# issue-progression-lottery-migration プレゼント抽選機能の移行整理

- 状態: Open
- 優先度: 中
- 担当: 未定
- 期限: 未定

## 概要

旧 `docs/PROGRESSION.md` の実装計画をIssue本文へ移植し、抽選機能開発の正本を `issues/` に統一する。

## 背景

旧進捗文書は削除済みのため、実装フェーズ・要件・リスクをIssue本文へ集約して追跡可能性を維持する必要がある。

## 目的

プレゼント抽選機能の機能要件と段階的実装計画を本Issueで管理し、1Issue 1PRで実装を進められる状態にする。

## 作業前に守る制約

- 手順書・計画・レビュー観点の正本を `issues/` に統一する
- Twitch API連携・印刷関連の検証は既存の安全制約（DRY_RUN_MODE等）を維持する

## 実施手順

1. `## タスク分解` のフェーズ順（1 → 6）で実装する
2. フェーズ内タスクを1PR単位に分割し、進捗をチェックボックスで更新する
3. 完了時に `issues/index.md` とIssue状態を更新する

## スコープ

- プレゼント抽選機能の設定・抽選ロジック・API・UI・テスト
- 抽選機能に関するデータ永続化・Twitch連携・運用上のリスク対策

## 非スコープ

- 抽選機能以外のTwitch連携機能の包括改修
- 実装と無関係なドキュメント整理

## タスク分解

### 移行元要件（旧 docs/PROGRESSION.md）
## 機能要件

### 1. リワード設定
- 1つのリワード（1口）を設定画面で選択可能
- リワードIDを保存し、抽選時に参照

### 2. 抽選ロジック
- **口数計算（PRESENT.md準拠）:**
  - **基本口数:** 1口リワードの使用回数
    - 同一ユーザーの複数回使用は合算
    - **基本口数の上限:** 合計が3を超える場合は**3に制限**
  - **ボーナス口数計算式:** `累計月数 × Tier係数 × 1.1 ÷ 3`（切り上げ）
    - **Tier係数:**
      - Tier1: 1.0
      - Tier2: 1.1
      - Tier3: 1.2
      - サブスク未登録: ボーナスなし（0口）
    - **最低ボーナス:** サブスク登録者は計算結果が0でも最低1口
  - **最終口数:** 基本口数（最大3） + ボーナス口数（小数点切り上げ）
  - **最終口数の上限:** なし（設定で変更可能）
  - **計算例:**
    - サブスク未登録: 3回実行 = 3 + 0 = **3口**
    - Tier1 + 1ヶ月: 3回実行 = 3 + ceil(1×1.0×1.1÷3) = 3 + 1 = **4口**（最低ボーナス適用）
    - Tier1 + 6ヶ月: 3回実行 = 3 + ceil(6×1.0×1.1÷3) = 3 + 3 = **6口**
    - Tier3 + 12ヶ月: 3回実行 = 3 + ceil(12×1.2×1.1÷3) = 3 + 6 = **9口**

- **連続当選防止:**
  - 前回当選者は次回抽選から自動除外
  - ただし前回当選者としてUI表示は継続

- **公平な抽選:**
  - `crypto/rand` を使用した暗号学的に安全な乱数生成
  - 累積重み方式による効率的な抽選（メモリ効率化）

### 3. UI要件

#### Settings画面
- [ ] リワード選択ドロップダウン（1口リワード用）
- [ ] 抽選実行ボタン
- [ ] 前回当選者表示エリア
- [ ] 前回当選者手動リセットボタン
- [ ] 抽選履歴一覧
- [ ] 履歴削除機能
- [ ] オプション設定
  - [ ] 基本口数上限設定（デフォルト: 3）
  - [ ] 最終口数上限設定（デフォルト: 無制限）

#### Overlay画面
- [ ] ルーレットアニメーション表示エリア
- [ ] 当選者発表エフェクト
- [ ] 前回当選者の表示（対象外表記付き）
- [ ] 参加者リストと口数表示

### 4. データ永続化

#### 新規テーブル: `lottery_settings`
```sql
CREATE TABLE lottery_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reward_id TEXT,               -- 1口リワードID
  last_winner TEXT,             -- 前回当選者ユーザー名
  base_tickets_limit INTEGER DEFAULT 3,    -- 基本口数上限
  final_tickets_limit INTEGER DEFAULT 0,   -- 最終口数上限（0=無制限）
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 新規テーブル: `lottery_history`
```sql
CREATE TABLE lottery_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  winner_name TEXT NOT NULL,
  total_participants INTEGER NOT NULL,
  total_tickets INTEGER NOT NULL,
  participants_json TEXT,         -- 参加者詳細（JSON）
  reward_ids_json TEXT,           -- 使用されたリワードID配列（JSON）
  drawn_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**participants_json の形式:**
