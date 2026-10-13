// Fictional fixtures only. Writes fresh reports; never overwrites an existing report.
// Run after build: node test/experience-preview.mjs reports/experience
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const output = process.argv[2];
if (!output) throw new Error('Pass a fresh output directory.');
const temporary = await mkdtemp(path.join(await realpath(tmpdir()), 'repo-yokai-preview-'));
function run(base, head, name, expected = 0) {
  const result = spawnSync(process.execPath, ['dist/cli.js', '--base-dir', base, '--head-dir', head, '--output-dir', path.join(output, name)], {encoding:'utf8'});
  process.stdout.write(`${name}: ${result.stdout}${result.stderr}`);
  if (result.status !== expected) throw new Error(`${name}: expected exit ${expected}, got ${result.status}`);
}
async function fixture(name, base, head) {
  for (const [side, files] of Object.entries({base, head})) {
    await mkdir(path.join(temporary, name, side), {recursive:true});
    for (const [file, contents] of Object.entries(files)) {
      const target = path.join(temporary, name, side, file);
      await mkdir(path.dirname(target), {recursive:true});
      await writeFile(target, contents);
    }
  }
  return ['base', 'head'].map(side => path.join(temporary, name, side));
}
try {
  run('fixtures/demo/base', 'fixtures/demo/head', 'demo');
  run('fixtures/zero/base', 'fixtures/zero/head', 'zero');
  const long = 'fictional-archive-with-a-deliberately-long-file-name-and-&-character-for-wrapping-checks.ts';
  const branching = {'a.ts':`import './${long}';\nimport './c';`, [long]:"import './a';", 'c.ts':"import './a';"};
  run(...await fixture('long', {}, branching), 'long');
  const large = Object.fromEntries(Array.from({length:9}, (_, i) => [`room-${i}.ts`, `import './room-${(i+1)%9}';`]));
  run(...await fixture('large', {}, large), 'large');
  run(...await fixture('partial', {'bell.ts':"import './bell';"}, {'bell.ts':"import './bell';\nconst = ;"}), 'partial', 2);
} finally { await rm(temporary, {recursive:true, force:true}); }
