import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyze } from '../dist/analyze.js';
import { createReport, circularDependency } from '../dist/report.js';
import { renderHtml } from '../dist/html.js';

async function setup(t, base = {}, head = base) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'repo-yokai-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [snapshot, files] of Object.entries({ base, head })) {
    await mkdir(path.join(root, snapshot));
    for (const [name, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, snapshot, name)), { recursive: true });
      await writeFile(path.join(root, snapshot, name), text);
    }
  }
  return { root, base: path.join(root, 'base'), head: path.join(root, 'head'), output: path.join(root, 'output') };
}
const cli = (base, head, output, extra = []) => spawnSync(process.execPath, ['dist/cli.js', '--base-dir', base, '--head-dir', head, '--output-dir', output, ...extra], { encoding: 'utf8' });

test('demo classifies new, continuing, resolved and self cycles with real source lines', async () => {
  const report = await createReport('fixtures/demo/base', 'fixtures/demo/head');
  assert.deepEqual(report.findings.reduce((counts, f) => { counts[f.status]++; return counts; }, { new: 0, continuing: 0, resolved: 0 }), { new: 2, continuing: 1, resolved: 1 });
  assert.ok(report.findings.some(f => f.files.length === 1 && f.files[0] === 'self/bell.ts'));
  for (const finding of report.findings) {
    for (const snapshot of ['base', 'head']) {
      for (const edge of finding.evidence[snapshot]) {
        const source = await readFile(`fixtures/demo/${snapshot}/${edge.from}`, 'utf8');
        assert.ok(source.split('\n')[edge.line - 1].includes(edge.specifier));
        assert.ok(finding.files.includes(edge.to));
      }
    }
    if (finding.status === 'resolved') assert.equal(finding.evidence.head.length, 0);
    if (finding.status === 'new') assert.equal(finding.evidence.base.length, 0);
  }
  assert.equal(report.analysisCoverage.base.incomplete, false);
});

test('one SCC with multiple simple cycles; stable reports and keys across input roots', async t => {
  const files = { 'a.ts': "import './b';\nimport './c';", 'b.ts': "export * from './a';", 'c.ts': "import './a';" };
  const dirs = await setup(t, files);
  const report = await createReport(dirs.base, dirs.head);
  assert.equal(report.findings.length, 1);
  assert.deepEqual(report.findings[0].files, ['a.ts', 'b.ts', 'c.ts']);
  assert.equal(report.findings[0].evidence.head.length, 4);
  assert.equal(JSON.stringify(report), JSON.stringify(await createReport(dirs.base, dirs.head)));
  const other = await setup(t, Object.fromEntries(Object.entries(files).reverse()));
  assert.deepEqual(report, await createReport(other.base, other.head));
});

test('changed SCC membership resolves old set and introduces new set', async t => {
  const dirs = await setup(t, { 'a.ts': "import './b';", 'b.ts': "import './a';" }, { 'a.ts': "import './b';", 'b.ts': "import './c';", 'c.ts': "import './a';" });
  const report = await createReport(dirs.base, dirs.head);
  assert.deepEqual(report.findings.map(f => f.status).sort(), ['new', 'resolved']);
  assert.equal(report.findings.find(f => f.status === 'resolved').files.length, 2);
});

test('zero findings explicitly do not guarantee safety', async () => {
  const report = await createReport('fixtures/zero/base', 'fixtures/zero/head');
  assert.deepEqual(report.findings, []);
  assert.match(renderHtml(report), /安全を保証する結果ではありません/);
  assert.match(report.warning, /Zero findings do not guarantee safety/);
});

test('TS, TSX, JS, JSX, directory index, exports and type-only edges', async t => {
  const dirs = await setup(t, { 'a.ts': "\nexport type { B } from './nested';", 'nested/index.tsx': "import './b.js';", 'nested/b.js': "export * from './c.jsx';", 'nested/c.jsx': "import '../a.ts';" });
  const snapshot = await analyze(dirs.base);
  assert.equal(snapshot.edges.length, 4);
  assert.equal(snapshot.edges.find(e => e.from === 'a.ts').line, 2);
  assert.equal(circularDependency.detect(snapshot).length, 1);
  assert.equal(snapshot.analysisCoverage.incomplete, false);
});