```json
[
  {
    "username": "user1",
    "base_tickets": 3,
    "tier_bonus": 1.0,
    "month_bonus": 4,
    "final_tickets": 8,
    "is_excluded": false
  },
  {
    "username": "user2",
    "base_tickets": 2,
    "tier_bonus": 0.5,
    "month_bonus": 0,
    "final_tickets": 3,
    "is_excluded": false
  }
]
```

---


### 実装フェーズ（旧 docs/PROGRESSION.md）
## 実装フェーズ

### Phase 1: データベース・設定管理（推定: 4-6時間）

#### タスク
- [ ] `lottery_settings` テーブル作成
- [ ] `lottery_history` テーブル作成
- [ ] 設定CRUD関数実装（`internal/localdb/lottery.go`）
  - [ ] `GetLotterySettings()`
  - [ ] `UpdateLotterySettings()`
  - [ ] `ResetLastWinner()` - 前回当選者手動リセット
  - [ ] `SaveLotteryHistory()`
  - [ ] `GetLotteryHistory(limit int)`
  - [ ] `DeleteLotteryHistory(id int)`

#### 成果物
- `internal/localdb/lottery.go` - 抽選関連DB操作

---

### Phase 1.5: サブスク情報取得機能（推定: 3-4時間）

#### タスク
- [ ] Twitch API連携実装（`internal/twitchapi/subscriptions.go`）
  - [ ] `GetUserSubscription(broadcasterID, userID string)` 実装
  - [ ] サブスクTier情報取得
  - [ ] 累計サブスク月数取得
- [ ] 最終口数計算ロジック
  - [ ] `CalculateBaseTickets(userRewards []RewardUsage, limit int) int` - 基本口数計算と制限
  - [ ] `CalculateFinalTickets(baseTickets int, subInfo *SubscriptionInfo) int`
  - [ ] ボーナス計算式: `累計月数 × Tier係数 × 1.1 ÷ 3`（切り上げ）
  - [ ] Tier係数: Tier1=1.0、Tier2=1.1、Tier3=1.2、サブスク未登録=0
  - [ ] 最低ボーナス: サブスク登録者は計算結果が0なら1に補正
  - [ ] 小数点切り上げ処理（`math.Ceil`）
  - [ ] 最終口数上限チェック（設定値が0以外の場合）
- [ ] サブスク情報キャッシュ機構（30分TTL）
  - [ ] メモリキャッシュ実装（同時配信中はサブスク状態不変想定）
  - [ ] キャッシュヒット率向上
- [ ] エラーハンドリング
  - [ ] API失敗時はボーナス0として処理継続
  - [ ] サブスク未登録ユーザーはボーナス0
  - [ ] エラーログ記録
  - [ ] UI側で警告表示（日本語）

#### 必要なTwitch API権限
- スコープ: `channel:read:subscriptions`
- エンドポイント: `GET https://api.twitch.tv/helix/subscriptions`

#### 成果物
- `internal/twitchapi/subscriptions.go` - サブスク情報取得
- `internal/lottery/calculator.go` - 口数計算ロジック

---

### Phase 2: 抽選ロジック実装（推定: 6-8時間）

#### タスク
- [ ] 参加者情報収集
  - [ ] 1口リワードの使用者取得
  - [ ] 各ユーザーの基本口数を計算
    - [ ] 複数回使用の合算（使用回数をカウント）
    - [ ] 基本口数上限チェック（設定値を超えたら制限）
  - [ ] 各ユーザーのサブスク情報取得（Phase 1.5の関数使用）
  - [ ] 最終口数計算（基本+ボーナス）
    - [ ] ボーナス = ceil(累計月数 × Tier係数 × 1.1 ÷ 3)
    - [ ] サブスク登録者でボーナスが0なら1に補正
  - [ ] 最終口数上限チェック（設定値が0以外の場合）
  - [ ] 前回当選者を除外
- [ ] 累積重み方式の抽選実装（パフォーマンス最適化）
  ```go
  type WeightedUser struct {
      Username      string
      FinalTickets  int
      CumulativeSum int  // 累積口数
  }
  ```
  - [ ] 累積重み配列生成（メモリ効率 O(n)）
  - [ ] 二分探索による抽選（時間効率 O(log n)）
- [ ] 暗号学的に安全な乱数生成（`crypto/rand`）
- [ ] 抽選実行関数 `DrawLottery()`
- [ ] 抽選後の後処理
  - [ ] 前回当選者更新
  - [ ] 詳細履歴保存（participants_json含む）
  - [ ] WebSocket通知

#### パフォーマンス目標
- 参加者100人、各8口（総口数800）を1秒以内で処理

#### 成果物
- `internal/lottery/draw.go` - 抽選ロジック
- `internal/lottery/draw_test.go` - ユニットテスト

---

