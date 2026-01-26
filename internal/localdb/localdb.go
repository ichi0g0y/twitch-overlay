package localdb

import (
	"database/sql"
	"fmt"

	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	_ "github.com/mattn/go-sqlite3"
	"go.uber.org/zap"
)

var DBClient *sql.DB

type Token struct {
	AccessToken  string
	RefreshToken string
	Scope        string
	ExpiresAt    int64
}

func SetupDB(dbPath string) (*sql.DB, error) {
	if DBClient != nil {
		return DBClient, nil
	}

	// WALモードとBusy Timeoutを設定（Race Condition対策）
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, err
	}

	// SQLiteは単一ライターなので接続プールを1に制限
	db.SetMaxOpenConns(1)

	DBClient = db

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS tokens (
		id INTEGER PRIMARY KEY,
		access_token TEXT,
		refresh_token TEXT,
		scope TEXT,
		expires_at INTEGER
	)`)
	if err != nil {
		return nil, err
	}

	// settingsテーブルを追加
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		setting_type TEXT NOT NULL DEFAULT 'normal',
		is_required BOOLEAN NOT NULL DEFAULT false,
		description TEXT,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, err
	}

	// 既存のsettingsテーブルに新しいカラムを追加（ALTER TABLEは既に存在する場合にはエラーになるが、それを無視）
	db.Exec(`ALTER TABLE settings ADD COLUMN setting_type TEXT NOT NULL DEFAULT 'normal'`)
	db.Exec(`ALTER TABLE settings ADD COLUMN is_required BOOLEAN NOT NULL DEFAULT false`)
	db.Exec(`ALTER TABLE settings ADD COLUMN description TEXT`)

	// playback_stateテーブルを追加
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS playback_state (
		id INTEGER PRIMARY KEY,
		track_id TEXT NOT NULL,
		position REAL NOT NULL DEFAULT 0,
		duration REAL NOT NULL DEFAULT 0,
		playback_status TEXT NOT NULL DEFAULT 'stopped',
		is_playing BOOLEAN NOT NULL DEFAULT false,
		volume INTEGER NOT NULL DEFAULT 70,
		playlist_name TEXT,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, err
	}

	// playlistsテーブルを追加
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS playlists (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL UNIQUE,
		description TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, err
	}

	// playlist_tracksテーブルを追加
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS playlist_tracks (
		playlist_id TEXT NOT NULL,
		track_id TEXT NOT NULL,
		position INTEGER NOT NULL,
		added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (playlist_id, track_id),
		FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
	)`)
	if err != nil {
		return nil, err
	}

	// tracksテーブルを追加（音楽トラック情報）
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS tracks (
		id TEXT PRIMARY KEY,
		file_path TEXT NOT NULL UNIQUE,
		title TEXT,
		artist TEXT,
		album TEXT,
		duration REAL,
		added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, err
	}

	// cache_entriesテーブルを追加（キャッシュファイル管理）
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS cache_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		url_hash TEXT UNIQUE NOT NULL,
		original_url TEXT NOT NULL,
		file_path TEXT NOT NULL,
		file_size INTEGER DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		logger.Error("Failed to create cache_entries table", zap.Error(err))
		return nil, fmt.Errorf("failed to create cache_entries table: %w", err)
	}

	// キャッシュ設定のデフォルト値を設定
	_, err = db.Exec(`INSERT OR IGNORE INTO settings (key, value, setting_type, is_required, description) VALUES
		('cache_expiry_days', '7', 'cache', false, 'キャッシュファイルの有効期限（日数）'),
		('cache_max_size_mb', '100', 'cache', false, '最大キャッシュサイズ（MB）'),
		('cache_cleanup_enabled', 'true', 'cache', false, '自動クリーンアップの有効/無効'),
		('cache_cleanup_on_start', 'true', 'cache', false, '起動時クリーンアップの実行')`)
	if err != nil {
		logger.Error("Failed to insert default cache settings", zap.Error(err))
		return nil, fmt.Errorf("failed to insert default cache settings: %w", err)
	}

	// オーバーレイ設定のデフォルト値を設定
	_, err = db.Exec(`INSERT OR IGNORE INTO settings (key, value, setting_type, is_required, description) VALUES
		('MUSIC_ENABLED', 'true', 'overlay', false, '音楽プレイヤーの有効/無効'),
		('MUSIC_VOLUME', '70', 'overlay', false, '音楽の音量'),
		('MUSIC_AUTO_PLAY', 'false', 'overlay', false, '自動再生の有効/無効'),
		('FAX_ENABLED', 'true', 'overlay', false, 'FAX表示の有効/無効'),
		('FAX_ANIMATION_SPEED', '1.0', 'overlay', false, 'FAXアニメーション速度'),
		('FAX_IMAGE_TYPE', 'color', 'overlay', false, 'FAX画像タイプ'),
		('OVERLAY_CLOCK_ENABLED', 'true', 'overlay', false, '時計表示の有効/無効'),
		('OVERLAY_CLOCK_FORMAT', '24h', 'overlay', false, '時計フォーマット'),
		('CLOCK_SHOW_ICONS', 'true', 'overlay', false, '時計アイコン表示'),
		('OVERLAY_LOCATION_ENABLED', 'true', 'overlay', false, '場所表示の有効/無効'),
		('OVERLAY_DATE_ENABLED', 'true', 'overlay', false, '日付表示の有効/無効'),
		('OVERLAY_TIME_ENABLED', 'true', 'overlay', false, '時刻表示の有効/無効'),
		('REWARD_COUNT_ENABLED', 'false', 'overlay', false, 'リワードカウント表示の有効/無効'),
		('REWARD_COUNT_POSITION', 'left', 'overlay', false, 'リワードカウント表示位置'),
		('LOTTERY_ENABLED', 'false', 'overlay', false, 'プレゼントルーレットの有効/無効'),
		('LOTTERY_DISPLAY_DURATION', '5', 'overlay', false, 'ルーレット表示時間（秒）'),
		('LOTTERY_ANIMATION_SPEED', '1.0', 'overlay', false, 'ルーレットアニメーション速度'),
		('LOTTERY_TICKER_ENABLED', 'false', 'overlay', false, 'プレゼント参加者ティッカー表示の有効/無効'),
		('TICKER_NOTICE_ENABLED', 'false', 'overlay', false, 'ティッカーお知らせ文の有効/無効'),
		('TICKER_NOTICE_TEXT', '', 'overlay', false, 'ティッカーお知らせ文の内容'),
		('TICKER_NOTICE_FONT_SIZE', '16', 'overlay', false, 'ティッカーお知らせ文のフォントサイズ（px）'),
		('TICKER_NOTICE_ALIGN', 'center', 'overlay', false, 'ティッカーお知らせ文の配置'),
		('OVERLAY_CARDS_EXPANDED', '{"musicPlayer":true,"fax":true,"clock":true,"rewardCount":true,"lottery":true}', 'overlay', false, 'カードの折りたたみ状態'),
		('OVERLAY_CARDS_LAYOUT', '{"left":["musicPlayer","fax","clock"],"right":["rewardCount","lottery"]}', 'overlay', false, 'カードの配置状態'),
		('OVERLAY_DEBUG_ENABLED', 'false', 'overlay', false, 'デバッグ情報表示の有効/無効')`)
	if err != nil {
		logger.Error("Failed to insert default overlay settings", zap.Error(err))
		return nil, fmt.Errorf("failed to insert default overlay settings: %w", err)
	}

	// reward_groupsテーブルを追加（カスタムリワードのグループ管理）
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS reward_groups (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		is_enabled BOOLEAN NOT NULL DEFAULT true,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		logger.Error("Failed to create reward_groups table", zap.Error(err))
		return nil, fmt.Errorf("failed to create reward_groups table: %w", err)
	}

	// reward_group_membersテーブルを追加（グループとリワードの多対多関係）
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS reward_group_members (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		group_id INTEGER NOT NULL,
		reward_id TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(group_id, reward_id),
		FOREIGN KEY (group_id) REFERENCES reward_groups(id) ON DELETE CASCADE
	)`)
	if err != nil {
		logger.Error("Failed to create reward_group_members table", zap.Error(err))
		return nil, fmt.Errorf("failed to create reward_group_members table: %w", err)
	}

	// app_created_rewardsテーブルを追加（このアプリで作成したリワードを記録）
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS app_created_rewards (
		reward_id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		logger.Error("Failed to create app_created_rewards table", zap.Error(err))
		return nil, fmt.Errorf("failed to create app_created_rewards table: %w", err)
	}

	// reward_redemption_countsテーブルを追加（リワード引き換え回数のカウント）
	if err := SetupRewardCountsTable(db); err != nil {
		return nil, err
	}

	// lottery_participantsテーブルを追加（プレゼントルーレット参加者管理）
	if err := SetupLotteryParticipantsTable(db); err != nil {
		return nil, err
	}

	return db, nil
}

// GetDB は現在のデータベース接続を返します
func GetDB() *sql.DB {
	return DBClient
}

// DeleteAllTokens deletes all tokens from the database
// This is used when OAuth scopes are updated and re-authentication is required
func DeleteAllTokens() error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec("DELETE FROM tokens")
	if err != nil {
		logger.Error("Failed to delete tokens", zap.Error(err))
		return fmt.Errorf("failed to delete tokens: %w", err)
	}

	logger.Info("All tokens have been deleted (scope update requires re-authentication)")
	return nil
}

// RecordAppCreatedReward records that this app created a reward
func RecordAppCreatedReward(rewardID, title string) error {
	db := GetDB()
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec(`INSERT OR REPLACE INTO app_created_rewards (reward_id, title, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
		rewardID, title)
	if err != nil {
		logger.Error("Failed to record app created reward", zap.Error(err), zap.String("reward_id", rewardID))
		return fmt.Errorf("failed to record app created reward: %w", err)
	}

	logger.Info("Recorded app created reward", zap.String("reward_id", rewardID), zap.String("title", title))
	return nil
}

