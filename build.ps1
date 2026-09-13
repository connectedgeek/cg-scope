# CG Scope build script.
#
# Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
# Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
#
# This file carries no version number. The extension's version lives in
# manifest.json and nowhere else. See "Versioning" in CLAUDE.md for why.
#
# One script with arguments, never two scripts. Two near-identical scripts
# diverge; see LESSONS-LEARNED.md item 9.
#
#   .\build.ps1 check      run the guards. Produces no artifacts.
#   .\build.ps1 selftest   prove the guards can fail, using fixtures.
#   .\build.ps1 version    report the extension version from manifest.json.
#   .\build.ps1 package    not implemented yet. Refuses rather than pretending.
#
# ---------------------------------------------------------------------------
# Why the network scanner is deliberately crude
# ---------------------------------------------------------------------------
# The honest way to know whether source code calls fetch() is to parse it. A
# regex-based comment and string stripper written by hand has real edge cases:
# regex literals containing quotes, template literals with nested strings,
# division that looks like a regex. On the previous project exactly this kind of
# stripper shipped with half of itself disabled, because one counter was shared
# between line comments and block comments, and three guards passed by matching
# text in their own comments rather than their subject.
#
# So this scanner does not try to be clever. It matches the forbidden
# identifiers ANYWHERE in the file, including inside comments and strings.
#
# The consequence is that you may not write the word "fetch" in a comment in
# src/. That is a small price. The important property is the direction of the
# error: a scanner that over-triggers fails loudly and is fixed in ten seconds,
# whereas a scanner that under-triggers passes silently and is the exact defect
# shape this project exists to avoid. Invariant 4 warns about guards that match
# adjacent text and therefore PASS. Being conservative fails in the safe
# direction.
#
# If a finding is a false positive, the fix is to reword the comment, not to
# weaken the pattern.

