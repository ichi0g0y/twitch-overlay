pub(super) const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    scope TEXT,
    expires_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    setting_type TEXT NOT NULL DEFAULT 'normal',
    is_required BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playback_state (
    id INTEGER PRIMARY KEY,
    track_id TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    playback_status TEXT NOT NULL DEFAULT 'stopped',
    is_playing BOOLEAN NOT NULL DEFAULT false,
    volume INTEGER NOT NULL DEFAULT 70,
    playlist_name TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,
    title TEXT,
    artist TEXT,
    album TEXT,
    duration REAL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cache_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_hash TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    reward_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, reward_id),
    FOREIGN KEY (group_id) REFERENCES reward_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_created_rewards (
    reward_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_redemption_counts (
    reward_id TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    user_names TEXT DEFAULT '[]',
    display_name TEXT DEFAULT '',
    is_enabled BOOLEAN DEFAULT NULL,
    last_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS word_filter_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    language TEXT NOT NULL,
    word TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('bad', 'good')),
    UNIQUE(language, word, type)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    user_id TEXT,
    username TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    badge_keys_json TEXT NOT NULL DEFAULT '[]',
    fragments_json TEXT,
    translation_text TEXT DEFAULT '',
    translation_status TEXT DEFAULT '',
    translation_lang TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_message_id
    ON chat_messages(message_id)
    WHERE message_id IS NOT NULL AND message_id != '';

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
    ON chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
    ON chat_messages(user_id);

CREATE TABLE IF NOT EXISTS chat_users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    chat_color TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_users_updated_at
    ON chat_users(updated_at);

CREATE TABLE IF NOT EXISTS irc_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_login TEXT NOT NULL,
    message_id TEXT,
    user_id TEXT,
    username TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    badge_keys_json TEXT NOT NULL DEFAULT '[]',
    fragments_json TEXT,
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_irc_chat_messages_channel_message_id
    ON irc_chat_messages(channel_login, message_id)
    WHERE message_id IS NOT NULL AND message_id != '';

CREATE INDEX IF NOT EXISTS idx_irc_chat_messages_created_at
    ON irc_chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_irc_chat_messages_channel
    ON irc_chat_messages(channel_login);

CREATE INDEX IF NOT EXISTS idx_irc_chat_messages_user_id
    ON irc_chat_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_irc_chat_messages_channel_created_at
    ON irc_chat_messages(channel_login, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS irc_channel_profiles (
    channel_login TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_irc_channel_profiles_updated_at
    ON irc_channel_profiles(updated_at);

CREATE TABLE IF NOT EXISTS lottery_participants (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    redeemed_at TIMESTAMP NOT NULL,
    is_subscriber BOOLEAN NOT NULL DEFAULT false,
    subscribed_months INTEGER NOT NULL DEFAULT 0,
    subscriber_tier TEXT DEFAULT '',
    entry_count INTEGER NOT NULL DEFAULT 1,
    assigned_color TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lottery_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    reward_id TEXT,
    last_winner TEXT,
    base_tickets_limit INTEGER NOT NULL DEFAULT 3,
    final_tickets_limit INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lottery_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    winner_name TEXT NOT NULL,
    total_participants INTEGER NOT NULL,
    total_tickets INTEGER NOT NULL,
    participants_json TEXT,
    reward_ids_json TEXT,
    drawn_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lottery_history_drawn_at
    ON lottery_history(drawn_at DESC);

CREATE TABLE IF NOT EXISTS channel_broadcast_cache (
    broadcaster_id TEXT PRIMARY KEY,
    last_broadcast_at TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
);
"#;