### Phase 3: API実装（推定: 4-5時間）

#### エンドポイント
- [ ] `POST /api/lottery/draw` - 抽選実行
- [ ] `GET /api/lottery/settings` - 設定取得
- [ ] `PUT /api/lottery/settings` - 設定更新
- [ ] `POST /api/lottery/reset-winner` - 前回当選者リセット
- [ ] `GET /api/lottery/history` - 履歴取得
- [ ] `DELETE /api/lottery/history/:id` - 履歴削除

#### WebSocketメッセージ
- [ ] `lottery_result` - 抽選結果通知
  ```json
  {
    "type": "lottery_result",
    "data": {
      "winner": "username",
      "total_participants": 10,
      "total_tickets": 25,
      "last_winner": "previous_winner",
      "participants_detail": [
        {
          "username": "user1",
          "final_tickets": 8,
          "is_excluded": false
        },
        {
          "username": "last_winner",
          "final_tickets": 5,
          "is_excluded": true
        }
      ],
      "subscription_errors": ["user3", "user7"]
    }
  }
  ```

- [ ] 抽選中フラグ管理
  - [ ] 同時リクエスト防止機構
  - [ ] 抽選中は他リクエストを403で拒否

#### 成果物
- `internal/webserver/lottery_api.go` - 抽選API（既存API層と統一）

---

### Phase 4: Settings UI実装（推定: 7-9時間）

#### コンポーネント
- [ ] `LotterySettings.tsx` - メインコンポーネント
  - [ ] リワードIDセレクター（1口リワード用）
  - [ ] 抽選実行ボタン
  - [ ] 前回当選者表示
  - [ ] 前回当選者リセットボタン
  - [ ] 抽選状態表示（実行中/完了）
  - [ ] サブスク情報取得エラー警告表示（日本語）
  - [ ] ローディングスピナー
  - [ ] オプション設定パネル
    - [ ] 基本口数上限入力（デフォルト: 3）
    - [ ] 最終口数上限入力（0=無制限）
- [ ] `LotteryHistory.tsx` - 履歴一覧
  - [ ] テーブル表示（当選者/参加者数/日時）
  - [ ] 詳細表示（participants_json展開）
  - [ ] 削除ボタン
  - [ ] ページネーション（オプション）
- [ ] `LotteryRuleDisplay.tsx` - ルール説明
  - [ ] PRESENT.mdのルールを表示
  - [ ] 計算例の提示

#### API連携
- [ ] `GetServerPort()` で動的ポート取得
- [ ] 設定の取得・更新
- [ ] 前回当選者リセット
- [ ] 抽選実行
- [ ] 履歴取得・削除
- [ ] 認証不要（ローカルネットワーク想定）

#### 成果物
- `frontend/src/components/Lottery/LotterySettings.tsx`
- `frontend/src/components/Lottery/LotteryHistory.tsx`
- `frontend/src/components/Lottery/LotteryRuleDisplay.tsx`

---

### Phase 5: Overlay UI実装（推定: 8-10時間）

#### コンポーネント
- [ ] `LotteryRoulette.tsx` - ルーレットコンポーネント
  - [ ] 参加者リスト表示（口数も表示）
  - [ ] 回転アニメーション（CSS Transform）
  - [ ] 当選者ハイライト
  - [ ] 前回当選者の特別表示（グレーアウト + 「対象外」バッジ）
- [ ] `LotteryWinner.tsx` - 当選者発表
  - [ ] 当選者名表示
  - [ ] 祝福エフェクト
  - [ ] 獲得口数表示
  - [ ] サブスクボーナス内訳表示（オプション）

#### アニメーション実装
- [ ] CSS Transform による回転演出
  - [ ] `@keyframes lottery-spin` 定義
  - [ ] 高速回転（1秒） → 減速（2秒） → 停止
  - [ ] イージング設定（`cubic-bezier(0.25, 0.46, 0.45, 0.94)`）
  - [ ] 4回転（1440deg）
- [ ] 当選者発表エフェクト
  - [ ] フェードイン/スケールアップ
  - [ ] 1秒のディレイ後に発表
  - [ ] パーティクルエフェクト（オプション）

