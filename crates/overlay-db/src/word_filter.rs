//! Word filter word storage (20 languages).

use crate::{Database, DbError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordFilterWord {
    pub id: i64,
    pub language: String,
    pub word: String,
    #[serde(rename = "type")]
    pub word_type: String,
}

impl Database {
    pub fn get_word_filter_words(&self, language: &str) -> Result<Vec<WordFilterWord>, DbError> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, language, word, type FROM word_filter_words WHERE language = ?1 ORDER BY word",
            )?;
            let rows = stmt.query_map([language], |row| {
                Ok(WordFilterWord {
                    id: row.get(0)?,
                    language: row.get(1)?,
                    word: row.get(2)?,
                    word_type: row.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn add_word_filter_word(
        &self,
        language: &str,
        word: &str,
        word_type: &str,
    ) -> Result<WordFilterWord, DbError> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO word_filter_words (language, word, type) VALUES (?1, ?2, ?3)",
                rusqlite::params![language, word, word_type],
            )?;
            let id = conn.last_insert_rowid();
            Ok(WordFilterWord {
                id,
                language: language.to_string(),
                word: word.to_string(),
                word_type: word_type.to_string(),
            })
        })
    }

    pub fn delete_word_filter_word(&self, id: i64) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM word_filter_words WHERE id = ?1", [id])?;
            Ok(())
        })
    }

    pub fn bulk_insert_word_filter_words(&self, words: &[WordFilterWord]) -> Result<(), DbError> {
        self.with_conn_mut(|conn| {
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare(
                    "INSERT OR IGNORE INTO word_filter_words (language, word, type) VALUES (?1, ?2, ?3)",
                )?;
                for w in words {
                    stmt.execute(rusqlite::params![w.language, w.word, w.word_type])?;
                }
            }
            tx.commit()?;
            Ok(())
        })
    }

    pub fn clear_all_word_filter_words(&self) -> Result<(), DbError> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM word_filter_words", [])?;
            Ok(())
        })
    }

    pub fn get_word_filter_languages(&self) -> Result<Vec<String>, DbError> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT DISTINCT language FROM word_filter_words ORDER BY language")?;
            let langs = stmt
                .query_map([], |row| row.get(0))?
                .collect::<Result<Vec<String>, _>>()?;
            Ok(langs)
        })
    }

    pub fn get_word_filter_seed_version(&self) -> Result<Option<String>, DbError> {
        self.get_setting("word_filter_seed_version")
    }

    pub fn set_word_filter_seed_version(&self, version: &str) -> Result<(), DbError> {
        self.set_setting("word_filter_seed_version", version, "system")
    }
}
