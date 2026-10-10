import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyze, compareText, excluded, inputRoot, isWithin } from './analyze.js';
import { compareSnapshots } from './report.js';
import type { CoverageNotice, Report } from './types.js';

const execute = promisify(execFile);
const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
// Remove inherited Git overrides (including config injections and alternate indexes).
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
Object.assign(environment, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
});
async function git(repo: string, args: string[], maxBuffer = 32 * 1024 * 1024): Promise<Buffer> {
  try {
    const { stdout } = await execute('git', ['--no-pager', '--no-optional-locks', '--no-replace-objects',
      '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.allow=never',
      '-C', repo, ...args], { env: environment, encoding: 'buffer', maxBuffer, timeout: 30_000 });
    return stdout;
  } catch {
    // Do not echo repository-controlled diagnostics or terminal control characters.
    throw new Error(`Git ${args[0]} failed: missing/invalid commit or object, shallow/partial history, resource limit, or invalid repository. Supply local commits; no automatic fetch is performed.`);
  }
}
async function resolveCommit(repo: string, ref: string): Promise<string> {
  if (!ref || ref.startsWith('-') || /[\x00-\x20\x7f]/.test(ref)) throw new Error('Invalid Git ref.');
  const sha = (await git(repo, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).toString('utf8').trim();
  if (!oidPattern.test(sha)) throw new Error('Git ref did not resolve to a full commit SHA.');
  return sha;
}
export async function gitRoots(input: string): Promise<string[]> {
  const repo = await inputRoot(input);
  const gitDir = (await git(repo, ['rev-parse', '--absolute-git-dir'])).toString('utf8').trimEnd();
  const bare = (await git(repo, ['rev-parse', '--is-bare-repository'])).toString('utf8').trim() === 'true';
  const root = bare ? repo : (await git(repo, ['rev-parse', '--show-toplevel'])).toString('utf8').trimEnd();
  const common = (await git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).toString('utf8').trimEnd();
  return Promise.all([root, gitDir, common].map(inputRoot));
}
export function safeSnapshotPath(root: string, name: string): string {
  // Backslashes, drive letters, NTFS streams and .git aliases are not portable paths.
  if (name.includes('\\') || name.includes(':') || name.includes('\0') || name.split('/').some(part =>
    !part || part === '.' || part === '..' || /^\.git(?:[ .]|$)/i.test(part) || /[ .]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Unsafe or non-portable Git tree path.');
  }
  const target = path.resolve(root, name);
  if (target === root || !isWithin(root, target)) throw new Error('Git tree path escapes snapshot root.');
  return target;
}
async function snapshot(repo: string, sha: string, root: string): Promise<CoverageNotice[]> {
  const listing = await git(repo, ['ls-tree', '-r', '-t', '-z', '--full-tree', sha]);
  // Reject undecodable bytes instead of silently colliding paths via replacement characters.
  const entries = new TextDecoder('utf-8', { fatal: true }).decode(listing).split('\0').filter(Boolean);
  const notices: CoverageNotice[] = [];
  let sourceBytes = 0;
  for (const entry of entries) {
    const match = /^(\d{6}) (blob|tree|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
    if (!match || !oidPattern.test(match[3]!)) throw new Error('Invalid Git tree entry.');
    const mode = match[1]!; const type = match[2]!; const oid = match[3]!; const name = match[4]!;
    const parts = name.split('/');
    if (parts.slice(0, -1).some(part => excluded.has(part))) continue;
    if (type === 'tree' && excluded.has(parts.at(-1)!)) {
      notices.push({ kind: 'excluded', file: name, message: 'Excluded directory.' }); continue;
    }
    const target = safeSnapshotPath(root, name);
    if (mode === '120000' || mode === '160000') {
      notices.push({ kind: 'blocked', file: name, message: mode === '120000' ? 'Git symlink not followed.' : 'Git submodule not followed.' }); continue;
    }
    if (type === 'tree') continue;
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error('Unsupported Git tree mode.');
    if (name.endsWith('.d.ts')) { notices.push({ kind: 'excluded', file: name, message: 'Declaration file excluded.' }); continue; }
    if (/\.(?:mjs|cjs|mts|cts)$/.test(name)) { notices.push({ kind: 'unsupported', file: name, message: 'Unsupported source extension.' }); continue; }
    if (!/\.(?:ts|tsx|js|jsx)$/.test(name)) continue;
    const content = await git(repo, ['cat-file', 'blob', oid], 16 * 1024 * 1024);
    sourceBytes += content.length;
    if (sourceBytes > 128 * 1024 * 1024) throw new Error('Git snapshot source content exceeds 128 MiB.');
    await mkdir(path.dirname(target), { recursive: true });
    // Never create links or preserve executable bits. Fail closed on path collisions.
    await writeFile(target, content, { flag: 'wx', mode: 0o600 });
  }
  return notices;
}
export async function createGitReport(input: string, base: string, head: string): Promise<Report> {
  const repo = await inputRoot(input);
  const roots = await gitRoots(repo);
  const baseSha = await resolveCommit(repo, base);
  const headSha = await resolveCommit(repo, head);
  const tempParent = await realpath(tmpdir());
  if (roots.some(root => isWithin(root, tempParent))) throw new Error('Temporary directory must be outside the repository.');
  const temp = await mkdtemp(path.join(tempParent, 'repo-yokai-git-'));
  try {
    const snapshots = [];
    for (const [label, sha] of [['base', baseSha], ['head', headSha]] as const) {
      const directory = path.join(temp, label);
      await mkdir(directory);
      const notices = await snapshot(repo, sha, directory);
      const result = await analyze(directory);
      const coverage = result.analysisCoverage;
      coverage.notices.push(...notices);
      coverage.notices.sort((a, b) => compareText(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || compareText(a.kind, b.kind) || compareText(a.message, b.message));
      coverage.incomplete ||= notices.some(notice => notice.kind !== 'excluded');
      coverage.scope.push('Committed Git blobs only; working tree and index changes are not included.');
      coverage.limitations.push('Git symlinks and submodules are not followed. No checkout, filters, hooks, or project scripts are run.');
      snapshots.push(result);
    }
    return { ...compareSnapshots(snapshots[0]!, snapshots[1]!), comparison: { mode: 'git', baseSha, headSha } };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