// IsAppCreatedReward checks if a reward was created by this app
func IsAppCreatedReward(rewardID string) (bool, error) {
	db := GetDB()
	if db == nil {
		return false, fmt.Errorf("database not initialized")
	}

	var exists int
	err := db.QueryRow(`SELECT COUNT(*) FROM app_created_rewards WHERE reward_id = ?`, rewardID).Scan(&exists)
	if err != nil {
		logger.Error("Failed to check if reward is app created", zap.Error(err), zap.String("reward_id", rewardID))
		return false, fmt.Errorf("failed to check if reward is app created: %w", err)
	}

	return exists > 0, nil
}

// GetAllAppCreatedRewardIDs returns all reward IDs created by this app
func GetAllAppCreatedRewardIDs() ([]string, error) {
	db := GetDB()
	if db == nil {
		return []string{}, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query(`SELECT reward_id FROM app_created_rewards ORDER BY created_at DESC`)
	if err != nil {
		logger.Error("Failed to get app created rewards", zap.Error(err))
		return []string{}, fmt.Errorf("failed to get app created rewards: %w", err)
	}
	defer rows.Close()

	rewardIDs := []string{}
	for rows.Next() {
		var rewardID string
		if err := rows.Scan(&rewardID); err != nil {
			logger.Error("Failed to scan reward ID", zap.Error(err))
			continue
		}
		rewardIDs = append(rewardIDs, rewardID)
	}

	return rewardIDs, nil
}
