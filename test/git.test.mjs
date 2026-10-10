import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm, readdir, cp, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGitReport, safeSnapshotPath } from '../dist/git.js';
import { renderMarkdown } from '../dist/markdown.js';
import { renderHtml } from '../dist/html.js';

const cliPath = path.resolve('dist/cli.js');
function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
async function setup(t) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'repo-yokai-integration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); const temp = path.join(root, 'temp');
  await mkdir(repo); await mkdir(temp);
  git(repo, 'init', '-q'); git(repo, 'config', 'user.name', 'Fixture'); git(repo, 'config', 'user.email', 'fixture@example.invalid');
  return { root, repo, temp };
}
function commit(repo, message) { git(repo, 'add', '.'); git(repo, 'commit', '-qm', message); return git(repo, 'rev-parse', 'HEAD'); }
function cli(dirs, base, head, name = 'output', extra = [], env = {}) {
  return spawnSync(process.execPath, [cliPath, '--repo', dirs.repo, '--base', base, '--head', head, '--output-dir', path.join(dirs.root, name), ...extra], { encoding: 'utf8', env: { ...process.env, TMPDIR: dirs.temp, TEMP: dirs.temp, TMP: dirs.temp, ...env } });
}
async function absent(file) { await assert.rejects(readFile(file), { code: 'ENOENT' }); }

test('Git commit snapshots reproduce demo evidence and leave dirty tree/index/branch unchanged', async t => {
  const dirs = await setup(t);
  await cp('fixtures/demo/base', dirs.repo, { recursive: true });
  const base = commit(dirs.repo, 'base');
  for (const name of await readdir(dirs.repo)) if (name !== '.git') await rm(path.join(dirs.repo, name), { recursive: true });
  await cp('fixtures/demo/head', dirs.repo, { recursive: true });
  const head = commit(dirs.repo, 'head');
  git(dirs.repo, 'tag', '-a', 'base-tag', '-m', 'base tag', base);
  await writeFile(path.join(dirs.repo, 'self/bell.ts'), 'staged change'); git(dirs.repo, 'add', '.');
  await writeFile(path.join(dirs.repo, 'self/bell.ts'), 'unstaged change');
  await writeFile(path.join(dirs.repo, 'untracked.ts'), "import './untracked';");
  const state = () => [git(dirs.repo, 'status', '--porcelain=v1', '-z'), git(dirs.repo, 'symbolic-ref', 'HEAD'), git(dirs.repo, 'diff'), git(dirs.repo, 'diff', '--cached')];
  const before = state(); const index = await readFile(path.join(dirs.repo, '.git/index'));
  const result = cli(dirs, 'base-tag', 'HEAD'); assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(path.join(dirs.root, 'output/report.json'), 'utf8'));
  assert.deepEqual(report.comparison, { mode: 'git', baseSha: base, headSha: head });
  assert.deepEqual(report.findings.reduce((n, f) => { n[f.status]++; return n; }, { new: 0, continuing: 0, resolved: 0 }), { new: 2, continuing: 1, resolved: 1 });
  for (const finding of report.findings) for (const label of ['base', 'head']) for (const edge of finding.evidence[label]) {
    const source = git(dirs.repo, 'show', `${label === 'base' ? base : head}:${edge.from}`);
    assert.ok(source.split('\n')[edge.line - 1].includes(edge.specifier));
  }
  for (const suffix of ['html', 'md']) {
    const content = await readFile(path.join(dirs.root, `output/report.${suffix}`), 'utf8');
    assert.ok(content.includes(base) && content.includes(head));
  }
  assert.deepEqual(state(), before); assert.deepEqual(await readFile(path.join(dirs.repo, '.git/index')), index);
  assert.equal(await readFile(path.join(dirs.repo, 'self/bell.ts'), 'utf8'), 'unstaged change');
  assert.deepEqual(await readdir(dirs.temp), []);
  const again = cli(dirs, base, head, 'again'); assert.equal(again.status, 0, again.stderr);
  for (const suffix of ['json', 'html', 'md']) assert.deepEqual(await readFile(path.join(dirs.root, `again/report.${suffix}`)), await readFile(path.join(dirs.root, `output/report.${suffix}`)));
});

