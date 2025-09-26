package twitchapi

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/nantokaworks/twitch-overlay/internal/env"
	"github.com/nantokaworks/twitch-overlay/internal/shared/logger"
	"go.uber.org/zap"
)

// EmoteInfo represents a Twitch emote
type EmoteInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Images    EmoteImages `json:"images"`
	EmoteType string `json:"emote_type,omitempty"`
	EmoteSet  string `json:"emote_set_id,omitempty"`
	OwnerID   string `json:"owner_id,omitempty"`
}

// EmoteImages represents URLs for different emote sizes
type EmoteImages struct {
	URL1x string `json:"url_1x"`
	URL2x string `json:"url_2x"`
	URL4x string `json:"url_4x"`
}

// EmoteCache stores emotes with caching
type EmoteCache struct {
	globalEmotes  []EmoteInfo
	channelEmotes []EmoteInfo
	emotesByName  map[string]*EmoteInfo
	lastUpdated   time.Time
	mu            sync.RWMutex
}

var emoteCache = &EmoteCache{
	emotesByName: make(map[string]*EmoteInfo),
}

// GetGlobalEmotes fetches global emotes from Twitch API
func GetGlobalEmotes() ([]EmoteInfo, error) {
	endpoint := "https://api.twitch.tv/helix/chat/emotes/global"

	resp, err := makeAuthenticatedRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get global emotes: %w", err)
	}
	defer resp.Body.Close()

	var response struct {
		Data     []EmoteInfo `json:"data"`
		Template string      `json:"template"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode global emotes: %w", err)
	}

	return response.Data, nil
}

// GetChannelEmotes fetches channel-specific emotes
func GetChannelEmotes(broadcasterID string) ([]EmoteInfo, error) {
	if broadcasterID == "" {
		if env.Value.TwitchUserID == nil || *env.Value.TwitchUserID == "" {
			return nil, fmt.Errorf("broadcaster ID not specified")
		}
		broadcasterID = *env.Value.TwitchUserID
	}

	endpoint := fmt.Sprintf("https://api.twitch.tv/helix/chat/emotes?broadcaster_id=%s", broadcasterID)

	resp, err := makeAuthenticatedRequest("GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get channel emotes: %w", err)
	}
	defer resp.Body.Close()

	var response struct {
		Data     []EmoteInfo `json:"data"`
		Template string      `json:"template"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode channel emotes: %w", err)
	}

	return response.Data, nil
}

// RefreshEmoteCache updates the cached emote lists
func RefreshEmoteCache() error {
	logger.Info("RefreshEmoteCache: starting")

	emoteCache.mu.Lock()
	defer emoteCache.mu.Unlock()

	// Clear existing cache
	emoteCache.emotesByName = make(map[string]*EmoteInfo)
	logger.Debug("RefreshEmoteCache: cleared existing cache")

	// Get global emotes
	logger.Debug("RefreshEmoteCache: fetching global emotes")
	globalEmotes, err := GetGlobalEmotes()
	if err != nil {
		logger.Warn("Failed to fetch global emotes", zap.Error(err))
		// Continue even if global emotes fail
	} else {
		emoteCache.globalEmotes = globalEmotes
		for i := range globalEmotes {
			emoteCache.emotesByName[globalEmotes[i].Name] = &globalEmotes[i]
		}
		logger.Info("Cached global emotes", zap.Int("count", len(globalEmotes)))
		// Log some example emotes for debugging
		if len(globalEmotes) > 0 {
			examples := []string{}
			for i, e := range globalEmotes {
				if i < 5 {
					examples = append(examples, e.Name)
				}
			}
			logger.Debug("Global emote examples", zap.Strings("emotes", examples))
		}
	}

	// Get channel emotes
	if env.Value.TwitchUserID != nil && *env.Value.TwitchUserID != "" {
		logger.Debug("RefreshEmoteCache: fetching channel emotes",
			zap.String("broadcaster_id", *env.Value.TwitchUserID))
		channelEmotes, err := GetChannelEmotes(*env.Value.TwitchUserID)
		if err != nil {
			logger.Warn("Failed to fetch channel emotes", zap.Error(err))
			// Continue even if channel emotes fail
		} else {
			emoteCache.channelEmotes = channelEmotes
			for i := range channelEmotes {
				// Channel emotes override global emotes with the same name
				emoteCache.emotesByName[channelEmotes[i].Name] = &channelEmotes[i]
			}
			logger.Info("Cached channel emotes", zap.Int("count", len(channelEmotes)))
			// Log some example emotes for debugging
			if len(channelEmotes) > 0 {
				examples := []string{}
				for i, e := range channelEmotes {
					if i < 5 {
						examples = append(examples, e.Name)
					}
				}
				logger.Debug("Channel emote examples", zap.Strings("emotes", examples))
			}
		}
	} else {
		logger.Warn("RefreshEmoteCache: TwitchUserID not set, skipping channel emotes")
	}

	emoteCache.lastUpdated = time.Now()
	logger.Info("RefreshEmoteCache: completed",
		zap.Int("total_cached", len(emoteCache.emotesByName)),
		zap.Time("updated_at", emoteCache.lastUpdated))
	return nil
}

// GetEmoteByName returns an emote by its name from cache
func GetEmoteByName(name string) (*EmoteInfo, bool) {
	emoteCache.mu.RLock()
	defer emoteCache.mu.RUnlock()

	// Check if cache is too old (1 hour) and not empty
	if time.Since(emoteCache.lastUpdated) > time.Hour && emoteCache.lastUpdated.Unix() > 0 {
		// Schedule refresh in background
		go func() {
			if err := RefreshEmoteCache(); err != nil {
				logger.Error("Failed to refresh emote cache", zap.Error(err))
			}
		}()
	}

	emote, ok := emoteCache.emotesByName[name]
	return emote, ok
}

// GetEmoteByID returns an emote by its ID from cache
func GetEmoteByID(id string) (*EmoteInfo, bool) {
	emoteCache.mu.RLock()
	defer emoteCache.mu.RUnlock()

	// Search through all cached emotes to find by ID
	for _, emote := range emoteCache.emotesByName {
		if emote.ID == id {
			return emote, true
		}
	}
	return nil, false
}

// GetAllCachedEmotes returns all cached emotes
func GetAllCachedEmotes() map[string]*EmoteInfo {
	emoteCache.mu.RLock()
	defer emoteCache.mu.RUnlock()

	// Return a copy to avoid race conditions
	result := make(map[string]*EmoteInfo)
	for k, v := range emoteCache.emotesByName {
		result[k] = v
	}
	return result
}

// InitializeEmoteCache initializes the emote cache at startup
func InitializeEmoteCache() {
	logger.Info("InitializeEmoteCache: starting")
	if err := RefreshEmoteCache(); err != nil {
		logger.Error("Failed to initialize emote cache", zap.Error(err))
	} else {
		logger.Info("InitializeEmoteCache: completed successfully",
			zap.Int("total_emotes", len(emoteCache.emotesByName)))
	}
}