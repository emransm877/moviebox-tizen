# Samsung TV compatibility and software updates

MovieBox checks the APIs it uses instead of rejecting a TV solely because its
version number is newer. The manifest minimum remains Tizen 7.0. The application
and package IDs remain `MBoxTV2025.MovieBox` / `MBoxTV2025`.

## Tested scope

- **Tizen 9:** earlier U8000F hardware results, including native-player operations,
  are recorded in [hardware validation](hardware-validation.md).
- **Tizen 10:** on 22 November 2026, the same UA43U8000FRSER reported platform
  version 10.0. MovieBox was absent from the application list. Its existing Samsung
  TV certificate signed a reinstall with the same application identity, and the
  TV accepted and launched it. Actual catalogue browsing, cached navigation,
  Dhindora S2 E1 playback, 1080p/480p switching, seeking and English/Bangla subtitle
  loading were exercised. These are specific device/source checks, not universal
  codec or catalogue guarantees.
- **Other models and future updates:** not certified. Browser checks cover
  unavailable optional keys, denied user-agent configuration, storage fallback,
  lifecycle and shared UI. Synthetic user-agent strings are not substitutes for
  testing Samsung's actual browser and decoder versions.

The public download may precede the development source. See the version labels
in the [README](../README.md) before choosing a package.

## Forward compatibility

The app keeps fallback paths for optional platform features, serializes media
commands, preserves UTF-8 text, and tests remote-navigation and lifecycle behavior.
New firmware still needs a real-device smoke test. No application can guarantee
that Samsung will preserve every developer-installed app, API or installation
permission through an unreleased operating-system update.

If the app disappears after an update, follow [recovery steps](INSTALL-TV.md).
Uninstalling removes app data; a reinstall does not create a backup of data that
was already removed. Do not replace the original author certificate to work
around a signing error.

## Primary references

- [Samsung TV device setup](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html)
- [Samsung certificate creation and updates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
- [Samsung web engine specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
- [Samsung general specifications](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html)
- [Application installation questions](https://developer.samsung.com/smarttv/develop/faq/application-installation.html)