test('symlinks, submodules, root escapes, scripts, Git filters/hooks and hostile filenames are inert', async t => {
  const dirs = await setup(t); const sentinel = path.join(dirs.root, 'EXECUTED');
  await writeFile(path.join(dirs.repo, 'a.ts'), "import './a';\nimport '../outside';\nimport './link';");
  await writeFile(path.join(dirs.repo, 'config.js'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'bad');`);
  await writeFile(path.join(dirs.repo, 'package.json'), JSON.stringify({ scripts: { prepare: `touch ${sentinel}` } }));
  const hostile = 'line\n`[x](https:evil) <img src=x> @someone.ts';
  // Colons are deliberately rejected by portable extraction; this variant is supported.
  const supported = hostile.replace(':', '-');
  await writeFile(path.join(dirs.repo, supported), 'export {};');
  await symlink(sentinel, path.join(dirs.repo, 'link.ts'));
  const base = commit(dirs.repo, 'base');
  git(dirs.repo, 'update-index', '--add', '--cacheinfo', `160000,${base},vendor`);
  git(dirs.repo, 'commit', '-qm', 'gitlink'); const head = git(dirs.repo, 'rev-parse', 'HEAD');
  await writeFile(path.join(dirs.repo, '.git/hooks/post-checkout'), `#!/bin/sh\ntouch '${sentinel}'\n`); await chmod(path.join(dirs.repo, '.git/hooks/post-checkout'), 0o755);
  const marker = path.join(dirs.root, 'hook'); await writeFile(marker, `#!/bin/sh\ntouch '${sentinel}'\n`); await chmod(marker, 0o755);
  git(dirs.repo, 'config', 'core.fsmonitor', marker);
  git(dirs.repo, 'config', 'filter.evil.smudge', marker); git(dirs.repo, 'config', 'filter.evil.required', 'true');
  await writeFile(path.join(dirs.repo, '.git/info/attributes'), '*.ts filter=evil');
  const result = cli(dirs, base, head); assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(await readFile(path.join(dirs.root, 'output/report.json'), 'utf8'));
  assert.ok(report.analysisCoverage.head.notices.some(n => n.message.includes('submodule')));
  assert.ok(report.analysisCoverage.head.notices.some(n => n.message.includes('symlink')));
  assert.ok(report.analysisCoverage.head.notices.some(n => n.message.includes('outside root')));
  assert.equal(report.analysisCoverage.head.filesParsed, 3);
  assert.ok(!renderHtml(report).includes('<img'));
  await absent(sentinel); assert.deepEqual(await readdir(dirs.temp), []);
});

test('invalid refs, mixed CLI modes and overlapping outputs fail without reports', async t => {
  const dirs = await setup(t); await writeFile(path.join(dirs.repo, 'a.ts'), 'export {};'); const sha = commit(dirs.repo, 'one');
  for (const ref of ['missing', '--help', 'HEAD\n', 'HEAD;touch injected', 'HEAD:a.ts']) {
    const result = cli(dirs, ref, sha); assert.equal(result.status, 1, result.stderr); await absent(path.join(dirs.root, 'output/report.json'));
  }
  assert.equal(cli(dirs, sha, sha, 'output', ['--base-dir', dirs.repo]).status, 1);
  assert.equal(cli(dirs, sha, sha, 'repo/reports').status, 1);
  assert.equal(cli(dirs, sha, sha, '.').status, 1);
  await symlink(dirs.root, path.join(dirs.root, 'linked'));
  assert.equal(cli(dirs, sha, sha, 'linked/report').status, 1);
  assert.equal(cli(dirs, sha, sha).status, 0);
  const original = await readFile(path.join(dirs.root, 'output/report.json'));
  assert.equal(cli(dirs, sha, sha).status, 1);
  assert.deepEqual(await readFile(path.join(dirs.root, 'output/report.json')), original);
  assert.deepEqual(await readdir(dirs.temp), []);
});

test('missing shallow history is fatal without auto-fetch; replace refs cannot rewrite comparison', async t => {
  const dirs = await setup(t); await writeFile(path.join(dirs.repo, 'a.ts'), "import './a';"); const base = commit(dirs.repo, 'base');
  await writeFile(path.join(dirs.repo, 'a.ts'), 'export {};'); const head = commit(dirs.repo, 'head');
  git(dirs.repo, 'replace', base, head);
  const report = await createGitReport(dirs.repo, base, head); assert.equal(report.findings[0].status, 'resolved');
  const shallow = path.join(dirs.root, 'shallow');
  git(dirs.repo, 'clone', '-q', '--depth=1', `file://${dirs.repo}`, shallow);
  const result = cli({ ...dirs, repo: shallow }, base, head); assert.equal(result.status, 1); assert.match(result.stderr, /shallow/);
  await absent(path.join(dirs.root, 'output/report.json'));
  assert.deepEqual(await readdir(dirs.temp), []);
});

test('unsafe tree paths fail closed and cleanup runs after extraction failure', async t => {
  const dirs = await setup(t); await writeFile(path.join(dirs.repo, 'a.ts'), 'export {};'); const base = commit(dirs.repo, 'base');
  for (const name of ['../escape.ts', '/absolute.ts', 'dir/../../escape.ts', 'C:/outside.ts', 'dir\\file.ts', '.GIT/config', 'a/./b.ts', 'a//b.ts', 'NUL.ts']) assert.throws(() => safeSnapshotPath(dirs.temp, name));
  const blob = git(dirs.repo, 'rev-parse', `${base}:a.ts`);
  const raw = Buffer.concat([Buffer.from('100644 ../ESCAPED.ts\0'), Buffer.from(blob, 'hex')]);
  const tree = spawnSync('git', ['-C', dirs.repo, 'hash-object', '-w', '--literally', '-t', 'tree', '--stdin'], { input: raw, encoding: 'utf8' });
  assert.equal(tree.status, 0, tree.stderr);
  const malicious = git(dirs.repo, 'commit-tree', tree.stdout.trim(), '-m', 'malformed tree');
  const result = cli(dirs, base, malicious); assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Unsafe|escapes/); await absent(path.join(dirs.temp, 'ESCAPED.ts'));
  assert.deepEqual(await readdir(dirs.temp), []);
  assert.equal(cli(dirs, base, base, 'output', [], { TMPDIR: dirs.repo, TEMP: dirs.repo, TMP: dirs.repo }).status, 1);
});

