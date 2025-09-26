package twitchapi

import (
	"testing"
)

func TestEmoteCache(t *testing.T) {
	t.Run("EmoteCache initialization", func(t *testing.T) {
		// キャッシュが正しく初期化されることを確認
		if emoteCache == nil {
			t.Fatal("EmoteCache should be initialized")
		}
		if emoteCache.emotesByName == nil {
			t.Fatal("EmoteCache.emotesByName should be initialized")
		}
	})

	t.Run("GetEmoteByName with empty cache", func(t *testing.T) {
		// 空のキャッシュからEmoteを取得
		emote, ok := GetEmoteByName("Kappa")
		if ok && emote != nil {
			// キャッシュされている場合は成功
			t.Logf("Found cached emote: %s (ID: %s)", emote.Name, emote.ID)
		} else {
			// キャッシュされていない場合も正常
			t.Log("Emote not found in cache (expected for empty cache)")
		}
	})

	t.Run("GetAllCachedEmotes returns map", func(t *testing.T) {
		emotes := GetAllCachedEmotes()
		if emotes == nil {
			t.Fatal("GetAllCachedEmotes should return non-nil map")
		}
		// Map should be initialized even if empty
		t.Logf("Cached emotes count: %d", len(emotes))
	})
}

func TestEmoteInfo(t *testing.T) {
	t.Run("EmoteInfo struct", func(t *testing.T) {
		emote := EmoteInfo{
			ID:   "25",
			Name: "Kappa",
			Images: EmoteImages{
				URL1x: "https://static-cdn.jtvnw.net/emoticons/v2/25/static/light/1.0",
				URL2x: "https://static-cdn.jtvnw.net/emoticons/v2/25/static/light/2.0",
				URL4x: "https://static-cdn.jtvnw.net/emoticons/v2/25/static/light/3.0",
			},
			EmoteType: "global",
			EmoteSet:  "",
			OwnerID:   "",
		}

		if emote.ID != "25" {
			t.Errorf("Expected emote ID to be '25', got '%s'", emote.ID)
		}
		if emote.Name != "Kappa" {
			t.Errorf("Expected emote name to be 'Kappa', got '%s'", emote.Name)
		}
	})
}