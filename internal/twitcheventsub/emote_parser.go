package twitcheventsub

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/joeyak/go-twitch-eventsub/v3"
	"github.com/ichi0g0y/twitch-overlay/internal/shared/logger"
	"github.com/ichi0g0y/twitch-overlay/internal/twitchapi"
	"go.uber.org/zap"
)

// ParseUserInputToFragments parses user input text and converts emotes to fragments
func ParseUserInputToFragments(userInput string) []twitch.ChatMessageFragment {
	if userInput == "" {
		logger.Debug("ParseUserInputToFragments: empty input")
		return []twitch.ChatMessageFragment{}
	}

	logger.Info("ParseUserInputToFragments: parsing input",
		zap.String("input", userInput))

	// Get all cached emotes
	emotes := twitchapi.GetAllCachedEmotes()
	logger.Info("ParseUserInputToFragments: cached emotes count",
		zap.Int("count", len(emotes)))

	if len(emotes) == 0 {
		// If no emotes cached, try to refresh
		logger.Warn("ParseUserInputToFragments: no emotes cached, triggering refresh")
		go func() {
			if err := twitchapi.RefreshEmoteCache(); err != nil {
				logger.Error("Failed to refresh emote cache", zap.Error(err))
			} else {
				logger.Info("Emote cache refreshed successfully")
			}
		}()
		// Return text-only for now
		return []twitch.ChatMessageFragment{
			{
				Type: "text",
				Text: userInput,
			},
		}
	}

	// Build regex pattern for all emote names
	// Sort by length (longest first) to match longer emote names first
	var emoteNames []string
	for name := range emotes {
		emoteNames = append(emoteNames, name)
	}

	// Sort emote names by length (longest first)
	for i := 0; i < len(emoteNames)-1; i++ {
		for j := i + 1; j < len(emoteNames); j++ {
			if len(emoteNames[j]) > len(emoteNames[i]) {
				emoteNames[i], emoteNames[j] = emoteNames[j], emoteNames[i]
			}
		}
	}

	// Build fragments
	fragments := []twitch.ChatMessageFragment{}
	remaining := userInput

	for len(remaining) > 0 {
		foundEmote := false

		// Check each emote name
		for _, emoteName := range emoteNames {
			// Check if the text starts with this emote name
			if strings.HasPrefix(remaining, emoteName) {
				// Check if it's a word boundary (not part of a longer word)
				isWordBoundary := false
				if len(remaining) == len(emoteName) {
					// End of string
					isWordBoundary = true
				} else {
					// Check next character
					nextChar := remaining[len(emoteName)]
					if nextChar == ' ' || nextChar == '\n' || nextChar == '\t' {
						isWordBoundary = true
					}
				}

				if isWordBoundary {
					// Found an emote
					emoteInfo := emotes[emoteName]
					fragments = append(fragments, twitch.ChatMessageFragment{
						Type: "emote",
						Text: emoteName,
						Emote: &twitch.ChatMessageFragmentEmote{
							Id:         emoteInfo.ID,
							EmoteSetId: emoteInfo.EmoteSet,
							OwnerId:    emoteInfo.OwnerID,
							Format:     []string{"static"},
						},
					})

					remaining = remaining[len(emoteName):]
					foundEmote = true

					logger.Info("Found emote in user input",
						zap.String("name", emoteName),
						zap.String("id", emoteInfo.ID),
						zap.String("remaining", remaining))
					break
				}
			}
		}

		if !foundEmote {
			// No emote found at the start, find the next potential emote position
			nextEmotePos := len(remaining)

			// Find the nearest emote in the remaining text
			for _, emoteName := range emoteNames {
				// Use word boundary regex to find emote
				pattern := fmt.Sprintf(`\b%s\b`, regexp.QuoteMeta(emoteName))
				re := regexp.MustCompile(pattern)
				if loc := re.FindStringIndex(remaining); loc != nil && loc[0] < nextEmotePos && loc[0] > 0 {
					nextEmotePos = loc[0]
				}
			}

			// Add text fragment up to the next emote (or all remaining text)
			textToAdd := remaining
			if nextEmotePos < len(remaining) {
				textToAdd = remaining[:nextEmotePos]
			}

			if len(textToAdd) > 0 {
				// Merge with previous text fragment if it exists
				if len(fragments) > 0 && fragments[len(fragments)-1].Type == "text" {
					fragments[len(fragments)-1].Text += textToAdd
				} else {
					fragments = append(fragments, twitch.ChatMessageFragment{
						Type: "text",
						Text: textToAdd,
					})
				}
				remaining = remaining[len(textToAdd):]
			}
		}
	}

	// If no fragments were created, return text-only
	if len(fragments) == 0 {
		logger.Debug("ParseUserInputToFragments: no fragments created, returning text-only")
		return []twitch.ChatMessageFragment{
			{
				Type: "text",
				Text: userInput,
			},
		}
	}

	// Log fragment summary
	emoteCount := 0
	for _, f := range fragments {
		if f.Type == "emote" {
			emoteCount++
		}
	}
	logger.Info("ParseUserInputToFragments: completed",
		zap.Int("total_fragments", len(fragments)),
		zap.Int("emote_count", emoteCount))

	return fragments
}

// InitializeEmoteParser initializes the emote parser by caching emotes
func InitializeEmoteParser() {
	logger.Info("Initializing emote parser")
	twitchapi.InitializeEmoteCache()

	// Log initial cache status
	emotes := twitchapi.GetAllCachedEmotes()
	logger.Info("Emote parser initialized",
		zap.Int("cached_emotes", len(emotes)))
}