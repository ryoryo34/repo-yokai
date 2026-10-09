# Repo Yokai

[English](./README.md) | [日本語](./README.ja.md)

コード分析の差分を、根拠付きの妖怪との遭遇として可視化するツール。

## 開発状況

最初のローカルCLIが動作します。**循環入道 / Junkan Nyudo** がTypeScript/JavaScriptの循環依存を検出し、2つのディレクトリを比較します。JSONと単体HTMLに、CSSの妖怪、ソースのパス・行番号、改善の手がかりを出力します。同梱fixtureはすべて架空です。GitHub連携と追加妖怪は将来構想であり、未実装です。

## インストールと実行

Node.js 22以上とnpmが必要です。このリポジトリをcloneして実行します。

```sh
npm ci --ignore-scripts
npm run build
npm run demo
```

`reports/demo/report.html` をブラウザで直接開きます。サーバーやネットワークは不要です。`reports/demo/report.json` にも同じ検出結果と解析範囲を出力します。デモの期待結果は **新規2件**（自己循環を含む）、**継続1件**、**解消1件**です。

```sh
node dist/cli.js \
  --base-dir fixtures/zero/base \
  --head-dir fixtures/zero/head \
  --output-dir reports/zero
```

ゼロ件fixtureは、**対応する解析範囲で循環がないことだけを示し、安全を保証しません**。自分のスナップショットでは両入力パスを差し替え、独立した出力先を指定してください。ローカルの変更されないスナップショットを使用します。入力コードや設定は実行しません。

出力先は入力ツリーと重複できません。既存の `report.json` / `report.html` は上書きしないため、再実行時は新しい出力ディレクトリを指定します。結果は相対パスで、タイムスタンプを含みません。同じ入力内容ならルートの場所が変わっても同じレポートになります。

| 終了コード | 意味 |
| --- | --- |
| `0` | 出力成功。対応範囲を解析済み（循環が存在する場合もある） |
| `2` | 出力成功。ただし非対応・未解決・ブロックされた参照、または解析エラーあり。coverageを確認 |
| `1` | 入力・引数・出力の致命的エラー。書き込み失敗時は出力が一部だけ残る場合あり |

## 検出と比較

- 相対パスの静的 `import` と `export … from` を解析します。副作用importと型だけのimportも含みます。ソースの依存グラフであり、実行時の不具合を断定するものではありません。
- `.ts` / `.tsx` / `.js` / `.jsx` に対応します。対応拡張子が明示されていれば完全一致で解決します。それ以外は `.ts`、`.tsx`、`.js`、`.jsx`、続いて同順の `index` を試します。`./service.model` のようなドットを含む名前にも対応します。`.js` → `.ts` の置換やpackage設定による解決は行いません。
- 強連結成分（SCC）ごとに1件だけ報告し、自己循環も扱います。札には成分内の全依存エッジ（`from`、`to`、1始まりの `line`、元の `specifier`）をbase/head別に表示します。根拠は実在するエッジの集合であり、説明の創作や全単純循環の列挙ではありません。
- finding keyは、ソートしたルート相対ファイル集合をJSON化したSHA-256に `circular-dependency:` を付けたものです。区切りは `/`、大文字小文字は保持します。同じ集合なら `continuing`、headだけなら `new`、baseだけなら `resolved`。リネームや集合変更は、設計上の問題が残っていても旧集合の解消＋新集合の出現になります。
- `resolved` は解析したheadグラフで見つからないという意味です。ファイル欠落・構文エラー・非対応参照は**すべてのステータス**に影響し得ます。修正済みと判断する前にcoverageを確認してください。

## 解析範囲と制約

JSONとHTMLに、対象範囲、制約、発見・解析したファイル数、エッジ数、ファイルごとの通知と取得可能な行番号を含めます。`incomplete` は非対応・未解決・ブロック・エラーでtrueになります。意図した除外だけではtrueになりません。`incomplete: false` も明示した範囲の解析完了だけを意味します。

パッケージ、絶対パスimport、tsconfig alias、dynamic import、CommonJS `require`、import-equals、import型式、JSDoc import、triple-slash directive、`.mjs/.cjs/.mts/.cts` は解決しません。JSDocの通知はドキュメントコメント内のimport構文を保守的に認識します。構文エラーは通知し、該当ファイル全体を除外します。そのファイルへのimportも未解決として表示します。対象プロジェクトの型チェックは行いません。

すべての階層で `node_modules`、`.git`、`dist`、`build`、`coverage`、`out`、`.next`、`.nuxt` を除外します。`.d.ts` と通常ファイル以外も除外します。それ以外の生成物は自動識別できません。symlinkは通知して追跡せず、入出力ルートやその親にsymlinkがあれば拒否します。ルート外への相対参照はブロックし、収集したルート内のファイル一覧だけでimportを解決します。

対象コード、プロジェクトのスクリプト、JS設定は実行せず、解析データも外部送信しません。HTMLではパス・メッセージ・specifierをエスケープし、スクリプトや外部素材を使わず、制限的なContent Security Policyを付けます。解析中はファイルシステムを変更しないでください。OSのsandboxではなく、悪意ある並行ディレクトリ置換への防御は提供しません。大規模リポジトリもメモリ上で解析します。

## 開発

```sh
npm run typecheck
npm test
npm run build
```

各ステータス、自己循環、SCC重複排除と集合変更、出力の再現性、拡張子/index解決、根拠行、解析失敗、非対応構文、symlink、ルート外参照、対象の非実行、HTMLインジェクション、CLIの出力保護をテストします。

実行時依存はTypeScript 5.9.3のみです（Apache-2.0）。安定したJavaScriptのCompiler APIをメモリ内hostから使い、プロジェクト設定を読み込まず構文解析します。[公式Compiler APIの例](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)と[インストール案内](https://www.typescriptlang.org/download/)を参照してください。CLI、ファイル操作、ハッシュ、テストにはNode標準機能を使います。`@types/node` は開発専用で、依存バージョンはlockfileに固定しています。UIフレームワークや第三者の画像素材は使っていません。

`src/types.ts` の `Rule`、`Snapshot`、`Finding`、`AnalysisCoverage` が最小の解析器境界です。この版は1ルールのみを実行します。プラグイン機構、追加妖怪、Gitスナップショット取得、Actions、PR投稿は別Issueの対象です。

[構想](docs/VISION.md)、[開発フロー](docs/WORKFLOW.md)、[Issue](https://github.com/ryoryo34/repo-yokai/issues)を参照してください。1 Issueにつき1つのCodexセッションと実装ブランチを使います。

## ライセンス

[MIT](LICENSE)
