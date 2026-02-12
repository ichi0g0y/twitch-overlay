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
