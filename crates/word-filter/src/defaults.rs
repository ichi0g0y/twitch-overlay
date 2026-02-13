//! Embedded default word lists for 20 languages.

/// A single language's embedded word lists.
pub struct EmbeddedWordList {
    pub language: &'static str,
    pub bad_words: &'static str,
    pub good_words: &'static str,
}

/// All embedded word lists (20 languages).
pub const WORD_LISTS: &[EmbeddedWordList] = &[
    EmbeddedWordList {
        language: "ar",
        bad_words: include_str!("../defaults/ar/BadList.txt"),
        good_words: include_str!("../defaults/ar/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "de",
        bad_words: include_str!("../defaults/de/BadList.txt"),
        good_words: include_str!("../defaults/de/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "el",
        bad_words: include_str!("../defaults/el/BadList.txt"),
        good_words: include_str!("../defaults/el/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "en",
        bad_words: include_str!("../defaults/en/BadList.txt"),
        good_words: include_str!("../defaults/en/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "es",
        bad_words: include_str!("../defaults/es/BadList.txt"),
        good_words: include_str!("../defaults/es/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "fr",
        bad_words: include_str!("../defaults/fr/BadList.txt"),
        good_words: include_str!("../defaults/fr/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "id",
        bad_words: include_str!("../defaults/id/BadList.txt"),
        good_words: include_str!("../defaults/id/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "it",
        bad_words: include_str!("../defaults/it/BadList.txt"),
        good_words: include_str!("../defaults/it/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "ja",
        bad_words: include_str!("../defaults/ja/BadList.txt"),
        good_words: include_str!("../defaults/ja/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "ko",
        bad_words: include_str!("../defaults/ko/BadList.txt"),
        good_words: include_str!("../defaults/ko/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "nl",
        bad_words: include_str!("../defaults/nl/BadList.txt"),
        good_words: include_str!("../defaults/nl/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "pl",
        bad_words: include_str!("../defaults/pl/BadList.txt"),
        good_words: include_str!("../defaults/pl/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "pt",
        bad_words: include_str!("../defaults/pt/BadList.txt"),
        good_words: include_str!("../defaults/pt/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "ru",
        bad_words: include_str!("../defaults/ru/BadList.txt"),
        good_words: include_str!("../defaults/ru/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "sv",
        bad_words: include_str!("../defaults/sv/BadList.txt"),
        good_words: include_str!("../defaults/sv/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "th",
        bad_words: include_str!("../defaults/th/BadList.txt"),
        good_words: include_str!("../defaults/th/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "tr",
        bad_words: include_str!("../defaults/tr/BadList.txt"),
        good_words: include_str!("../defaults/tr/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "uk",
        bad_words: include_str!("../defaults/uk/BadList.txt"),
        good_words: include_str!("../defaults/uk/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "vi",
        bad_words: include_str!("../defaults/vi/BadList.txt"),
        good_words: include_str!("../defaults/vi/GoodList.txt"),
    },
    EmbeddedWordList {
        language: "zh",
        bad_words: include_str!("../defaults/zh/BadList.txt"),
        good_words: include_str!("../defaults/zh/GoodList.txt"),
    },
];
