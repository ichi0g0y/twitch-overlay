package translation

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/abadojack/whatlanggo"
)

var (
	mentionRegex    = regexp.MustCompile(`@[\p{L}\p{N}_]+`)
	whitespaceRegex = regexp.MustCompile(`\s+`)
	urlOnlyRegex    = regexp.MustCompile(`^https?://\S+$`)
	wOnlyRegex      = regexp.MustCompile(`^[wｗ]+$`)
	numSymbolRegex  = regexp.MustCompile(`^[\p{N}\p{P}\p{S}\s]+$`)
)

var englishShortWords = map[string]struct{}{
	"hello":   {},
	"hi":      {},
	"hey":     {},
	"thanks":  {},
	"thank":   {},
	"thx":     {},
	"ty":      {},
	"ok":      {},
	"okay":    {},
	"lol":     {},
	"lmao":    {},
	"rofl":    {},
	"omg":     {},
	"gg":      {},
	"ggwp":    {},
	"wp":      {},
	"gl":      {},
	"hf":      {},
	"nice":    {},
	"good":    {},
	"great":   {},
	"cool":    {},
	"sorry":   {},
	"please":  {},
	"pls":     {},
	"welcome": {},
	"bye":     {},
	"goodbye": {},
	"gn":      {},
	"gm":      {},
	"night":   {},
	"morning": {},
	"evening": {},
	"afk":     {},
	"brb":     {},
	"np":      {},
	"sup":     {},
	"yo":      {},
	"yep":     {},
	"nope":    {},
	"yes":     {},
	"no":      {},
	"nah":     {},
	"all":     {},
	"guys":    {},
	"chat":    {},
	"there":   {},
}

var iso6391To3 = map[string]string{
	"ja": "jpn",
	"en": "eng",
	"zh": "cmn",
	"ko": "kor",
	"fr": "fra",
	"de": "deu",
	"es": "spa",
	"pt": "por",
	"ru": "rus",
	"it": "ita",
	"id": "ind",
	"th": "tha",
	"vi": "vie",
	"tl": "fil",
	"ar": "ara",
	"hi": "hin",
	"bn": "ben",
	"nl": "nld",
	"sv": "swe",
	"no": "nor",
	"da": "dan",
	"fi": "fin",
	"pl": "pol",
	"tr": "tur",
	"uk": "ukr",
	"el": "ell",
	"he": "heb",
	"hu": "hun",
	"cs": "ces",
	"sk": "slk",
	"ro": "ron",
	"bg": "bul",
	"sr": "srp",
	"hr": "hrv",
	"sl": "slv",
	"et": "est",
	"lv": "lav",
	"lt": "lit",
	"fa": "fas",
	"ur": "urd",
	"ta": "tam",
}

// NormalizeForLanguageDetection normalizes message text for language detection.
func NormalizeForLanguageDetection(text string) string {
	if strings.TrimSpace(text) == "" {
		return ""
	}

	normalized := strings.TrimSpace(text)
	normalized = strings.ReplaceAll(normalized, "\u3000", " ")
	normalized = mentionRegex.ReplaceAllString(normalized, "")
	normalized = whitespaceRegex.ReplaceAllString(normalized, " ")
	normalized = strings.TrimSpace(normalized)

	if normalized == "" {
		return ""
	}
	if urlOnlyRegex.MatchString(normalized) {
		return ""
	}

	return normalized
}

// ShouldTranslateToJapanese returns true when the text should be translated into Japanese.
func ShouldTranslateToJapanese(normalized string) bool {
	if ShouldSkipTranslation(normalized) {
		return false
	}
	return !IsJapanese(normalized)
}

// ShouldSkipTranslation excludes messages that should not be translated.
func ShouldSkipTranslation(normalized string) bool {
	if normalized == "" {
		return true
	}
	if wOnlyRegex.MatchString(normalized) {
		return true
	}
	if numSymbolRegex.MatchString(normalized) {
		return true
	}
	return false
}

// IsJapanese returns true when the normalized text is considered Japanese.
func IsJapanese(normalized string) bool {
	if normalized == "" {
		return false
	}

	if hasKanaOrSymbol(normalized) {
		return true
	}

	if hasKanji(normalized) {
		if isChinese(normalized) {
			return false
		}
		return true
	}

	return false
}

func isChinese(text string) bool {
	info := whatlanggo.Detect(text)
	return info.Lang == whatlanggo.Cmn && info.IsReliable()
}

// DetectLanguageCode returns ISO 639-3 code.
// Returns "und" when detection fails.
func DetectLanguageCode(text string) string {
	if strings.TrimSpace(text) == "" {
		return ""
	}

	info := whatlanggo.Detect(text)
	code := info.Lang.Iso6393()
	if code == "" {
		code = "und"
	}

	if info.IsReliable() {
		return code
	}

	if hasNonASCIILetter(text) {
		return code
	}

	if info.Confidence >= 0.3 {
		return code
	}

	if isCommonEnglishShortText(text) {
		return "eng"
	}

	return "und"
}

func hasKanaOrSymbol(text string) bool {
	for _, r := range text {
		switch {
		case r >= 0x3040 && r <= 0x30FF: // Hiragana + Katakana
			return true
		case r >= 0xFF66 && r <= 0xFF9D: // Halfwidth Katakana
			return true
		case r >= 0x337B && r <= 0x337F:
			return true
		case r >= 0x31F0 && r <= 0x31FF: // Katakana Phonetic Extensions
			return true
		case r >= 0x32D0 && r <= 0x32FF:
			return true
		case r >= 0x3300 && r <= 0x33FF:
			return true
		case r >= 0xFF01 && r <= 0xFF60: // Fullwidth forms (symbols)
			return true
		case r >= 0xFFE0 && r <= 0xFFE6: // Fullwidth symbols
			return true
		}
	}
	return false
}

func hasKanji(text string) bool {
	for _, r := range text {
		if r >= 0x4E00 && r <= 0x9FFF {
			return true
		}
	}
	return false
}

func hasNonASCIILetter(text string) bool {
	for _, r := range text {
		if unicode.IsLetter(r) && r > unicode.MaxASCII {
			return true
		}
	}
	return false
}

func isCommonEnglishShortText(text string) bool {
	words := extractASCIIWords(strings.ToLower(text))
	if len(words) == 0 {
		return false
	}
	for _, word := range words {
		if _, ok := englishShortWords[word]; !ok {
			return false
		}
	}
	return true
}

func extractASCIIWords(text string) []string {
	var words []string
	var builder strings.Builder

	flush := func() {
		if builder.Len() > 0 {
			words = append(words, builder.String())
			builder.Reset()
		}
	}

	for _, r := range text {
		if r <= unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsNumber(r)) {
			builder.WriteRune(r)
			continue
		}
		flush()
	}
	flush()

	return words
}

// NormalizeLanguageCode normalizes ISO language code to ISO 639-3 when possible.
func NormalizeLanguageCode(code string) string {
	code = strings.TrimSpace(strings.ToLower(code))
	if code == "" {
		return ""
	}
	code = strings.Split(code, "-")[0]
	code = strings.Split(code, "_")[0]
	if len(code) == 2 {
		if mapped, ok := iso6391To3[code]; ok {
			return mapped
		}
	}
	return code
}
