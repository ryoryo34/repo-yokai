import { lstat, readdir, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { AnalysisCoverage, CoverageNotice, Evidence, Snapshot } from './types.js';

const extensions = ['.ts', '.tsx', '.js', '.jsx'];
export const excluded = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'out', '.next', '.nuxt']);
export const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const portable = (p: string): string => p.split(path.sep).join('/');
export function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
// Check every existing component, including a symlink supplied as the root.
export async function assertNoSymlinks(target: string): Promise<void> {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlink paths are not supported.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}
export async function inputRoot(input: string): Promise<string> {
  const root = path.resolve(input);
  await assertNoSymlinks(root);
  if (!(await lstat(root)).isDirectory()) throw new Error('Input root must be a directory.');
  return realpath(root);
}

export async function analyze(input: string): Promise<Snapshot> {
  const root = await inputRoot(input);
  const coverage: AnalysisCoverage = {
    scope: ['Static relative import/export declarations, including type-only imports', '.ts/.tsx/.js/.jsx; exact extension, extensionless files, then directory index'],
    limitations: ['Not a safety guarantee or a runtime dependency graph.', 'No package/alias/tsconfig resolution, extension substitution, require, dynamic import, import-equals, import types, JSDoc imports or triple-slash resolution.', 'Declaration files, symlinks and named generated directories are excluded; other generated files cannot be identified automatically.', 'Inputs must remain unchanged during analysis; no protection against concurrent hostile filesystem mutation.'],
    filesDiscovered: 0, filesParsed: 0, edgesResolved: 0, incomplete: false, notices: [],
  };
  const notice = (kind: CoverageNotice['kind'], file: string, message: string, line?: number): void => {
    coverage.notices.push({ kind, file, ...(line === undefined ? {} : { line }), message });
    if (kind !== 'excluded') coverage.incomplete = true;
  };
  const files: string[] = [];
  const directories = [root];
  while (directories.length) {
    const directory = directories.pop()!;
    try {
      await assertNoSymlinks(directory);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        const relative = portable(path.relative(root, full));
        if (entry.isSymbolicLink()) notice('blocked', relative, 'Symlink not followed.');
        else if (entry.isDirectory()) {
          if (excluded.has(entry.name)) notice('excluded', relative, 'Excluded directory.');
          else directories.push(full);
        } else if (entry.isFile()) {
          if (entry.name.endsWith('.d.ts')) notice('excluded', relative, 'Declaration file excluded.');
          else if (extensions.includes(path.extname(entry.name))) files.push(relative);
          else if (/\.(?:mts|cts|mjs|cjs)$/.test(entry.name)) notice('unsupported', relative, 'Unsupported source extension.');
        } else notice('excluded', relative, 'Non-regular filesystem entry excluded.');
      }
    } catch { notice('error', portable(path.relative(root, directory)) || '.', 'Cannot safely read directory.'); }
  }
  files.sort(compareText);
  coverage.filesDiscovered = files.length;
  const sources = new Map<string, ts.SourceFile>();
  for (const file of files) {
    const full = path.join(root, file);
    try {
      await assertNoSymlinks(full);
      const handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        if (!(await handle.stat()).isFile()) throw new Error('Not a regular file');
        sources.set(file, ts.createSourceFile(file, await handle.readFile('utf8'), ts.ScriptTarget.Latest, true));
      } finally { await handle.close(); }
    } catch { notice('error', file, 'Cannot safely read source.'); }
  }
  // In-memory compiler host: never loads tsconfig, packages, libraries or project code.
  const host: ts.CompilerHost = {
    getSourceFile: name => sources.get(name), getDefaultLibFileName: () => '', writeFile: () => {},
    getCurrentDirectory: () => '', getDirectories: () => [], fileExists: name => sources.has(name),
    readFile: () => undefined, getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  };
  const program = ts.createProgram([...sources.keys()], { noResolve: true, noLib: true, allowJs: true, checkJs: false, jsx: ts.JsxEmit.Preserve }, host);
  const valid = new Map<string, ts.SourceFile>();
  for (const [file, source] of sources) {
    const diagnostics = program.getSyntacticDiagnostics(source);
    if (diagnostics.length) {
      for (const diagnostic of diagnostics) notice('error', file, ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'), source.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1);
    } else valid.set(file, source);
  }
  coverage.filesParsed = valid.size;
  const inventory = new Set(files);
  const edges: Evidence[] = [];
  for (const [file, source] of valid) {
    function resolveImport(specifier: string, line: number): void {
      if (!(specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..')) {
        notice('unsupported', file, `Non-relative module: ${specifier}`, line); return;
      }
      const target = path.resolve(root, path.dirname(file), specifier);
      if (!isWithin(root, target)) { notice('blocked', file, `Reference outside root: ${specifier}`, line); return; }
      const relative = portable(path.relative(root, target));
      const candidates = extensions.includes(path.extname(target)) ? [relative] : [...extensions.map(ext => relative + ext), ...extensions.map(ext => portable(path.join(relative, 'index' + ext)))];
      const found = candidates.find(candidate => inventory.has(candidate));
      if (!found) { notice('unresolved', file, `Unresolved relative module (possibly excluded or symlink): ${specifier}`, line); return; }
      if (!valid.has(found)) { notice('unresolved', file, `Target could not be parsed: ${specifier}`, line); return; }
      edges.push({ from: file, to: found, line, specifier });
    }
    // JSDoc nodes are not part of the ordinary forEachChild traversal.
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source.text);
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.MultiLineCommentTrivia && scanner.getTokenText().startsWith('/**') && /(?:@import\b|\bimport\s*\()/.test(scanner.getTokenText())) {
        notice('unsupported', file, 'JSDoc import syntax is not resolved.', source.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1);
      }
    }
    const pending: ts.Node[] = [source];
    while (pending.length) {
      const node = pending.pop()!;
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (ts.isStringLiteral(node.moduleSpecifier)) resolveImport(node.moduleSpecifier.text, line);
        else notice('unsupported', file, 'Non-literal module declaration.', line);
      } else if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node)) {
        notice('unsupported', file, 'Import-equals or import type is not resolved.', line);
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        notice('unsupported', file, 'Dynamic import or require is not resolved.', line);
      }
      ts.forEachChild(node, child => { pending.push(child); });
    }
    for (const ref of [...source.referencedFiles, ...source.typeReferenceDirectives, ...source.libReferenceDirectives]) {
      notice('unsupported', file, 'Triple-slash directive is not resolved.', source.getLineAndCharacterOfPosition(ref.pos).line + 1);
    }
  }
  edges.sort((a, b) => compareText(a.from, b.from) || a.line - b.line || compareText(a.to, b.to));
  coverage.edgesResolved = edges.length;
  coverage.notices.sort((a, b) => compareText(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || compareText(a.kind, b.kind) || compareText(a.message, b.message));
  return { files: [...valid.keys()].sort(compareText), edges, analysisCoverage: coverage };
}
