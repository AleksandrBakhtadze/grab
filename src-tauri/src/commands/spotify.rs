//! Spotify links.
//!
//! Spotify audio is DRM-protected and yt-dlp cannot download it. What we *can*
//! do is read the public embed page (`open.spotify.com/embed/<kind>/<id>`),
//! which carries the track list as JSON, and turn every track into a YouTube
//! search (`ytsearch1:<artists> - <title>`) that yt-dlp resolves to the best
//! match. The result is shaped like a normal `MediaInfo` so the rest of the
//! app doesn't care where it came from.

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

use crate::commands::metadata::{MediaInfo, PlaylistEntry};
use crate::errors::FriendlyError;

static RE_SPOTIFY: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^https?://open\.spotify\.com/(?:intl-[a-z-]+/)?(?:embed/)?(track|album|playlist)/([A-Za-z0-9]+)").unwrap()
});

pub fn is_spotify(url: &str) -> bool {
    RE_SPOTIFY.is_match(url.trim())
}

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}
fn f(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

fn largest_image(arr: Option<&Value>) -> Option<String> {
    arr?.as_array()?
        .iter()
        .max_by_key(|i| i.get("maxWidth").and_then(Value::as_u64).unwrap_or(0))
        .and_then(|i| s(i, "url"))
}

fn cover(entity: &Value) -> Option<String> {
    largest_image(entity.pointer("/coverArt/sources"))
        .or_else(|| largest_image(entity.pointer("/visualIdentity/image")))
}

fn artists(entity: &Value) -> Option<String> {
    let names: Vec<String> = entity
        .get("artists")?
        .as_array()?
        .iter()
        .filter_map(|a| s(a, "name"))
        .collect();
    (!names.is_empty()).then(|| names.join(", "))
}

fn search_url(artist: &str, title: &str) -> String {
    let q = if artist.is_empty() { title.to_string() } else { format!("{artist} - {title}") };
    format!("ytsearch1:{}", q.replace(['\n', '\r'], " "))
}

fn ensure_tls() {
    // reqwest is built with `rustls-no-provider`; install ring once (the
    // updater plugin does the same and ignores the "already installed" error).
    let _ = rustls::crypto::ring::default_provider().install_default();
}

pub async fn resolve_spotify(url: &str) -> Result<MediaInfo, FriendlyError> {
    let caps = RE_SPOTIFY.captures(url.trim()).ok_or_else(|| {
        FriendlyError::new(
            "spotify_link",
            "Unsupported Spotify link",
            "Only track, album, and playlist links from open.spotify.com are supported.",
            Some("Use “Share → Copy link” in Spotify and paste that."),
            url,
        )
    })?;
    let kind = caps[1].to_lowercase();
    let id = caps[2].to_string();
    let embed = format!("https://open.spotify.com/embed/{kind}/{id}");

    ensure_tls();
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .map_err(|e| FriendlyError::internal(e.to_string()))?;

    let html = client
        .get(&embed)
        .header("Accept-Language", "en")
        .send()
        .await
        .map_err(|e| {
            FriendlyError::new(
                "network",
                "Couldn't reach Spotify",
                "The Spotify page didn't load.",
                Some("Check your connection or proxy and try again."),
                e.to_string(),
            )
        })?
        .text()
        .await
        .map_err(|e| FriendlyError::internal(e.to_string()))?;

    let start = html
        .find("id=\"__NEXT_DATA__\"")
        .and_then(|i| html[i..].find('>').map(|j| i + j + 1))
        .ok_or_else(|| private_or_missing(&kind, &html))?;
    let end = html[start..]
        .find("</script>")
        .map(|j| start + j)
        .ok_or_else(|| private_or_missing(&kind, &html))?;
    let data: Value = serde_json::from_str(&html[start..end]).map_err(|e| FriendlyError::internal(e.to_string()))?;
    let entity = data
        .pointer("/props/pageProps/state/data/entity")
        .cloned()
        .ok_or_else(|| private_or_missing(&kind, &html))?;

    let name = s(&entity, "name").or_else(|| s(&entity, "title")).unwrap_or_else(|| "Spotify".into());
    let thumb = cover(&entity);

    if kind == "track" {
        let artist = artists(&entity).unwrap_or_default();
        return Ok(MediaInfo {
            kind: "video".into(),
            id: id.clone(),
            title: name.clone(),
            uploader: (!artist.is_empty()).then_some(artist.clone()),
            duration: f(&entity, "duration").map(|ms| ms / 1000.0),
            thumbnail: thumb,
            webpage_url: search_url(&artist, &name),
            extractor: "Spotify".into(),
            is_live: false,
            view_count: None,
            upload_date: None,
            formats: vec![],
            entries: vec![],
            playlist_count: None,
            subtitle_langs: vec![],
            auto_caption_langs: vec![],
        });
    }

    let entries: Vec<PlaylistEntry> = entity
        .get("trackList")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(i, t)| {
                    let title = s(t, "title").or_else(|| s(t, "name"))?;
                    let artist = s(t, "subtitle").or_else(|| artists(t)).unwrap_or_default();
                    Some(PlaylistEntry {
                        id: s(t, "uri").unwrap_or_else(|| format!("{id}-{i}")),
                        title: title.clone(),
                        url: search_url(&artist, &title),
                        duration: f(t, "duration").map(|ms| ms / 1000.0),
                        thumbnail: thumb.clone(),
                        uploader: (!artist.is_empty()).then_some(artist),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    if entries.is_empty() {
        return Err(private_or_missing(&kind, &html));
    }

    let uploader = s(&entity, "subtitle").or_else(|| artists(&entity));
    Ok(MediaInfo {
        kind: "playlist".into(),
        id,
        title: name,
        uploader,
        duration: None,
        thumbnail: thumb,
        webpage_url: url.trim().to_string(),
        extractor: "Spotify".into(),
        is_live: false,
        view_count: None,
        upload_date: None,
        formats: vec![],
        playlist_count: Some(entries.len() as u64),
        entries,
        subtitle_langs: vec![],
        auto_caption_langs: vec![],
    })
}

fn private_or_missing(kind: &str, html: &str) -> FriendlyError {
    FriendlyError::new(
        "spotify_unavailable",
        "Spotify content unavailable",
        &format!("Spotify didn't return a public {kind}. Private playlists, region-locked items, and deleted links can't be read."),
        Some("Make the playlist public in Spotify (… → Make public), or paste the individual track links."),
        html.chars().take(300).collect::<String>(),
    )
}
