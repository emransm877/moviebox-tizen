# Changelog

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
