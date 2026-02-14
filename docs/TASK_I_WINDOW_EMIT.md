# TASK I: ウィンドウ管理 + Emitイベント

> 運用メモ: 進行中タスクの正本は `issues/` へ移行しました。
> 移行先Issue: `issues/open/ISSUE-0011-issue-task-i-window-emit/README.md`


- 優先度: **P2**
- 見積: 1-2日
- 依存: Phase H（通知ウィンドウのスクリーン情報が必要）
- ブロック: Phase K（初期化統合）

---

## 目的

Go版 `window_darwin.go` のCGO関数群 (9個) と `app.go` のWails Emitイベント (14種) をTauri APIで再実装する。マルチモニター対応、ウィンドウ位置永続化を含む。

---

## タスク

### I-1. CGO関数のTauri代替実装

**新規作成**: `src-tauri/src/window/mod.rs`, `src-tauri/src/window/monitor.rs`

Go版 `window_darwin.go` の9つのCGO wrapper関数をTauri APIで代替:

| CGO関数 | Tauri代替 |
|---------|----------|
| `GetAllScreensWithPosition()` | `app.available_monitors()` + 座標取得 |
| `MoveSettingsWindowToAbsolutePosition(x,y)` | `window.set_position(PhysicalPosition)` |
| `GetSettingsWindowPosition()` | `window.outer_position()` |
| `FindScreenContainingWindow(x,y,w,h)` | モニター矩形との交差判定 |
| `GetNotificationWindowPosition()` | 通知ウィンドウの `outer_position()` |
| `MoveNotificationWindowToAbsolutePosition(x,y)` | 通知ウィンドウの `set_position()` |
| `GetMainWindowSize()` | `window.outer_size()` |
| `GetScreenSize(index)` | `monitor.size()` |
| `GetScreenPosition(index)` | `monitor.position()` |

**参考**: `window_darwin.go` 全体

### I-2. マルチモニター対応

**変更対象**: `src-tauri/src/window/monitor.rs`

```rust
fn get_all_screens() -> Vec<ScreenInfo> {
    // Tauri Monitor API で全モニター情報取得
    // 各モニターの絶対座標・サイズを返す
}

fn find_screen_containing(x: i32, y: i32, w: u32, h: u32) -> Option<usize> {
    // ウィンドウ矩形がどのモニターに属するかを判定
    // 面積最大のモニターを返す
}

fn generate_screen_config_hash(screens: &[ScreenInfo]) -> String {
    // MD5ハッシュでモニター構成を識別
    // モニター構成が変わったら位置リセット
}
```

**参考**: `app.go:245-280` GetAllScreensWithPosition, `app.go:263` FindScreenContainingWindow

### I-3. ウィンドウ位置永続化・復元

**変更対象**: `src-tauri/src/window/position.rs`

- ウィンドウの位置・サイズをDB永続化
- 保存するデータ:
  ```rust
  struct WindowState {
      x: i32,
      y: i32,
      width: u32,
      height: u32,
      is_fullscreen: bool,
      screen_config_hash: String,  // モニター構成識別
  }
  ```
- 起動時にDBから復元 (`restoreWindowState`)
- モニター構成ハッシュが変わった場合はデフォルト位置にリセット

**参考**: `app.go:800-900` restoreWindowState

### I-4. ウィンドウイベントハンドリング

**変更対象**: `src-tauri/src/window/events.rs`

Tauri `WindowEvent` でイベントを捕捉:

| イベント | 処理 |
|---------|------|
| `Moved` | 新しい位置をDBに保存 |
| `Resized` | 新しいサイズをDBに保存 |
| `CloseRequested` | アプリ終了処理（クリーンアップ） |

```rust
// Tauri Builder で登録
.on_window_event(|window, event| {
    match event {
        WindowEvent::Moved(position) => save_position(window, position),
        WindowEvent::Resized(size) => save_size(window, size),
        WindowEvent::CloseRequested { .. } => cleanup(window),
        _ => {}
    }
})
```