**アニメーション仕様:**
```css
@keyframes lottery-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(1440deg); }
}

.lottery-roulette {
  animation: lottery-spin 3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

#### WebSocket統合
- [ ] `getWebSocketClient()` で接続
- [ ] `lottery_result` メッセージ購読
- [ ] 抽選結果の受信と表示更新

#### 成果物
- `web/src/components/Lottery/LotteryRoulette.tsx`
- `web/src/components/Lottery/LotteryWinner.tsx`
- `web/src/styles/lottery.css`

---

### Phase 6: テスト・デバッグ（推定: 5-7時間）

#### テスト項目
- [ ] **ユニットテスト**
  - [ ] サブスク情報取得（モック使用）
  - [ ] 基本口数計算と制限ロジック
    - [ ] 1回使用
    - [ ] 複数回使用（合算）
    - [ ] 基本口数上限チェック（3口制限）
    - [ ] 上限超過時の制限処理（4口 → 3口）
  - [ ] 最終口数計算ロジック（各種ケース）
    - [ ] 基本口数のみ（サブスク未登録）
    - [ ] Tier1 + 1ヶ月（最低ボーナス適用）
    - [ ] Tier1 + 6ヶ月
    - [ ] Tier2 + 6ヶ月
    - [ ] Tier3 + 12ヶ月
    - [ ] 小数点切り上げ
    - [ ] 最終口数上限チェック（設定値あり）
  - [ ] 累積重み方式の抽選ロジック
  - [ ] 前回当選者除外ロジック
- [ ] **統合テスト**
  - [ ] 抽選API呼び出し
  - [ ] Twitch API連携（実環境）
  - [ ] WebSocket通知
  - [ ] DB保存・取得（参加者詳細含む）
- [ ] **UI/UXテスト**
  - [ ] アニメーションの滑らかさ
  - [ ] レスポンシブデザイン
  - [ ] エラーハンドリング（日本語メッセージ）
    - [ ] 参加者0人
    - [ ] 前回当選者のみ
    - [ ] サブスク情報取得失敗
    - [ ] リワードID未設定
    - [ ] 基本口数上限超過時の警告表示
- [ ] **パフォーマンステスト**
  - [ ] 100人参加時の処理時間計測
  - [ ] メモリ使用量確認

#### デバッグモード
- [ ] `?debug=true` パラメータでテストモード
- [ ] ダミーデータ生成機能
  - [ ] サブスクTier/月数をランダム生成
  - [ ] 参加者10-100人を生成
- [ ] 抽選ログ出力（詳細な内訳）
- [ ] テストケース実行コマンド
  ```bash
  DRY_RUN_MODE=true go test ./internal/lottery/... -v
  ```

---


## 受け入れ条件

- [ ] Phase 1〜6 の未完了タスクがIssue上で追跡され、完了時にチェックが更新されている
- [ ] 抽選API・UI・データ永続化の必須要件が移植元文書と同等に管理されている
- [ ] リスク管理項目（0人参加、同時抽選、API障害、Rate Limit等）に対する対策方針が残っている

## リスク管理

### リスク1: 参加者が0人
**対策:**
- API側でエラーレスポンス返却
- UI側で「参加者がいません」メッセージ表示

### リスク2: 前回当選者のみが参加
**対策:**
- 「抽選可能な参加者がいません」エラー
- UIで前回当選者を表示し、リセット促す

### リスク3: リワードIDが未設定
**対策:**
- Settings画面で必須入力バリデーション
- API側で設定チェック

### リスク4: 同時抽選リクエスト
**対策:**
- バックエンドで抽選中フラグ管理
- 抽選中は他リクエストを403で拒否

### リスク5: Twitch API通信エラー
**対策:**
- サブスク情報取得失敗時はボーナス0として処理継続
- エラーログ記録
- WebSocketで警告通知（`subscription_errors`フィールド）
- UI側で「一部ユーザーのサブスク情報取得失敗」警告表示

### リスク6: Twitch API Rate Limit
**対策:**
- サブスク情報を30分間キャッシュ
- 同一配信中はキャッシュから取得（ほぼAPI呼び出し不要）
- Rate Limit: 800req/min（通常使用で問題なし）

### リスク7: 抽選実行後のリワードカウント管理
**対策:**
- 抽選実行後も自動リセットしない（手動管理）
- Settings画面に「リワードカウントリセット」ボタン配置
- 抽選履歴とリワードカウントを分離管理

### リスク8: 基本口数上限超過時のユーザー体験
**対策:**
- 基本口数が上限を超えた場合は自動的に上限値に制限
- UI側で「一部ユーザーの基本口数が上限(3口)を超えたため制限されました」と日本語で警告表示
- 履歴のparticipants_jsonに元の基本口数と制限後の値を両方記録

### リスク9: 履歴データの肥大化
**対策:**
- 履歴は無制限に保存（ユーザー要件）
- 将来的にエクスポート機能で対応可能
- データベースファイルサイズが問題になった場合は手動削除で対応

---


## レビュー観点

- 移植元進捗文書の要件・フェーズ・リスクが欠落していないか
- フェーズ単位で1PRに分割可能な粒度になっているか
- 抽選ロジック要件（口数計算、除外ルール、公平性）が明確か

## TODO ID連携

- なし

## 関連ファイル

- `issues/open/issue-progression-lottery-migration/README.md`
- `issues/index.md`

## 関連ドキュメント

- `docs/TAURI_MIGRATION_PLAN.md`
