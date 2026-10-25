import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packageNames, artifactPath, verifyRecord } from './release.mjs';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = packageNames.map((name) => `korea-map-${name}`);
const shaPattern = /^[a-f0-9]{40}$/;
const versionPattern = /^\d+\.\d+\.\d+$/;
const freshnessMs = 24 * 60 * 60 * 1000;
const expectedWorkflow = '.github/workflows/npm-publish.yml';
// First-release reviewed policy: any workflow edit needs a new explicit source review.
// Normalize CRLF only so the same tracked policy works on Windows, macOS and Linux.
const reviewedWorkflowSha256 = '2b7059f148357aae94e43b657bc959a3960608825eebd1443b4853e934be296f';
const sorted = (values) => [...values].sort();
const equalNames = (values) =>
  Array.isArray(values) && JSON.stringify(sorted(values)) === JSON.stringify(sorted(names));

export function parseReleasePreflightOptions(args) {
  const options = {};
  for (const arg of args) {
    const match = /^--(github-repository|evidence-dir)=(.+)$/.exec(arg);
    assert(match && !Object.hasOwn(options, match[1]), 'Unique supported flags required');
    options[match[1]] = match[2];
  }
  if (options['github-repository'])
    assert(
      /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(options['github-repository']),
      'Explicit owner/repository required',
    );
  if (options['evidence-dir'])
    assert(isAbsolute(options['evidence-dir']), 'Absolute evidence directory required');
  return options;
}

function check(id, passed, code, responsibility, details) {
  return {
    id,
    status: passed ? 'PASS' : 'BLOCKED',
    ...(passed ? {} : { reason: { code, responsibility } }),
    ...(details ? { details } : {}),
  };
}
function fresh(value, now) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now + 5 * 60 * 1000 && now - time <= freshnessMs;
}
function bound(value, source, now) {
  return (
    value?.schemaVersion === 1 &&
    value.sourceCommit === source.head &&
    value.sourceDirty === false &&
    fresh(value.checkedAt, now)
  );
}
function processPassed(value) {
  return (
    value?.completed === true &&
    value.exitCode === 0 &&
    value.signal === null &&
    value.errorCode === null
  );
}
function probePassed(value) {
  return (
    value?.status === 'PASS' &&
    value.completed === true &&
    value.exitCode === 0 &&
    value.signal === null &&
    value.executionErrorCode === null
  );
}
function notRun(id, code, responsibility) {
  return { id, status: 'NOT_RUN', reason: { code, responsibility } };
}