test('Markdown neutralizes filenames, specifiers, diagnostics, mentions and control characters with bounded evidence', async t => {
  const dirs = await setup(t);
  const filename = 'odd\n`![x](url) <img> @user.ts';
  await writeFile(path.join(dirs.repo, filename), `import ${JSON.stringify('./' + filename)};\nimport '<script>';`);
  const sha = commit(dirs.repo, 'hostile text'); const report = await createGitReport(dirs.repo, sha, sha);
  const md = renderMarkdown(report);
  assert.equal(report.findings.length, 1); assert.ok(report.findings[0].evidence.head[0].from.includes('\n'));
  for (const forbidden of ['<img>', '<script>', '@user', '![x]', '`', 'odd\n']) assert.ok(!md.includes(forbidden), forbidden);
  assert.match(md, /&#92;n/); assert.match(md, /PARTIAL/); assert.match(md, /head:.*:1/);
  const many = { ...report, findings: Array(200).fill(report.findings[0]) };
  assert.match(renderMarkdown(many), /180 more findings/);
  assert.ok(Buffer.byteLength(renderMarkdown(many)) < 1024 * 1024);
  const hugeEdge = { from: '😀'.repeat(300), to: '😀'.repeat(300), specifier: '😀'.repeat(300), line: 1 };
  const huge = { ...report.findings[0], evidence: { base: Array(8).fill(hugeEdge), head: Array(8).fill(hugeEdge) } };
  const bounded = renderMarkdown({ ...report, findings: Array(20).fill(huge) });
  assert.ok(Buffer.byteLength(bounded) < 1024 * 1024);
  assert.match(bounded, /Summary size limit/);
});

test('bare repositories work and Git environment overrides cannot redirect input', async t => {
  const dirs = await setup(t); await writeFile(path.join(dirs.repo, 'a.ts'), "import './a';"); const sha = commit(dirs.repo, 'one');
  const bare = path.join(dirs.root, 'bare'); git(dirs.repo, 'clone', '-q', '--bare', dirs.repo, bare);
  const result = cli({ ...dirs, repo: bare }, sha, sha, 'output', [], { GIT_DIR: '/missing', GIT_WORK_TREE: '/missing', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: '/missing' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(path.join(dirs.root, 'output/report.json'), 'utf8')); assert.equal(report.findings[0].status, 'continuing');
});
