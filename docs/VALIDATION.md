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
