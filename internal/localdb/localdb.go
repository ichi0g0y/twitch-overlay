package localdb

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
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

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}
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
		return nil, err
	}

	// キャッシュ設定のデフォルト値を設定
	_, err = db.Exec(`INSERT OR IGNORE INTO settings (key, value, setting_type, is_required, description) VALUES
		('cache_expiry_days', '7', 'cache', false, 'キャッシュファイルの有効期限（日数）'),
		('cache_max_size_mb', '100', 'cache', false, '最大キャッシュサイズ（MB）'),
		('cache_cleanup_enabled', 'true', 'cache', false, '自動クリーンアップの有効/無効'),
		('cache_cleanup_on_start', 'true', 'cache', false, '起動時クリーンアップの実行')`)
	if err != nil {
		return nil, err
	}

	return db, nil
}

// GetDB は現在のデータベース接続を返します
func GetDB() *sql.DB {
	return DBClient
}
