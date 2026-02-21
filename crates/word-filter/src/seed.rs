//! Database seeding for default word lists with version tracking.

use overlay_db::Database;
use overlay_db::word_filter::WordFilterWord;

use crate::defaults::WORD_LISTS;

/// Current seed version. Bump to trigger a full reseed on next startup.
const SEED_VERSION: &str = "v2";

/// Seed the database with default word lists from embedded files.
/// If the seed version matches, no action is taken.
pub fn seed_default_words(db: &Database) -> Result<(), SeedError> {
    let current = db.get_word_filter_seed_version().map_err(SeedError::Db)?;

    if current.as_deref() == Some(SEED_VERSION) {
        return Ok(());
    }

    if current.is_some() {
        tracing::info!(
            old = current.as_deref().unwrap_or(""),
            new = SEED_VERSION,
            "Word filter defaults updated, reseeding"
        );
        db.clear_all_word_filter_words().map_err(SeedError::Db)?;
    } else {
        tracing::info!("Seeding default word filter lists");
    }

    let words = load_embedded_words();
    if !words.is_empty() {
        db.bulk_insert_word_filter_words(&words)
            .map_err(SeedError::Db)?;
        tracing::info!(count = words.len(), "Seeded word filter");
    }

    db.set_word_filter_seed_version(SEED_VERSION)
        .map_err(SeedError::Db)?;

    Ok(())
}

fn load_embedded_words() -> Vec<WordFilterWord> {
    let mut words = Vec::new();

    for list in WORD_LISTS {
        parse_lines(list.bad_words, list.language, "bad", &mut words);
        parse_lines(list.good_words, list.language, "good", &mut words);
    }

    words
}

fn parse_lines(content: &str, language: &str, word_type: &str, out: &mut Vec<WordFilterWord>) {
    for line in content.lines() {
        let w = line.trim();
        if w.is_empty() {
            continue;
        }
        out.push(WordFilterWord {
            id: 0,
            language: language.to_string(),
            word: w.to_string(),
            word_type: word_type.to_string(),
        });
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SeedError {
    #[error("Database error: {0}")]
    Db(overlay_db::DbError),
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn test_seed_fresh_db() {
        let db = Database::open_in_memory().expect("failed to open in-memory db");

        seed_default_words(&db).expect("failed to seed words");

        assert_eq!(
            db.get_word_filter_seed_version()
                .expect("failed to read seed version"),
            Some(SEED_VERSION.to_string())
        );
        assert_eq!(
            db.get_word_filter_languages()
                .expect("failed to read languages")
                .len(),
            20
        );
        assert!(
            !db.get_word_filter_words("en")
                .expect("failed to read english words")
                .is_empty()
        );
    }

    #[test]
    fn test_seed_idempotent() {
        let db = Database::open_in_memory().expect("failed to open in-memory db");
        seed_default_words(&db).expect("failed to seed words");

        db.add_word_filter_word("en", "smoke-custom-word", "bad")
            .expect("failed to add custom word");
        let before = total_word_count(&db);

        seed_default_words(&db).expect("failed to re-seed words");
        let after = total_word_count(&db);

        assert_eq!(before, after);
        assert!(
            db.get_word_filter_words("en")
                .expect("failed to read english words")
                .iter()
                .any(|w| w.word == "smoke-custom-word")
        );
    }

    #[test]
    fn test_seed_version_upgrade() {
        let db = Database::open_in_memory().expect("failed to open in-memory db");
        seed_default_words(&db).expect("failed to seed words");

        db.add_word_filter_word("en", "upgrade-custom-word", "bad")
            .expect("failed to add custom word");
        db.set_word_filter_seed_version("v1")
            .expect("failed to set old seed version");

        seed_default_words(&db).expect("failed to apply upgraded seed");

        assert_eq!(
            db.get_word_filter_seed_version()
                .expect("failed to read seed version"),
            Some(SEED_VERSION.to_string())
        );
        assert!(
            !db.get_word_filter_words("en")
                .expect("failed to read english words")
                .iter()
                .any(|w| w.word == "upgrade-custom-word")
        );
    }

    #[test]
    fn test_parse_lines_basic() {
        let mut out = Vec::new();
        parse_lines(" alpha\n\nbeta \n   \n gamma\t", "en", "bad", &mut out);

        assert_eq!(out.len(), 3);
        assert_eq!(out[0].word, "alpha");
        assert_eq!(out[1].word, "beta");
        assert_eq!(out[2].word, "gamma");
        assert!(out.iter().all(|w| w.language == "en"));
        assert!(out.iter().all(|w| w.word_type == "bad"));
    }

    #[test]
    fn test_parse_lines_empty() {
        let mut out = Vec::new();
        parse_lines("", "en", "bad", &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn test_load_embedded_words_nonempty() {
        let words = load_embedded_words();
        assert!(!words.is_empty());
    }

    #[test]
    fn test_load_embedded_words_all_languages() {
        let words = load_embedded_words();
        let languages: HashSet<String> = words.iter().map(|word| word.language.clone()).collect();

        assert_eq!(languages.len(), 20);
    }

    fn total_word_count(db: &Database) -> usize {
        WORD_LISTS
            .iter()
            .map(|list| {
                db.get_word_filter_words(list.language)
                    .expect("failed to read words")
                    .len()
            })
            .sum()
    }
}
