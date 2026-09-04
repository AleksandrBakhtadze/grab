//! Maps yt-dlp's stderr into something a person can act on.
//!
//! yt-dlp prints one or more `ERROR: ...` lines on failure. The wording is
//! reasonably stable across extractors, so a small ordered table of
//! substring / regex matches covers the vast majority of real-world failures.
//! The *first* matching rule wins, so more specific rules come first.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendlyError {
    /// Stable machine-readable code the UI can branch on.
    pub code: String,
    /// Short headline, e.g. "This video is private".
    pub title: String,
    /// One or two sentences explaining what happened.
    pub message: String,
    /// Concrete next step. Optional because some errors have no fix.
    pub suggestion: Option<String>,
    /// The raw yt-dlp lines that triggered the mapping, for the details panel.
    pub raw: String,
}

impl FriendlyError {
    pub fn new(
        code: &str,
        title: &str,
        message: &str,
        suggestion: Option<&str>,
        raw: impl Into<String>,
    ) -> Self {
        Self {
            code: code.to_string(),
            title: title.to_string(),
            message: message.to_string(),
            suggestion: suggestion.map(str::to_string),
            raw: raw.into(),
        }
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        let msg = msg.into();
        Self::new(
            "internal",
            "Something went wrong inside Grab",
            &msg,
            Some("Try again. If it keeps happening, copy the details below and file an issue."),
            msg.clone(),
        )
    }
}

impl std::fmt::Display for FriendlyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.title, self.message)
    }
}

impl std::error::Error for FriendlyError {}

impl From<tauri_plugin_shell::Error> for FriendlyError {
    fn from(e: tauri_plugin_shell::Error) -> Self {
        FriendlyError::new(
            "sidecar",
            "Couldn't start yt-dlp",
            "The bundled yt-dlp binary could not be launched.",
            Some("Reinstall Grab, or check that antivirus software hasn't quarantined yt-dlp."),
            e.to_string(),
        )
    }
}

impl From<std::io::Error> for FriendlyError {
    fn from(e: std::io::Error) -> Self {
        FriendlyError::internal(e.to_string())
    }
}

struct Rule {
    pattern: Regex,
    code: &'static str,
    title: &'static str,
    message: &'static str,
    suggestion: Option<&'static str>,
}

macro_rules! rule {
    ($re:expr, $code:expr, $title:expr, $msg:expr, $fix:expr) => {
        Rule {
            pattern: Regex::new($re).expect("static regex"),
            code: $code,
            title: $title,
            message: $msg,
            suggestion: $fix,
        }
    };
}

