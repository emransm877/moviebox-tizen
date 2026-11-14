# Inline player controls

The seek timeline sits above one row of controls. Existing quality, audio and subtitle selectors are painted as icons while retaining their actual choices, tooltips, accessible labels and keyboard/native remote picker behavior. Time stays readable. Play/Pause and mute reflect their real states. Selected upstream Stremio SVG geometry is retained, with a foreground recolour and MIT provenance in assets/player-icons.

The permanent Next button remains removed. Series continue automatically; the near-end Up next card remains available. Desktop More contains download, local subtitle import and timing. TV More contains timing and audio-edition restart information. Movies hide the episode control. No casting or playback-speed capability is added by this visual revision.

Only when the player controls are hidden, a single Up-arrow press opens the season/episode panel at the right edge, including from hidden controls/fullscreen. Visible controls, an open selector or an options panel keep their own Up-arrow navigation; the shortcut does not open the drawer in those states. Held repeat events do not repeatedly open the panel. Browsing leaves playback running; choosing an episode starts that exact selection. Back/Escape closes the panel before leaving the player. The TV drawer slides from the right; desktop uses a right-anchored fade/slide. Reduced-motion preferences disable TV animations.

Windows and HTML video size cycle through Fit, Crop and Stretch. Native Samsung AVPlay uses Fit, Stretch and Auto aspect; its unsupported crop enum is no longer called. Playback is not restarted. Desktop keeps true fullscreen and click/double-click behavior. TV keeps the boxless raised theme-coloured focus effect, remote seeking and native AVPlay; its onscreen volume/mute use Samsung TVAudioControl when available. Without native volume access those controls are disabled and the hardware remote remains available. Browser playback uses the HTML video volume controls.

Validation covers real Qt layout/input/fullscreen/episode behavior, 1920/1280 TV browser layout and remote-style navigation with mocked AVPlay. Earlier native TV playback evidence is recorded separately; installation/launch of this release does not certify every upstream media source or every physical remote interaction.


Season selectors size to their labels instead of stretching across the panel. The desktop More menu uses a shared text inset and an explicitly padded, vertically aligned timing editor.


## Explicit volume adjustment and shared dropdown sizing

The speaker icon is an ordinary navigable button. Left/Right or Tab can move past it without entering a slider. Activate it by click or OK/Enter to open a small popup containing volume level, slider and mute. Left/Right adjust only after entering the popup. OK/Enter on the slider or Back/Escape closes the popup and restores the speaker focus; outside clicks also close it. Playback is preserved. The slider is not a focus target in the closed main control row.

All Windows selectors share one content-sized popup implementation: option text measurement, consistent left inset, a small checkmark column, and a width cap for long labels. A wide settings field no longer forces a wide popup. Closed text also uses a fixed inset rather than native style-dependent padding. Every TV selector uses actual rendered font measurements and shared compact title/row/container padding, with wrapping for long labels. This applies to seasons, audio/subtitle languages, quality, filters and settings.

Native Qt input checks cover bypassing the speaker, explicit activation, adjusting volume without pausing, return focus, and a wide field opening a compact popup. TV browser tests mock TVAudioControl as well as AVPlay to verify the same remote behavior. Hardware volume varies by audio output and retains the documented API fallback; automated tests do not certify every physical remote/output.


## Player focus rows

Left/Right on a main-row icon or closed icon selector follows the visible enabled controls in visual order. It stays in the row across empty space and stops at its ends. It does not change volume or quality and does not jump to the seek bar. Up from the visible row selects the seek bar; Down from the seek bar restores the last row action, including after pointer selection. Hidden controls retain their existing seek/episode shortcuts. Open sliders, selector popups and episode panels retain their own navigation.

Regression checks walk the whole icon row in both directions, assert the exact next control after Volume, and verify the Up/Down seek bridge without pausing playback or changing quality.


The six catalogue filter fields share one content-sized row. Closed field widths include text, arrow and border padding; selected text remains readable. Apply and Reset stay below the fields. TV uses a horizontal scroll fallback only if unusual long selections exceed the available width.


## Native seek lifecycle

Samsung documents that AVPlay calls must wait for the asynchronous seek callback. Buffering events during a seek use its captured state, pause/resume intent is applied after the callback, and audio/quality/display changes are deferred. The latest requested seek target is retained. A ten-second missing-callback deadline cancels and reopens the native session once at that target with the requested pause state and existing subtitle selection. A second timeout returns to details with progress saved, preventing an endless retry loop. Late callbacks carry the previous epoch and cannot alter the recovered session.

A native `PLAYER_ERROR_SEEK_FAILED` (`InvalidValuesError`, code 26) was captured on the test TV during repeated seeks. That proves a native seek error, not the cause of an earlier whole-interface freeze whose process had already restarted. Browser tests deliberately withhold callbacks and reject overlapping commands; they do not certify every decoder/source.

Reference: https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html#AVPlayManager::seekTo
