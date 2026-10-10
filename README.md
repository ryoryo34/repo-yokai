# Repo Yokai

[English](./README.md) | [日本語](./README.ja.md)

Turn evidence-backed changes in code analysis into yokai encounters.

## Status

The first local CLI works: **Junkan Nyudo / 循環入道** detects circular dependencies in TypeScript/JavaScript and compares two directories or Git commits. It writes JSON, Markdown, and a standalone HTML report with a CSS character, source paths, line numbers, and refactoring hints. All bundled fixtures are fictional. GitHub Actions summary and artifact integration is available; additional yokai and automatic PR comments are not implemented.

## Install and run

Requires Node.js 22+ and npm (Git 2.43+ for Git mode). Clone this repository, then:

```sh
npm ci --ignore-scripts
npm run build
npm run demo
```

Open `reports/demo/report.html` directly in a browser; no server or network is needed. `reports/demo/report.json` and `reports/demo/report.md` contain the same findings and coverage. Expected demo result: **2 new** (including a self-cycle), **1 continuing**, **1 resolved**.

```sh
node dist/cli.js \
  --base-dir fixtures/zero/base \
  --head-dir fixtures/zero/head \
  --output-dir reports/zero
```

The zero fixture reports no cycles **within the supported scope, never a safety guarantee**. For your own snapshots, replace both input paths and choose a separate output directory. Run on local, unchanging snapshots; input code and configuration are never executed.

Output must not overlap either input tree. Existing `report.json`, `report.html`, or `report.md` files are never overwritten: choose a fresh output directory for another run. Results contain relative source paths and no timestamps, so identical snapshots produce identical report contents regardless of root location.

| Exit | Meaning |
| --- | --- |
| `0` | Report written; supported scope analyzed (cycles may exist) |
| `2` | Report written, but unsupported/unresolved/blocked references or analysis errors occurred; inspect coverage |
| `1` | Fatal input, CLI, or output error; a write failure may leave a partial output directory |

## Compare Git commits

```sh
# Run the trusted, built analyzer; output must be outside the target repository.
node dist/cli.js --repo /path/to/target-repo \
  --base BASE_COMMIT --head HEAD_COMMIT \
  --output-dir /path/to/new-report-directory
```

Use two locally available commit SHAs or commit-ish refs. Refs are resolved once to full commit SHAs, recorded as `comparison.baseSha` / `comparison.headSha` in JSON and displayed in HTML/Markdown. The comparison is exactly base versus head, not a merge-base calculation or GitHub's synthetic merge commit. Git mode and directory mode cannot be mixed.

Only committed blobs count: dirty, staged and untracked files are ignored. The target working tree, index and branch are not changed. Raw `ls-tree` / `cat-file` reads avoid checkout, hooks, clean/smudge filters, target package scripts, configuration JS, submodule initialization and symlink traversal. Excluded Git links and unsupported source extensions appear in coverage. LFS objects are not downloaded or expanded. Git replace refs and inherited `GIT_*` overrides are ignored; the installed Git binary, local repository administration/configuration, and analyzer installation must be trusted.

Missing commits or objects (including shallow/partial clones) fail with exit 1. The CLI never fetches: obtain the necessary objects yourself before running. Bare repositories are supported. Output must be outside the target worktree and Git metadata directories and cannot contain them. Git snapshots use a private temporary directory outside the repository and are removed on success or ordinary errors; forced process termination may require manual cleanup of `repo-yokai-git-*` in the system temp directory. Concurrent hostile filesystem mutation is outside the guarantee.

Git extraction rejects invalid UTF-8 and unsafe/non-portable paths (including traversal, backslashes, drive/stream colons, reserved device names, and trailing dots/spaces). Newlines and Markdown characters in supported filenames remain data. Case/normalization collisions fail closed. Limits are 32 MiB for a tree listing, 16 MiB per source blob, 128 MiB source content per snapshot, and 30 seconds per Git command; exceeding a limit is fatal. Large projects still consume memory and CPU.

## GitHub Actions / PR Checks

Copy the [workflow example](docs/examples/repo-yokai.yml) to `.github/workflows/repo-yokai.yml` in your repository after reviewing its pinned analyzer SHA. The same workflow runs here as **Repo Yokai**. It uses `pull_request`, `contents: read`, a fresh hosted runner, pinned action commits, and a separately installed, fixed analyzer commit with `npm ci --ignore-scripts`. It fetches the event's base/head SHAs into a bare repository and never checks out or runs the analyzed PR code. It does not use `pull_request_target`, write permissions, PR comments, or shared dependency caches. GitHub.com repositories are supported by this example; initial fork runs may need maintainer approval.

Open **PR → Checks → Repo Yokai → Details**, then the workflow run's **Summary** for counts, key evidence, coverage, and SHAs. Download **repo-yokai-report** from **Artifacts**, unzip, and open `report.html` locally; JSON and Markdown are also included. Exit 2 adds an explicit partial-coverage warning and retains all reports. Exit 1 fails the job; fatal errors and failed tests are never converted to success. Summary output is bounded below GitHub's 1 MiB step limit; full evidence remains in JSON/HTML.

