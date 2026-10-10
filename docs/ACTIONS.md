# Actions design / Actionsの設計

The [copyable workflow](examples/repo-yokai.yml) and this repository's `Repo Yokai` workflow are identical. The reviewed analyzer is pinned to `3766ed92c9508a4886e24d6fe787989f8d5d3848`, which contains the Git/Markdown implementation and its 21 passing tests. This is an implementation commit, not a release or automatic update channel. Consumers should review that commit and its lockfile before adoption. Changing a target PR cannot select a different analyzer through input refs.

[導入用workflow](examples/repo-yokai.yml)と本リポジトリの `Repo Yokai` は同じ内容です。信頼する解析器はGit・Markdown実装と21件のテストを含む上記commitに固定しています。リリースや自動更新channelではなく、導入時にcommitとlockfileを確認する前提です。解析対象のrefで実行する解析器の版を切り替えることはできません。

## Trust boundaries / 信頼境界

- **Analyzer:** a separate checkout at a full SHA, with a pinned lockfile and `npm ci --ignore-scripts`. Only its TypeScript compiler and CLI execute. No target dependency install, `npm test`, target scripts, JS config, hooks, or checkout occur in the reporting job.
- **Target:** event base/head SHAs are passed through environment variables, validated before fetch, and shell-quoted. A fresh bare repository receives only Git objects from the event repository on GitHub.com. The CLI reads objects without contacting remotes. Fork PR head objects are fetched by SHA through the base repository; unavailable objects fail explicitly.
- **Credentials:** `contents: read`; checkout does not persist credentials. The read token is available only to the acquisition step, is not stored in Git config, and is not passed to the analyzer. No PR/comment/issues write scopes. No secrets, self-hosted runners, reusable dependency caches, `pull_request_target`, or comment posting.
- **Output:** fixed filenames outside both repositories. Summary treats source-derived strings as data and is bounded below 1 MiB. HTML has no scripts or remote resources. Reports expose repository-relative filenames and import specifiers, so access follows the workflow artifact's visibility. Retention is 7 days; no deployment occurs.
- **Workflow edits:** `pull_request` can include changes to the workflow itself. Review `.github/workflows` changes and use platform fork approvals; pinning the analyzer does not make a modified workflow trustworthy. The separate `CI` workflow intentionally executes proposed analyzer tests on an isolated runner with read-only permissions.

解析器は別checkout・固定SHA・lockfileから用意し、対象PRの依存をインストールしません。対象のbase/headをGitHub.comから新しいbare repositoryへ取得するstepだけにread tokenを渡し、保存しません。解析CLI自体は通信しません。レポートは相対パスとimport文字列を含み、artifactの公開範囲に従います。保持期間は7日で、デプロイしません。PRでworkflowそのものが変更された場合の安全性まで、解析器のSHA固定で保証するものではありません。開発用 `CI` は別の責務として提案コードのテストを実行します。

## Exit handling / 終了コード

`0`: supported-scope report, with or without findings. `2`: partial coverage, warning plus successful artifact publication. All other exits (including CLI fatal `1`, command failure, timeout, or a signal) fail the reporting job. A failed test/typecheck/build fails development CI. The partial fixture explicitly requires exit `2`; it is not a blanket `continue-on-error`.

`0` は検出件数に関係なく対応範囲のレポート生成成功、`2` はcoverage不完全を警告してartifactを保存、それ以外はjob失敗です。テスト・型チェック・ビルドの失敗も隠しません。partial fixtureでは明示的に `2` を要求します。

## Read reports / 閲覧

PR → Checks → Repo Yokai → Details → run Summary. Counts, evidence, coverage, and the resolved SHAs are in the summary. Artifacts → repo-yokai-report → unzip → open `report.html`. Keep the accompanying JSON for full evidence. Summary lists only a bounded subset and says when data is omitted. No automatic PR body/comment updates are made.

PRのChecksからRepo YokaiのDetailsを開き、実行Summaryで件数・根拠・coverage・SHAを確認します。Artifactsのrepo-yokai-reportを展開してHTMLを開き、全根拠はJSONでも確認できます。summaryの省略は明示します。PR本文・コメントへの自動反映はありません。

## Primary references / 一次資料

Reviewed for Issue #3; no third-party implementation code or artwork was copied.

- [Git ls-tree](https://git-scm.com/docs/git-ls-tree): NUL-delimited paths and full-tree listing.
- [Git cat-file](https://git-scm.com/docs/git-cat-file): raw blob reads without `--filters` or `--textconv`.
- [Git environment](https://git-scm.com/docs/git): `GIT_NO_LAZY_FETCH`, configuration and replacement-object controls.
- [GitHub job summaries](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary): `GITHUB_STEP_SUMMARY`, GitHub-flavored Markdown and the 1 MiB per-step limit.
- [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use): least privilege, immutable action pins and untrusted input boundaries.
- [checkout v4](https://github.com/actions/checkout/tree/11d5960a326750d5838078e36cf38b85af677262), [setup-node v4](https://github.com/actions/setup-node/tree/49933ea5288caeca8642d1e84afbd3f7d6820020), [upload-artifact v4](https://github.com/actions/upload-artifact/tree/ea165f8d65b6e75b540449e92b4886f43607fa02): pinned official actions (MIT).

No new npm dependencies. TypeScript 5.9.3 remains the only runtime dependency (Apache-2.0); `@types/node` is development-only (MIT), with its lockfile-pinned `undici-types` dependency (MIT).
