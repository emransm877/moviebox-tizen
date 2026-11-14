# Install MovieBox on a Samsung TV

The TV download is a **developer-install bundle**, not a Samsung Store release.
Samsung requires a valid signature and target-TV authorization. A widget signed
for somebody else's TV is not a universal installer. This project does not bypass
Samsung's installation checks.

## Supported target

- Samsung Tizen 7.0 or newer. The exercised device is U8000F / Tizen 9.0.
- Other models, codecs and firmware versions require their own playback checks.
- This package does not run on Android TV, LG webOS, Roku or Apple TV.

## Install from a Windows PC

1. Download and extract `MovieBox-TV-0.7.2-install-bundle.zip` from Releases.
2. Install official Tizen Studio, Samsung TV Extension and Samsung Certificate
   Extension. Keep the PC and TV on the same network.
3. Enable TV Developer Mode, enter this PC's LAN address as Host PC IP, and restart
   the TV. The TV IP and Host PC IP are different addresses.
4. Create a **Samsung > TV** certificate profile using Certificate Manager. Include
   the target TV's DUID. Keep its password and signing files private.
5. Double-click `Install-MovieBoxTV.cmd`, then enter the TV address and certificate
   profile name when prompted. If SDK tools are not found, enter their installation
   directory. For an explicit command, use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-MovieBoxTV.ps1 -TvAddress YOUR_TV_IP -Profile YOUR_PROFILE -SdkRoot C:\tizen-studio
```

The helper verifies the widget hash, connects, signs a temporary copy using your
existing SDK profile, installs it and requests launch. The original unsigned WGT
is preserved; no certificate is included or uploaded. It does not require Python
or Node.js. The installed app does not need the PC to remain running.

For updates, use the same author certificate and application identity. The helper
does not uninstall the app or clear its local history. If the SDK rejects the
package with a certificate error, fix the profile instead of uninstalling it.

## Verify after installation

Open a movie and a series episode; check video, sound, subtitle selection, resume,
Right/Left seeking, audio choices and the search keyboard with the physical remote.
Passing installation alone does not certify every playback source.

A store-style installation for arbitrary TVs requires Samsung distribution and
approval; that process is not completed by this GitHub release.

Official instructions: [Samsung certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
and [TV device setup](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
