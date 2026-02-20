# ワークフロー

## AI協調フロー

- ユーザー指示の目的を最優先にする
- Codex / Claude の役割は固定しない
- レビュー作成側か指摘対応側かを、ターンごとに判断する
- 修正内容・進行状況・手順書・計画・レビュー観点は GitHub Issues に集約する
- GitHub操作手段は固定しない（REST API / GraphQL API など、環境に合う手段を選ぶ）
- 状態管理は GitHub Issue のラベル + Close で運用する
- 1 Issue 1 worktree を基本とし、強く関連する作業のみ同一worktreeで扱う
- PR は小さく分割して順次マージする
- 既存の未コミット変更があっても、Issue定義の作成とIssue番号の確定は通常どおり進める

## Issue状態とラベル

- `Open`: 未着手/待機中（ラベルなし）
- `In Progress`: `status:in-progress` ラベルを付与
- `Close`: 完了。PRマージ後にIssueをクローズする
- 優先度は `priority:P0` / `priority:P1` / `priority:P2` / `priority:P3` で管理する

優先度の目安:

1. `P0`: サービス停止・致命的不具合・最優先対応
2. `P1`: 重要機能の実装/修正で早期対応が必要
3. `P2`: 通常優先度
4. `P3`: 低優先度・後続対応可

## Issue設計原則

- 新規タスク起票時は、同一目的・同一完了条件の作業を原則1つのIssueに集約する
- 進捗はIssue本文のチェックリストで管理する
- Issue分割は優先度・担当・期限・リリース単位が異なる場合に限定する
- 分割した親子Issueは `Refs #...` で相互参照する
- `/pick` 相当の指示やIssue番号の明示がなく、`current_issue` も未確定の依頼は、planモードでOpen Issue候補を優先度順に提示し、採用Issueをユーザー確認する
- 適切な既存Issueがない場合は、その旨をユーザーへ報告し、以降はユーザー指示に従う

## Issueスコープ管理

- `current_issue` は会話コンテキストと `.context/current_issue` の二重管理で扱う
- セッション開始時に `.context/current_issue` があれば、対象Issueとして復元する
- 会話コンテキストと `.context/current_issue` が不一致の場合は、ユーザー最新の明示指示を優先し、明示がない場合は `.context/current_issue` を正とする
- 計画相談・壁打ちは `current_issue` 未設定でも進めてよい
- Issue番号が未指定かつ `current_issue` 未確定のときは、planモードでOpen Issueを優先度順（`P0 -> P1 -> P2 -> P3 -> 優先度なし`）に複数件取得して候補化する
- 候補が1件ならそのIssueを `current_issue` として確定し、複数件ならユーザーに選択してもらい、選ばれたIssueを `current_issue` として確定する
- 適切な候補がない場合は、候補0件であることをユーザーへ報告し、`current_issue` は未確定のままにする
- 既存Issueを継続する場合は `/pick` / `/p` またはIssue番号明示で対象を切り替える
- `current_issue` 確定時は `.context/current_issue` にIssue番号を1行で書き出す
- `.context/current_issue` を再設定する場合は、ユーザー最新指示でIssue番号が明示されているときを除き、上書き前にユーザー確認を行う
- 共有ライブラリ変更を含む場合は、影響先Issueと `Refs #...` で相互に記載する
- 対象PRがマージされ、Issue完了が確認できたら `.context/current_issue` を削除する

## 基本フロー

### 0. 受付ゲート

1. ユーザー指示の目的・完了条件・期待する成果物を確認する
2. `/pick` 相当の指示やIssue番号の明示がなく、`current_issue` も未確定の場合は、planモードでOpen Issue候補の提示とスコープ確認を先に行う（計画相談・壁打ちは除く）
3. そのターンでレビュー作成側か指摘対応側かを決め、進め方を明示する

### 1. 計画

1. ユーザー指示を分解し、同一目的・同一完了条件の作業を原則1つのIssueに集約する
2. Issue定義の作成として、目的・手順・受け入れ条件・チェックリストを整理する
3. 分割が必要な場合は、優先度・担当・期限・リリース単位の差異を根拠に分割する
4. スコープ合意後は、同一エージェントがIssue確定（既存Issue選択）から実装まで継続して進める

### 2. スコープ固定（任意）

1. 対象Issue番号を確定し、会話コンテキストの `current_issue` と同期する
2. `current_issue` 確定時は `.context/current_issue` にIssue番号を1行で保存する
3. 未確定時はOpen Issue候補を提示し、候補0件なら報告のみ行ってユーザー確認で次アクションを決定する

### 3. 実装

1. ファイル変更に着手する時点で対象Issueが未作成なら、この段階でIssueを作成して番号を確定する
2. Conductorで対象Issue用のworkspace（worktree）を作成し、基底ブランチは `develop` を使う
3. Issue化している場合は、着手時にIssueへ `status:in-progress` を付与する
4. 修正規模が当初想定を超える場合は、分割方針またはスコープ変更を先に確認する
5. 実装・テスト結果、判断理由、残課題は日本語で報告し、必要に応じてIssueへ記録する

### 4. レビュー

1. レビュー依頼時は対象Issue番号を明示する
2. レビュー指摘にはファイルパス・行番号・根拠を含める
3. 指摘は `採用 / 不採用 / 追加情報必要` で判定する
4. レビューコメントのIssue記録が必要な場合は、指摘要約・採否・対応方針をIssueへ記載する
5. ユーザーフィードバックや追加判断も、履歴が必要な場合はIssueへ記録する

### 5. PRと完了

1. PR本文には対象Issueを記載する
2. `Closes` は `current_issue`（会話または `.context/current_issue` で確定した番号）を記載する
3. `Refs` は関連Issueのみを記載し、共有ライブラリ変更時は相互Issueを明示する
4. PRマージ後にIssueが自動クローズされない場合は、マージPRを参照して手動クローズする
5. 対象Issueの完了が確認できたら `.context/current_issue` を削除する
