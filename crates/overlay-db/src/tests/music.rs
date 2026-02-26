use super::test_db;
use crate::music;

#[test]
fn test_music() {
    let db = test_db();
    let track = music::Track {
        id: "t1".into(),
        file_path: "/music/song.mp3".into(),
        title: Some("Song".into()),
        artist: Some("Artist".into()),
        album: None,
        duration: Some(180.0),
        added_at: None,
    };
    db.add_track(&track).unwrap();

    let tracks = db.get_all_tracks().unwrap();
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].title, Some("Song".into()));

    db.create_playlist("p1", "My Playlist", "desc").unwrap();
    db.add_track_to_playlist("p1", "t1", 0).unwrap();

    let pt = db.get_playlist_tracks("p1").unwrap();
    assert_eq!(pt.len(), 1);
    assert_eq!(pt[0].track_id, "t1");

    let full_tracks = db.get_playlist_tracks_full("p1").unwrap();
    assert_eq!(full_tracks.len(), 1);
    assert_eq!(full_tracks[0].id, "t1");
    assert_eq!(full_tracks[0].title, Some("Song".into()));

    db.delete_track("t1").unwrap();
    assert!(db.get_all_tracks().unwrap().is_empty());
}