/** Current first-release policy only. Pending version decisions are reported, never applied. */
export function inspectReleaseConfiguration({
  manifests,
  changesetConfig,
  changesets,
  releaseSource,
  workflow,
}) {
  const entries = packageNames.map((name) => manifests?.[name]);
  const version = entries[0]?.version;
  const versionsMatch =
    typeof version === 'string' &&
    versionPattern.test(version) &&
    entries.every(
      (entry, index) =>
        entry?.name === names[index] && entry.version === version && entry.private !== true,
    );
  const checks = [
    check(
      'package-versions',
      versionsMatch,
      'PACKAGE_VERSION_OR_IDENTITY_MISMATCH',
      'source-change',
      versionsMatch ? { version, names } : undefined,
    ),
  ];
  const repositoryMatch =
    /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*)\.git$/.exec(
      entries[0]?.repository?.url ?? '',
    );
  const repository = repositoryMatch?.[1] ?? null;
  checks.push(
    check(
      'package-repository',
      repository &&
        entries.every(
          (entry, index) =>
            entry?.repository?.url === entries[0].repository.url &&
            entry.repository.directory === `packages/${packageNames[index]}`,
        ),
      'CONSISTENT_PACKAGE_REPOSITORY_REQUIRED',
      'source-change',
    ),
  );
  checks.push(
    check(
      'changesets-group',
      changesetConfig?.fixed?.length === 1 &&
        equalNames(changesetConfig.fixed[0]) &&
        changesetConfig.baseBranch === 'main' &&
        changesetConfig.access === 'public' &&
        Array.isArray(changesetConfig.ignore) &&
        changesetConfig.ignore.length === 0,
      'FIVE_PACKAGE_CHANGESETS_GROUP_REQUIRED',
      'source-change',
    ),
  );
  const pins = [...releaseSource.matchAll(/['"](\d+\.\d+\.\d+)['"]/g)].map((match) => match[1]);
  const publishes = [
    ...workflow.matchAll(
      /npm publish artifacts\/(korea-map-(?:core|styles|data-adapters|web|native))-(\d+\.\d+\.\d+)\.tgz\b/g,
    ),
  ];
  checks.push(
    check(
      'release-version',
      versionsMatch &&
        pins.length > 0 &&
        pins.every((pin) => pin === version) &&
        publishes.length === 5 &&
        equalNames(publishes.map((match) => match[1])) &&
        publishes.every((match) => match[2] === version),
      'RELEASE_SCRIPT_OR_WORKFLOW_VERSION_MISMATCH',
      'source-change',
    ),
  );
  let validChangesets = true;
  const bumps = [];
  for (const entry of changesets) {
    const lines = entry.text.split(/\r?\n/);
    const closing = lines.indexOf('---', 1);
    if (lines[0] !== '---' || closing < 1) {
      validChangesets = false;
      continue;
    }
    for (const line of lines.slice(1, closing).filter((line) => line.trim())) {
      const match = /^(['"]?)([^'":\s]+)\1:\s*(patch|minor|major)\s*$/.exec(line);
      if (!match || !names.includes(match[2])) validChangesets = false;
      else bumps.push({ name: match[2], bump: match[3] });
    }
  }
  checks.push(
    check(
      'pending-changesets',
      validChangesets && bumps.length === 0,
      validChangesets ? 'PENDING_VERSION_DECISION' : 'UNREVIEWED_CHANGESET_FORMAT',
      'maintainer-version-review',
      { pendingBumps: bumps },
    ),
  );
  const guards = [
    'workflow_dispatch:',
    "github.ref == 'refs/heads/main'",
    "vars.NPM_PUBLISH_ENABLED == 'true'",
    'vars.NPM_APPROVED_COMMIT',
    'environment: npm-release',
    'pnpm audit:dependencies',
    'pnpm verify:packages',
    'pnpm verify:native-consumer',
    'pnpm release:verify',
    '--provenance --access public --ignore-scripts',
  ];
  checks.push(
    check(
      'publication-guards',
      createHash('sha256').update(workflow.replace(/\r\n/g, '\n')).digest('hex') ===
        reviewedWorkflowSha256 &&
        guards.every((value) => workflow.includes(value)) &&
        !/\n {2}(push|pull_request|release|schedule):|continue-on-error:|\|\|\s*true/.test(
          workflow,
        ) &&
        workflow.indexOf('pnpm release:verify') < workflow.indexOf('npm publish artifacts/'),
      'PUBLICATION_GUARDS_CHANGED',
      'source-change',
    ),
  );
  return { version: versionsMatch ? version : null, repository, checks };
}

function receiptCheck(id, receipt, source, now, command, validate) {
  if (!receipt) return notRun(id, 'RECEIPT_MISSING', 'fresh-validation');
  const identity = bound(receipt, source, now);
  return check(
    id,
    identity &&
      processPassed(receipt) &&
      JSON.stringify(receipt.command) === JSON.stringify(['pnpm', command]) &&
      validate(receipt.report),
    identity ? 'VALIDATION_DID_NOT_PASS' : 'STALE_OR_UNBOUND_RECEIPT',
    'fresh-validation',
  );
}
function artifactMatches(reportPackages, manifest, expectedNames) {
  if (
    !Array.isArray(reportPackages) ||
    reportPackages.length !== expectedNames.length ||
    !Array.isArray(manifest?.packages) ||
    manifest.packages.some((record) => !record || typeof record.name !== 'string')
  )
    return false;
  const expected = new Map(manifest.packages.map((record) => [record.name, record]));
  const observed = reportPackages.map((record) => {
    const recordName =
      record?.name ??
      expectedNames.find((name) => record?.file === `${name}-${manifest.version}.tgz`);
    const reference = expected.get(recordName);
    return reference &&
      expectedNames.includes(recordName) &&
      record.file === reference.file &&
      record.sha256 === reference.sha256 &&
      (record.version === undefined || record.version === reference.version) &&
      (record.bytes === undefined || record.bytes === reference.bytes) &&
      (record.gzipBytes === undefined || record.gzipBytes === reference.bytes)
      ? recordName
      : null;
  });
  return !observed.includes(null) && new Set(observed).size === expectedNames.length;
}

/** A result is only readiness for human review; it never authorizes publication. */
export function evaluateReleasePreflight({
  source,
  configuration,
  manifest,
  artifactsValid,
  receipts = {},
  remote,
  now = Date.now(),
}) {
  const checks = [...configuration.checks];
  checks.push(
    check(
      'source',
      shaPattern.test(source.head ?? '') && source.dirty === false,
      'CLEAN_EXACT_SOURCE_REQUIRED',
      'source-change',
    ),
  );
  checks.push(
    check(
      'prepared-artifacts',
      artifactsValid === true &&
        manifest?.schemaVersion === 1 &&
        manifest.sourceCommit === source.head &&
        manifest.sourceDirty === false &&
        manifest.version === configuration.version &&
        Array.isArray(manifest.packages) &&
        equalNames(manifest.packages.map((record) => record?.name)),
      'PREPARED_ARTIFACTS_MISSING_STALE_OR_INVALID',
      'fresh-validation',
    ),
  );
  const audit = receipts.audit;
  if (!audit) checks.push(notRun('dependency-audit', 'RECEIPT_MISSING', 'fresh-validation'));
  else {
    const identity = bound(audit, source, now);
    const counts = audit.report?.metadata?.vulnerabilities;
    const validCounts =
      counts &&
      ['info', 'low', 'moderate', 'high', 'critical'].every(
        (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0,
      );
    checks.push(
      check(
        'dependency-audit',
        identity &&
          processPassed(audit) &&
          JSON.stringify(audit.command) === JSON.stringify(['pnpm', 'audit', '--json']) &&
          validCounts &&
          counts.high === 0 &&
          counts.critical === 0,
        identity ? 'AUDIT_FAILED_OR_INCOMPLETE' : 'STALE_OR_UNBOUND_RECEIPT',
        'dependency-security',
      ),
    );
  }
  checks.push(
    receiptCheck(
      'web-consumer',
      receipts.web,
      source,
      now,
      'verify:packages',
      (report) =>
        report?.schemaVersion === 2 &&
        report.sourceCommit === source.head &&
        report.sourceDirty === false &&
        report.status === 'PASS' &&
        report.blocked === false &&
        probePassed(report.nodeNextProbe) &&
        ['reproducibility', 'offlineConsumerInstall'].every(
          (key) => report.checks?.[key] === 'PASS',
        ) &&
        ['supportedBundlerTypes', 'webLayerTypes', 'coreNodeNextTypes', 'ssrImport'].every((key) =>
          probePassed(report.checks?.[key]),
        ) &&
        report.checks?.browser?.status === 'PASS' &&
        ['render', 'selection', 'destroy'].every((key) => report.checks.browser[key] === 'PASS') &&
        report.checks.browser.externalRequests === 0 &&
        report.checks.browser.pageErrors === 0 &&
        artifactMatches(report.packages, manifest, names),
    ),
  );
  checks.push(
    receiptCheck(
      'native-consumer',
      receipts.native,
      source,
      now,
      'verify:native-consumer',
      (report) =>
        report?.schemaVersion === 1 &&
        report.sourceCommit === source.head &&
        report.sourceDirty === false &&
        report.overall === 'PASS' &&
        report.releaseBlocked === false &&
        [
          'dependencyDeclarations',
          'publicSdkBundlerDeclarations',
          'publicSdkNodeNextDeclarations',
        ].every((key) => probePassed(report.checks?.[key])) &&
        [
          'registryLockPreparation',
          'offlineTarballInstall',
          'publicTypesStrictWithSkipLibCheck',
          'configPluginIntrospection',
          'androidJavaScriptExport',
          'iosJavaScriptExport',
        ].every((key) => report.checks?.[key] === 'PASS') &&
        artifactMatches(report.packages, manifest, [
          'korea-map-core',
          'korea-map-native',
          'korea-map-styles',
        ]),
    ),
  );
  if (!remote)
    checks.push(notRun('github-workflow', 'EXPLICIT_GITHUB_GET_NOT_REQUESTED', 'github-admin'));
  else
    checks.push(
      check(
        'github-workflow',
        remote.status === 'PASS' &&
          remote.reason === undefined &&
          remote.repository === configuration.repository &&
          fresh(remote.checkedAt, now) &&
          remote.workflowRegistered === true &&
          remote.workflowOnDefault === true &&
          remote.environmentProtected === true,
        remote.reason ?? 'GITHUB_ADMIN_CONFIGURATION_NOT_VERIFIED',
        'github-admin',
        {
          repository: remote.repository ?? null,
          defaultBranch: remote.defaultBranch ?? null,
          workflowRegistered: remote.workflowRegistered === true,
          workflowOnDefault: remote.workflowOnDefault === true,
          environmentProtected: remote.environmentProtected === true,
        },
      ),
    );
  const registry = receipts.registry;
  if (!registry)
    checks.push(notRun('registry-review', 'REGISTRY_AND_PUBLISHER_REVIEW_MISSING', 'npm-owner'));
  else
    checks.push(
      check(
        'registry-review',
        bound(registry, source, now) &&
          registry.status === 'PASS' &&
          registry.mode === 'FIRST_PUBLICATION' &&
          registry.publisherAccessReviewed === true &&
          registry.provenancePlanReviewed === true &&
          Array.isArray(registry.names) &&
          registry.names.length === 5 &&
          equalNames(registry.names.map((entry) => entry?.name)) &&
          registry.names.every(
            (entry) => entry.version === configuration.version && entry.httpStatus === 404,
          ),
        'REGISTRY_NAMES_AND_PUBLISHER_REVIEW_REQUIRED',
        'npm-owner',
      ),
    );
  return {
    schemaVersion: 1,
    checkedAt: new Date(now).toISOString(),
    sourceCommit: source.head ?? null,
    sourceDirty: source.dirty ?? null,
    status: checks.every((entry) => entry.status === 'PASS') ? 'READY_FOR_REVIEW' : 'BLOCKED',
    publicationAuthorized: false,
    scope:
      'Configuration, artifact, audit/consumer receipts and operating preconditions only; not full-platform acceptance or publication approval',
    checks,
  };
}

function boundedFile(path, maximum = 1024 * 1024, boundary = rootDirectory) {
  const within = relative(boundary, path);
  assert(
    within &&
      within !== '..' &&
      !within.startsWith('../') &&
      !within.startsWith('..\\') &&
      !isAbsolute(within),
    'Read must stay within the source workspace',
  );
  let current = boundary;
  for (const part of within.split(/[\\/]/)) {
    current = resolve(current, part);
    assert(!lstatSync(current).isSymbolicLink(), 'Symlinked evidence or artifacts not accepted');
  }
  const info = lstatSync(path);
  assert(
    info.isFile() && !info.isSymbolicLink() && info.size <= maximum,
    'Bounded regular file required',
  );
  return readFileSync(path);
}
function optionalJson(path, boundary) {
  try {
    return JSON.parse(boundedFile(path, undefined, boundary));
  } catch {
    return null;
  }
}

/** Explicit GET only. Authentication is inherited; credential values and raw CLI output are never returned. */
export function inspectGitHubRelease(repository, run = spawnSync, now = Date.now()) {
  assert(
    /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository),
    'Explicit owner/repository required',
  );
  function get(path) {
    const result = run('gh', ['api', '--hostname', 'github.com', '--method', 'GET', path], {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (result.error || result.signal || result.status !== 0) return null;
    try {
      return JSON.parse(result.stdout);
    } catch {
      return null;
    }
  }
  const repo = get(`repos/${repository}`);
  const workflows = get(`repos/${repository}/actions/workflows?per_page=100`);
  const environment = get(`repos/${repository}/environments/npm-release`);
  const defaultBranch =
    typeof repo?.default_branch === 'string' && /^[A-Za-z0-9_./-]{1,128}$/.test(repo.default_branch)
      ? repo.default_branch
      : null;
  const file = defaultBranch
    ? get(
        `repos/${repository}/contents/${expectedWorkflow}?ref=${encodeURIComponent(defaultBranch)}`,
      )
    : null;
  const main = get(`repos/${repository}/branches/main`);
  const workflowRegistered =
    Array.isArray(workflows?.workflows) &&
    workflows.workflows.some(
      (entry) => entry.path === expectedWorkflow && entry.state === 'active',
    );
  const workflowOnDefault = file?.type === 'file' && file.path === expectedWorkflow;
  const policy = environment?.deployment_branch_policy;
  const branchPolicies =
    policy?.custom_branch_policies === true
      ? get(`repos/${repository}/environments/npm-release/deployment-branch-policies?per_page=100`)
      : null;
  const mainAllowed =
    (policy?.protected_branches === true && main?.protected === true) ||
    (policy?.custom_branch_policies === true &&
      Array.isArray(branchPolicies?.branch_policies) &&
      branchPolicies.branch_policies.some(
        (entry) => entry.name === 'main' && entry.type === 'branch',
      ));
  const environmentProtected =
    Array.isArray(environment?.protection_rules) &&
    environment.protection_rules.some(
      (rule) =>
        rule.type === 'required_reviewers' &&
        rule.prevent_self_review === true &&
        Array.isArray(rule.reviewers) &&
        rule.reviewers.length > 0,
    ) &&
    mainAllowed;
  const reason =
    !repo || !workflows
      ? 'GITHUB_GET_UNAVAILABLE_OR_PERMISSION_REQUIRED'
      : !workflowRegistered || !workflowOnDefault
        ? 'MANUAL_WORKFLOW_MISSING_OR_UNVERIFIED_ON_DEFAULT_BRANCH'
        : !environment || !main
          ? 'GITHUB_GET_UNAVAILABLE_OR_PERMISSION_REQUIRED'
          : !environmentProtected
            ? 'NPM_RELEASE_ENVIRONMENT_OR_MAIN_POLICY_NOT_VERIFIED'
            : undefined;
  return {
    repository,
    checkedAt: new Date(now).toISOString(),
    status:
      defaultBranch && workflowRegistered && workflowOnDefault && environmentProtected && !reason
        ? 'PASS'
        : 'BLOCKED',
    defaultBranch,
    workflowRegistered,
    workflowOnDefault,
    environmentProtected,
    ...(reason ? { reason } : {}),
  };
}

export function runReleasePreflight({
  root = rootDirectory,
  options = {},
  run = spawnSync,
  now = Date.now(),
} = {}) {
  const git = (args) => {
    const result = run('git', ['-C', root, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    return result.status === 0 && !result.error && !result.signal ? result.stdout.trim() : null;
  };
  const head = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain']);
  const artifacts = resolve(root, 'artifacts');
  const evidenceDirectory = resolve(
    options['evidence-dir'] ?? resolve(artifacts, 'release/evidence'),
  );
  const within = relative(artifacts, evidenceDirectory);
  assert(
    within !== '..' &&
      !within.startsWith('../') &&
      !within.startsWith('..\\') &&
      !isAbsolute(within),
    'Evidence must remain inside ignored artifacts',
  );
  const manifests = Object.fromEntries(
    packageNames.map((name) => [
      name,
      optionalJson(resolve(root, 'packages', name, 'package.json'), root),
    ]),
  );
  const changesets = readdirSync(resolve(root, '.changeset'))
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => ({
      text: boundedFile(resolve(root, '.changeset', file), undefined, root).toString('utf8'),
    }));
  const configuration = inspectReleaseConfiguration({
    manifests,
    changesetConfig: optionalJson(resolve(root, '.changeset/config.json'), root),
    changesets,
    releaseSource: boundedFile(resolve(root, 'scripts/release.mjs'), undefined, root).toString(
      'utf8',
    ),
    workflow: boundedFile(resolve(root, expectedWorkflow), undefined, root).toString('utf8'),
  });
  const manifest = optionalJson(resolve(artifacts, 'release/integrity.json'), root);
  let artifactsValid = false;
  try {
    assert(
      Array.isArray(manifest?.packages) &&
        manifest.packages.length === 5 &&
        equalNames(manifest.packages.map((record) => record.name)),
    );
    for (const record of manifest.packages)
      verifyRecord(record, boundedFile(artifactPath(record, artifacts), 16 * 1024 * 1024, root));
    artifactsValid = true;
  } catch {
    /* Absent, malformed or mutated artifacts remain blocked. */
  }
  const receipts = Object.fromEntries(
    ['audit', 'web', 'native', 'registry'].map((name) => [
      name,
      optionalJson(resolve(evidenceDirectory, `${name}.json`), root),
    ]),
  );
  const remote = options['github-repository']
    ? inspectGitHubRelease(options['github-repository'], run, now)
    : null;
  return evaluateReleasePreflight({
    source: { head, dirty: dirty === null ? null : dirty.length > 0 },
    configuration,
    manifest,
    artifactsValid,
    receipts,
    remote,
    now,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = runReleasePreflight({
      options: parseReleasePreflightOptions(process.argv.slice(2)),
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'READY_FOR_REVIEW') process.exitCode = 1;
  } catch {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        status: 'BLOCKED',
        publicationAuthorized: false,
        reason: {
          code: 'PREFLIGHT_INPUT_OR_EXECUTION_INVALID',
          responsibility: 'maintainer-review',
        },
      }),
    );
    process.exitCode = 1;
  }
}
