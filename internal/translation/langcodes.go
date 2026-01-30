package translation

import "strings"

var iso6393ToLangTag = map[string]string{
	"jpn": "jpn_Jpan",
	"eng": "eng_Latn",
	"cmn": "zho_Hans",
	"zho": "zho_Hans",
	"kor": "kor_Hang",
	"fra": "fra_Latn",
	"deu": "deu_Latn",
	"spa": "spa_Latn",
	"por": "por_Latn",
	"rus": "rus_Cyrl",
	"ita": "ita_Latn",
	"ind": "ind_Latn",
	"tha": "tha_Thai",
	"vie": "vie_Latn",
	"fil": "fil_Latn",
	"ara": "ara_Arab",
	"hin": "hin_Deva",
	"ben": "ben_Beng",
	"nld": "nld_Latn",
	"swe": "swe_Latn",
	"nor": "nor_Latn",
	"dan": "dan_Latn",
	"fin": "fin_Latn",
	"pol": "pol_Latn",
	"tur": "tur_Latn",
	"ukr": "ukr_Cyrl",
	"ell": "ell_Grek",
	"heb": "heb_Hebr",
	"hun": "hun_Latn",
	"ces": "ces_Latn",
	"slk": "slk_Latn",
	"ron": "ron_Latn",
	"som": "som_Latn",
	"bul": "bul_Cyrl",
	"srp": "srp_Cyrl",
	"hrv": "hrv_Latn",
	"slv": "slv_Latn",
	"est": "est_Latn",
	"lav": "lav_Latn",
	"lit": "lit_Latn",
	"fas": "fas_Arab",
	"urd": "urd_Arab",
	"tam": "tam_Taml",
}

func NormalizeToLangTag(code string) string {
	code = strings.TrimSpace(code)
	if code == "" {
		return ""
	}
	if strings.Contains(code, "_") {
		parts := strings.SplitN(code, "_", 2)
		lang := strings.TrimSpace(parts[0])
		if len(lang) == 2 {
			if mapped, ok := iso6393ToLangTag[NormalizeLanguageCode(lang)]; ok {
				return mapped
			}
		}
		return strings.ToLower(lang) + "_" + normalizeScript(parts[1])
	}

	normalized := NormalizeLanguageCode(code)
	if mapped, ok := iso6393ToLangTag[normalized]; ok {
		return mapped
	}
	return ""
}

func NormalizeFromLangTag(code string) string {
	code = strings.TrimSpace(code)
	if code == "" {
		return ""
	}
	parts := strings.SplitN(code, "_", 2)
	return NormalizeLanguageCode(parts[0])
}

func normalizeScript(script string) string {
	script = strings.TrimSpace(script)
	if script == "" {
		return script
	}
	if len(script) == 4 {
		return strings.ToUpper(script[:1]) + strings.ToLower(script[1:])
	}
	return script
}
