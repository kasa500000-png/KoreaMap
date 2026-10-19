import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inspectFontCoverage, designLabelCorpus } from '../packages/styles/dist/index.js';
const index = process.argv.indexOf('--font');
if (index < 0 || !process.argv[index + 1])
  throw new Error(
    'Pass --font with your reviewed local TTF/OTF/TTC file. No download or fallback.',
  );
const bytes = await readFile(process.argv[index + 1]);
const allHangul = Array.from({ length: 11172 }, (_, i) => String.fromCodePoint(0xac00 + i)).join(
  '',
);
const faceOption = process.argv.indexOf('--face');
const faceIndex = faceOption < 0 ? 0 : Number(process.argv[faceOption + 1]);
const report = inspectFontCoverage(bytes, [...designLabelCorpus, allHangul], faceIndex);
console.log(
  JSON.stringify(
    { faceIndex, fontSha256: createHash('sha256').update(bytes).digest('hex'), ...report },
    null,
    2,
  ),
);
if (!report.ok) process.exitCode = 1;
