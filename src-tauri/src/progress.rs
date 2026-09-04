//! Parsing of yt-dlp's line-oriented output.
//!
//! We hand yt-dlp `--progress-template` strings that make it print one JSON
//! object per progress tick, prefixed with a sentinel so we can pick them out
//! of the stream cheaply. yt-dlp's `j` conversion JSON-encodes whatever value
//! it has, so a missing field arrives as the *string* `"NA"` (or `"null"`
//! where we give a `|null` default) rather than a JSON null. Every field is
//! therefore read leniently: numbers must be numbers, strings must not be
//! one of those placeholders.
//!
//! Note: because `--print` implies `--quiet`, yt-dlp routes its "screen"
//! output (progress included) to **stderr**. The reader therefore feeds both
//! streams through `parse_line` without caring which one a line came from.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DL_PREFIX: &str = "GRAB_DL:";
pub const PP_PREFIX: &str = "GRAB_PP:";
pub const FILE_PREFIX: &str = "GRAB_FILE:";

/// `--progress-template download:...`
pub fn download_template() -> String {
    format!(
        concat!(
            "download:{}{{",
            "\"status\":%(progress.status)j,",
            "\"downloaded\":%(progress.downloaded_bytes|null)j,",
            "\"total\":%(progress.total_bytes|null)j,",
            "\"totalEstimate\":%(progress.total_bytes_estimate|null)j,",
            "\"speed\":%(progress.speed|null)j,",
            "\"eta\":%(progress.eta|null)j,",
            "\"elapsed\":%(progress.elapsed|null)j,",
            "\"filename\":%(progress.filename|null)j,",
            "\"fragIndex\":%(progress.fragment_index|null)j,",
            "\"fragCount\":%(progress.fragment_count|null)j",
            "}}"
        ),
        DL_PREFIX
    )
}

/// `--progress-template postprocess:...`
pub fn postprocess_template() -> String {
    format!(
        "postprocess:{}{{\"status\":%(progress.status)j,\"postprocessor\":%(progress.postprocessor)j}}",
        PP_PREFIX
    )
}

/// `--print after_move:...` — the only reliable way to learn the final path
/// after merging / audio extraction / embedding have all run.
pub fn file_print_template() -> String {
    format!("after_move:{}%(filepath)j", FILE_PREFIX)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub status: String,
    pub downloaded: Option<u64>,
    pub total: Option<u64>,
    /// 0.0 – 100.0, computed here so the frontend never divides by zero.
    pub percent: Option<f64>,
    /// Bytes per second.
    pub speed: Option<f64>,
    /// Seconds remaining.
    pub eta: Option<u64>,
    pub elapsed: Option<f64>,
    pub filename: Option<String>,
    pub frag_index: Option<u64>,
    pub frag_count: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ParsedLine {
    Progress(Progress),
    Postprocess { status: String, postprocessor: String },
    FinalPath(String),
    AlreadyDownloaded(String),
    Destination(String),
    Error(String),
    Other(String),
}

static RE_ALREADY: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\[download\]\s+(.+?)\s+has already been downloaded").unwrap());
static RE_DESTINATION: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"^\[(?:download|ExtractAudio|VideoConvertor)\]\s+Destination:\s+(.+)$"#).unwrap());
static RE_MERGER: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"^\[Merger\]\s+Merging formats into "(.+)"$"#).unwrap());

fn lenient_u64(v: Option<&Value>) -> Option<u64> {
    match v? {
        Value::Number(n) => n.as_u64().or_else(|| n.as_f64().map(|f| f.max(0.0) as u64)),
        _ => None,
    }
}

fn lenient_f64(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64(),
        _ => None,
    }
}

fn lenient_str(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) if s != "NA" && s != "null" && !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

