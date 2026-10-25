import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { artifactRecord, packageNames } from '../scripts/release.mjs';
import {
  evaluateReleasePreflight,
  inspectGitHubRelease,
  inspectReleaseConfiguration,
  parseReleasePreflightOptions,
  runReleasePreflight,
} from '../scripts/release-preflight.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'kasa500000-png/KoreaMap';
const head = 'a'.repeat(40);
const now = Date.parse('2026-10-21T00:00:00.000Z');
const checkedAt = new Date(now).toISOString();
const script = readFileSync(resolve(repositoryRoot, 'scripts/release.mjs'), 'utf8');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/npm-publish.yml'), 'utf8');
const manifests = Object.fromEntries(
  packageNames.map((name) => [
    name,
    JSON.parse(readFileSync(resolve(repositoryRoot, 'packages', name, 'package.json'), 'utf8')),
  ]),
);
const changesetConfig = JSON.parse(
  readFileSync(resolve(repositoryRoot, '.changeset/config.json'), 'utf8'),
);
const packages = packageNames.map((name) =>
  artifactRecord(name, '0.1.0', Buffer.from(`authored unit fixture ${name}`)),
);
const names = packages.map((entry) => entry.name);
const clone = (value) => JSON.parse(JSON.stringify(value));
const byId = (report, id) => report.checks.find((entry) => entry.id === id);
function configurationInput() {
  return {
    manifests: clone(manifests),
    changesetConfig: clone(changesetConfig),
    changesets: [{ text: '---\n---\n\nEmpty baseline.' }],
    releaseSource: script,
    workflow,
  };
}
function probe() {
  return { status: 'PASS', completed: true, exitCode: 0, signal: null, executionErrorCode: null };
}
function receipt(command, report) {
  return {
    schemaVersion: 1,
    sourceCommit: head,
    sourceDirty: false,
    checkedAt,
    completed: true,
    exitCode: 0,
    signal: null,
    errorCode: null,
    command,
    report,
  };
}
function fixture() {
  return {
    source: { head, dirty: false },
    configuration: inspectReleaseConfiguration(configurationInput()),
    manifest: {
      schemaVersion: 1,
      version: '0.1.0',
      sourceCommit: head,
      sourceDirty: false,
      publicationApproved: false,
      packages: clone(packages),
    },
    artifactsValid: true,
    now,
    remote: {
      repository,
      checkedAt,
      status: 'PASS',
      defaultBranch: 'main',
      workflowRegistered: true,
      workflowOnDefault: true,
      environmentProtected: true,
    },
    receipts: {
      audit: receipt(['pnpm', 'audit', '--json'], {
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
      }),
      web: receipt(['pnpm', 'verify:packages'], {
        schemaVersion: 2,
        sourceCommit: head,
        sourceDirty: false,
        status: 'PASS',
        blocked: false,
        packages: clone(packages),
        nodeNextProbe: probe(),
        checks: {
          reproducibility: 'PASS',
          offlineConsumerInstall: 'PASS',
          supportedBundlerTypes: probe(),
          webLayerTypes: probe(),
          coreNodeNextTypes: probe(),
          ssrImport: probe(),
          browser: {
            status: 'PASS',
            externalRequests: 0,
            pageErrors: 0,
            render: 'PASS',
            selection: 'PASS',
            destroy: 'PASS',
          },
        },
      }),
      native: receipt(['pnpm', 'verify:native-consumer'], {
        schemaVersion: 1,
        sourceCommit: head,
        sourceDirty: false,
        overall: 'PASS',
        releaseBlocked: false,
        packages: clone(
          packages.filter((entry) =>
            ['korea-map-core', 'korea-map-native', 'korea-map-styles'].includes(entry.name),
          ),
        ),
        checks: {
          dependencyDeclarations: probe(),
          publicSdkBundlerDeclarations: probe(),
          publicSdkNodeNextDeclarations: probe(),
          registryLockPreparation: 'PASS',
          offlineTarballInstall: 'PASS',
          publicTypesStrictWithSkipLibCheck: 'PASS',
          configPluginIntrospection: 'PASS',
          androidJavaScriptExport: 'PASS',
          iosJavaScriptExport: 'PASS',
        },
      }),
      registry: {
        schemaVersion: 1,
        sourceCommit: head,
        sourceDirty: false,
        checkedAt,
        status: 'PASS',
        mode: 'FIRST_PUBLICATION',
        publisherAccessReviewed: true,
        provenancePlanReviewed: true,
        names: names.map((name) => ({ name, version: '0.1.0', httpStatus: 404 })),
      },
    },
  };
}

