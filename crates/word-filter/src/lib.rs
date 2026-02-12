//! Inappropriate word filter supporting 20 languages.
//!
//! Languages: AR, DE, EL, EN, ES, FR, ID, IT, JA, KO,
//! NL, PL, PT, RU, SV, TH, TR, UK, VI, ZH

pub mod defaults;
pub mod seed;

pub use seed::{SeedError, seed_default_words};
