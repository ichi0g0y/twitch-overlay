use super::test_db;

#[test]
fn test_cache() {
    let db = test_db();
    db.add_cache_entry(
        "hash1",
        "https://example.com/img.png",
        "/cache/hash1.png",
        1024,
    )
    .unwrap();

    let entry = db.get_cache_entry("hash1").unwrap().unwrap();
    assert_eq!(entry.original_url, "https://example.com/img.png");
    assert_eq!(entry.file_size, 1024);

    let stats = db.get_cache_stats().unwrap();
    assert_eq!(stats.total_files, 1);
    assert_eq!(stats.total_size_bytes, 1024);

    db.delete_cache_entry("hash1").unwrap();
    assert!(db.get_cache_entry("hash1").unwrap().is_none());
}