test('synthetic complete evidence is only readiness for review, never publication authorization', () => {
  const report = evaluateReleasePreflight(fixture());
  assert.equal(report.status, 'READY_FOR_REVIEW');
  assert.equal(report.publicationAuthorized, false);
  assert(report.checks.every((entry) => entry.status === 'PASS'));
  assert.match(report.scope, /not full-platform acceptance or publication approval/);
});

test('consumer readiness requires every current strict declaration probe despite an aggregate PASS', () => {
  for (const [consumer, key] of [
    ['web', 'webLayerTypes'],
    ['native', 'publicSdkBundlerDeclarations'],
    ['native', 'publicSdkNodeNextDeclarations'],
  ]) {
    for (const invalid of [
      undefined,
      null,
      'PASS',
      { ...probe(), status: 'NOT_RUN' },
      { ...probe(), status: 'FAIL' },
      { ...probe(), completed: false },
      { ...probe(), exitCode: 2 },
      { ...probe(), signal: 'SIGTERM' },
      { ...probe(), executionErrorCode: 'ETIMEDOUT' },
    ]) {
      const value = fixture();
      if (invalid === undefined) delete value.receipts[consumer].report.checks[key];
      else value.receipts[consumer].report.checks[key] = invalid;
      const report = evaluateReleasePreflight(value);
      assert.equal(byId(report, `${consumer}-consumer`).status, 'BLOCKED', `${consumer}:${key}`);
      assert.equal(report.publicationAuthorized, false);
    }
  }
});

test('five-package versions, fixed Changesets group and pinned release commands must agree', () => {
  const base = configurationInput();
  assert(inspectReleaseConfiguration(base).checks.every((entry) => entry.status === 'PASS'));
  for (const mutate of [
    (value) => {
      value.manifests.native.version = '0.2.0';
    },
    (value) => {
      value.manifests.native.private = true;
    },
    (value) => {
      value.manifests.styles.name = 'another-name';
    },
    (value) => {
      value.manifests.core.repository.directory = 'examples/web';
    },
    (value) => {
      value.changesetConfig.fixed[0].pop();
    },
    (value) => {
      value.changesetConfig.fixed = [null];
    },
    (value) => {
      value.changesetConfig.ignore.push('korea-map-native');
    },
    (value) => {
      value.releaseSource = value.releaseSource.replaceAll("'0.1.0'", "'0.2.0'");
    },
    (value) => {
      value.workflow = value.workflow.replace(
        'korea-map-native-0.1.0.tgz',
        'korea-map-native-0.2.0.tgz',
      );
    },
    (value) => {
      value.workflow = value.workflow.replace('pnpm verify:native-consumer', 'true');
    },
  ]) {
    const input = clone(base);
    mutate(input);
    assert(inspectReleaseConfiguration(input).checks.some((entry) => entry.status === 'BLOCKED'));
  }
});

test('pending patch/minor versions require an explicit maintainer decision without applying a bump', () => {
  const input = configurationInput();
  input.changesets = [
    { text: '---\n"korea-map-core": minor\n---\nSynthetic pending API change.' },
    { text: '---\n"korea-map-web": patch\n---\nSynthetic pending fix.' },
  ];
  const original = JSON.stringify(input.manifests);
  const report = inspectReleaseConfiguration(input);
  const pending = byId(report, 'pending-changesets');
  assert.equal(pending.status, 'BLOCKED');
  assert.equal(pending.reason.code, 'PENDING_VERSION_DECISION');
  assert(pending.details.pendingBumps.some((entry) => entry.bump === 'minor'));
  assert(pending.details.pendingBumps.some((entry) => entry.bump === 'patch'));
  assert.equal(report.version, '0.1.0');
  assert.equal(JSON.stringify(input.manifests), original);
  input.changesets = [{ text: '---\n"unknown-package": patch\n---\nUnknown.' }];
  assert.equal(
    byId(inspectReleaseConfiguration(input), 'pending-changesets').reason.code,
    'UNREVIEWED_CHANGESET_FORMAT',
  );
});

