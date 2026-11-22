# Install MovieBox on a Samsung TV

The TV download is a **developer-install bundle**, not a Samsung Store release.
Samsung requires a valid signature and target-TV authorization. A widget signed
for somebody else's TV is not a universal installer. This project does not bypass
Samsung's installation checks.

## Supported target

- Minimum platform: Samsung Tizen 7.0. Hardware checks cover the U8000F on
  Tizen 9 and its upgrade to Tizen 10; other models require their own checks.
- Other models, codecs and firmware versions require their own playback checks.
- This package does not run on Android TV, LG webOS, Roku or Apple TV.

## Install from a Windows PC

1. Download and extract the latest **published** install bundle from
   [Releases](https://github.com/emransm877/moviebox-tizen/releases). The development
   version in the source tree may be newer than the published download.
2. Install official Tizen Studio, Samsung TV Extension and Samsung Certificate
   Extension. Keep the PC and TV on the same network.
3. Enable TV Developer Mode, enter this PC's LAN address as Host PC IP, and restart
   the TV. The TV IP and Host PC IP are different addresses.
4. Create a **Samsung > TV** certificate profile using Certificate Manager. Include
   the target TV's DUID. For an existing installation, retain its original author
   certificate; a matching profile name alone does not establish the same author.
   In Device Manager, use **Permit to install applications** if permission is
   required. Keep passwords, device IDs and signing files private.
5. Double-click `Install-MovieBoxTV.cmd`, then enter the TV address and certificate
   profile name when prompted. If SDK tools are not found, enter their installation
   directory. For an explicit command, use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-MovieBoxTV.ps1 -TvAddress YOUR_TV_IP -Profile YOUR_PROFILE -SdkRoot C:\tizen-studio
```

The source helper verifies the widget hash, checks that the connected target is a
Samsung TV, checks whether MovieBox is present, signs a temporary copy, installs
and confirms that the app is listed and launched. SDK commands have time limits;
errors stop the process without uninstalling. Older published bundles can contain
an earlier helper. The unsigned WGT is preserved and no certificate is uploaded.
The installed app does not need the PC to remain running. Use ordinary SDK/temp
paths without `%`, `!`, `^`, quotes or line breaks; the SDK batch launcher expands
these characters, so the helper rejects them instead of changing an argument.

For updates, use the same author certificate and application identity. The helper
does not uninstall the app or clear its local history. If the SDK rejects the
package with a certificate error, fix the profile instead of uninstalling it.

## Missing after a TV software update

First check Apps: a missing home-screen shortcut does not prove the app was
removed. Reconnect Developer Mode using the PC address authorized by the TV.
With Ethernet and Wi-Fi both connected, check which PC address is actually used;
being on the same Wi-Fi does not establish developer authorization.

If MovieBox is absent, reinstall with the existing author certificate and app ID
`MBoxTV2025.MovieBox`. If it is present, install in place. Do not uninstall, reset
Smart Hub or reset the TV as an automatic troubleshooting step. Reinstallation
cannot restore local history or settings that the TV has already deleted.

The same application was reinstalled and launched on the tested U8000F after its
Tizen 10 upgrade. That observation does not establish why the previous app went
missing. See [compatibility and recovery](COMPATIBILITY.md) for the tested scope.

## Verify after installation

Open a movie and a series episode; check video, sound, subtitle selection, resume,
Right/Left seeking, audio choices and the search keyboard with the physical remote.
Passing installation alone does not certify every playback source.

A store-style installation for arbitrary TVs requires Samsung distribution and
approval; that process is not completed by this GitHub release.

Official instructions: [Samsung certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
and [TV device setup](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
