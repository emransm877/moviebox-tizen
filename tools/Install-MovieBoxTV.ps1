param(
    [string]$TvAddress = '',
    [string]$Profile = '',
    [string]$SdkRoot = '',
    [string]$WidgetPath = (Join-Path $PSScriptRoot 'MovieBox-TV-0.9.2-unsigned.wgt')
)
$ErrorActionPreference = 'Stop'
if (-not $TvAddress) { $TvAddress = Read-Host 'TV local IPv4 address (Developer Mode must be enabled)' }
$parsedAddress = $null
if (-not [Net.IPAddress]::TryParse($TvAddress, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'Enter the TV IPv4 address, without a port.' }
if (-not $Profile) { $Profile = Read-Host 'Existing Samsung TV certificate profile name, authorized for this TV' }
if ($Profile -notmatch '^[A-Za-z0-9_. -]+$') { throw 'Use a certificate profile name containing letters, numbers, spaces, dots, hyphens or underscores.' }
if (-not $SdkRoot) {
    foreach ($sdkCandidate in @($env:TIZEN_STUDIO, 'C:\tizen-studio')) {
        if ($sdkCandidate -and (Test-Path -LiteralPath (Join-Path $sdkCandidate 'tools\sdb.exe'))) { $SdkRoot = $sdkCandidate; break }
    }
}
if (-not $SdkRoot) { $SdkRoot = Read-Host 'Tizen Studio installation directory (for example C:\tizen-studio)' }
if (-not $SdkRoot) { throw 'Install Tizen Studio and the Samsung TV certificate extension first. See INSTALL-TV.md.' }
$sdb = Join-Path $SdkRoot 'tools\sdb.exe'
$tizen = Join-Path $SdkRoot 'tools\ide\bin\tizen.bat'
if (-not (Test-Path -LiteralPath $sdb) -or -not (Test-Path -LiteralPath $tizen)) { throw 'SDK tools are missing. Check -SdkRoot.' }
if (-not (Test-Path -LiteralPath $WidgetPath)) { throw 'Place the unsigned MovieBox WGT beside this script, or pass -WidgetPath.' }
$expectedHash = '7bee2e5be93574fb379bbbc431b26e442b635befa1fc4576b1d8b5bca2f53f48'
if ((Get-FileHash -LiteralPath $WidgetPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'The widget does not match the reviewed 0.9.2 release. Download it again.' }
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$workDirectory = Join-Path $tempBase ('MovieBoxTV-' + [Guid]::NewGuid().ToString('N'))
$appDirectory = Join-Path $workDirectory 'app'
$outputDirectory = Join-Path $workDirectory 'signed'
New-Item -ItemType Directory -Path $appDirectory,$outputDirectory -Force | Out-Null
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path -LiteralPath $WidgetPath).Path, $appDirectory)
    $serial = $TvAddress + ':26101'
    & $sdb connect $serial
    if ($LASTEXITCODE -ne 0) { throw 'TV connection failed. Check Developer Mode, Host PC IP and the TV restart.' }
    & $tizen package -t wgt -s $Profile -o $outputDirectory -- $appDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Signing failed. Complete a Samsung TV certificate profile that includes this TV DUID.' }
    $signedWidgets = @(Get-ChildItem -LiteralPath $outputDirectory -Filter '*.wgt' -File)
    if ($signedWidgets.Count -ne 1) { throw 'Signing did not produce exactly one widget.' }
    & $tizen install -n $signedWidgets[0].FullName -s $serial
    if ($LASTEXITCODE -ne 0) { throw 'TV installation failed. Check the certificate authorization and TV compatibility.' }
    & $sdb -s $serial shell 0 was_execute MBoxTV2025.MovieBox
    if ($LASTEXITCODE -ne 0) { throw 'Installed, but launch failed. Open MovieBox from TV Apps.' }
    Write-Output 'MovieBox installation commands completed. Check the TV screen.'
} finally {
    $resolvedWork = [IO.Path]::GetFullPath($workDirectory)
    if ($resolvedWork.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedWork -Leaf) -match '^MovieBoxTV-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolvedWork -Recurse -Force
    }
}
