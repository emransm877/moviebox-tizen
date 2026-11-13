# Themes and latest-title spotlight

Choose **Settings → MovieBox theme**. The five implemented themes adapt the generated concepts to the native Qt and TV interfaces; actual catalogue artwork replaces fictional preview artwork. All existing application actions remain available in every theme. Changes apply immediately and persist per device.

| Theme | Appearance and navigation |
|---|---|
| Obsidian Cinema | Charcoal and mint, full sidebar |
| Orbital | Midnight and ice blue, top navigation |
| Prism | Indigo and violet, compact icon rail |
| Aurora | Pearl and emerald, light surfaces and top navigation |
| Eclipse | Cinema black and champagne, display typography and top navigation |

The home spotlight requests the service's **Latest** movie and TV channels, taking up to 50 unique titles from each, then shuffles the combined set. Its counter shows the actual available count. If a channel is unavailable, the other channel or existing home feed remains usable. It never fabricates 100 entries when fewer are returned.

The slideshow advances every eight seconds while eligible. Previous/Next and Pause/Resume are keyboard/remote accessible. Automatic rotation pauses while its controls are focused, on hover, outside Home, during video playback or while hidden. TV reduced-motion preference also disables automatic rotation. Watch resolves the active title and starts that title; More info opens its details without autoplay. A TV-show slide exposes that show's seasons and episodes. Existing saved progress still applies.

Only metadata for the rotation is fetched in the background; artwork loads for the active slide rather than 100 full-size images. No streams or subtitles are downloaded just to fill the carousel. Theme selection does not replace the native player, clear the library or restart a stream. Lists and preferences remain local per installation.

Validation includes all previous offline/UI checks, actual Qt settings/theme/player tests, fixture TV remote/theme/carousel tests, and a live 100-title feed probe. Mock AVPlay checks are not hardware playback proof. Upstream availability, network conditions and other devices still need their own testing.