test('unsupported syntax, missing targets and parse errors are visible and cannot make false cycle evidence', async t => {
  const dirs = await setup(t, {
    'main.ts': "import 'pkg';\nimport '@/alias';\nimport('./dynamic');\nrequire('./cjs');\nimport legacy = require('./legacy');\ntype T = import('./types').T;\nimport './missing';\nimport './broken';\n/// text\n",
    'broken.ts': 'export const = ;',
    'refs.ts': '/// <reference path="./missing.d.ts" />\nexport {};',
    'module.mjs': "import './main.ts'",
  });
  const snapshot = await analyze(dirs.base);
  assert.equal(snapshot.analysisCoverage.incomplete, true);
  assert.equal(snapshot.edges.length, 0);
  assert.ok(snapshot.analysisCoverage.notices.some(n => n.file === 'broken.ts' && n.kind === 'error' && n.line === 1));
  assert.ok(snapshot.analysisCoverage.notices.some(n => n.message.includes('Triple-slash')));
  assert.ok(snapshot.analysisCoverage.notices.filter(n => n.kind === 'unsupported').length >= 8);
  const result = cli(dirs.base, dirs.head, dirs.output);
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(await readFile(path.join(dirs.output, 'report.json'), 'utf8'));
  assert.equal(report.analysisCoverage.head.incomplete, true);
});

test('root escapes and symlinks are blocked, generated paths excluded, no outside evidence', async t => {
  const dirs = await setup(t, { 'main.ts': "import '../outside';\nimport './link';\nimport './linked/secret';\nimport './dist/generated';", 'dist/generated.ts': "import '../main';", 'node_modules/pkg/index.ts': 'invalid ???', '.git/fake.ts': 'invalid ???', 'types.d.ts': 'export {};', 'safe.ts': 'export {};' });
  await writeFile(path.join(dirs.root, 'outside.ts'), "import './base/main';");
  await mkdir(path.join(dirs.root, 'secrets'));
  await writeFile(path.join(dirs.root, 'secrets/secret.ts'), 'private content');
  await symlink(path.join(dirs.root, 'outside.ts'), path.join(dirs.base, 'link.ts'));
  await symlink(path.join(dirs.root, 'secrets'), path.join(dirs.base, 'linked'));
  const snapshot = await analyze(dirs.base);
  assert.deepEqual(snapshot.files, ['main.ts', 'safe.ts']);
  assert.equal(snapshot.edges.length, 0);
  assert.ok(snapshot.analysisCoverage.notices.some(n => n.message.includes('outside root')));
  assert.equal(snapshot.analysisCoverage.notices.filter(n => n.message === 'Symlink not followed.').length, 2);
  assert.ok(!JSON.stringify(snapshot).includes('private content'));
  await symlink(dirs.base, path.join(dirs.root, 'root-link'));
  await assert.rejects(analyze(path.join(dirs.root, 'root-link')), /Symlink/);
  await assert.rejects(analyze(path.join(dirs.root, 'root-link/dist')), /Symlink/);
});

