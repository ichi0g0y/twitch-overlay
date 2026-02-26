use super::test_db;

#[test]
fn test_word_filter() {
    let db = test_db();
    let w = db.add_word_filter_word("en", "badword", "bad").unwrap();
    assert_eq!(w.word, "badword");

    let words = db.get_word_filter_words("en").unwrap();
    assert_eq!(words.len(), 1);

    let langs = db.get_word_filter_languages().unwrap();
    assert_eq!(langs, vec!["en"]);

    db.set_word_filter_seed_version("v2").unwrap();
    assert_eq!(
        db.get_word_filter_seed_version().unwrap(),
        Some("v2".into())
    );

    db.delete_word_filter_word(w.id).unwrap();
    assert!(db.get_word_filter_words("en").unwrap().is_empty());
}
