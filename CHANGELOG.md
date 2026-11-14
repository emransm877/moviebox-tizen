# Changelog

## 0.8.2 — 2026-11-14

- Move the volume slider out of the main row. Explicitly activate the speaker icon to adjust volume; normal arrow navigation skips past the icon. OK/Enter or Back/Escape closes the popup and returns focus. Mute remains inside the popup.
- Size every dropdown popup to its actual option text instead of inheriting wide fields. Unify text padding and remove extra native/TV container spacing.

## 0.8.1 — 2026-11-14

- Restrict the episode Up shortcut to hidden player controls; visible controls and open menus keep normal navigation.
- Compact the season selectors and TV option popup. Align the desktop More menu labels and pad the subtitle timing value.

## 0.8.0 — 2026-11-14

- Put the timeline above one inline control row using the upstream Stremio SVG icons with bundled MIT attribution.
- Keep quality, subtitle and audio choices in accessible icon selectors; keep timing and downloads in More on Windows.
- One Up-arrow press opens the episode panel from the right, including when player controls are hidden.
- Retain series autoplay, resume, fullscreen, subtitle/audio preferences, library and themes.
- See [inline player behavior](docs/INLINE_PLAYER.md).

## 0.7.2 — 2026-11-14

- Use compact icons for player Play/Pause and Seasons & episodes, with accessible names and tooltips. Retain time and seek labels.

## 0.7.1 — 2026-11-14

- Remove the permanent Next transport button. Series continue automatically; the near-end Up next card remains. Movies return to details when finished.

## 0.7.0 — 2026-11-14

- Automatic next series episode, including season boundaries; final/unavailable playback returns to details.
- Near-end next-up card without guessing or skipping unknown credits.
- Immediate video/OK playback toggles, refined dropdowns, and TV season/episode drawer.
- TV-only lifted focus and saved theme before first paint.
- Existing library, catalogue cache, themes, audio, subtitles and quality controls retained.
- See [exact behavior and validation limits](docs/PLAYER_BEHAVIOR.md).

## 0.6.1 — 2026-11-14

- Retain the last fully cached page boundary when a long catalogue exceeds the metadata budget. Returning to that view resumes Load more at the first uncached page, without skipping results.

## 0.6.0 — 2026-11-14

- Cache Movies/TV Shows metadata and loaded pages by filters across visits and restarts. Show cached results immediately, check stale data in the background, and preserve position when unchanged.
- Add Continue watching selection mode, single/multiple/all removal and Undo. Remove all episode records belonging to a chosen title, preserve My list, and prevent removed progress from being recreated on close.

- Tighten title details: place actions immediately after the synopsis for movies and after the season selector for TV shows. Remove the desktop's flexible gap and hide the entire unused movie season row.
- Keep existing posters, seasons, episode cards, playback, library and themes intact; use consistent compact spacing on TV too.


## 0.5.0 — 2026-11-14

- Add five live Settings themes: Obsidian Cinema, Orbital, Prism, Aurora and Eclipse. Save the choice across launches; refresh surfaces, focus accents, hero styling and navigation without changing playback or library data.
- Add a shuffled latest movies + TV slideshow, up to 50 of each (100 unique titles), with previous/next/pause, an accurate count, and exact active-title Watch/More info actions.
- Load bounded metadata in the background and only active-slide artwork. Pause automatic rotation while interacting, in other views, during playback or when hidden.
- Preserve the existing catalogue, filters, library, audio, captions, quality, fullscreen, remote/keyboard input and optional update features.


## 0.4.0

- Fix missing covers in search, My list and details by distinguishing the native
  API's BlurHash placeholder strings from actual thumbnail URLs.
- Add separate live Movies and TV Shows catalogue channels, combined year,
  genre, country, language/edition, sort and minimum-rating filters and pagination.
- Keep remote-friendly Apply/Reset controls and separate saved filter choices.
- Fix Up-arrow navigation getting trapped below the page header, and keep focused
  options visible inside long filter pickers.
- Add a short, composited 4.5% poster focus/hover enlargement and accent highlight.
- Retain bounded, resized poster loading and the responsiveness/seek fixes.
- Audit prior requests and clearly record remaining parity and validation gaps.

## 0.3.0

- Resize allowlisted service artwork at the CDN before decoding: 300 px posters,
  960 px hero images and 360 px detail artwork. Render 12 initial posters and
  request offscreen images only near the viewport.
- Compact stored title metadata, batch library writes and flush on lifecycle
  events; index history lookups and avoid repainting unchanged subtitle text.
- Keep a recovery copy of My list/history and restore it if the primary local
  record is damaged.
- Set Samsung's supported four-second start/resume buffer targets, coalesce
  repeated seeks, update the seek preview immediately and avoid flashing the
  loading overlay for brief seek buffering; persistent stalls remain visible.
- Add optional daily GitHub release notices, Later, Skip this version, installation
  instructions and an automatic-check setting. Updates never block playback or
  install automatically.
- Allow small runtime differences (0.1%, bounded to 2–10 seconds) between audio
  editions. Different cuts require an explicit restart action rather than a
  silent jump to the same timestamp.
- Extend browser, update-policy and artwork checks. Actual TV performance is
  measured separately from browser/mock-AVPlay test results.

## 0.2.1

- Verify installation and native playback on Samsung U8000F / Tizen 9.0.
- Serialize and coalesce remote seeks; preserve repeated 10-second targets and
  prevent seek-buffering from triggering an automatic quality reload.
- Add native API detail/search routes that do not require a browser Referer.
- Permit the service's external subtitle CDN and verify real TV subtitle loading.
- Render 36 initial posters with Load More, cache navigation layout measurements,
  and remove expensive blur and smooth-scroll effects.
- Exclude generated signatures and all temporary diagnostics from public artifacts.

## 0.1.0 — development preview

- Add a TV interface and Samsung remote navigation with native IME handling.
- Add AVPlay playback, quality controls, seeking and hidden player controls.
- Add audio tracks/editions with runtime-safe switching and persistent preferences.
- Add native external-subtitle discovery, episode-specific caching and resume.
- Add deterministic unsigned widget packaging and browser/protocol tests.

Initial browser-only validation preceded the physical TV checks in 0.2.1.