test('reviewed active publication policy cannot be replaced by comments, reordered steps or shell bypasses', () => {
  for (const change of [
    (value) =>
      value.replace('      - run: pnpm release:verify', '      # - run: pnpm release:verify'),
    (value) => value.replace('    if: github.ref', '    # if: github.ref'),
    (value) => value.replace('    environment: npm-release', '    # environment: npm-release'),
    (value) =>
      value.replace(
        '      - run: pnpm audit:dependencies',
        '      - run: pnpm audit:dependencies || true',
      ),
    (value) =>
      value.replace('      - run: pnpm verify:packages', '      - run: echo pnpm verify:packages'),
    (value) =>
      value.replace(
        '      - run: pnpm verify:native-consumer',
        '      - run: pnpm verify:native-consumer\n        if: false',
      ),
    (value) =>
      value.replace(
        '      - run: pnpm release:prepare\n      - run: pnpm release:verify',
        '      - run: pnpm release:verify\n      - run: pnpm release:prepare',
      ),
  ]) {
    const input = configurationInput();
    input.workflow = change(input.workflow);
    assert.notEqual(input.workflow, workflow, 'The mutation must change the actual policy');
    assert.equal(byId(inspectReleaseConfiguration(input), 'publication-guards').status, 'BLOCKED');
  }
  const windows = configurationInput();
  windows.workflow = windows.workflow.replace(/\n/g, '\r\n');
  assert.equal(byId(inspectReleaseConfiguration(windows), 'publication-guards').status, 'PASS');
});

test('missing evidence and default remote NOT_RUN cannot count as a passing gate', () => {
  const value = fixture();
  value.receipts = {};
  value.remote = null;
  value.manifest = null;
  value.artifactsValid = false;
  const report = evaluateReleasePreflight(value);
  assert.equal(report.status, 'BLOCKED');
  for (const id of [
    'dependency-audit',
    'web-consumer',
    'native-consumer',
    'github-workflow',
    'registry-review',
  ])
    assert.equal(byId(report, id).status, 'NOT_RUN', id);
  assert.equal(byId(report, 'github-workflow').reason.code, 'EXPLICIT_GITHUB_GET_NOT_REQUESTED');
  assert.equal(byId(report, 'prepared-artifacts').status, 'BLOCKED');
});

