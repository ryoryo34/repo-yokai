# Repo Yokai

## 構想

PRの変更に潜む特徴や問題を妖怪として表現する。妖怪には出現条件、コードの根拠、場所、改善の手がかりがある。修正で新規・継続・解消が変わり、退治まで見届けられる。将来はセキュリティや権限、例外処理などの分析器を接続する。妖怪ゼロを安全保証とはしない。

## 最初の到達点

実際のTypeScript/JavaScriptコードを静的解析し、baseとheadで循環依存が新規・継続・解消したかを判定するCLIと、根拠が読める妖怪HTMLレポートを作る。PR統合前にローカルfixtureで検出の正しさと楽しさを確かめる。

## Issue #3の到達点

Gitのbase/headからcommit済みblobを静的解析し、SHA付きJSON・HTML・MarkdownとGitHub Actionsのsummary・artifactで確認できる。PRコメント投稿と自動マージは行わない。

## 後続Issueの候補（未着手）

- 権限拡大や例外の握りつぶしを根拠付きで検出する追加妖怪
- 妖怪定義の拡張形式と外部分析器との統合

候補へ着手する際に、背景・目的・範囲・完了条件・参考・依存関係を持つGitHub Issueを作り、別セッションで実装する。

## 参考

- https://github.com/mtoyoda/sl
- https://github.com/nvbn/thefuck
- https://github.com/microsoft/TypeScript
