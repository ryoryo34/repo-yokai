# Issue #1 validation

Validated on Node.js v25.4.0 / npm 11.7.0.

- `npm ci --ignore-scripts`: successful clean install; audit reported zero vulnerabilities.
- `npm run typecheck`: passed.
- `npm test`: 14 tests passed; includes `npm run build`.
- Demo CLI: new=2, continuing=1, resolved=1; JSON and HTML written, exit 0.
- Zero fixture CLI: new=0, continuing=0, resolved=0; explicit no-safety-guarantee message, exit 0.
- Partial-coverage CLI tested with unsupported syntax and parse errors: report written, exit 2.
- Fatal arguments, overlapping roots, existing outputs, and symlink output tested: exit 1, existing files preserved.
- Regression tests cover source non-execution, root escapes, symlink files/directories/roots, HTML injection, stable keys/order, SCC membership changes, evidence line numbers, and a 12,000-node graph.
- Browser: viewed demo and zero reports through a loopback HTTP server; checked rendered counts, character/card layout, warning, coverage, and expansion of base evidence. `file://` navigation could not be tested because the test browser permits HTTP(S) only. HTML is self-contained (inline CSS, no scripts or external resources).
- `git diff --check`: passed.

No blocking implementation issues remain within the declared scope. Node.js 22 is the minimum documented version; this local run used Node.js 25, not a cross-version/platform matrix. Unsupported module resolution and concurrent filesystem mutation remain explicitly documented limitations. Additional yokai and GitHub integration were not implemented.

# Issue #3 validation

Local environment: Node.js v25.4.0, npm 11.7.0, Git 2.50.1 (Apple Git-155), macOS.

- `npm run typecheck` and `npm run build`: passed.
- `npm test`: 22/22 passed (14 existing + 8 Git/Markdown integration tests).
- Temporary two-commit fixture: new=2, continuing=1, resolved=1; exact SHAs and evidence source lines verified. Annotated tag input resolves to its commit. Repeated JSON/HTML/Markdown output is identical.
- Dirty tree, staged and untracked files: status, branch, index bytes, staged/unstaged diffs and content preserved; only committed sources analyzed.
- Symlinks, gitlinks/submodules, root escapes, executable source/config/package scripts, Git fsmonitor/hooks/smudge filters, inherited Git environment overrides and replacement refs: tested without executing the sentinels or following links.
- Invalid refs, missing shallow history, mixed CLI modes, output overlap/symlinks, existing reports, malicious raw tree traversal: fatal errors; no reports/outside writes. Temporary snapshots removed after success, partial coverage and extraction failure.
- Markdown injection/control characters and summary size limits: passed. Full SHA/coverage/evidence retained in full reports. Bare repository supported. Case/Unicode directory collisions are rejected consistently across filesystems.
- `actionlint` on both workflows and the copyable example: passed. Example is byte-identical to the actual reporting workflow. Pinned official action SHAs verified through GitHub's API; npm dependency licenses checked locally (no new dependencies).
- Real local Git CLI comparison from parent `6c1e6de37366d82bef217b0956cdc32a4d819323` to analyzer `3766ed92c9508a4886e24d6fe787989f8d5d3848`: JSON/HTML/Markdown generated; new=0, continuing=5, resolved=0; exit 2, expected because Node/package imports, `.js` to `.ts` resolution and `.mjs` tests are outside scope. The five continuing cycles are the repository's fictional fixtures.
- Browser: rendered local Git report over loopback HTTP, checked counts, both SHAs, real evidence and partial coverage. HTML remains self-contained; direct `file://` navigation not tested.
- `git diff --check`: passed.

GitHub Actions on the first PR revision passed on hosted Ubuntu / Node.js 22:

- [Development CI](https://github.com/ryoryo34/repo-yokai/actions/runs/38009481170): install, typecheck, tests, build, complete/partial fixtures and artifact upload succeeded.
- [Pinned analyzer report](https://github.com/ryoryo34/repo-yokai/actions/runs/38009481176): trusted analyzer build, real event-SHA fetch into a bare repository, summary publication, partial-coverage warning and artifact upload succeeded. Downloaded the real `repo-yokai-report` artifact and verified its three report files and exact event SHAs.
- Browser confirmed GitHub run success, partial warning and artifact listing. The logged-out browser did not expose job-summary content; publication was verified through successful runner steps and the matching artifact Markdown.
- The initial v4 actions emitted a Node.js 20 deprecation warning. The workflow now pins official v7 commits (Node.js 24 action runtime), disables setup-node automatic caching explicitly, and pins the updated analyzer with the collision regression test. Final revision results are checked separately before completion.

 Fork-approval/private-repository behavior and Windows remain unverified; the copyable workflow targets GitHub.com hosted Ubuntu runners. No target-repository installation, auto-merge, deployment, PR comment or paid API call is part of this issue.

# Issue #5 validation

- HTML groups new/continuing/resolved, offers count anchors, preserves keys under native details, and uses source-backed inline diagrams with explicit size limits. JSON/Markdown and analyzer behavior remain unchanged.
- `npm test`: 26/26 passed (22 existing + 4 experience regressions); `npm run typecheck`, `npm run build`, `git diff --check`: passed.
- Demo remains 2/1/1; JSON is byte-identical to the pre-change demo. Preview generator verifies complete/zero/long/large exits 0 and partial exits 2.
- Real browser: 15 fixture/viewport combinations at 1280×800, 850×850 and 390×844 without horizontal overflow; count navigation, base/head evidence, key details and keyboard focus checked.
- Direct `file://` browser navigation was prohibited by the browser policy; offline file execution remains unverified. Inline-only resources, no scripts and restrictive CSP are preserved and tested.
- See [reproduction steps, screenshots, observations and limits](EXPERIENCE.md). Latest-head hosted CI results are recorded in the PR checks/description.
