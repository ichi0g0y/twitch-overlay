//! In-memory log buffer backed by tracing subscriber events.

use std::collections::VecDeque;
use std::sync::{LazyLock, Mutex};

use serde::Serialize;
use serde_json::{Map, Value};
use tokio::sync::broadcast;
use tracing::field::{Field, Visit};
use tracing::{Event, Subscriber};
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;

const MAX_LOG_ENTRIES: usize = 1000;
const STREAM_CHANNEL_CAPACITY: usize = 512;

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub fields: Map<String, Value>,
}

struct LogState {
    entries: VecDeque<LogEntry>,
    tx: broadcast::Sender<LogEntry>,
}

static LOG_STATE: LazyLock<Mutex<LogState>> = LazyLock::new(|| {
    let (tx, _) = broadcast::channel(STREAM_CHANNEL_CAPACITY);
    Mutex::new(LogState {
        entries: VecDeque::with_capacity(MAX_LOG_ENTRIES),
        tx,
    })
});

pub fn recent(limit: usize) -> Vec<LogEntry> {
    let safe_limit = limit.clamp(1, MAX_LOG_ENTRIES);
    let Ok(state) = LOG_STATE.lock() else {
        return Vec::new();
    };

    let mut logs = state
        .entries
        .iter()
        .rev()
        .take(safe_limit)
        .cloned()
        .collect::<Vec<_>>();
    logs.reverse();
    logs
}

pub fn all() -> Vec<LogEntry> {
    let Ok(state) = LOG_STATE.lock() else {
        return Vec::new();
    };
    state.entries.iter().cloned().collect()
}

pub fn clear() -> usize {
    let Ok(mut state) = LOG_STATE.lock() else {
        return 0;
    };
    let cleared = state.entries.len();
    state.entries.clear();
    cleared
}

pub fn subscribe() -> broadcast::Receiver<LogEntry> {
    if let Ok(state) = LOG_STATE.lock() {
        state.tx.subscribe()
    } else {
        let (tx, rx) = broadcast::channel(1);
        drop(tx);
        rx
    }
}

fn push(entry: LogEntry) {
    let Ok(mut state) = LOG_STATE.lock() else {
        return;
    };

    if state.entries.len() >= MAX_LOG_ENTRIES {
        state.entries.pop_front();
    }
    state.entries.push_back(entry.clone());
    let _ = state.tx.send(entry);
}

#[derive(Default)]
pub struct LogCaptureLayer;

impl LogCaptureLayer {
    pub fn new() -> Self {
        Self
    }
}

impl<S> Layer<S> for LogCaptureLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let mut visitor = JsonVisitor::default();
        event.record(&mut visitor);

        let meta = event.metadata();
        let message = visitor.message.unwrap_or_else(|| meta.name().to_string());

        push(LogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: meta.level().to_string().to_lowercase(),
            target: meta.target().to_string(),
            message,
            fields: visitor.fields,
        });
    }
}

#[derive(Default)]
struct JsonVisitor {
    message: Option<String>,
    fields: Map<String, Value>,
}

impl JsonVisitor {
    fn record_field_value(&mut self, field: &Field, value: Value) {
        if field.name() == "message" {
            self.message = value
                .as_str()
                .map(ToString::to_string)
                .or_else(|| Some(value.to_string()));
            return;
        }
        self.fields.insert(field.name().to_string(), value);
    }
}

impl Visit for JsonVisitor {
    fn record_i64(&mut self, field: &Field, value: i64) {
        self.record_field_value(field, Value::from(value));
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.record_field_value(field, Value::from(value));
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.record_field_value(field, Value::from(value));
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        self.record_field_value(field, Value::from(value));
    }

    fn record_f64(&mut self, field: &Field, value: f64) {
        self.record_field_value(field, Value::from(value));
    }

    fn record_error(&mut self, field: &Field, value: &(dyn std::error::Error + 'static)) {
        self.record_field_value(field, Value::from(value.to_string()));
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.record_field_value(field, Value::from(format!("{value:?}")));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{LazyLock, Mutex};

    static TEST_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

    #[test]
    fn clear_returns_removed_count() {
        let _guard = TEST_LOCK.lock().expect("lock");
        push(LogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            target: "test".to_string(),
            message: "a".to_string(),
            fields: Map::new(),
        });
        push(LogEntry {
            timestamp: chrono::Utc::now().to_rfc3339(),
            level: "info".to_string(),
            target: "test".to_string(),
            message: "b".to_string(),
            fields: Map::new(),
        });

        let removed = clear();
        assert!(removed >= 2);
    }

    #[test]
    fn recent_applies_limit() {
        let _guard = TEST_LOCK.lock().expect("lock");
        clear();
        for idx in 0..5 {
            push(LogEntry {
                timestamp: chrono::Utc::now().to_rfc3339(),
                level: "info".to_string(),
                target: "test".to_string(),
                message: format!("m{idx}"),
                fields: Map::new(),
            });
        }

        let logs = recent(3);
        assert_eq!(logs.len(), 3);
        assert_eq!(logs[0].message, "m2");
        assert_eq!(logs[2].message, "m4");
    }
}