test('input code and executable configuration are never executed', async t => {
  const dirs = await setup(t);
  const sentinel = path.join(dirs.root, 'EXECUTED');
  const payload = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'bad');`;
  await writeFile(path.join(dirs.base, 'main.js'), payload);
  await writeFile(path.join(dirs.base, 'config.js'), payload);
  await writeFile(path.join(dirs.base, 'tsconfig.json'), 'not even valid JSON');
  await writeFile(path.join(dirs.base, 'package.json'), JSON.stringify({ scripts: { prepare: 'exit 42' } }));
  const result = cli(dirs.base, dirs.head, dirs.output);
  assert.equal(result.status, 2);
  await assert.rejects(readFile(sentinel), { code: 'ENOENT' });
});

test('HTML injection in filenames, module specifiers and parser diagnostics is escaped', async t => {
  const payload = '<img src=x onerror=alert(1)>';
  const filename = `${payload}.ts`;
  const dirs = await setup(t, { [filename]: `import './${payload}';\nimport '${payload}';`, 'broken.ts': `const ${payload}` });
  const report = await createReport(dirs.base, dirs.head);
  assert.equal(report.findings.length, 1);
  const html = renderHtml(report);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /form-action 'none'/);
});

test('CLI validates options, protects input/output and refuses existing report or output symlink', async t => {
  const dirs = await setup(t, { 'a.ts': "import './a';" });
  assert.equal(cli(dirs.base, dirs.head, dirs.base).status, 1);
  assert.equal(cli(dirs.base, dirs.head, path.join(dirs.base, 'report')).status, 1);
  assert.equal(cli(dirs.base, dirs.head, dirs.root).status, 1);
  assert.equal(cli(dirs.base, dirs.head, dirs.output, ['--unknown']).status, 1);
  assert.equal(cli(path.join(dirs.root, 'missing'), dirs.head, dirs.output).status, 1);
  const result = cli(dirs.base, dirs.head, dirs.output);
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(path.join(dirs.output, 'report.html'), 'utf8'), /循環入道/);
  const original = await readFile(path.join(dirs.output, 'report.json'), 'utf8');
  assert.equal(cli(dirs.base, dirs.head, dirs.output).status, 1);
  assert.equal(await readFile(path.join(dirs.output, 'report.json'), 'utf8'), original);
  const linked = path.join(dirs.root, 'linked-output');
  await symlink(dirs.output, linked);
  assert.equal(cli(dirs.base, dirs.head, linked).status, 1);
  const output2 = path.join(dirs.root, 'output2');
  await mkdir(output2);
  await symlink(path.join(dirs.root, 'does-not-exist'), path.join(output2, 'report.html'));
  assert.equal(cli(dirs.base, dirs.head, output2).status, 1);
  await assert.rejects(readFile(path.join(dirs.root, 'does-not-exist')), { code: 'ENOENT' });
});

test('iterative SCC traversal handles a deep chain without call-stack overflow', () => {
  const files = Array.from({ length: 12000 }, (_, i) => `${i}.ts`);
  const edges = files.slice(1).map((to, i) => ({ from: files[i], to, line: 1, specifier: `./${to}` }));
  assert.equal(circularDependency.detect({ files, edges }).length, 0);
  edges.push({ from: files.at(-1), to: files[0], line: 1, specifier: './0.ts' });
  assert.equal(circularDependency.detect({ files, edges })[0].files.length, 12000);
});

test('dotted file stems resolve; JS extension substitution is deliberately unsupported', async t => {
  const dirs = await setup(t, { 'main.ts': "import './service.model';\nimport './missing.js';", 'service.model.ts': "import './main';", 'missing.ts': 'export {};' });
  const snapshot = await analyze(dirs.base);
  assert.equal(circularDependency.detect(snapshot).length, 1);
  assert.ok(snapshot.analysisCoverage.notices.some(n => n.kind === 'unresolved' && n.message.includes('./missing.js')));
});

test('comments and strings do not create edges; JSDoc imports have coverage notices', async t => {
  const dirs = await setup(t, { 'main.js': `// import './main';\nconst text = "import './main'";\n/** @type {import('./main').Thing} */\nconst item = {};\n/** @import { Thing } from './main' */\nexport {};` });
  const snapshot = await analyze(dirs.base);
  assert.equal(snapshot.edges.length, 0);
  assert.equal(snapshot.analysisCoverage.notices.filter(n => n.message.includes('JSDoc')).length, 2);
  assert.equal(snapshot.analysisCoverage.incomplete, true);
});

test('syntax failure in head exposes uncertainty even when a base SCC becomes resolved', async t => {
  const dirs = await setup(t, { 'a.ts': "import './a';" }, { 'a.ts': "import './a';\nconst = ;" });
  const report = await createReport(dirs.base, dirs.head);
  assert.equal(report.findings[0].status, 'resolved');
  assert.equal(report.findings[0].analysisCoverage.head.incomplete, true);
  assert.match(report.warning, /incomplete coverage can change any status/);
});
