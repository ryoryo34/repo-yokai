# Repo Yokai

[English](./README.md) | [日本語](./README.ja.md)

コード分析の差分を、根拠付きの妖怪との遭遇として可視化するツール。

## 開発状況

最初のローカルCLIが動作します。**循環入道 / Junkan Nyudo** がTypeScript/JavaScriptの循環依存を検出し、2つのディレクトリまたはGitコミットを比較します。JSON・Markdown・単体HTMLに、CSSの妖怪、ソースのパス・行番号、改善の手がかりを出力します。同梱fixtureはすべて架空です。GitHub Actionsのsummary・artifact連携に対応しています。追加妖怪とPRへの自動コメントは未実装です。

## インストールと実行

Node.js 22以上とnpmが必要です（GitモードはGit 2.43以上）。このリポジトリをcloneして実行します。

```sh
npm ci --ignore-scripts
npm run build
npm run demo
```

`reports/demo/report.html` をブラウザで直接開きます。サーバーやネットワークは不要です。`reports/demo/report.json` と `reports/demo/report.md` にも同じ検出結果と解析範囲を出力します。デモの期待結果は **新規2件**（自己循環を含む）、**継続1件**、**解消1件**です。

```sh
node dist/cli.js \
  --base-dir fixtures/zero/base \
  --head-dir fixtures/zero/head \
  --output-dir reports/zero
```

ゼロ件fixtureは、**対応する解析範囲で循環がないことだけを示し、安全を保証しません**。自分のスナップショットでは両入力パスを差し替え、独立した出力先を指定してください。ローカルの変更されないスナップショットを使用します。入力コードや設定は実行しません。

出力先は入力ツリーと重複できません。既存の `report.json` / `report.html` / `report.md` は上書きしないため、再実行時は新しい出力ディレクトリを指定します。結果は相対パスで、タイムスタンプを含みません。同じ入力内容ならルートの場所が変わっても同じレポートになります。

| 終了コード | 意味 |
| --- | --- |
| `0` | 出力成功。対応範囲を解析済み（循環が存在する場合もある） |
| `2` | 出力成功。ただし非対応・未解決・ブロックされた参照、または解析エラーあり。coverageを確認 |
| `1` | 入力・引数・出力の致命的エラー。書き込み失敗時は出力が一部だけ残る場合あり |

## Gitコミットの比較

```sh
# 信頼するビルド済み解析器を実行し、対象リポジトリの外へ出力します。
node dist/cli.js --repo /path/to/target-repo \
  --base BASE_COMMIT --head HEAD_COMMIT \
  --output-dir /path/to/new-report-directory
```

ローカルに存在する2つのコミットSHAまたはcommit-ish refを指定します。refを一度だけ完全なcommit SHAへ解決し、JSONの `comparison.baseSha` / `comparison.headSha` とHTML・Markdownに記録します。指定したbaseとheadを直接比較し、merge-baseの計算やGitHubの合成merge commitへの置き換えはしません。Gitモードとdirectoryモードは混在できません。

コミット済みblobだけが対象で、未コミット・staged・未追跡ファイルは含めません。対象の作業ツリー・index・ブランチは変更しません。`ls-tree` / `cat-file` で生の内容を読み、checkout、hooks、clean/smudgeフィルタ、対象のpackage scripts・設定JSの実行、submodule初期化、symlinkの追跡を避けます。除外したGitリンクと非対応拡張子はcoverageに記録します。LFSのダウンロード・展開もしません。replace refsと継承した `GIT_*` 環境変数は無視します。インストール済みGit、ローカルのリポジトリ管理情報・設定、解析器の配置先は信頼する前提です。

コミットやobjectが不足する場合（shallow/partial cloneを含む）はexit 1です。CLIはfetchしないため、必要なobjectは事前に取得してください。bare repositoryにも対応します。出力先は対象worktree・Git管理ディレクトリの外に置き、それらを内包することもできません。snapshotはリポジトリ外の専用一時ディレクトリに作り、成功時・通常のエラー時に削除します。強制終了時にはsystem temp内の `repo-yokai-git-*` を手動で削除する必要があります。悪意ある並行ファイルシステム変更への保証はありません。

不正なUTF-8と危険・非可搬なパス（パス遡行、backslash、drive/streamのcolon、予約device名、末尾dot/spaceなど）は拒否します。対応するファイル名内の改行やMarkdown記号はデータとして扱います。大文字小文字・正規化の衝突時もエラーにします。上限はtree一覧32 MiB、ソースblobごと16 MiB、snapshotごとのソース合計128 MiB、Gitコマンドごと30秒で、超過は致命的エラーです。大規模プロジェクトではメモリ・CPUを使用します。

## GitHub Actions / PR Checks

[workflow例](docs/examples/repo-yokai.yml)の固定した解析器SHAをレビューしてから、導入先の `.github/workflows/repo-yokai.yml` へコピーします。このリポジトリでも同じworkflowを **Repo Yokai** として実行します。`pull_request`、`contents: read`、新しいhosted runner、commit固定のActions、別に配置した固定commitの解析器、`npm ci --ignore-scripts` を使います。eventのbase/head SHAをbare repositoryへfetchし、解析対象PRのコードをcheckout・実行しません。`pull_request_target`、書き込み権限、PRコメント、依存cacheの共有は使いません。この例はGitHub.com向けです。初回のfork実行ではmaintainer承認が必要な場合があります。