pub fn parse_line(raw: &str) -> ParsedLine {
    let line = raw.trim_end_matches(['\r', '\n']);

    if let Some(json) = line.strip_prefix(DL_PREFIX) {
        if let Ok(v) = serde_json::from_str::<Value>(json) {
            let downloaded = lenient_u64(v.get("downloaded"));
            let total = lenient_u64(v.get("total")).or_else(|| lenient_u64(v.get("totalEstimate")));
            let percent = match (downloaded, total) {
                (Some(d), Some(t)) if t > 0 => Some(((d as f64 / t as f64) * 100.0).clamp(0.0, 100.0)),
                _ => None,
            };
            let status = lenient_str(v.get("status")).unwrap_or_else(|| "downloading".into());
            let percent = if status == "finished" { Some(100.0) } else { percent };
            return ParsedLine::Progress(Progress {
                status,
                downloaded,
                total,
                percent,
                speed: lenient_f64(v.get("speed")),
                eta: lenient_u64(v.get("eta")),
                elapsed: lenient_f64(v.get("elapsed")),
                filename: lenient_str(v.get("filename")),
                frag_index: lenient_u64(v.get("fragIndex")),
                frag_count: lenient_u64(v.get("fragCount")),
            });
        }
        return ParsedLine::Other(line.to_string());
    }

    if let Some(json) = line.strip_prefix(PP_PREFIX) {
        if let Ok(v) = serde_json::from_str::<Value>(json) {
            return ParsedLine::Postprocess {
                status: lenient_str(v.get("status")).unwrap_or_else(|| "started".into()),
                postprocessor: lenient_str(v.get("postprocessor")).unwrap_or_default(),
            };
        }
        return ParsedLine::Other(line.to_string());
    }

    if let Some(json) = line.strip_prefix(FILE_PREFIX) {
        if let Ok(p) = serde_json::from_str::<String>(json) {
            return ParsedLine::FinalPath(p);
        }
        return ParsedLine::FinalPath(json.trim_matches('"').to_string());
    }

    if let Some(c) = RE_ALREADY.captures(line) {
        return ParsedLine::AlreadyDownloaded(c[1].to_string());
    }
    if let Some(c) = RE_MERGER.captures(line) {
        return ParsedLine::Destination(c[1].to_string());
    }
    if let Some(c) = RE_DESTINATION.captures(line) {
        return ParsedLine::Destination(c[1].to_string());
    }
    if line.starts_with("ERROR") {
        return ParsedLine::Error(line.to_string());
    }
    ParsedLine::Other(line.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_progress_with_na() {
        let l = r#"GRAB_DL:{"status":"downloading","downloaded":512,"total":"NA","totalEstimate":1024,"speed":100.5,"eta":5,"elapsed":1.2,"filename":"a.mp4.part","fragIndex":"NA","fragCount":"NA"}"#;
        match parse_line(l) {
            ParsedLine::Progress(p) => {
                assert_eq!(p.downloaded, Some(512));
                assert_eq!(p.total, Some(1024));
                assert_eq!(p.percent, Some(50.0));
                assert_eq!(p.speed, Some(100.5));
                assert_eq!(p.frag_index, None);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn placeholder_strings_are_none() {
        let l = r#"GRAB_DL:{"status":"downloading","downloaded":10,"total":"null","totalEstimate":"NA","speed":"null","eta":"NA","elapsed":0.1,"filename":"null","fragIndex":"null","fragCount":"null"}"#;
        match parse_line(l) {
            ParsedLine::Progress(p) => {
                assert_eq!(p.total, None);
                assert_eq!(p.speed, None);
                assert_eq!(p.filename, None);
                assert_eq!(p.frag_index, None);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn parses_progress_with_nulls() {
        let l = r#"GRAB_DL:{"status":"downloading","downloaded":10,"total":null,"totalEstimate":null,"speed":null,"eta":null,"elapsed":0.1,"filename":"a.mp4","fragIndex":3,"fragCount":10}"#;
        match parse_line(l) {
            ParsedLine::Progress(p) => {
                assert_eq!(p.total, None);
                assert_eq!(p.percent, None);
                assert_eq!(p.speed, None);
                assert_eq!(p.frag_index, Some(3));
                assert_eq!(p.frag_count, Some(10));
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn template_is_well_formed() {
        let t = download_template();
        assert!(t.starts_with("download:GRAB_DL:{"));
        assert!(t.ends_with('}'));
        assert!(t.contains("%(progress.speed|null)j"));
    }

    #[test]
    fn parses_final_path_with_windows_escapes() {
        let l = r#"GRAB_FILE:"C:\\Users\\me\\Downloads\\clip.mp4""#;
        assert_eq!(
            parse_line(l),
            ParsedLine::FinalPath(r"C:\Users\me\Downloads\clip.mp4".into())
        );
    }

    #[test]
    fn parses_already_downloaded() {
        let l = "[download] /tmp/x.mp4 has already been downloaded";
        assert_eq!(parse_line(l), ParsedLine::AlreadyDownloaded("/tmp/x.mp4".into()));
    }
}
