//! Dynamic emote cache learned from incoming chat fragments.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::LazyLock;

use serde_json::Value;
use tokio::sync::RwLock;

const DYNAMIC_EMOTE_LIMIT: usize = 4000;

#[derive(Default)]
struct DynamicEmoteCache {
    urls_by_name: HashMap<String, String>,
    key_counts_by_name: HashMap<String, usize>,
    seen_keys: HashSet<String>,
    order: VecDeque<String>,
}

static DYNAMIC_CACHE: LazyLock<RwLock<DynamicEmoteCache>> =
    LazyLock::new(|| RwLock::new(DynamicEmoteCache::default()));

/// Learn emote names and IDs from EventSub chat fragments.
pub async fn learn_from_chat_fragments(fragments: &Value) -> usize {
    let Some(items) = fragments.as_array() else {
        return 0;
    };
    let mut learned = 0usize;
    let mut cache = DYNAMIC_CACHE.write().await;

    for item in items {
        let Some(kind) = item.get("type").and_then(|v| v.as_str()) else {
            continue;
        };
        if kind != "emote" {
            continue;
        }

        let Some(name) = item.get("text").and_then(|v| v.as_str()) else {
            continue;
        };
        let Some(id) = item
            .get("emote")
            .and_then(|e| e.get("id"))
            .and_then(|v| v.as_str())
        else {
            continue;
        };
        if name.is_empty() || id.is_empty() {
            continue;
        }

        let url = emote_url(id);
        let key = format!("{name}\u{1f}{id}");
        if !cache.seen_keys.contains(&key) {
            cache.seen_keys.insert(key.clone());
            cache.order.push_back(key);
            *cache
                .key_counts_by_name
                .entry(name.to_string())
                .or_insert(0) += 1;
            learned += 1;
        }

        cache.urls_by_name.insert(name.to_string(), url);
    }

    trim_cache(&mut cache);
    learned
}

/// Snapshot cached emotes as a name -> URL map.
pub async fn snapshot_name_map() -> HashMap<String, String> {
    DYNAMIC_CACHE.read().await.urls_by_name.clone()
}

fn trim_cache(cache: &mut DynamicEmoteCache) {
    while cache.order.len() > DYNAMIC_EMOTE_LIMIT {
        let Some(oldest_key) = cache.order.pop_front() else {
            break;
        };
        cache.seen_keys.remove(&oldest_key);
        if let Some((name, _id)) = split_key(&oldest_key).map(|(name, id)| (name.to_string(), id)) {
            if let Some(count) = cache.key_counts_by_name.get_mut(&name) {
                if *count > 1 {
                    *count -= 1;
                } else {
                    cache.key_counts_by_name.remove(&name);
                    cache.urls_by_name.remove(&name);
                }
            }
        }
    }
}

fn split_key(key: &str) -> Option<(&str, &str)> {
    let mut parts = key.split('\u{1f}');
    let first = parts.next()?;
    let second = parts.next()?;
    Some((first, second))
}

fn emote_url(id: &str) -> String {
    format!("https://static-cdn.jtvnw.net/emoticons/v2/{id}/static/light/3.0")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    async fn clear_dynamic_cache_for_test() {
        let mut cache = DYNAMIC_CACHE.write().await;
        cache.urls_by_name.clear();
        cache.key_counts_by_name.clear();
        cache.seen_keys.clear();
        cache.order.clear();
    }

    #[tokio::test]
    async fn learns_and_exposes_dynamic_emote_map() {
        clear_dynamic_cache_for_test().await;

        let name = "KappaTestDynamic";
        let id = "999999999";
        let fragments = json!([
            { "type": "text", "text": "hello" },
            { "type": "emote", "text": name, "emote": { "id": id } }
        ]);

        let learned = learn_from_chat_fragments(&fragments).await;
        assert!(learned >= 1);

        let map = snapshot_name_map().await;
        assert_eq!(
            map.get(name),
            Some(&format!(
                "https://static-cdn.jtvnw.net/emoticons/v2/{id}/static/light/3.0"
            ))
        );
    }

    #[test]
    fn trim_cache_keeps_same_name_when_newer_id_remains() {
        let name = "SameName";
        let old_key = format!("{name}\u{1f}old");
        let new_key = format!("{name}\u{1f}new");
        let mut cache = DynamicEmoteCache::default();

        cache.seen_keys.insert(old_key.clone());
        cache.order.push_back(old_key.clone());

        for i in 0..(DYNAMIC_EMOTE_LIMIT - 1) {
            let key = format!("Fill{i}\u{1f}{i}");
            cache.seen_keys.insert(key.clone());
            cache.order.push_back(key);
        }

        cache.seen_keys.insert(new_key.clone());
        cache.order.push_back(new_key.clone());
        cache.key_counts_by_name.insert(name.to_string(), 2);
        cache
            .urls_by_name
            .insert(name.to_string(), emote_url("new"));

        trim_cache(&mut cache);

        assert_eq!(cache.order.len(), DYNAMIC_EMOTE_LIMIT);
        assert!(!cache.seen_keys.contains(&old_key));
        assert!(cache.seen_keys.contains(&new_key));
        assert_eq!(cache.urls_by_name.get(name), Some(&emote_url("new")));
        assert_eq!(cache.key_counts_by_name.get(name), Some(&1));
    }
}
