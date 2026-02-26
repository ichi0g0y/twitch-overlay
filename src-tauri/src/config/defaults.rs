//! All setting definitions with their default values.

use std::collections::HashMap;
use std::sync::LazyLock;

type DefTuple = (&'static str, &'static str, bool, bool, &'static str);

const DEFS_PART1: &[DefTuple] = &include!("defaults/defs_part1.rs");
const DEFS_PART2: &[DefTuple] = &include!("defaults/defs_part2.rs");
const DEFS_PART3: &[DefTuple] = &include!("defaults/defs_part3.rs");
const DEFS_PART4: &[DefTuple] = &include!("defaults/defs_part4.rs");
const DEFS_PART5: &[DefTuple] = &include!("defaults/defs_part5.rs");
const DEF_GROUPS: &[&[DefTuple]] = &[DEFS_PART1, DEFS_PART2, DEFS_PART3, DEFS_PART4, DEFS_PART5];

/// A single setting definition.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct SettingDef {
    pub key: &'static str,
    pub default: &'static str,
    pub secret: bool,
    pub required: bool,
    pub description: &'static str,
}

/// Global setting definitions indexed by key.
pub static DEFAULT_SETTINGS: LazyLock<HashMap<&'static str, SettingDef>> = LazyLock::new(|| {
    DEF_GROUPS
        .iter()
        .flat_map(|defs| defs.iter())
        .map(|&(key, default, secret, required, description)| {
            (
                key,
                SettingDef {
                    key,
                    default,
                    secret,
                    required,
                    description,
                },
            )
        })
        .collect()
});

/// Get the default value for a setting key, or `None` if not defined.
#[allow(dead_code)]
pub fn get_default(key: &str) -> Option<&'static str> {
    DEFAULT_SETTINGS.get(key).map(|d| d.default)
}
