# Changelog

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