param(
    [Parameter(Position = 0)]
    [ValidateSet('check', 'selftest', 'version', 'package')]
    [string]$Task = 'check'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
$SrcRoot  = Join-Path $RepoRoot 'src'

# ---------------------------------------------------------------------------
# The forbidden constructs
# ---------------------------------------------------------------------------
# Each entry names the invariant it enforces, so a future reader can argue with
# the reasoning rather than with a regex.

$Forbidden = @(
    @{ Pattern = '\bfetch\b';             Why = 'invariant 11: no network requests' }
    @{ Pattern = '\bXMLHttpRequest\b';    Why = 'invariant 11: no network requests' }
    @{ Pattern = '\bsendBeacon\b';        Why = 'invariant 11: no network requests' }
    @{ Pattern = '\bEventSource\b';       Why = 'invariant 11: no network requests' }
    @{ Pattern = '\bWebSocket\b';         Why = 'invariant 11: no network requests' }
    @{ Pattern = '\bRTCPeerConnection\b'; Why = 'invariant 11: a peer connection is an exfiltration path' }
    @{ Pattern = '\bimportScripts\b';     Why = 'invariant 7: no remotely hosted code' }
    @{ Pattern = '\beval\s*\(';           Why = 'invariant 7: no remotely hosted code' }
    @{ Pattern = 'new\s+Function\s*\(';   Why = 'invariant 7: no remotely hosted code' }
    @{ Pattern = '\bimport\s*\(';         Why = 'invariant 7: dynamic import can load a URL. Static imports are fine.' }
    @{ Pattern = 'https?://';             Why = 'invariant 11: an absolute URL in src/ is either a request or a link off-package' }
)

# Absolute URLs that are deliberately permitted. Starts empty on purpose.
# Adding an entry here is a decision, not a convenience: write why, next to it.
$AllowedUrlSubstrings = @()

$ScannedExtensions = @('.js', '.mjs', '.html', '.htm', '.css', '.json')

# ---------------------------------------------------------------------------
# The scanner. Used by BOTH check and selftest, so that selftest is testing the
# thing that runs in production rather than a copy of it.
# ---------------------------------------------------------------------------

function Invoke-ForbiddenScan {
    param(
        [Parameter(Mandatory = $true)][string]$Root
    )

    $findings = New-Object System.Collections.ArrayList
    $scanned  = 0

    if (-not (Test-Path -LiteralPath $Root)) {
        return [pscustomobject]@{ Findings = $findings; FilesScanned = 0; Root = $Root }
    }

    $files = Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue |
             Where-Object { $ScannedExtensions -contains $_.Extension.ToLowerInvariant() }

    foreach ($file in $files) {
        $scanned++
        $lines = Get-Content -LiteralPath $file.FullName -ErrorAction Stop
        $n = 0
        foreach ($line in $lines) {
            $n++
            foreach ($rule in $Forbidden) {
                $m = [regex]::Matches($line, $rule.Pattern)
                foreach ($match in $m) {

                    # The URL rule is the only one with an allowlist.
                    if ($rule.Pattern -eq 'https?://') {
                        $permitted = $false
                        foreach ($allowed in $AllowedUrlSubstrings) {
                            if ($line -like "*$allowed*") { $permitted = $true; break }
                        }
                        if ($permitted) { continue }
                    }

                    [void]$findings.Add([pscustomobject]@{
                        File    = $file.FullName.Substring($Root.Length).TrimStart('\', '/')
                        Line    = $n
                        Match   = $match.Value
                        Why     = $rule.Why
                        Text    = $line.Trim()
                    })
                }
            }
        }
    }

    return [pscustomobject]@{ Findings = $findings; FilesScanned = $scanned; Root = $Root }
}

function Write-Findings {
    param($Result)
    foreach ($f in $Result.Findings) {
        Write-Host ("  {0}:{1}  {2}" -f $f.File, $f.Line, $f.Match) -ForegroundColor Red
        Write-Host ("      {0}" -f $f.Why) -ForegroundColor DarkGray
        Write-Host ("      {0}" -f $f.Text) -ForegroundColor DarkGray
    }
}

# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------
# manifest.json is the only place a version literal exists. Nothing else in
# this repository stores one, and nothing derives one by copying. Anything that
# needs the version at runtime reads chrome.runtime.getManifest().version.
#
# Why this is a rule rather than a preference: on the previous project a
# version file silently failed to update, the build stamped the stale value
# onto six binaries, and two different programs shipped carrying one version
# number. The check that missed it compared file sizes, which were identical
# because "0.9.16" and "0.9.17" are both seven bytes. One literal cannot
# disagree with itself.
#
# Chrome's format rules: one to four dot-separated integers, each 0 to 65535,
# no leading zeros. This is NOT semver: no prerelease suffix, no build
# metadata, no "1.0.0-beta".

function Get-ExtensionVersion {
    # Takes a path so that selftest can exercise the real validator against
    # fixtures rather than against a copy of it. See LESSONS-LEARNED.md item 9.
    param(
        [string]$ManifestPath = $null
    )

    $manifestPath = if ($ManifestPath) { $ManifestPath } else { Join-Path $RepoRoot 'manifest.json' }

    if (-not (Test-Path -LiteralPath $manifestPath)) {
        return [pscustomobject]@{
            Present = $false; Valid = $false; Version = $null
            Reason  = 'manifest.json does not exist yet (Outstanding item 2)'
        }
    }

    try {
        $raw  = Get-Content -LiteralPath $manifestPath -Raw
        $json = $raw | ConvertFrom-Json
    }
    catch {
        return [pscustomobject]@{
            Present = $true; Valid = $false; Version = $null
            Reason  = 'manifest.json is not valid JSON'
        }
    }

    $prop = $json.PSObject.Properties['version']
    if ($null -eq $prop -or [string]::IsNullOrWhiteSpace([string]$prop.Value)) {
        return [pscustomobject]@{
            Present = $true; Valid = $false; Version = $null
            Reason  = 'manifest.json has no version field'
        }
    }

    $v = [string]$prop.Value

    if ($v -notmatch '^\d+(\.\d+){0,3}$') {
        return [pscustomobject]@{
            Present = $true; Valid = $false; Version = $v
            Reason  = 'version must be one to four dot-separated integers'
        }
    }

    foreach ($part in $v.Split('.')) {
        if ($part.Length -gt 1 -and $part.StartsWith('0')) {
            return [pscustomobject]@{
                Present = $true; Valid = $false; Version = $v
                Reason  = ("segment '{0}' has a leading zero, which Chrome rejects" -f $part)
            }
        }
        if ([int64]$part -gt 65535) {
            return [pscustomobject]@{
                Present = $true; Valid = $false; Version = $v
                Reason  = ("segment '{0}' exceeds 65535" -f $part)
            }
        }
    }

    return [pscustomobject]@{
        Present = $true; Valid = $true; Version = $v; Reason = $null
    }
}

function Invoke-Version {
    $v = Get-ExtensionVersion

    if (-not $v.Present) {
        Write-Host ''
        Write-Host 'UNKNOWN: no manifest.json, so there is no version.' -ForegroundColor Yellow
        Write-Host ("  {0}" -f $v.Reason) -ForegroundColor DarkGray
        Write-Host ''
        return 2
    }

    if (-not $v.Valid) {
        Write-Host ''
        Write-Host 'FAIL: manifest.json version is not usable.' -ForegroundColor Red
        Write-Host ("  {0}" -f $v.Reason) -ForegroundColor DarkGray
        Write-Host ''
        return 1
    }

    Write-Host ''
    Write-Host ("CG Scope {0}" -f $v.Version) -ForegroundColor Green
    Write-Host '  (from manifest.json, the only place this number exists)' -ForegroundColor DarkGray
    Write-Host ''
    return 0
}

# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------

function Invoke-Check {
    Write-Host ''
    Write-Host 'CG Scope: check' -ForegroundColor Cyan
    Write-Host '---------------'

    # Version guard. Absent manifest is expected right now and is reported as
    # such. A manifest that exists with a broken version is a hard failure,
    # because a version Chrome will reject is better found here than at load.
    $v = Get-ExtensionVersion
    if ($v.Present -and -not $v.Valid) {
        Write-Host ''
        Write-Host 'FAIL: manifest.json version is not usable.' -ForegroundColor Red
        Write-Host ("  {0}" -f $v.Reason) -ForegroundColor DarkGray
        Write-Host ''
        return 1
    }
    if ($v.Valid) {
        Write-Host ("version guard: {0}" -f $v.Version)
    } else {
        Write-Host ("version guard: not applicable ({0})" -f $v.Reason) -ForegroundColor DarkGray
    }

    $result = Invoke-ForbiddenScan -Root $SrcRoot

    # Invariant 5: a check that cannot measure something reports nothing.
    # Zero files scanned is NOT a pass. It is "I could not tell", and the only
    # honest response is to fail. On the previous project a nightly purge
    # recorded six runs, all ok, all zeros, which is exactly what both a healthy
    # system and a completely broken one look like.
    if ($result.FilesScanned -eq 0) {
        Write-Host ''
        Write-Host 'UNKNOWN: no scannable files found under src/.' -ForegroundColor Yellow
        Write-Host 'Nothing was verified. This is not a pass.' -ForegroundColor Yellow
        Write-Host ("Looked in: {0}" -f $SrcRoot) -ForegroundColor DarkGray
        Write-Host ("Extensions: {0}" -f ($ScannedExtensions -join ' ')) -ForegroundColor DarkGray
        Write-Host ''
        return 2
    }

    Write-Host ("network guard: scanned {0} file(s) under src/" -f $result.FilesScanned)

    if ($result.Findings.Count -gt 0) {
        Write-Host ''
        Write-Host ("FAIL: {0} forbidden construct(s) found." -f $result.Findings.Count) -ForegroundColor Red
        Write-Findings $result
        Write-Host ''
        return 1
    }

    Write-Host 'network guard: PASS' -ForegroundColor Green
    Write-Host ''
    Write-Host 'check: PASS' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Not yet checked, because the thing being checked does not exist:' -ForegroundColor DarkGray
    Write-Host '  - manifest permissions justified in CLAUDE.md (no manifest.json yet)' -ForegroundColor DarkGray
    Write-Host '  - lint, tests (no source yet)' -ForegroundColor DarkGray
    Write-Host ''
    return 0
}

# ---------------------------------------------------------------------------
# selftest
# ---------------------------------------------------------------------------
# Invariant 3: a guard is proved by watching it fail. This runs the real
# scanner against fixtures whose answers are known, and asserts both
# directions: that clean code passes and that each forbidden construct is
# caught. A guard that has never failed is decoration.

function Invoke-SelfTest {
    Write-Host ''
    Write-Host 'CG Scope: guard selftest' -ForegroundColor Cyan
    Write-Host '------------------------'

    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("cg-scope-selftest-" + [guid]::NewGuid().ToString('N'))
    $failures = 0
    $cases    = 0

    try {
        New-Item -ItemType Directory -Path $tmp -Force | Out-Null

        # --- Case 1: clean file must produce no findings ------------------
        $clean = @'
// A tool module that reads the page and nothing else.
const rect = document.body.getBoundingClientRect();
const styles = window.getComputedStyle(document.body);
export function describe() {
  return { width: rect.width, color: styles.color };
}
'@
        $cleanDir = Join-Path $tmp 'clean'
        New-Item -ItemType Directory -Path $cleanDir -Force | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $cleanDir 'tool.js'), $clean, (New-Object System.Text.UTF8Encoding $false))

        $cases++
        $r = Invoke-ForbiddenScan -Root $cleanDir
        if ($r.FilesScanned -ne 1) {
            Write-Host '  FAIL  clean fixture: scanner did not scan the file' -ForegroundColor Red
            $failures++
        } elseif ($r.Findings.Count -ne 0) {
            Write-Host '  FAIL  clean fixture: false positive on clean code' -ForegroundColor Red
            Write-Findings $r
            $failures++
        } else {
            Write-Host '  pass  clean code produces no findings' -ForegroundColor Green
        }

        # --- Case 2: each forbidden construct must be caught ---------------
        # The expected substring is what the scanner should report as Match.
        $poison = @(
            @{ Name = 'fetch';        Code = 'const r = await fetch("/x");';                        Expect = 'fetch' }
            @{ Name = 'xhr';          Code = 'const x = new XMLHttpRequest();';                     Expect = 'XMLHttpRequest' }
            @{ Name = 'beacon';       Code = 'navigator.sendBeacon("/x", d);';                      Expect = 'sendBeacon' }
            @{ Name = 'eventsource';  Code = 'const e = new EventSource("/x");';                    Expect = 'EventSource' }
            @{ Name = 'websocket';    Code = 'const w = new WebSocket("wss://x");';                 Expect = 'WebSocket' }
            @{ Name = 'rtc';          Code = 'const p = new RTCPeerConnection();';                  Expect = 'RTCPeerConnection' }
            @{ Name = 'importscript'; Code = 'importScripts("x.js");';                              Expect = 'importScripts' }
            @{ Name = 'eval';         Code = 'eval(payload);';                                      Expect = 'eval(' }
            @{ Name = 'newfunction';  Code = 'const f = new Function("return 1");';                 Expect = 'new Function(' }
            @{ Name = 'dynimport';    Code = 'const m = await import(name);';                       Expect = 'import(' }
            @{ Name = 'url';          Code = 'const u = "https" + "://example.com";';               Expect = '' }
        )

        foreach ($p in $poison) {
            $cases++
            $dir = Join-Path $tmp $p.Name
            New-Item -ItemType Directory -Path $dir -Force | Out-Null

            # The url case needs a real absolute URL in the file; build it here
            # so that this script's own source does not contain one.
            $code = $p.Code
            if ($p.Name -eq 'url') {
                $code = 'const docs = "' + 'http' + 's://example.com/docs";'
            }

            [System.IO.File]::WriteAllText((Join-Path $dir 'tool.js'), $code, (New-Object System.Text.UTF8Encoding $false))

            $r = Invoke-ForbiddenScan -Root $dir
            if ($r.Findings.Count -eq 0) {
                Write-Host ("  FAIL  {0}: forbidden construct was NOT caught" -f $p.Name) -ForegroundColor Red
                Write-Host ("        source was: {0}" -f $code) -ForegroundColor DarkGray
                $failures++
            } else {
                Write-Host ("  pass  {0} caught ({1})" -f $p.Name, $r.Findings[0].Match) -ForegroundColor Green
            }
        }

        # --- Case 3: an empty tree must report UNKNOWN, not pass -----------
        $cases++
        $emptyDir = Join-Path $tmp 'empty'
        New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
        $r = Invoke-ForbiddenScan -Root $emptyDir
        if ($r.FilesScanned -ne 0) {
            Write-Host '  FAIL  empty tree: scanner claims to have scanned something' -ForegroundColor Red
            $failures++
        } else {
            Write-Host '  pass  empty tree reports zero files scanned' -ForegroundColor Green
        }

        # --- Case 4: near-miss identifiers must NOT trigger ----------------
        # Guards that match substrings rather than constructs produce noise
        # that gets them disabled. Prove these are safe.
        $cases++
        $nearMiss = @'
const prefetchHint = 1;
const fetchedAt = Date.now();
function evaluate(x) { return x; }
const importantValue = 2;
export { prefetchHint, fetchedAt, evaluate, importantValue };
'@
        $nmDir = Join-Path $tmp 'nearmiss'
        New-Item -ItemType Directory -Path $nmDir -Force | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $nmDir 'tool.js'), $nearMiss, (New-Object System.Text.UTF8Encoding $false))
        $r = Invoke-ForbiddenScan -Root $nmDir
        if ($r.Findings.Count -ne 0) {
            Write-Host '  FAIL  near-miss identifiers triggered the guard' -ForegroundColor Red
            Write-Findings $r
            $failures++
        } else {
            Write-Host '  pass  prefetchHint / fetchedAt / evaluate / importantValue do not trigger' -ForegroundColor Green
        }

        # --- Case 5: the version validator must reject what Chrome rejects --
        # A version guard that has never rejected anything is decoration.
        $versionCases = @(
            @{ Name = 'good 1 segment';  Json = '{"version":"3"}';          ExpectValid = $true  }
            @{ Name = 'good 3 segments'; Json = '{"version":"0.1.0"}';      ExpectValid = $true  }
            @{ Name = 'good 4 segments'; Json = '{"version":"1.2.3.4"}';    ExpectValid = $true  }
            @{ Name = 'leading zero';    Json = '{"version":"0.01.0"}';     ExpectValid = $false }
            @{ Name = 'five segments';   Json = '{"version":"1.2.3.4.5"}';  ExpectValid = $false }
            @{ Name = 'over 65535';      Json = '{"version":"1.70000"}';    ExpectValid = $false }
            @{ Name = 'semver suffix';   Json = '{"version":"1.0.0-beta"}'; ExpectValid = $false }
            @{ Name = 'empty string';    Json = '{"version":""}';           ExpectValid = $false }
            @{ Name = 'no version key';  Json = '{"name":"x"}';             ExpectValid = $false }
            @{ Name = 'malformed json';  Json = '{ not json';               ExpectValid = $false }
        )

        $vDir = Join-Path $tmp 'versions'
        New-Item -ItemType Directory -Path $vDir -Force | Out-Null
        $i = 0
        foreach ($vc in $versionCases) {
            $cases++
            $i++
            $p = Join-Path $vDir ("m{0}.json" -f $i)
            [System.IO.File]::WriteAllText($p, $vc.Json, (New-Object System.Text.UTF8Encoding $false))
            $res = Get-ExtensionVersion -ManifestPath $p
            if ($res.Valid -eq $vc.ExpectValid) {
                Write-Host ("  pass  version '{0}' -> valid={1}" -f $vc.Name, $res.Valid) -ForegroundColor Green
            } else {
                Write-Host ("  FAIL  version '{0}': expected valid={1}, got valid={2} ({3})" -f `
                            $vc.Name, $vc.ExpectValid, $res.Valid, $res.Reason) -ForegroundColor Red
                $failures++
            }
        }

        # --- Case 6: a missing manifest is UNKNOWN, not invalid, not valid --
        $cases++
        $missing = Get-ExtensionVersion -ManifestPath (Join-Path $vDir 'does-not-exist.json')
        if ($missing.Present -eq $false -and $missing.Valid -eq $false) {
            Write-Host '  pass  missing manifest reports Present=false' -ForegroundColor Green
        } else {
            Write-Host '  FAIL  missing manifest did not report Present=false' -ForegroundColor Red
            $failures++
        }
    }
    finally {
        if (Test-Path -LiteralPath $tmp) {
            Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host ''
    if ($failures -gt 0) {
        Write-Host ("selftest: FAIL  ({0} of {1} cases failed)" -f $failures, $cases) -ForegroundColor Red
        Write-Host 'The guard cannot be trusted until this passes.' -ForegroundColor Red
        Write-Host ''
        return 1
    }

    Write-Host ("selftest: PASS  ({0} cases)" -f $cases) -ForegroundColor Green
    Write-Host ''
    return 0
}

# ---------------------------------------------------------------------------
# package
# ---------------------------------------------------------------------------

function Invoke-Package {
    Write-Host ''
    Write-Host 'package: NOT IMPLEMENTED' -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'This refuses rather than producing something that looks like a'
    Write-Host 'release. Per CLAUDE.md the package step must refuse when the'
    Write-Host 'tree is dirty, the version was not bumped, check fails, a'
    Write-Host 'permission has no justification, or PENDING-DISCLOSURES.md has'
    Write-Host 'an unresolved item. None of those refusals exist yet, and a'
    Write-Host 'package step without them is worse than no package step.'
    Write-Host ''
    Write-Host 'Outstanding item 11. Not before item 10.'
    Write-Host ''
    return 1
}

# ---------------------------------------------------------------------------

switch ($Task) {
    'check'    { exit (Invoke-Check) }
    'selftest' { exit (Invoke-SelfTest) }
    'version'  { exit (Invoke-Version) }
    'package'  { exit (Invoke-Package) }
}
