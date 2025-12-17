package types

import "time"

// PresentParticipant はプレゼントルーレットの参加者情報
type PresentParticipant struct {
	UserID         string    `json:"user_id" db:"user_id"`
	Username       string    `json:"username" db:"username"`
	DisplayName    string    `json:"display_name" db:"display_name"`
	AvatarURL      string    `json:"avatar_url" db:"avatar_url"`
	RedeemedAt     time.Time `json:"redeemed_at" db:"redeemed_at"`
	IsSubscriber   bool      `json:"is_subscriber" db:"is_subscriber"`
	SubscriberTier string    `json:"subscriber_tier" db:"subscriber_tier"` // "1000", "2000", "3000"
	EntryCount     int       `json:"entry_count" db:"entry_count"`         // 購入口数（最大3口）
	AssignedColor  string    `json:"assigned_color" db:"assigned_color"`   // ルーレットの色（カラーコード）
}

// PresentLottery はプレゼントルーレットの状態
type PresentLottery struct {
	IsRunning    bool                  `json:"is_running"`
	IsLocked     bool                  `json:"is_locked"`
	Participants []PresentParticipant  `json:"participants"`
	Winner       *PresentParticipant   `json:"winner,omitempty"`
	StartedAt    *time.Time            `json:"started_at,omitempty"`
}
