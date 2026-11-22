"""Offline installer regressions. No SDK, certificate, network or TV is used."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools' / 'Install-MovieBoxTV.ps1'
POWERSHELL = shutil.which('powershell.exe')


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


@unittest.skipUnless(os.name == 'nt' and POWERSHELL, 'Windows PowerShell required')
class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='moviebox-installer-test-')
        self.addCleanup(self.directory.cleanup)
        self.work = Path(self.directory.name)

    def powershell(self, script, timeout=12):
        encoded = base64.b64encode(script.encode('utf-16le')).decode('ascii')
        env = dict(os.environ, MOVIEBOX_WRAPPER_TEST='SYNTHETIC_EXPANDED_VALUE')
        return subprocess.run([POWERSHELL, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
                              capture_output=True, text=True, timeout=timeout, env=env)

    def wrapper(self, arguments, executable=None, timeout=5):
        # Extract only the function AST; never execute the installer body.
        script = "$ErrorActionPreference='Stop'; $tokens=$null; $errors=$null; "
        script += "$ast=[Management.Automation.Language.Parser]::ParseFile(" + literal(SOURCE) + ",[ref]$tokens,[ref]$errors); "
        script += "if($errors.Count){throw 'Installer parse errors'}; "
        script += "$fn=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-SdkCommand'},$true); "
        script += "Invoke-Expression $fn.Extent.Text; "
        script += "try {$value=Invoke-SdkCommand " + literal(executable or sys.executable)
        script += " @(" + ','.join(literal(arg) for arg in arguments) + ") " + str(timeout)
        script += "; Write-Output ('RESULT:' + (ConvertTo-Json -Compress @{ok=$true;value=$value}))} "
        script += "catch {Write-Output ('RESULT:' + (ConvertTo-Json -Compress @{ok=$false;error=$_.Exception.Message}))}"
        result = self.powershell(script, timeout=timeout+10)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        line = next((line[7:] for line in result.stdout.splitlines() if line.startswith('RESULT:')), None)
        self.assertIsNotNone(line, result.stdout + result.stderr)
        return json.loads(line)

    def test_native_literal_argument_boundaries(self):
        values = ['', 'with spaces', "apostrophe's", 'a&b', 'a|b', 'a;b', '$(Write-Output injected)', '%MOVIEBOX_WRAPPER_TEST%', 'ends\\', 'বাংলা']
        result = self.wrapper(['-c', 'import json,sys;print(json.dumps(sys.argv[1:]))', *values])
        self.assertTrue(result['ok'], result)
        self.assertEqual(json.loads(result['value']), values)

    def test_native_embedded_double_quotes(self):
        values = ['embedded"quote', 'space and "quote"', 'last\\"quote']
        result = self.wrapper(['-c', 'import json,sys;print(json.dumps(sys.argv[1:]))', *values])
        self.assertTrue(result['ok'], result)
        self.assertEqual(json.loads(result['value']), values)

    def test_batch_spaces_apostrophes_ampersands_and_pipes_remain_literal(self):
        recorder = self.work / 'record args.py'
        recorder.write_text('import json,sys\nprint(json.dumps(sys.argv[1:]))\n', encoding='utf-8')
        batch = self.work / 'SDK shim.cmd'
        batch.write_text('@echo off\n"' + sys.executable + '" "' + str(recorder) + '" %*\n', encoding='utf-8')
        values = ['space value', "apostrophe's", 'amp&echo WRAPPER_INJECTION', 'pipe|echo WRAPPER_INJECTION']
        result = self.wrapper(values, batch)
        self.assertTrue(result['ok'], result)
        self.assertEqual(json.loads(result['value']), values)

    def test_batch_expansion_and_quote_characters_fail_explicitly(self):
        batch = self.work / 'SDK shim.cmd'
        batch.write_text('@echo should-not-run\n', encoding='ascii')
        for argument in ['%MOVIEBOX_WRAPPER_TEST%', '!EXPANSION!', 'caret^value', 'double"quote', 'line\nbreak']:
            with self.subTest(argument=argument):
                result = self.wrapper([argument], batch)
                self.assertFalse(result['ok'])
                self.assertIn('cannot contain', result['error'])
                self.assertNotIn('should-not-run', result['error'])

    def test_batch_sdk_style_delayed_expansion_and_call_boundaries(self):
        recorder = self.work / 'record args.py'
        recorder.write_text('import json,sys\nprint(json.dumps(sys.argv[1:]))\n', encoding='utf-8')
        batch = self.work / 'SDK CALL shim.cmd'
        batch.write_text('@echo off\nsetlocal enableDelayedExpansion\ncall :record %*\nexit /b %errorlevel%\n:record\n"' + sys.executable + '" "' + str(recorder) + '" %*\nexit /b %errorlevel%\n', encoding='utf-8')
        values = ['space value', "apostrophe's", 'amp&echo WRAPPER_INJECTION', 'pipe|echo WRAPPER_INJECTION']
        result = self.wrapper(values, batch)
        self.assertTrue(result['ok'], result)
        self.assertEqual(json.loads(result['value']), values)

    def test_nonzero_exit_preserves_failure_stage_and_output(self):
        result = self.wrapper(['-c', 'import sys;print(12345);sys.exit(7)'])
        self.assertFalse(result['ok'])
        self.assertIn('failed (7)', result['error'])
        self.assertIn('12345', result['error'])

    def test_timeout_is_bounded_and_reports_no_uninstall(self):
        started = time.monotonic()
        result = self.wrapper(['-c', 'import time;time.sleep(30)'], timeout=1)
        self.assertFalse(result['ok'])
        self.assertIn('timed out after 1 seconds', result['error'])
        self.assertIn('No uninstall', result['error'])
        self.assertLess(time.monotonic()-started, 8)

    def test_inherited_output_pipe_wait_is_bounded(self):
        started = time.monotonic()
        marker = self.work/'owned-child.pid'
        code = "import subprocess,sys,pathlib;p=subprocess.Popen([sys.executable,'-c','import time;time.sleep(12)']);pathlib.Path(" + repr(str(marker)) + ").write_text(str(p.pid));print(12345)"
        try:
            result = self.wrapper(['-c', code], timeout=1)
            self.assertFalse(result['ok'], result)
            self.assertIn('timed out waiting for output', result['error'])
            self.assertLess(time.monotonic()-started, 3.5)
        finally:
            # This PID comes only from our owned fixture; no SDK/TV process exists.
            if marker.exists():
                try:
                    os.kill(int(marker.read_text()), signal.SIGTERM)
                except ProcessLookupError:
                    pass

    def run_fake_installer(self, *, platform='10.0', vendor='Samsung', profile='tv', post_app=True, launch=True):
        sdk = self.work/'Fake SDK'
        (sdk/'tools/ide/bin').mkdir(parents=True)
        (sdk/'tools/sdb.exe').write_bytes(b'not executable - never called')
        (sdk/'tools/ide/bin/tizen.bat').write_text('exit /b 99', encoding='ascii')
        widget = self.work/'owned.wgt'
        with zipfile.ZipFile(widget, 'w') as archive:
            archive.writestr('config.xml', '<widget/>')
        # Replace only the function with a fake and the reviewed digest with our
        # owned fixture digest in an isolated copy. Production source is untouched.
        text = SOURCE.read_text(encoding='utf-8-sig')
        start = text.index('function Invoke-SdkCommand {')
        end = text.index("\nif (-not $TvAddress)", start)
        log = self.work/'calls.jsonl'
        fake = '''function Invoke-SdkCommand {
 param([string]$Executable,[string[]]$CommandArguments,[int]$TimeoutSeconds)
 Add-Content -LiteralPath LOGPATH -Value (ConvertTo-Json -Compress @{args=$CommandArguments;timeout=$TimeoutSeconds})
 if($CommandArguments -contains 'capability'){return "profile_name:PROFILE`nvendor_name:VENDOR`nplatform_version:PLATFORM`n"}
 if($CommandArguments -contains 'applist'){
  $script:inventoryCount++
  if($script:inventoryCount -eq 1 -or POSTAPP){return 'MBoxTV2025.MovieBox'}
  return 'OtherApp.Other'
 }
 if($CommandArguments[0] -eq 'package'){
  $out=$CommandArguments[[Array]::IndexOf($CommandArguments,'-o')+1]
  [IO.File]::WriteAllText((Join-Path $out 'Owned.wgt'),'owned fake signed placeholder')
 }
 if($CommandArguments -contains 'was_execute'){return LAUNCHTEXT}
 return 'OK'
}
'''.replace('LOGPATH', literal(log)).replace('PROFILE', profile).replace('VENDOR', vendor).replace('PLATFORM', platform)
        fake = fake.replace('POSTAPP', '$true' if post_app else '$false').replace('LAUNCHTEXT', literal('app_id[MBoxTV2025.MovieBox] launched' if launch else 'unconfirmed'))
        text = text[:start] + fake + text[end:]
        text = re.sub(r"\$expectedHash = '[0-9a-fA-F]{64}'", "$expectedHash = '" + hashlib.sha256(widget.read_bytes()).hexdigest() + "'", text)
        script = self.work/'Installer fixture.ps1'
        script.write_text(text, encoding='utf-8-sig')
        command = '& ' + literal(script) + ' -TvAddress 127.0.0.1 -Profile ' + literal('Owned Test Profile') + ' -SdkRoot ' + literal(sdk) + ' -WidgetPath ' + literal(widget)
        result = self.powershell(command, timeout=15)
        calls = [json.loads(line) for line in log.read_text(encoding='utf-8-sig').splitlines()] if log.exists() else []
        self.assertFalse(any('uninstall' in call['args'] for call in calls))
        return result, calls

    def test_same_identity_in_place_flow_uses_bounded_selected_target(self):
        result, calls = self.run_fake_installer()
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertIn('launch confirmed on Tizen 10.0', result.stdout)
        self.assertEqual([call['timeout'] for call in calls], [15, 15, 20, 90, 120, 20, 20])
        self.assertTrue(all('127.0.0.1:26101' in call['args'] for call in calls if call['args'][0] != 'package'))

    def test_legacy_minimum_not_future_version_ceiling(self):
        result, _ = self.run_fake_installer(platform='7.0')
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)

    def test_non_samsung_capability_stops_before_signing(self):
        result, calls = self.run_fake_installer(vendor='Other')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 2)

    def test_below_minimum_platform_stops_before_signing(self):
        result, calls = self.run_fake_installer(platform='6.5')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 2)

    def test_missing_post_install_app_prevents_launch(self):
        result, calls = self.run_fake_installer(post_app=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('not listed', result.stderr)
        self.assertFalse(any('was_execute' in call['args'] for call in calls))

    def test_unconfirmed_launch_is_not_success(self):
        result, _ = self.run_fake_installer(launch=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('launch was not confirmed', result.stderr)


if __name__ == '__main__':
    unittest.main()