The analyzer SHA is a reviewed trust choice, never derived from the PR's head or branch. Update it intentionally after reviewing a new analyzer commit and its lockfile. As with any `pull_request` workflow, PRs can propose workflow changes: inspect them, use GitHub-hosted isolated runners, and do not add secrets or write permissions. This repository's separate **CI** workflow intentionally builds/tests proposed analyzer code and generates fictional demo/partial reports; it is development CI, while **Repo Yokai** performs target analysis using the pinned tool. See [Actions design and references](docs/ACTIONS.md).

## Detection and comparison

- Parse static relative `import` and `export … from` declarations, including side-effect and type-only imports. This is a source dependency graph, not a claim about runtime failures.
- Analyze `.ts`, `.tsx`, `.js`, `.jsx`. Explicit supported suffixes require an exact file. Otherwise try `.ts`, `.tsx`, `.js`, `.jsx`, then `index` with those suffixes in that order. Dotted stems such as `./service.model` are supported. No `.js` → `.ts` substitution or package metadata resolution.
- Report each strongly connected component (SCC) once, including self-cycles. Each card lists all internal dependency edges (`from`, `to`, 1-based `line`, original `specifier`) separately for base and head. Evidence is a set of real edges, not an invented explanation or exhaustive enumeration of simple cycles.
- The finding key is `circular-dependency:` plus SHA-256 of the sorted, JSON-encoded root-relative file set (forward slashes, case preserved). Same set = `continuing`; only in head = `new`; only in base = `resolved`. Renames or SCC membership changes produce an old resolved finding and a new finding, even if the underlying design problem persists.
- `resolved` means absent from the analyzed head graph. Missing/invalid files and unsupported references can affect **any** status. Check coverage before concluding that a cycle was fixed.

## Coverage and boundaries

JSON, HTML, and Markdown include scope, limitations, discovered/parsed file and edge counts, and per-file notices with line numbers when available. `incomplete` flags unsupported, unresolved, blocked, or error notices. Intentional exclusions alone do not set it; even `incomplete: false` means only the declared scope was analyzed.

Not resolved: packages, absolute imports, tsconfig aliases, dynamic imports, CommonJS `require`, import-equals, import type expressions, JSDoc imports, triple-slash directives, and `.mjs/.cjs/.mts/.cts` sources. JSDoc coverage notices conservatively recognize import syntax in documentation comments. Syntax errors exclude the whole affected file and are reported; imports targeting it become unresolved. No type-checking of the analyzed project is performed.

Excluded directory names at every depth: `node_modules`, `.git`, `dist`, `build`, `coverage`, `out`, `.next`, `.nuxt`. `.d.ts` and non-regular entries are excluded. Other generated files cannot be identified automatically. Symlinks are reported and not followed; a symlink in an input/output root or any parent component is rejected. Relative imports outside the root are blocked. The scanner resolves imports only against the collected in-root file inventory.

No project scripts, JS configuration, or analyzed code are executed, and no analysis data is sent out. HTML escapes untrusted paths/messages/specifiers, uses no script or external asset, and adds a restrictive Content Security Policy. Keep the filesystem unchanged during a run: this CLI is not an OS sandbox and does not defend against concurrent hostile directory replacement. Large repositories are parsed in memory.

## Development

```sh
npm run typecheck
npm test
npm run build
```

Tests cover all lifecycle states, self-cycles, SCC deduplication and membership changes, deterministic output, extension/index resolution, evidence lines, parse failures, unsupported syntax, symlinks, root escapes, non-execution, HTML injection, and CLI output protection. Git tests additionally cover dirty/index preservation, SHA/evidence correctness, missing/shallow history, hostile paths, non-execution of hooks/filters/scripts, temporary cleanup, and safe bounded Markdown.

TypeScript 5.9.3 is the only runtime dependency (Apache-2.0): its stable JavaScript compiler API parses sources through an in-memory host, without loading project configuration. See the [official compiler API examples](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) and [installation guide](https://www.typescriptlang.org/download/). Node built-ins provide the CLI, filesystem operations, hashing and test runner. `@types/node` is development-only; versions are pinned in the lockfile. No UI framework or third-party artwork is used.

`src/types.ts` defines `Rule`, `Snapshot`, `Finding`, and `AnalysisCoverage` as the minimal analyzer boundary. This release runs one rule; a plugin system, other yokai and PR comment posting belong in separate issues. Git snapshots and Actions summaries/artifacts are implemented.

See [vision](docs/VISION.md), [workflow](docs/WORKFLOW.md), and [issues](https://github.com/ryoryo34/repo-yokai/issues). One issue corresponds to one Codex session and one implementation branch.

## License

[MIT](LICENSE)