test('dirty, stale, future or different-source receipts cannot be recycled for another final commit', () => {
  for (const name of ['audit', 'web', 'native', 'registry']) {
    for (const change of [
      { sourceCommit: 'b'.repeat(40) },
      { sourceDirty: true },
      { checkedAt: new Date(now - 24 * 60 * 60 * 1000 - 1).toISOString() },
      { checkedAt: new Date(now + 5 * 60 * 1000 + 1).toISOString() },
    ]) {
      const value = fixture();
      Object.assign(value.receipts[name], change);
      assert.equal(
        evaluateReleasePreflight(value).status,
        'BLOCKED',
        `${name} ${JSON.stringify(change)}`,
      );
    }
  }
  for (const mutate of [
    (value) => {
      value.source.head = 'main';
    },
    (value) => {
      value.source.dirty = true;
    },
    (value) => {
      value.manifest.sourceCommit = 'b'.repeat(40);
    },
    (value) => {
      value.manifest.sourceDirty = true;
    },
    (value) => {
      value.receipts.web.report.sourceCommit = 'b'.repeat(40);
    },
    (value) => {
      value.receipts.native.report.sourceDirty = true;
    },
    (value) => {
      value.remote.repository = 'someone/else';
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.equal(evaluateReleasePreflight(value).status, 'BLOCKED');
  }
});

test('audit high/critical findings, missing counts and a failed execution fail closed', () => {
  for (const mutate of [
    (value) => {
      value.report.metadata.vulnerabilities.high = 2;
    },
    (value) => {
      value.report.metadata.vulnerabilities.critical = 1;
    },
    (value) => {
      delete value.report.metadata.vulnerabilities.high;
    },
    (value) => {
      value.report.metadata.vulnerabilities.high = -1;
    },
    (value) => {
      value.exitCode = 1;
    },
    (value) => {
      value.signal = 'SIGTERM';
    },
    (value) => {
      value.errorCode = 'ETIMEDOUT';
    },
    (value) => {
      value.completed = false;
    },
    (value) => {
      value.command = ['pnpm', 'audit', '--prod', '--json'];
    },
  ]) {
    const input = fixture();
    mutate(input.receipts.audit);
    assert.equal(byId(evaluateReleasePreflight(input), 'dependency-audit').status, 'BLOCKED');
  }
});

test('PARTIAL_PASS, unsupported declarations, timeouts and browser errors cannot pass consumers', () => {
  for (const [name, mutate] of [
    [
      'web',
      (value) => {
        value.report.status = 'PARTIAL_PASS';
      },
    ],
    [
      'web',
      (value) => {
        value.report.blocked = true;
      },
    ],
    [
      'web',
      (value) => {
        value.report.nodeNextProbe.exitCode = 2;
      },
    ],
    [
      'web',
      (value) => {
        value.report.nodeNextProbe.signal = 'SIGTERM';
      },
    ],
    [
      'web',
      (value) => {
        value.report.checks.browser.externalRequests = 1;
      },
    ],
    [
      'web',
      (value) => {
        value.report.checks.browser.pageErrors = 1;
      },
    ],
    [
      'web',
      (value) => {
        value.report.checks.ssrImport.completed = false;
      },
    ],
    [
      'native',
      (value) => {
        value.report.overall = 'PARTIAL_PASS';
      },
    ],
    [
      'native',
      (value) => {
        value.report.releaseBlocked = true;
      },
    ],
    [
      'native',
      (value) => {
        value.report.checks.dependencyDeclarations.executionErrorCode = 'ETIMEDOUT';
      },
    ],
    [
      'native',
      (value) => {
        value.report.checks.iosJavaScriptExport = 'NOT_RUN';
      },
    ],
    [
      'native',
      (value) => {
        value.completed = false;
      },
    ],
  ]) {
    const input = fixture();
    mutate(input.receipts[name]);
    assert.equal(byId(evaluateReleasePreflight(input), `${name}-consumer`).status, 'BLOCKED');
  }
});

test('consumer reports must identify the same prepared tarballs without omissions or duplicate identities', () => {
  for (const [name, mutate] of [
    [
      'web',
      (value) => {
        value.packages[0].sha256 = '0'.repeat(64);
      },
    ],
    [
      'native',
      (value) => {
        value.packages[0].file = '../other.tgz';
      },
    ],
    [
      'web',
      (value) => {
        value.packages.pop();
      },
    ],
    [
      'native',
      (value) => {
        value.packages[1] = value.packages[0];
      },
    ],
  ]) {
    const input = fixture();
    mutate(input.receipts[name].report);
    assert.equal(byId(evaluateReleasePreflight(input), `${name}-consumer`).status, 'BLOCKED');
  }
  const malformed = fixture();
  malformed.manifest.packages = null;
  assert.equal(evaluateReleasePreflight(malformed).status, 'BLOCKED');
});

test('Native schema 1 scalar checks accept only the literal PASS string and reject contradictory objects', () => {
  for (const key of [
    'registryLockPreparation',
    'offlineTarballInstall',
    'publicTypesStrictWithSkipLibCheck',
    'configPluginIntrospection',
    'androidJavaScriptExport',
    'iosJavaScriptExport',
  ]) {
    for (const invalid of [
      undefined,
      'FAIL',
      'NOT_RUN',
      null,
      { status: 'PASS' },
      { status: 'PASS', completed: false, exitCode: 1, signal: 'SIGTERM' },
    ]) {
      const value = fixture();
      value.receipts.native.report.checks[key] = invalid;
      assert.equal(byId(evaluateReleasePreflight(value), 'native-consumer').status, 'BLOCKED', key);
    }
  }
});

function githubRunner({
  missingWorkflow = false,
  environmentDenied = false,
  protectedMain = true,
  customPolicy = false,
  policyMain = true,
  mainFailure,
} = {}) {
  const calls = [];
  const run = (program, args) => {
    assert.equal(program, 'gh');
    assert.deepEqual(args.slice(0, 5), ['api', '--hostname', 'github.com', '--method', 'GET']);
    const path = args[5];
    calls.push(path);
    let value;
    if (path === `repos/${repository}`)
      value = { default_branch: missingWorkflow ? 'chore/project-policy' : 'main' };
    else if (path.endsWith('/actions/workflows?per_page=100'))
      value = {
        workflows: missingWorkflow
          ? []
          : [{ path: '.github/workflows/npm-publish.yml', state: 'active' }],
      };
    else if (path.endsWith('/environments/npm-release')) {
      if (environmentDenied)
        return { status: 1, stderr: 'SENSITIVE RAW AUTH OUTPUT MUST NOT ESCAPE' };
      value = {
        protection_rules: [
          {
            type: 'required_reviewers',
            prevent_self_review: true,
            reviewers: [{ type: 'User', reviewer: { id: 1 } }],
          },
        ],
        deployment_branch_policy: {
          protected_branches: !customPolicy,
          custom_branch_policies: customPolicy,
        },
      };
    } else if (path.endsWith('/branches/main')) {
      if (mainFailure) return mainFailure;
      value = { protected: protectedMain };
    } else if (path.includes('/deployment-branch-policies?'))
      value = { branch_policies: [{ name: policyMain ? 'main' : 'unrelated', type: 'branch' }] };
    else if (path.includes('/contents/')) {
      if (missingWorkflow) return { status: 1, stderr: '404' };
      value = { type: 'file', path: '.github/workflows/npm-publish.yml' };
    } else assert.fail(`Unexpected GET ${path}`);
    return { status: 0, signal: null, stdout: JSON.stringify(value) };
  };
  return { run, calls };
}

test('explicit GitHub check is GET-only and blocks unregistered/default-missing workflow or unknown environment', () => {
  for (const options of [
    {},
    { missingWorkflow: true, environmentDenied: true },
    { environmentDenied: true },
    { protectedMain: false },
    { customPolicy: true, policyMain: false },
    { customPolicy: true },
  ]) {
    const { run, calls } = githubRunner(options);
    const report = inspectGitHubRelease(repository, run, now);
    assert.equal(
      report.status,
      !options.missingWorkflow &&
        !options.environmentDenied &&
        options.protectedMain !== false &&
        options.policyMain !== false
        ? 'PASS'
        : 'BLOCKED',
    );
    assert(calls.length >= 5);
    assert(!JSON.stringify(report).includes('SENSITIVE RAW AUTH OUTPUT'));
    if (options.missingWorkflow)
      assert.equal(report.reason, 'MANUAL_WORKFLOW_MISSING_OR_UNVERIFIED_ON_DEFAULT_BRANCH');
  }
  const unavailable = inspectGitHubRelease(
    repository,
    () => ({ status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' } }),
    now,
  );
  assert.equal(unavailable.status, 'BLOCKED');
});

test('custom main environment policy cannot replace a failed, unavailable or timed-out required main GET', () => {
  for (const mainFailure of [
    { status: 1, stderr: '403 permission denied' },
    { status: 1, stderr: '404 not found' },
    { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' } },
  ]) {
    const { run } = githubRunner({ customPolicy: true, mainFailure });
    const remote = inspectGitHubRelease(repository, run, now);
    assert.equal(
      remote.environmentProtected,
      true,
      'A policy alone does not prove main can be inspected',
    );
    assert.equal(remote.reason, 'GITHUB_GET_UNAVAILABLE_OR_PERMISSION_REQUIRED');
    assert.equal(remote.status, 'BLOCKED');
    const input = fixture();
    input.remote = remote;
    assert.equal(byId(evaluateReleasePreflight(input), 'github-workflow').status, 'BLOCKED');
    input.remote.status = 'PASS';
    assert.equal(
      byId(evaluateReleasePreflight(input), 'github-workflow').status,
      'BLOCKED',
      'Contradictory PASS with a failure reason is rejected',
    );
  }
});

test('CLI options require explicit safe repository and reject unknown, duplicate or relative evidence arguments', () => {
  assert.deepEqual(parseReleasePreflightOptions([]), {});
  assert.deepEqual(parseReleasePreflightOptions([`--github-repository=${repository}`]), {
    'github-repository': repository,
  });
  for (const args of [
    ['--publish'],
    ['--github-repository=../escape'],
    ['--github-repository=one/repo', '--github-repository=other/repo'],
    ['--evidence-dir=relative'],
  ])
    assert.throws(() => parseReleasePreflightOptions(args));
});

function workspace(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'korea-map-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(path, value) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value),
    );
  }
  const value = fixture();
  for (const name of packageNames) write(`packages/${name}/package.json`, manifests[name]);
  write('.changeset/config.json', changesetConfig);
  write('.changeset/baseline.md', '---\n---\n\nEmpty synthetic baseline.');
  write('scripts/release.mjs', script);
  write('.github/workflows/npm-publish.yml', workflow);
  write('artifacts/release/integrity.json', value.manifest);
  for (const name of packageNames)
    write(`artifacts/korea-map-${name}-0.1.0.tgz`, Buffer.from(`authored unit fixture ${name}`));
  for (const name of Object.keys(value.receipts))
    write(`artifacts/release/evidence/${name}.json`, value.receipts[name]);
  const github = githubRunner();
  const run = (program, args, options) => {
    if (program === 'gh') return github.run(program, args, options);
    assert.equal(program, 'git');
    assert.deepEqual(args.slice(0, 2), ['-C', root]);
    assert(['rev-parse', 'status'].includes(args[2]));
    return { status: 0, signal: null, stdout: args[2] === 'rev-parse' ? head : '' };
  };
  return { root, run, write, github };
}

test('local execution performs no implicit remote GET; explicit GET and valid artifact bytes are independently required', (t) => {
  const { root, run, write, github } = workspace(t);
  const local = runReleasePreflight({ root, run, now });
  assert.equal(local.status, 'BLOCKED');
  assert.equal(byId(local, 'github-workflow').status, 'NOT_RUN');
  assert.deepEqual(github.calls, []);
  const options = { 'github-repository': repository };
  assert.equal(runReleasePreflight({ root, run, now, options }).status, 'READY_FOR_REVIEW');
  write('artifacts/korea-map-native-0.1.0.tgz', 'mutated bytes');
  assert.equal(
    byId(runReleasePreflight({ root, run, now, options }), 'prepared-artifacts').status,
    'BLOCKED',
  );
  assert.throws(() =>
    runReleasePreflight({
      root,
      run,
      now,
      options: { 'evidence-dir': resolve(root, '../outside') },
    }),
  );
});

test('symlinked evidence ancestors cannot read outside the workspace or satisfy a receipt', (t) => {
  const { root, run } = workspace(t);
  const outside = mkdtempSync(resolve(tmpdir(), 'korea-map-external-evidence-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(resolve(outside, 'audit.json'), JSON.stringify(fixture().receipts.audit));
  const link = resolve(root, 'artifacts/linked-evidence');
  symlinkSync(outside, link, 'junction');
  const report = runReleasePreflight({ root, run, now, options: { 'evidence-dir': link } });
  assert.equal(report.status, 'BLOCKED');
  assert.equal(byId(report, 'dependency-audit').status, 'NOT_RUN');
});

test('actual local preflight exits nonzero with informative blocked JSON and does not authorize publication', () => {
  const result = spawnSync(process.execPath, ['scripts/release-preflight.mjs'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.signal, null);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.publicationAuthorized, false);
  assert.equal(byId(report, 'github-workflow').status, 'NOT_RUN');
  assert(report.checks.some((check) => check.status !== 'PASS')); // Live workspace version decisions may change; missing operational evidence never authorizes publication.
});
