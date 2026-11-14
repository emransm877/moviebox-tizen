# Player behavior

Series advance automatically through available episodes and across season boundaries. There is no autoplay checkbox or permanent Next transport button. At the final episode, a movie end, or an unavailable/undecodable automatic next source, playback returns to title details. Explicitly opening a completed title starts it again from zero.

The next-up card uses a valid source `creditsStartMs` marker when available. Without one it appears during the final 30 seconds (or final 10% of short videos, at least 5 seconds). It never infers a credits boundary or automatically cuts off the story. The viewer may choose Play next or Hide; otherwise the current video finishes. Next-source metadata is prepared while the current video continues, without starting a second decoder.

Windows: one video click toggles playback immediately; double-click toggles true fullscreen while preserving the prior playback state. Dropdowns fit their content/control width and fade in when Windows animations are enabled.

TV: successive OK presses toggle pause/play immediately when the video or play/pause control is selected. Other controls retain their own OK action. The season/episode drawer lets viewers browse without pausing and choose an exact episode. Back closes the picker/drawer first. Focus uses a small lift and translucent theme colour, with no focus outline rectangle; the seek bar becomes slightly raised. This focus change applies only to TV. The saved theme is read synchronously before styles and the first rendered frame.

Validation uses isolated libraries and legal local video. Native Windows input, fullscreen, playback and failure paths are exercised. TV browser tests use fixture API data and mocked AVPlay; they do not certify a physical remote or every Samsung decoder. The TV was unavailable over SDB during this revision, so this revision has not yet been installed or hardware-verified on it. Earlier U8000F hardware results remain documented separately.
