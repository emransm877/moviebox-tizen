# Hardware validation

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