**PR → Checks → Repo Yokai → Details** からworkflow実行の **Summary** を開くと、件数・主要な根拠・coverage・SHAを確認できます。**Artifacts** の **repo-yokai-report** をダウンロード・展開して `report.html` をローカルで開きます。JSON・Markdownも含まれます。exit 2では不完全なcoverageを警告し、全レポートを保存します。exit 1ではjobを失敗にし、致命的エラーやテスト失敗を成功扱いにしません。summaryはGitHubのstepごと1 MiB上限未満に制限し、完全な根拠はJSON・HTMLに残します。

解析器SHAはレビューして信頼する版を選び、PRのheadやブランチから決めません。更新時には新しい解析器commitとlockfileを確認します。通常の `pull_request` workflowと同様、PRでworkflow自体の変更も提案できるため、その差分を確認し、隔離されたGitHub-hosted runnerを使い、秘密や書き込み権限を追加しないでください。本リポジトリの別workflow **CI** は開発用として提案された解析器コードをビルド・テストし、架空のdemo/partialレポートを生成します。**Repo Yokai** は固定した解析器で対象を解析します。[Actionsの設計と参照](docs/ACTIONS.md)も参照してください。

## 検出と比較

- 相対パスの静的 `import` と `export … from` を解析します。副作用importと型だけのimportも含みます。ソースの依存グラフであり、実行時の不具合を断定するものではありません。
- `.ts` / `.tsx` / `.js` / `.jsx` に対応します。対応拡張子が明示されていれば完全一致で解決します。それ以外は `.ts`、`.tsx`、`.js`、`.jsx`、続いて同順の `index` を試します。`./service.model` のようなドットを含む名前にも対応します。`.js` → `.ts` の置換やpackage設定による解決は行いません。
- 強連結成分（SCC）ごとに1件だけ報告し、自己循環も扱います。札には成分内の全依存エッジ（`from`、`to`、1始まりの `line`、元の `specifier`）をbase/head別に表示します。根拠は実在するエッジの集合であり、説明の創作や全単純循環の列挙ではありません。
- finding keyは、ソートしたルート相対ファイル集合をJSON化したSHA-256に `circular-dependency:` を付けたものです。区切りは `/`、大文字小文字は保持します。同じ集合なら `continuing`、headだけなら `new`、baseだけなら `resolved`。リネームや集合変更は、設計上の問題が残っていても旧集合の解消＋新集合の出現になります。
- `resolved` は解析したheadグラフで見つからないという意味です。ファイル欠落・構文エラー・非対応参照は**すべてのステータス**に影響し得ます。修正済みと判断する前にcoverageを確認してください。

## 解析範囲と制約

JSON・HTML・Markdownに、対象範囲、制約、発見・解析したファイル数、エッジ数、ファイルごとの通知と取得可能な行番号を含めます。`incomplete` は非対応・未解決・ブロック・エラーでtrueになります。意図した除外だけではtrueになりません。`incomplete: false` も明示した範囲の解析完了だけを意味します。

パッケージ、絶対パスimport、tsconfig alias、dynamic import、CommonJS `require`、import-equals、import型式、JSDoc import、triple-slash directive、`.mjs/.cjs/.mts/.cts` は解決しません。JSDocの通知はドキュメントコメント内のimport構文を保守的に認識します。構文エラーは通知し、該当ファイル全体を除外します。そのファイルへのimportも未解決として表示します。対象プロジェクトの型チェックは行いません。

すべての階層で `node_modules`、`.git`、`dist`、`build`、`coverage`、`out`、`.next`、`.nuxt` を除外します。`.d.ts` と通常ファイル以外も除外します。それ以外の生成物は自動識別できません。symlinkは通知して追跡せず、入出力ルートやその親にsymlinkがあれば拒否します。ルート外への相対参照はブロックし、収集したルート内のファイル一覧だけでimportを解決します。

対象コード、プロジェクトのスクリプト、JS設定は実行せず、解析データも外部送信しません。HTMLではパス・メッセージ・specifierをエスケープし、スクリプトや外部素材を使わず、制限的なContent Security Policyを付けます。解析中はファイルシステムを変更しないでください。OSのsandboxではなく、悪意ある並行ディレクトリ置換への防御は提供しません。大規模リポジトリもメモリ上で解析します。

## 開発

```sh
npm run typecheck
npm test
npm run build
```

各ステータス、自己循環、SCC重複排除と集合変更、出力の再現性、拡張子/index解決、根拠行、解析失敗、非対応構文、symlink、ルート外参照、対象の非実行、HTMLインジェクション、CLIの出力保護をテストします。Gitのテストではdirty/index保持、SHAと根拠の整合、履歴不足・shallow clone、悪意あるパス、hooks・フィルタ・scriptsの非実行、一時領域の片付け、安全でサイズ制限付きのMarkdownも検証します。

実行時依存はTypeScript 5.9.3のみです（Apache-2.0）。安定したJavaScriptのCompiler APIをメモリ内hostから使い、プロジェクト設定を読み込まず構文解析します。[公式Compiler APIの例](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)と[インストール案内](https://www.typescriptlang.org/download/)を参照してください。CLI、ファイル操作、ハッシュ、テストにはNode標準機能を使います。`@types/node` は開発専用で、依存バージョンはlockfileに固定しています。UIフレームワークや第三者の画像素材は使っていません。

`src/types.ts` の `Rule`、`Snapshot`、`Finding`、`AnalysisCoverage` が最小の解析器境界です。この版は1ルールのみを実行します。プラグイン機構、追加妖怪、PRコメント投稿は別Issueの対象です。Gitスナップショット取得とActionsのsummary・artifact連携は実装済みです。

[構想](docs/VISION.md)、[開発フロー](docs/WORKFLOW.md)、[Issue](https://github.com/ryoryo34/repo-yokai/issues)を参照してください。1 Issueにつき1つのCodexセッションと実装ブランチを使います。

## ライセンス

[MIT](LICENSE)