**参考**: `app.go:900-1000` ウィンドウイベントハンドラー

### I-5. 14種 Tauri Emitイベント実装

**新規作成**: `src-tauri/src/events.rs`

全14種のイベントを `AppHandle::emit()` で実装:

```rust
pub mod events {
    pub const STREAM_STATUS_CHANGED: &str = "stream_status_changed";
    pub const PRINTER_CONNECTED: &str = "printer_connected";
    pub const PRINTER_ERROR: &str = "printer_error";
    pub const PRINT_ERROR: &str = "print_error";
    pub const PRINT_SUCCESS: &str = "print_success";
    pub const WEBSERVER_STARTED: &str = "webserver_started";
    pub const WEBSERVER_ERROR: &str = "webserver_error";
    pub const AUTH_SUCCESS: &str = "auth_success";
    pub const SETTINGS_UPDATED: &str = "settings_updated";
    pub const MUSIC_STATUS_UPDATE: &str = "music_status_update";
    pub const MUSIC_CONTROL_COMMAND: &str = "music_control_command";
    pub const FAX_RECEIVED: &str = "fax_received";
    pub const EVENTSUB_EVENT: &str = "eventsub_event";
    pub const SAVE_WINDOW_POSITION: &str = "save_window_position";
}
```

各イベントの発行箇所:

| イベント | 発行元 |
|---------|--------|
| `stream_status_changed` | 配信状態コールバック（Phase B） |
| `printer_connected` | プリンター接続/切断（Phase D） |
| `printer_error` | プリンター操作失敗（Phase D） |
| `print_error` | 印刷失敗（Phase F） |
| `print_success` | 印刷成功（Phase F） |
| `webserver_started` | axumサーバー起動完了 |
| `webserver_error` | axumサーバー起動失敗 |
| `auth_success` | OAuth完了（Phase B） |
| `settings_updated` | 設定変更時 |
| `music_status_update` | 再生状態変更 |
| `music_control_command` | 再生制御 |
| `fax_received` | FAX受信 |
| `eventsub_event` | Twitchイベント（Phase C） |
| `save_window_position` | ウィンドウ移動時 |

**参考**: `app.go` 全体のWails Emitイベント14箇所

### I-6. フロントエンド側 listener

**変更対象**: `frontend/src/` 内

Tauri JavaScript API で各イベントをリッスン:

```typescript
import { listen } from '@tauri-apps/api/event';

await listen('stream_status_changed', (event) => {
    // UIステータス更新
});

await listen('printer_connected', (event) => {
    // プリンターUI更新
});
```

**参考**: `frontend/src/` 内の既存Wailsイベントリスナー

### I-7. macOS固有処理

**変更対象**: `src-tauri/src/window/` 内

- UIステートファイルクリーンアップ:
  ```
  ~/Library/Saved Application State/com.tauri.twitch-overlay.savedState
  ~/Library/Preferences/com.tauri.twitch-overlay.plist
  ```
  バンドルIDはTauri設定 (`tauri.conf.json`) に合わせる

- Bluetooth安全機構は Phase D で実装済みの想定

**参考**: `app.go:1-50` clearUIStateFiles

---

## 完了条件

- [ ] 全9つのCGO関数相当がTauri Monitor APIで動作
- [ ] ウィンドウ位置が再起動後も正しく復元される
- [ ] モニター構成変更時にデフォルト位置にリセットされる
- [ ] ウィンドウ移動/リサイズが自動的にDBに保存される
- [ ] 14種のEmitイベントが適切なタイミングで発行される
- [ ] フロントエンド側でイベントをリッスンしUIが更新される
- [ ] macOS固有のUIステートクリーンアップが動作

---

## 参照ファイル

| Go側 | 行数 | 用途 |
|------|------|------|
| `window_darwin.go` | - | CGO wrapper関数9個 |
| `app.go` | 2,100 | Wails Emitイベント14種、ウィンドウ管理 |
| `app.go:800-900` | - | restoreWindowState |
| `app.go:900-1000` | - | ウィンドウイベントハンドラー |
