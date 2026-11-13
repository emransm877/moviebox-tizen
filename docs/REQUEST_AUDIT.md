# MovieBox request audit — 2026-11-14

This is an evidence checklist, not a claim of complete Android feature parity.

## Addressed in TV 0.4.0 and desktop 0.6.0

| Request | Result and verification |
|---|---|
| Artwork in search, My list and details | Fixed the native API BlurHash `thumbnail` being mistaken for an image URL. Real URLs are resized before loading. Browser regressions exercise all three views; actual TV search covers were checked. Desktop already selected the real cover URL. |
| Separate Movies and TV Shows | Separate live service channels, rather than filtering the home feed. |
| Year, genre, country and sorting | Combined server-side filters, plus language/edition and minimum rating. Choices come from a verified service metadata snapshot; title results and subsequent pages are requested live. |
| Remote and keyboard filters | Native TV option picker and keyboard-accessible Qt controls; explicit Apply/Reset retain focus. Per-section choices persist separately. |
| Return to the top on TV | Up/Down retain their content region; the first row restores the full page header. Long filter lists scroll the active option into their own viewport. |
| Animated poster focus | A 160 ms enlargement and accent highlight on both apps, with no full-catalogue blur or layout resize. |
| Preserve responsiveness | Keep resized artwork, 12 initial TV posters, lazy image requests, cached focus bounds, compact/coalesced saves and subtitle redraw suppression. |

## Retained from the previous releases

- Movie details hide seasons; series expose seasons and episode buttons.
- Native playback, real available qualities, auto quality, resume and next episode.
- True desktop fullscreen and double-click toggle; native full-screen TV player
  with hidden controls and remote seeking.
- Episode-specific automatic subtitle discovery/download/cache where tracks exist.
- Embedded audio selection and dubbed editions; small padding differences are
  accepted, while different cuts need an explicit restart.
- My list and history recovery copies, lifecycle saves and desktop multi-instance
  merge protection. The two desktop saved titles survived separate frozen processes.
- Optional GitHub Release notices, Later/Skip and opt-out. Existing old binaries
  need the first manual upgrade; pushing source without publishing a newer release
  is not an application update.
- Public source, documentation and downloadable Windows/APK/TV release assets.

## Still pending, unavailable or not fully verified

- Five concept-inspired themes are implemented as live Settings choices; real
  catalogue content replaces fictional preview artwork. See THEMES_AND_SPOTLIGHT.md.
- A service cannot supply 1080p or subtitles for every title. Available editions,
  membership restrictions and upstream track availability remain authoritative.
  Embedded/burned-in text cannot be disabled with a subtitle-track setting.
- Desktop QR ticket creation exists; completed account login and cross-device
  history/list synchronization have not been verified. My list remains local to
  each installation; TV QR login/cloud synchronization are not implemented.
- Desktop has local subtitle import and background file downloads. The TV preview
  does not yet implement local subtitle import or offline video downloads.
- The Android 0.2.0 optional-notice APK was compiled and signature/alignment checked,
  but no connected phone was available for this revision's lifecycle/UI test.
  General MovieBox advertising removal remains unverified/unimplemented by this patch.
- Samsung developer installation needs a certificate authorized for that TV.
  There is no approved Samsung Store release or universal unsigned installer.
- Other TV models, codecs and all network conditions are not certified. Brief
  seek overlays are delayed; genuine network buffering can still occur.

These outstanding items are intentionally listed separately from completed fixes.

## Theme and spotlight update

Five selectable, persistent themes and a shuffled latest-movies/TV carousel are implemented. Existing feature regression suites are retained. See [theme and spotlight behavior](THEMES_AND_SPOTLIGHT.md).

## Cached catalogues and history management

Movies/TV Shows now restore cached filtered pages and position, with background refresh. Continue watching supports single/multiple/all removal and Undo while preserving My list. Details use compact action spacing. See [behavior and evidence](CACHE_AND_HISTORY.md).
