# Player behavior

Series advance automatically through available episodes and across season boundaries. There is no autoplay checkbox or permanent Next transport button. At the final episode, a movie end, or an unavailable/undecodable automatic next source, playback returns to title details. Explicitly opening a completed title starts it again from zero.

The next-up card uses a valid source `creditsStartMs` marker when available. Without one it appears during the final 30 seconds (or final 10% of short videos, at least 5 seconds). It never infers a credits boundary or automatically cuts off the story. The viewer may choose Play next or Hide; otherwise the current video finishes. Next-source metadata is prepared while the current video continues, without starting a second decoder.

Windows: one video click toggles playback immediately; double-click toggles true fullscreen while preserving the prior playback state. Dropdowns fit their content/control width and fade in when Windows animations are enabled.

TV: successive OK presses toggle pause/play immediately when the video or play/pause control is selected. Other controls retain their own OK action. The season/episode drawer lets viewers browse without pausing and choose an exact episode. Back closes the picker/drawer first. Focus uses a small lift and translucent theme colour, with no focus outline rectangle; the seek bar becomes slightly raised. This focus change applies only to TV. The saved theme is read synchronously before styles and the first rendered frame.

Validation uses isolated libraries and legal local video. Native Windows input, fullscreen, playback and failure paths are exercised. TV browser tests use fixture API data and mocked AVPlay; they do not certify a physical remote or every Samsung decoder. The TV was unavailable for the original 0.7.0 revision. The normal signed 0.7.2 build has since installed and launched on Samsung U8000F/Tizen 9; this is installation/launch verification, not a physical retest of every new control. Earlier U8000F hardware results remain documented separately.


Player Play/Pause and Seasons & episodes use icons with accessible names and tooltips. Play/Pause updates its icon and accessible name with the actual playback state. Time and seek amounts remain visible.


## Native TV player checks — 2026-11-14

The current 0.7.2 player code was checked on Samsung U8000F / Tizen 9 using a temporary private diagnostic build and a legal local H.264 fixture. The saved Eclipse theme matched the first rendered frame. A change to Prism persisted across process exit/relaunch and also matched the first frame. The original theme was restored.

Native AVPlay accepted successive injected OK inputs for pause and resume without waiting for the controls to hide. The inputs were injected 118 ms apart; this is not a measurement of the physical remote's radio/IR latency. Seeking near the fixture's actual end led to the native completion callback and a return to the title details. No real title completion was simulated. Stored saved-list and history counts remained unchanged, and no runtime errors were reported during this check.

The normal signed 0.7.2 release was reinstalled and launched afterwards. The private diagnostic listener was stopped. Public release widgets and bundles remain unchanged and contain no diagnostic code, personal certificate or signature. Series progression and the episode drawer retain browser fixture coverage; a physical remote acceptance test for every control/title is not claimed.
