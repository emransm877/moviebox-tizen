# Inline player controls

The seek timeline sits above one row of controls. Existing quality, audio and subtitle selectors are painted as icons while retaining their actual choices, tooltips, accessible labels and keyboard/native remote picker behavior. Time stays readable. Play/Pause and mute reflect their real states. Selected upstream Stremio SVG geometry is retained, with a foreground recolour and MIT provenance in assets/player-icons.

The permanent Next button remains removed. Series continue automatically; the near-end Up next card remains available. Desktop More contains download, local subtitle import and timing. TV More contains timing and audio-edition restart information. Movies hide the episode control. No casting or playback-speed capability is added by this visual revision.

Only when the player controls are hidden, a single Up-arrow press opens the season/episode panel at the right edge, including from hidden controls/fullscreen. Visible controls, an open selector or an options panel keep their own Up-arrow navigation; the shortcut does not open the drawer in those states. Held repeat events do not repeatedly open the panel. Browsing leaves playback running; choosing an episode starts that exact selection. Back/Escape closes the panel before leaving the player. The TV drawer slides from the right; desktop uses a right-anchored fade/slide. Reduced-motion preferences disable TV animations.

Video size cycles through Fit, Crop and Stretch without restarting playback. Desktop keeps true fullscreen and click/double-click behavior. TV keeps the boxless raised theme-coloured focus effect, remote seeking and native AVPlay; its onscreen volume/mute use Samsung TVAudioControl when available. Without native volume access those controls are disabled and the hardware remote remains available. Browser playback uses the HTML video volume controls.

Validation covers real Qt layout/input/fullscreen/episode behavior, 1920/1280 TV browser layout and remote-style navigation with mocked AVPlay. Earlier native TV playback evidence is recorded separately; installation/launch of this release does not certify every upstream media source or every physical remote interaction.


Season selectors size to their labels instead of stretching across the panel. The desktop More menu uses a shared text inset and an explicitly padded, vertically aligned timing editor.