static RULES: Lazy<Vec<Rule>> = Lazy::new(|| {
    vec![
        rule!(
            r"(?i)private video|this video is private|is private",
            "private",
            "This video is private",
            "The owner has restricted who can view it, so yt-dlp can't fetch it anonymously.",
            Some("If your account has access, enable “Use cookies from browser” in Settings and try again.")
        ),
        rule!(
            r"(?i)members[- ]only|join this channel|premium|subscribers only|paywall|requires a subscription",
            "membership",
            "Members-only or paid content",
            "This item is behind a membership, subscription, or paywall.",
            Some("If your account is subscribed, enable “Use cookies from browser” in Settings.")
        ),
        rule!(
            r"(?i)confirm you.?re not a bot|sign in to confirm|not a bot",
            "bot_check",
            "The site asked for a sign-in check",
            "The platform is challenging anonymous requests from this network.",
            Some("Enable “Use cookies from browser” in Settings so the request carries your logged-in session, or try again later.")
        ),
        rule!(
            r"(?i)age[- ]restricted|confirm your age|age gate|inappropriate for some users|age verification",
            "age_gate",
            "Age-restricted content",
            "The platform requires a signed-in adult account to view this.",
            Some("Enable “Use cookies from browser” in Settings with a browser where you're logged in.")
        ),
        rule!(
            r"(?i)login[_ ]required|log in|logged[- ]in|requires authentication|authentication required|please sign in|sign in to",
            "login_required",
            "Sign-in required",
            "The platform only serves this content to logged-in users.",
            Some("Enable “Use cookies from browser” in Settings and pick the browser where you're signed in.")
        ),
        rule!(
            r"(?i)not available in your country|blocked it in your country|geo[- ]?restrict|not made this video available in your country|unavailable in your (region|location)",
            "region_blocked",
            "Not available in your region",
            "The uploader or platform has blocked this content for your location.",
            Some("Set a proxy in Settings (for example a VPN endpoint in a permitted region).")
        ),
        rule!(
            r"(?i)http error 429|too many requests|rate[- ]limit",
            "rate_limited",
            "Rate limited by the platform",
            "The platform is throttling requests from your address.",
            Some("Wait a few minutes, lower concurrency in Settings, or set a rate limit before retrying.")
        ),
        rule!(
            r"(?i)http error 404|not found|does not exist|no longer available|video unavailable|has been removed|content isn.?t available|this content isn.?t available|page not found|is not available",
            "not_found",
            "Content not found",
            "The link doesn't resolve to media any more. It may have been deleted, moved, or never existed.",
            Some("Double-check the URL in your browser. If it plays there, update yt-dlp from Settings.")
        ),
        rule!(
            r"(?i)copyright|terminated|account associated with this video has been",
            "removed",
            "Content removed",
            "This item was taken down (copyright claim or a terminated account).",
            None
        ),
        rule!(
            r"(?i)live event will begin|premieres in|is not yet available|upcoming",
            "not_started",
            "Live stream hasn't started",
            "This is a scheduled premiere or live event that hasn't begun.",
            Some("Try again once it's live, or after it ends for the full recording.")
        ),
        rule!(
            r"(?i)unsupported url|no suitable extractor|is not a valid url|unsupported site",
            "unsupported",
            "Unsupported link",
            "yt-dlp doesn't know how to extract media from this URL.",
            Some("Make sure the link points directly to a video or post, and update yt-dlp from Settings.")
        ),
        rule!(
            r"(?i)requested format is not available|format .* not available|no video formats found",
            "format_unavailable",
            "Requested quality not available",
            "The platform doesn't offer a stream matching the format you picked.",
            Some("Choose “Best available” or a lower resolution and retry.")
        ),
        rule!(
            r"(?i)ffmpeg (not found|is not installed)|ffprobe .*not found|postprocessing: .*ffmpeg",
            "ffmpeg_missing",
            "ffmpeg is missing or broken",
            "Grab couldn't run the bundled ffmpeg, which is needed to merge and convert streams.",
            Some("Reinstall Grab. If you're running from source, place the ffmpeg sidecar in src-tauri/binaries.")
        ),
        rule!(
            r"(?i)no space left|disk full|not enough space|errno 28",
            "disk_full",
            "Out of disk space",
            "The destination drive is full.",
            Some("Free up space or choose a different output folder in Settings.")
        ),
        rule!(
            r"(?i)permission denied|errno 13|access is denied|read-only file system",
            "permission_denied",
            "Can't write to the output folder",
            "Grab doesn't have permission to write there.",
            Some("Pick a folder you own in Settings, such as your Downloads folder.")
        ),
        rule!(
            r"(?i)unable to download webpage|getaddrinfo failed|name or service not known|nodename nor servname|connection reset|timed out|timeout|network is unreachable|connection refused|temporary failure in name resolution|ssl|certificate verify failed|remote end closed|urlopen error|incomplete read",
            "network",
            "Network problem",
            "Grab couldn't reach the platform.",
            Some("Check your internet connection, VPN, or proxy settings and retry.")
        ),
        rule!(
            r"(?i)http error 403|forbidden",
            "forbidden",
            "Access denied by the platform",
            "The platform refused the request (HTTP 403).",
            Some("Update yt-dlp from Settings — extractor changes are the usual cause. Cookies can also help.")
        ),
        rule!(
            r"(?i)unable to extract|failed to parse|unable to download api page|unable to download json metadata|cannot parse data|extractor.*failed",
            "extractor_broken",
            "yt-dlp can't parse this site right now",
            "The platform changed something and the extractor needs an update.",
            Some("Open Settings → yt-dlp → Update. Extractors are patched within days of a breakage.")
        ),
    ]
});

/// Pull the most useful lines from a yt-dlp run's stderr/stdout and map them.
pub fn map_ytdlp_error(lines: &[String], exit_code: Option<i32>) -> FriendlyError {
    let interesting: Vec<&String> = lines
        .iter()
        .filter(|l| {
            let t = l.trim();
            t.starts_with("ERROR") || t.contains("Error") || t.contains("error")
        })
        .collect();

    let haystack: String = if interesting.is_empty() {
        lines
            .iter()
            .rev()
            .take(12)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        interesting
            .iter()
            .map(|s| s.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    };

    for r in RULES.iter() {
        if r.pattern.is_match(&haystack) {
            return FriendlyError::new(r.code, r.title, r.message, r.suggestion, haystack);
        }
    }

    let headline = interesting
        .first()
        .map(|l| l.trim().trim_start_matches("ERROR:").trim().to_string())
        .unwrap_or_else(|| {
            format!(
                "yt-dlp exited with code {}",
                exit_code.map(|c| c.to_string()).unwrap_or_else(|| "?".into())
            )
        });

    FriendlyError::new(
        "unknown",
        "Download failed",
        &headline,
        Some("Retry once. If it fails again, update yt-dlp from Settings and check the raw log."),
        haystack,
    )
}
