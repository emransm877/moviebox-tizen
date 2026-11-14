# MovieBox TV App

A small, independent Samsung Tizen client, installed on the TV as **MovieBox**.
The interface is designed for a television and the Samsung remote, with native
AVPlay decoding rather than a desktop application running on the TV.

**Preview 0.8.3:** browser-tested player revision, installed and launched on the test TV. Earlier builds were installed and tested on Samsung UA43U8000FRSER / Tizen 9.0.
Native 1080p playback, subtitle loading, and forward/back seeking were verified;
the user confirmed seeking with the Samsung remote. Requires Tizen 7.0+; other
models remain unverified. See [hardware validation](docs/hardware-validation.md).

## Download and install

[**Download TV install bundle**](https://github.com/emransm877/moviebox-tizen/releases/latest/download/MovieBox-TV-0.8.3-install-bundle.zip)

This is a developer-install bundle: an unsigned WGT plus a Windows helper that
signs and installs using your own Samsung TV certificate profile. Extract it,
read `INSTALL-TV.md`, then open `Install-MovieBoxTV.cmd`. The PC needs official
Tizen SDK tools and a certificate authorized for the target TV. The app itself
does not need the PC after installation. See [installation steps](docs/INSTALL-TV.md).

**There is no universal Samsung TV sideload file or approved Samsung Store listing
in this release.** Another TV requires its own authorization. This is not an
Android TV, webOS, Roku or Apple TV package.

## Features

- Discover titles, live search suggestions, movie details and series episodes.
- Separate Movies and TV Shows catalogues with live server pagination and combined
  year, genre, country, language/edition, sorting and minimum-rating filters.
- Native API BlurHash placeholders are distinguished from image URLs, so artwork
  renders in My list, search and detail pages without decoding enormous originals.
- Arrows/OK/Return navigation, remote transport keys and remote-friendly option menus.
- Samsung's native on-screen keyboard through a focused HTML search input;
  Samsung IME Done/Cancel/composition keys are handled without swallowing text input.
- Fullscreen AVPlay playback, seeking, automatically hidden controls, real source
  qualities and automatic quality reduction when buffering persists.
- Embedded audio tracks and actual dubbed editions. Audio switches preserve
  position and paused state only between matching runtimes; subtitle-only
  editions and truncated source variants are excluded from audio choices.
- Automatic per-episode subtitle discovery/download and persistent IndexedDB caching.
- Continue watching, saved titles, audio/subtitle preferences and next-episode playback.

The API adapter respects upstream access restrictions. Catalog/artwork/media
availability belongs to the service. A missing source or subtitle cannot be
created by changing a resolution label. Desktop downloads, local file import,
and desktop QR account login are not included in this TV preview.

## Package

Python 3.11+ can create the unsigned development widget without an npm toolchain:

```powershell
python tools/package.py
```

The output is `dist/MovieBox-TV-0.8.3-unsigned.wgt` with a SHA-256 file. It is an
unsigned build artifact, **not an installable signed release**. The package
contains only the app's HTML/CSS/JavaScript and icons; it does not contain Python,
an emulator, a browser engine, or the Android APK.

## Install on a Samsung TV

1. Install the official Tizen Studio tools, Samsung TV Extension and Samsung
   Certificate Extension.
2. In the TV's Apps/App Settings screen, enter `12345`, enable Developer Mode,
   set the **Host PC IP** to your computer's LAN address and restart the TV.
3. Connect using `sdb connect TV_IP:26101`. Create a Samsung **TV** certificate
   profile in Certificate Manager, sign in to your Samsung account locally and
   include the connected TV's DUID in the distributor certificate.
4. Sign the application directory with your existing profile:

```powershell
tizen package -t wgt -s YOUR_PROFILE -- app
```

5. Install the signed widget using the Tizen Studio device tools, then launch
   application ID `MBoxTV2025.MovieBox`.

Keep certificates, certificate passwords, DUIDs and device profiles private.
Another TV may need its own signed distributor profile. Do not commit signing
files or publish a personal developer certificate.

Official references: [TV device setup](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html),
[Samsung certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html),
[AVPlay](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html),
[keyboard/IME](https://developer.samsung.com/smarttv/develop/guides/user-interaction/keyboardime.html).

## Development and tests

Run offline protocol/access-control checks with Node.js 20+:

```powershell
node tests/api.test.cjs
```

The optional live check `node tests/native_live.cjs` makes guest API requests;
it does not establish that AVPlay works on a TV. Browser tests need Python,
Playwright and Microsoft Edge, and deliberately identify their AVPlay mock:

```powershell
python -m pip install playwright
python tests/ui_acceptance.py
```

For a live browser preview, place the desktop source in the sibling
`MovieBoxDesktop` directory and run `python tools/dev_server.py`. Open
`http://127.0.0.1:8765`. This optional loopback-only preview adapter preserves
media request headers for desktop browsers. The installed TV client makes its
own API and AVPlay requests and does not need the preview PC server.

## Project and licensing

Maintained by [Emran Hossain](https://github.com/emransm877). This project is not
affiliated with or endorsed by MovieBox or Samsung. Original project code is MIT;
MovieBox names, logos and third-party catalog assets retain their owners' rights.
See `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md` and `SECURITY.md`.

## Themes and latest titles

Choose any of five persistent themes in Settings, including a matching MovieBox logo. Home rotates up to 100 latest movies and TV shows with remote-friendly Previous/Next/Pause and Watch/More info actions for the active title. See [behavior and feature preservation](docs/THEMES_AND_SPOTLIGHT.md).

## Catalogue cache and Continue watching

Movies/TV Shows restore their cached pages and position immediately. After five minutes, the app checks for new results in the background; Apply filters can refresh manually. In Continue watching choose **Select titles**, select one/several or **Select all**, then **Remove selected**. **Undo removal** restores the last batch during the current session. My list is preserved. See [details](docs/CACHE_AND_HISTORY.md).
