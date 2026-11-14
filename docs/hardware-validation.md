# Hardware validation

## 0.3.0 follow-up: 2026-11-14

Measured on the same U8000F / Tizen 9.0 using private, excluded diagnostics:

| Check | Observed result |
|---|---|
| Startup main-thread task | Previous build: 4,574 ms maximum; candidate: 140 ms in the measured launch |
| Artwork | Previously observed 6,750 × 6,750 source image; candidate poster images decoded at 300 px wide |
| Catalog | 12 initial posters rather than 36; 252 document nodes in the candidate sample versus 376 |
| Controlled navigation | Ten injected arrow events: max movement work 4.7 ms; max complete handler 7.1 ms; event delay at most 0.7 ms in that run |
| Native buffer policy | Actual AVPlay accepted four-second play/resume targets in IDLE |
| Seeking | Three Right presses and one Left press coalesced into one native seek, confirmed in 853 ms; 1080p retained, no native error |
| Long-term playback | Native clock continued and loading indicator was hidden in subsequent samples |

These are bounded observations on one device, not a universal latency guarantee.
Network/cache conditions were not held constant. Injected events exercise actual
TV application handlers and AVPlay, but do not certify physical remote transport
latency. The UI can remain responsive while media still needs network data.
Brief seek buffering indicators are delayed; persistent buffering remains visible.
The final installed/public build excludes this diagnostic endpoint and scripts.

## Original 0.2.1 validation

Date: 2026-11-13. Target: Samsung UA43U8000FRSER (43-inch U8000F), Tizen 9.0.

| Check | Evidence and result |
|---|---|
| Signed installation | Samsung TV certificate accepted; application installed and launched |
| Native engine | Actual `webapis.avplay`, state `PLAYING`, playback clock advancing |
| Quality | Actual 1080p source remained selected through seek tests |
| Subtitles | 1,908 parsed cues loaded for the exercised movie after allowing its CDN |
| Forward/back seeking | Real TV player completed queued seeks without native errors; manual Samsung remote seeking confirmed by the user |
| Repeated key handling | Controlled in-page arrow events exercised the TV app handler and real AVPlay; serialized calls completed and quality stayed at 1080p |
| Navigation timing | Five controlled player focus moves: maximum handler time 4.4 ms |
| Playback UI timing | A bounded settled sample was around 16.7 ms per animation frame; this is UI scheduling, not decoded video frame-rate evidence |
| Automated UI tests | 39 browser checks with explicitly mocked AVPlay |
| Protocol checks | Real guest catalog, search, suggestions, detail, seasons, qualities and English subtitle requests passed |

The original seeking regression was reproduced on the TV: a successful seek's
buffering events triggered a quality reload and a position jump. The corrected
build excludes seek/resume/preparation buffering from network-failure decisions,
queues one native seek at a time, and accumulates remote presses.

Private diagnostic builds reported only whitelisted player state, key codes,
timing and error counters to the developer's local PC. They did not report typed
search text, media URLs or credentials. This diagnostic code and its local-network
permission are absent from the public widget and final installed build.

Native keyboard presentation and every possible title, codec, audio edition and
network condition are not certified by these samples. Other TV models require
their own testing. The project does not claim equivalence to YouTube's implementation.
## 0.4.0 catalogue, artwork and scrolling validation

Date: 2026-11-14. Same Samsung U8000F / Tizen 9.0 target.

- Actual native search returned ten visible covers, all decoded at 300 pixels wide.
- The new Movies channel loaded twelve covers at 300 pixels wide; a native detail
  image decoded at 360 by 540 pixels. My list was empty on this TV; its artwork
  regression is covered by the browser fixture rather than a hardware claim.
- Starting at scroll offset 521, controlled Up events returned the content scroll
  offset to zero while focus remained inside the content region.
- 62 browser checks pass with explicitly mocked AVPlay, including catalogue
  filters, BlurHash artwork, long option lists, scroll-to-top and poster scaling.
- The final 0.4.0 widget was signed, installed and launched without diagnostics.
## 0.5.0 themes and latest-title spotlight

Date: 2026-11-14. Samsung U8000F / Tizen 9.0.

All five theme selections were applied through the settings change handler on
the actual TV. The live carousel contained 100 unique title records, with 50
movies and 50 TV shows, and continued rotating. No JavaScript error/rejection
was reported in the bounded samples. The original theme was restored afterwards.
The 62 previous browser checks still pass; 13 additional theme/carousel checks
exercise exact active-slide actions, remote navigation, persistence and native
source preservation with explicitly mocked AVPlay. These do not certify every
upstream title or model. The release widget excludes private diagnostics.
## 0.6.0 catalogue cache and history selection

Date: 2026-11-14. Same Samsung U8000F / Tizen 9.0 target.

The actual app's catalogue request counter was 11 after Movies, 12 after TV
Shows, and remained 12 on returning to Movies. Twelve movie posters were visible
on return, demonstrating the fresh-cache path without another catalogue request.
The totals include the earlier spotlight metadata calls. A bounded application
handler check selected one Continue watching title, then cancelled selection;
stored history was 10 entries before and after. No production history was removed.
Browser fixture tests cover actual deletion, Select all, Undo and page reload;
those AVPlay calls are explicitly mocked. The final widget excludes diagnostics.


## 0.7.2 installation — 2026-11-14

The normal release widget was signed locally with the test TV certificate, installed successfully as an update, and launched on Samsung UA43U8000FRSER / Tizen 9 through SDB. No uninstall, data reset, or diagnostic build was used. This check confirms installation/launch; the icon/input behavior is covered by the browser fixture tests and has not yet received a new physical remote acceptance test. Personal signing material is excluded from public packages.


## Native TV player checks — 2026-11-14

The current 0.7.2 player code was checked on Samsung U8000F / Tizen 9 using a temporary private diagnostic build and a legal local H.264 fixture. The saved Eclipse theme matched the first rendered frame. A change to Prism persisted across process exit/relaunch and also matched the first frame. The original theme was restored.

Native AVPlay accepted successive injected OK inputs for pause and resume without waiting for the controls to hide. The inputs were injected 118 ms apart; this is not a measurement of the physical remote's radio/IR latency. Seeking near the fixture's actual end led to the native completion callback and a return to the title details. No real title completion was simulated. Stored saved-list and history counts remained unchanged, and no runtime errors were reported during this check.

The normal signed 0.7.2 release was reinstalled and launched afterwards. The private diagnostic listener was stopped. Public release widgets and bundles remain unchanged and contain no diagnostic code, personal certificate or signature. Series progression and the episode drawer retain browser fixture coverage; a physical remote acceptance test for every control/title is not claimed.


## 0.8.3 sizing and row-focus checks — 2026-11-14

A temporary private build with the current player code used a legal local H.264 fixture on Samsung U8000F / Tizen 9. Injected application key events moved Right past Volume directly to Quality, rather than the seek bar. The former `PLAYER_DISPLAY_MODE_CROPPED_FULL` command returned `InvalidValuesError` on this TV. The corrected button cycled Letterbox/Fit, Full-screen/Stretch and Auto aspect, with each native command accepted while playback remained PLAYING and the corresponding UI label updated. Saved-list and history counts were unchanged. The normal signed 0.8.3 release was restored and launched afterwards; the owned diagnostic listener was stopped.

This verifies native command acceptance and application focus behavior, not physical IR/radio latency or captured native-plane pixels. Equal source/screen aspect ratios can produce the same visible picture across valid sizing modes. Samsung's supported display enums are documented at https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html . Public packages contain neither the diagnostic code nor personal signing material.
