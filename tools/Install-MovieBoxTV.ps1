param(
    [string]$TvAddress = '',
    [string]$Profile = '',
    [string]$SdkRoot = '',
    [string]$WidgetPath = (Join-Path $PSScriptRoot 'MovieBox-TV-0.9.3-unsigned.wgt')
)
$ErrorActionPreference = 'Stop'

function Invoke-SdkCommand {
    param([string]$Executable, [string[]]$CommandArguments, [int]$TimeoutSeconds = 90)
    function ConvertTo-NativeArgument([string]$Value) {
        # Windows CRT argv quoting, including embedded quotes and trailing slashes.
        $quoted = '"'; $slashes = 0
        foreach ($character in $Value.ToCharArray()) {
            if ($character -eq '\') { $slashes++; continue }
            if ($character -eq '"') { $quoted += ('\' * ($slashes * 2 + 1)) + '"' }
            else { $quoted += ('\' * $slashes) + $character }
            $slashes = 0
        }
        return $quoted + ('\' * ($slashes * 2)) + '"'
    }
    $start = New-Object System.Diagnostics.ProcessStartInfo
    if ([IO.Path]::GetExtension($Executable) -in @('.bat', '.cmd')) {
        # The SDK batch file runs through cmd.exe. Reject expansion characters
        # rather than silently changing a literal path or profile argument.
        foreach ($value in @($Executable) + $CommandArguments) {
            if ($value -match '[%!^"\r\n]') { throw 'SDK batch paths/arguments cannot contain percent signs, exclamation marks, carets, quotes or line breaks. Use a literal SDK path without these characters.' }
        }
        $start.FileName = Join-Path $env:SystemRoot 'System32\cmd.exe'
        $batchCommand = '"' + $Executable + '"'
        foreach ($argument in $CommandArguments) { $batchCommand += ' "' + $argument + '"' }
        $start.Arguments = '/d /v:off /s /c "' + $batchCommand + '"'
    } else {
        $start.FileName = $Executable
        $start.Arguments = (($CommandArguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
    }
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    $elapsed = [Diagnostics.Stopwatch]::StartNew()
    try {
        if (-not $process.Start()) { throw 'Could not start the SDK command.' }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            # Kill only this owned command tree, including a stalled SDK child.
            & taskkill.exe /PID $process.Id /T /F 2>&1 | Out-Null
            throw "SDK command timed out after $TimeoutSeconds seconds. No uninstall was attempted."
        }
        foreach ($read in @($stdout, $stderr)) {
            $remaining = [int][Math]::Max(0, $TimeoutSeconds * 1000 - $elapsed.ElapsedMilliseconds)
            if (-not $read.Wait($remaining)) { throw "SDK command timed out waiting for output after $TimeoutSeconds seconds." }
        }
        $output = $stdout.Result + $stderr.Result
        if ($process.ExitCode -ne 0) { throw "SDK command failed ($($process.ExitCode)): $output" }
        return $output
    } finally { $process.Dispose() }
}

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
$expectedHash = 'c716af01027a5711f94a1c81893e31c74999bc5ad0bf2aea2b274566578fb689'
if ((Get-FileHash -LiteralPath $WidgetPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'The widget does not match the reviewed 0.9.3 build. Use the matching installation bundle.' }
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$workDirectory = Join-Path $tempBase ('MovieBoxTV-' + [Guid]::NewGuid().ToString('N'))
$appDirectory = Join-Path $workDirectory 'app'
$outputDirectory = Join-Path $workDirectory 'signed'
New-Item -ItemType Directory -Path $appDirectory,$outputDirectory -Force | Out-Null
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path -LiteralPath $WidgetPath).Path, $appDirectory)
    $serial = $TvAddress + ':26101'
    $null = Invoke-SdkCommand $sdb @('connect', $serial) 15
    $capabilities = Invoke-SdkCommand $sdb @('-s', $serial, 'capability') 15
    if ($capabilities -notmatch '(?m)^profile_name:tv\s*$' -or $capabilities -notmatch '(?m)^vendor_name:Samsung\s*$') {
        throw 'The selected target is not a ready Samsung TV. Check Developer Mode and Host PC IP. With two network adapters, the TV must authorize the address used to connect.'
    }
    $platform = [regex]::Match($capabilities, '(?m)^platform_version:([0-9]+(?:\.[0-9]+)*)\s*$')
    if (-not $platform.Success -or [version]$platform.Groups[1].Value -lt [version]'7.0') { throw 'This build requires Samsung Tizen 7.0 or newer.' }
    $appsBefore = Invoke-SdkCommand $sdb @('-s', $serial, 'shell', '0', 'applist') 20
    if ($appsBefore.Contains('MBoxTV2025.MovieBox')) {
        Write-Output 'MovieBox is present. Installing in place; use the original author certificate to retain its identity and data.'
    } else {
        Write-Output 'MovieBox is absent. Reinstalling restores the app; data already removed by the TV cannot be recovered by this helper.'
    }
    $null = Invoke-SdkCommand $tizen @('package', '-t', 'wgt', '-s', $Profile, '-o', $outputDirectory, '--', $appDirectory) 90
    $signedWidgets = @(Get-ChildItem -LiteralPath $outputDirectory -Filter '*.wgt' -File)
    if ($signedWidgets.Count -ne 1) { throw 'Signing did not produce exactly one widget.' }
    $null = Invoke-SdkCommand $tizen @('install', '-n', $signedWidgets[0].FullName, '-s', $serial) 120
    $appsAfter = Invoke-SdkCommand $sdb @('-s', $serial, 'shell', '0', 'applist') 20
    if (-not $appsAfter.Contains('MBoxTV2025.MovieBox')) { throw 'SDK install returned, but MovieBox is not listed on the TV. Check installation permission and the certificate authorization.' }
    $launch = Invoke-SdkCommand $sdb @('-s', $serial, 'shell', '0', 'was_execute', 'MBoxTV2025.MovieBox') 20
    if ($launch -notmatch 'app_id\[MBoxTV2025\.MovieBox\]\s+(?:launched|resumed)') { throw 'Installed, but launch was not confirmed. Open MovieBox from TV Apps and check its screen.' }
    Write-Output ('MovieBox installed and launch confirmed on Tizen ' + $platform.Groups[1].Value + '. Check video, sound and remote controls on the TV.')
} finally {
    $resolvedWork = [IO.Path]::GetFullPath($workDirectory)
    if ($resolvedWork.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedWork -Leaf) -match '^MovieBoxTV-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolvedWork -Recurse -Force
    }
}
