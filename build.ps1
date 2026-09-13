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
#   .\build.ps1 package    everything check does, then the zip, then read it
#                          back and look inside it.
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
# Version bump
# ---------------------------------------------------------------------------
# The rule in CLAUDE.md is that the version moves when shipping files change.
# It was written down, it was not enforced by anything, and on 2026-09-13 a
# whole tool landed at the previous version and was caught by a person reading
# the popup. That is lesson 5: a rule enforced by nobody is a note to somebody
# who is busy.
#
# The discipline this enforces is "bump when you start a change, not when you
# finish it". Once the version has moved, every subsequent run passes until the
# change is committed. Bumping at the end means the check fails at exactly the
# moment you are trying to ship, which is when a person is most likely to wave
# it through.
#
# The decision is a pure function so the selftest can exercise it without
# constructing git repositories. The git plumbing is separate and is allowed to
# report "cannot tell", which is a distinct answer from "fine".

function Get-VersionBumpVerdict {
    param(
        [string]$HeadVersion,
        [string]$CurrentVersion,
        [int]$ChangedCount
    )

    if ([string]::IsNullOrWhiteSpace($HeadVersion)) {
        return [pscustomobject]@{ Ok = $true; Known = $false
            Reason = 'no committed manifest.json to compare against' }
    }
    if ($ChangedCount -le 0) {
        return [pscustomobject]@{ Ok = $true; Known = $true
            Reason = 'no shipping files changed since HEAD' }
    }
    if ($CurrentVersion -ne $HeadVersion) {
        return [pscustomobject]@{ Ok = $true; Known = $true
            Reason = ("version moved {0} -> {1}" -f $HeadVersion, $CurrentVersion) }
    }
    return [pscustomobject]@{ Ok = $false; Known = $true
        Reason = ("{0} shipping file(s) changed since HEAD but the version is still {1}. Bump manifest.json before continuing; see Versioning in CLAUDE.md." -f $ChangedCount, $CurrentVersion) }
}

# Paths whose contents reach a user. Documents and build tooling are excluded
# deliberately: correcting a typo in CLAUDE.md is not a new version of the
# extension, and treating it as one would make the rule noise.
$ShippingPaths = @('manifest.json', 'src', 'icons')

function Get-GitBumpState {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        return [pscustomobject]@{ Available = $false; HeadVersion = $null; ChangedCount = 0
            Note = 'git is not on PATH' }
    }

    Push-Location $RepoRoot
    try {
        git rev-parse --verify HEAD 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            return [pscustomobject]@{ Available = $false; HeadVersion = $null; ChangedCount = 0
                Note = 'no commits yet' }
        }

        $headManifest = git show HEAD:manifest.json 2>$null
        $headVersion = $null
        if ($LASTEXITCODE -eq 0 -and $headManifest) {
            try { $headVersion = ($headManifest | ConvertFrom-Json).version } catch { $headVersion = $null }
        }

        $modified = @(git diff --name-only HEAD -- $ShippingPaths 2>$null)
        $untracked = @(git ls-files --others --exclude-standard -- $ShippingPaths 2>$null)
        $changed = @($modified + $untracked | Where-Object { $_ } | Select-Object -Unique)

        return [pscustomobject]@{
            Available = $true; HeadVersion = $headVersion
            ChangedCount = $changed.Count; Changed = $changed; Note = $null
        }
    }
    finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# Permission justification
# ---------------------------------------------------------------------------
# Invariant 8: every permission in manifest.json has an entry in the
# Permissions table in CLAUDE.md naming the feature that needs it, and a
# permission whose feature was deleted is removed in the same commit.
#
# This guard checks BOTH directions, because both are failures:
#   - a permission in the manifest with no justification is an unexplained
#     capability, which is the most common reason a submission is queried
#   - a justification with no permission is a document describing an extension
#     that no longer exists, which is how CLAUDE.md stops being trusted
#
# It also enforces that host_permissions is empty, per "Settled" in CLAUDE.md.
# That is a design decision with a written argument behind it, so the guard
# makes changing it a deliberate act rather than a quiet one.
#
# Note on why justifications are not comments in manifest.json: JSON does not
# have comments, and Chrome rejects or warns on unrecognised keys. CLAUDE.md is
# where the reasoning lives, and this guard is what keeps the two in step.

function Get-PermissionAudit {
    param(
        [string]$ManifestPath = $null,
        [string]$DocPath = $null
    )

    $manifestPath = if ($ManifestPath) { $ManifestPath } else { Join-Path $RepoRoot 'manifest.json' }
    $docPath      = if ($DocPath)      { $DocPath }      else { Join-Path $RepoRoot 'CLAUDE.md' }

    $problems = New-Object System.Collections.ArrayList

    if (-not (Test-Path -LiteralPath $manifestPath)) {
        return [pscustomobject]@{
            Present = $false; Ok = $false; Problems = $problems
            Manifest = @(); Documented = @()
        }
    }

    try {
        $json = (Get-Content -LiteralPath $manifestPath -Raw) | ConvertFrom-Json
    }
    catch {
        [void]$problems.Add('manifest.json is not valid JSON')
        return [pscustomobject]@{
            Present = $true; Ok = $false; Problems = $problems
            Manifest = @(); Documented = @()
        }
    }

    function Get-JsonArray($obj, $name) {
        $p = $obj.PSObject.Properties[$name]
        if ($null -eq $p -or $null -eq $p.Value) { return @() }
        return @($p.Value)
    }

    $required = Get-JsonArray $json 'permissions'
    $optional = Get-JsonArray $json 'optional_permissions'
    $hosts    = @(Get-JsonArray $json 'host_permissions') + @(Get-JsonArray $json 'optional_host_permissions')
    $declared = @($required) + @($optional)

    # Parse the Permissions table out of the document. Only table rows count:
    # the "Deliberately absent" bullets below the table also contain backticked
    # permission names, and counting those would let a permission be justified
    # by the sentence explaining that it is NOT used. That is invariant 4,
    # matching adjacent text rather than the construct.
    $documented = New-Object System.Collections.ArrayList
    if (Test-Path -LiteralPath $docPath) {
        $inSection = $false
        foreach ($line in (Get-Content -LiteralPath $docPath)) {
            if ($line -match '^##\s+Permissions\s*$') { $inSection = $true; continue }
            if ($inSection -and $line -match '^---\s*$') { break }
            if ($inSection -and $line -match '^\|\s*`([A-Za-z_][A-Za-z0-9_]*)`') {
                [void]$documented.Add($Matches[1])
            }
        }
    }
    else {
        [void]$problems.Add(("CLAUDE.md not found at {0}" -f $docPath))
    }

    foreach ($p in $declared) {
        if ($documented -notcontains $p) {
            [void]$problems.Add(("permission '{0}' is in manifest.json but has no row in the CLAUDE.md Permissions table" -f $p))
        }
    }

    foreach ($d in $documented) {
        if ($declared -notcontains $d) {
            [void]$problems.Add(("permission '{0}' is justified in CLAUDE.md but is not in manifest.json. Remove the justification or add the permission." -f $d))
        }
    }

    foreach ($h in $hosts) {
        [void]$problems.Add(("host permission '{0}' is declared. CLAUDE.md Settled says there are none; activeTab covers invocation-time access. Change the decision in writing first." -f $h))
    }

    return [pscustomobject]@{
        Present    = $true
        Ok         = ($problems.Count -eq 0)
        Problems   = $problems
        Manifest   = $declared
        Documented = @($documented)
    }
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

    # Bump guard. Only meaningful once there is a commit to compare against.
    if ($v.Valid) {
        $git = Get-GitBumpState
        if (-not $git.Available) {
            Write-Host ("bump guard: cannot tell ({0})" -f $git.Note) -ForegroundColor DarkGray
        }
        else {
            $verdict = Get-VersionBumpVerdict -HeadVersion $git.HeadVersion `
                                              -CurrentVersion $v.Version `
                                              -ChangedCount $git.ChangedCount
            if (-not $verdict.Ok) {
                Write-Host ''
                Write-Host 'FAIL: the version was not bumped.' -ForegroundColor Red
                Write-Host ("  {0}" -f $verdict.Reason) -ForegroundColor DarkGray
                foreach ($f in $git.Changed) { Write-Host ("    {0}" -f $f) -ForegroundColor DarkGray }
                Write-Host ''
                return 1
            }
            Write-Host ("bump guard: {0}" -f $verdict.Reason)
        }
    }

    # Permission guard. Same shape as the version guard: absent manifest is
    # reported as not applicable, a present manifest is checked properly.
    $perm = Get-PermissionAudit
    if ($perm.Present) {
        if (-not $perm.Ok) {
            Write-Host ''
            Write-Host 'FAIL: permissions and their justifications disagree.' -ForegroundColor Red
            foreach ($p in $perm.Problems) {
                Write-Host ("  {0}" -f $p) -ForegroundColor Red
            }
            Write-Host ''
            return 1
        }
        Write-Host ("permission guard: {0} declared, all justified in CLAUDE.md" -f $perm.Manifest.Count)
    }
    else {
        Write-Host 'permission guard: not applicable (no manifest.json)' -ForegroundColor DarkGray
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
    Write-Host 'Not checked, and this list is the honest scope of what PASS means:' -ForegroundColor DarkGray
    Write-Host '  - no lint (no linter configured)' -ForegroundColor DarkGray
    Write-Host '  - no unit tests of tool behaviour (no tools yet)' -ForegroundColor DarkGray
    Write-Host '  - nothing here executes the extension. Only Chrome does that.' -ForegroundColor DarkGray
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

        # --- Case 7: the permission guard must catch both directions --------
        $pDir = Join-Path $tmp 'perms'
        New-Item -ItemType Directory -Path $pDir -Force | Out-Null

        # A stand-in CLAUDE.md justifying exactly two permissions. The trailing
        # bullet is the trap: it names a permission in prose that the guard
        # must NOT count as justified, because it is the sentence saying the
        # permission is deliberately absent.
        $fakeDoc = @'
## Permissions

| Permission | Feature that needs it |
|---|---|
| `activeTab` | Every tool. |
| `storage` | Preferences. |

Deliberately absent:

- No `tabs`. It grants URL and title of every tab.

---

## Next section
'@
        $docPath = Join-Path $pDir 'CLAUDE.md'
        [System.IO.File]::WriteAllText($docPath, $fakeDoc, (New-Object System.Text.UTF8Encoding $false))

        $permCases = @(
            @{ Name = 'all justified';        Json = '{"permissions":["activeTab","storage"]}';                 ExpectOk = $true  }
            @{ Name = 'undocumented perm';    Json = '{"permissions":["activeTab","storage","cookies"]}';        ExpectOk = $false }
            @{ Name = 'documented but gone';  Json = '{"permissions":["activeTab"]}';                            ExpectOk = $false }
            @{ Name = 'host permission';      Json = '{"permissions":["activeTab","storage"],"host_permissions":["*://*/*"]}'; ExpectOk = $false }
            @{ Name = 'prose is not a row';   Json = '{"permissions":["activeTab","storage","tabs"]}';           ExpectOk = $false }
        )

        $j = 0
        foreach ($pc in $permCases) {
            $cases++
            $j++
            $mp = Join-Path $pDir ("manifest{0}.json" -f $j)
            [System.IO.File]::WriteAllText($mp, $pc.Json, (New-Object System.Text.UTF8Encoding $false))
            $res = Get-PermissionAudit -ManifestPath $mp -DocPath $docPath
            if ($res.Ok -eq $pc.ExpectOk) {
                Write-Host ("  pass  permissions '{0}' -> ok={1}" -f $pc.Name, $res.Ok) -ForegroundColor Green
            } else {
                Write-Host ("  FAIL  permissions '{0}': expected ok={1}, got ok={2}" -f `
                            $pc.Name, $pc.ExpectOk, $res.Ok) -ForegroundColor Red
                foreach ($prob in $res.Problems) { Write-Host ("        {0}" -f $prob) -ForegroundColor DarkGray }
                $failures++
            }
        }

        # --- Case 8: optional_permissions count as declared -----------------
        # A permission requested at runtime still needs a justification; it is
        # not exempt for being optional.
        $cases++
        $mp = Join-Path $pDir 'manifest-optional.json'
        [System.IO.File]::WriteAllText($mp, '{"permissions":["activeTab","storage"],"optional_permissions":["downloads"]}', (New-Object System.Text.UTF8Encoding $false))
        $res = Get-PermissionAudit -ManifestPath $mp -DocPath $docPath
        if ($res.Ok -eq $false) {
            Write-Host '  pass  an undocumented optional_permission is caught' -ForegroundColor Green
        } else {
            Write-Host '  FAIL  optional_permissions were not checked' -ForegroundColor Red
            $failures++
        }

        # --- Case 9: the bump verdict ---------------------------------------
        # Pure function, so no git repository is needed to exercise it. The
        # case that matters is the last one: it is the failure that actually
        # happened, on 2026-09-13, when a tool shipped at the old version.
        $bumpCases = @(
            @{ Name = 'changed and bumped';    Head = '0.1.0'; Cur = '0.2.0'; N = 5; ExpectOk = $true  }
            @{ Name = 'changed, not bumped';   Head = '0.1.0'; Cur = '0.1.0'; N = 5; ExpectOk = $false }
            @{ Name = 'nothing changed';       Head = '0.1.0'; Cur = '0.1.0'; N = 0; ExpectOk = $true  }
            @{ Name = 'no head to compare';    Head = '';      Cur = '0.1.0'; N = 5; ExpectOk = $true  }
            @{ Name = 'one file, not bumped';  Head = '0.2.0'; Cur = '0.2.0'; N = 1; ExpectOk = $false }
        )

        foreach ($bc in $bumpCases) {
            $cases++
            $res = Get-VersionBumpVerdict -HeadVersion $bc.Head -CurrentVersion $bc.Cur -ChangedCount $bc.N
            if ($res.Ok -eq $bc.ExpectOk) {
                Write-Host ("  pass  bump '{0}' -> ok={1}" -f $bc.Name, $res.Ok) -ForegroundColor Green
            } else {
                Write-Host ("  FAIL  bump '{0}': expected ok={1}, got ok={2} ({3})" -f `
                            $bc.Name, $bc.ExpectOk, $res.Ok, $res.Reason) -ForegroundColor Red
                $failures++
            }
        }

        # --- Case 10: which files ship ---------------------------------------
        # The filter decides what a user receives. A mistake here ships a test
        # fixture or a notes file, which is what RELEASING.md step 4 exists to
        # catch by hand; this catches it earlier.
        $cases++
        $candidates = @(
            'manifest.json', 'src/popup/popup.js', 'src/tools/ruler.js',
            'icons/icon16.png',
            'CLAUDE.md', 'README.md', 'build.ps1', 'docs/RELEASING.md',
            'test/hostile.html', 'tools/png-strip.mjs', '.gitignore',
            'dist/cg-scope-0.1.0.zip',
            # Inside src/ and still excluded. The first version of the filter
            # kept these, which contradicted the post-build inspection.
            'src/popup/popup.js.map', 'src/.env.local', 'src/.DS_Store'
        )
        $expected = @('manifest.json', 'src/popup/popup.js', 'src/tools/ruler.js',
                      'icons/icon16.png')
        $got = @(Select-ShippingPaths -Paths $candidates)
        $missing = @($expected | Where-Object { $got -notcontains $_ })
        $extra   = @($got | Where-Object { $expected -notcontains $_ })
        if ($missing.Count -eq 0 -and $extra.Count -eq 0) {
            Write-Host '  pass  the shipping filter keeps manifest, src and icons and nothing else' -ForegroundColor Green
        } else {
            Write-Host '  FAIL  shipping filter' -ForegroundColor Red
            foreach ($m in $missing) { Write-Host ("        missing: {0}" -f $m) -ForegroundColor DarkGray }
            foreach ($e in $extra)   { Write-Host ("        extra  : {0}" -f $e) -ForegroundColor DarkGray }
            $failures++
        }

        # --- Case 10b: what is allowed inside the package --------------------
        # These cases exist because the inline version of this check shipped
        # passing and unable to fail. The 'backslashed' cases are the ones that
        # matter: they are the exact shape the archive actually produced, and
        # the old check returned clean on them.
        $pkgCases = @(
            @{ Name = 'clean, forward slashes';
               E = @('manifest.json', 'src/popup/popup.js', 'icons/icon16.png');
               ExpectClean = $true }
            @{ Name = 'backslash entry names';
               E = @('manifest.json', 'src\popup\popup.js', 'icons\icon16.png');
               ExpectClean = $false }
            @{ Name = 'a doc slipped in';
               E = @('manifest.json', 'docs/RELEASING.md');
               ExpectClean = $false }
            @{ Name = 'a doc slipped in, backslashed';
               E = @('manifest.json', 'docs\RELEASING.md');
               ExpectClean = $false }
            @{ Name = 'no manifest';
               E = @('src/popup/popup.js');
               ExpectClean = $false }
            @{ Name = 'nothing at all';
               E = @();
               ExpectClean = $false }
        )

        foreach ($pc in $pkgCases) {
            $cases++
            $probs = @(Test-PackageEntries -Entries $pc.E)
            $clean = ($probs.Count -eq 0)
            if ($clean -eq $pc.ExpectClean) {
                Write-Host ("  pass  package entries '{0}' -> clean={1}" -f $pc.Name, $clean) -ForegroundColor Green
            } else {
                Write-Host ("  FAIL  package entries '{0}': expected clean={1}, got clean={2}" -f `
                            $pc.Name, $pc.ExpectClean, $clean) -ForegroundColor Red
                foreach ($pp in $probs) { Write-Host ("        {0}" -f $pp) -ForegroundColor DarkGray }
                $failures++
            }
        }

        # --- Case 11: the disclosure gate ------------------------------------
        # This is the gate that was written in bold in two documents on the
        # previous project and walked past anyway. It has to be provably able
        # to refuse.
        $dDir = Join-Path $tmp 'disclosures'
        New-Item -ItemType Directory -Path $dDir -Force | Out-Null

        $discCases = @(
            @{ Name = 'empty marker';   Body = "## Pending`n`n*(empty)*`n";                          ExpectClear = $true  }
            @{ Name = 'one entry';      Body = "## Pending`n`n## 2026-09-13: started storing X`n";    ExpectClear = $false }
            @{ Name = 'template only';  Body = "## Pending`n`n*(empty)*`n`n<!--`nTemplate:`nstuff`n-->`n"; ExpectClear = $true  }
            @{ Name = 'entry then tmpl';Body = "## Pending`n`n## a thing`n`n<!--`nTemplate`n-->`n";    ExpectClear = $false }
        )
        $k = 0
        foreach ($dc in $discCases) {
            $cases++
            $k++
            $dp = Join-Path $dDir ("d{0}.md" -f $k)
            [System.IO.File]::WriteAllText($dp, $dc.Body, (New-Object System.Text.UTF8Encoding $false))
            $res = Test-DisclosuresClear -Path $dp
            if ($res.Clear -eq $dc.ExpectClear) {
                Write-Host ("  pass  disclosures '{0}' -> clear={1}" -f $dc.Name, $res.Clear) -ForegroundColor Green
            } else {
                Write-Host ("  FAIL  disclosures '{0}': expected clear={1}, got clear={2} ({3})" -f `
                            $dc.Name, $dc.ExpectClear, $res.Clear, $res.Reason) -ForegroundColor Red
                $failures++
            }
        }

        # A missing gate is not an open one.
        $cases++
        $res = Test-DisclosuresClear -Path (Join-Path $dDir 'does-not-exist.md')
        if ($res.Clear -eq $false) {
            Write-Host '  pass  a missing disclosures file refuses rather than passing' -ForegroundColor Green
        } else {
            Write-Host '  FAIL  a missing disclosures file was treated as clear' -ForegroundColor Red
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
# Every refusal below replaces a person remembering. The previous project's
# build script earned its keep the day it refused a release that would have
# published two different binaries under one version number.
#
# The two mistakes this exists to make impossible, per RELEASING.md:
# shipping a version whose disclosures are not published, and shipping a
# package whose contents nobody looked at.

# What reaches a user. Everything else in the repository is for the people
# working on it: documents, the build script, the test fixture, the icon
# tooling. A pure function so the selftest can exercise it without a filesystem.
function Select-ShippingPaths {
    param([string[]]$Paths)
    $keep = New-Object System.Collections.ArrayList
    foreach ($p in $Paths) {
        $n = $p.Replace('\', '/').TrimStart('./')

        if (-not ($n -eq 'manifest.json' -or $n -like 'src/*' -or $n -like 'icons/*')) { continue }

        # Excluded even inside the shipping directories. RELEASING.md step 4
        # says to look for source maps, .env files and stray dotfiles by hand
        # before uploading; the filter should mean there is nothing there to
        # find. The post-build inspection checks for them again, and the first
        # version of this function disagreed with that inspection: it kept
        # .map files, so the zip would have been built and then deleted. Two
        # guards contradicting each other is how the wrong one gets found.
        $leaf = $n.Substring($n.LastIndexOf('/') + 1)
        if ($n -like '*.map' -or $n -like '*.env*' -or $leaf.StartsWith('.')) { continue }

        [void]$keep.Add($n)
    }
    return @($keep)
}

# PENDING-DISCLOSURES.md must be empty before a version is published. That rule
# existed in bold in two documents on the previous project and was walked past
# anyway, because nothing enforced it. This is the enforcement.
function Test-DisclosuresClear {
    param([string]$Path = $null)
    $p = if ($Path) { $Path } else { Join-Path $RepoRoot 'docs/PENDING-DISCLOSURES.md' }

    if (-not (Test-Path -LiteralPath $p)) {
        return [pscustomobject]@{ Clear = $false; Items = @()
            Reason = 'docs/PENDING-DISCLOSURES.md is missing. It is a gate, and a missing gate is not an open one.' }
    }

    $items = New-Object System.Collections.ArrayList
    $inPending = $false
    foreach ($line in (Get-Content -LiteralPath $p)) {
        if ($line -match '^##\s+Pending\s*$') { $inPending = $true; continue }
        if (-not $inPending) { continue }
        # The commented-out template at the end of the file is not an entry.
        if ($line -match '^\s*<!--') { break }
        $t = $line.Trim()
        if ($t -eq '' -or $t -eq '*(empty)*') { continue }
        [void]$items.Add($t)
    }

    if ($items.Count -gt 0) {
        return [pscustomobject]@{ Clear = $false; Items = @($items)
            Reason = ("{0} unresolved item(s) under ## Pending" -f $items.Count) }
    }
    return [pscustomobject]@{ Clear = $true; Items = @(); Reason = 'nothing pending' }
}

# ---------------------------------------------------------------------------
# What is allowed to be inside the package
# ---------------------------------------------------------------------------
# Separated from Invoke-Package so it can be tested against entry names without
# building an archive.
#
# The first version of this check lived inline and compared entry names against
# patterns written with forward slashes. The names it was handed contained
# backslashes, because .NET's CreateFromDirectory stamps the platform separator
# into the archive on Windows. Three of its patterns therefore could not match
# anything, ever. It passed on every run and had never been capable of failing,
# which is the definition of decoration. See defect log entry 5 in CLAUDE.md.
function Test-PackageEntries {
    param([string[]] $Entries)

    $problems = New-Object System.Collections.ArrayList

    if (-not $Entries -or $Entries.Count -eq 0) {
        [void]$problems.Add('the package is empty')
        return $problems.ToArray()
    }

    # The ZIP format specifies forward slashes. An entry named with backslashes
    # is not a path to anything on a machine that does not use them, and it is
    # also what blinded the directory checks below.
    foreach ($e in $Entries) {
        if ($e -like '*\*') {
            [void]$problems.Add("entry name contains a backslash, which the ZIP format does not use: $e")
        }
    }

    # Measured against a normalised copy, so that a name which gets past the
    # check above in some future version is still held to the rules below
    # rather than slipping through both.
    $norm = @($Entries | ForEach-Object { $_.Replace('\', '/') })

    foreach ($n in $norm) {
        if ($n -like 'docs/*' -or $n -like 'test/*' -or $n -like 'tools/*' -or
            $n -like 'dist/*' -or $n -like '*.md'   -or $n -like '.git*'   -or
            $n -like '*.ps1' -or $n -like '*.map'   -or $n -like '.env*') {
            [void]$problems.Add("contains a file that should not ship: $n")
        }
    }

    if ($norm -notcontains 'manifest.json') {
        [void]$problems.Add('no manifest.json inside the package')
    }

    return $problems.ToArray()
}

function Invoke-Package {
    Write-Host ''
    Write-Host 'CG Scope: package' -ForegroundColor Cyan
    Write-Host '-----------------'

    # 1. Everything check does. A package is never produced from a tree that
    #    would not pass the guards.
    $checkResult = Invoke-Check
    if ($checkResult -ne 0) {
        Write-Host 'REFUSED: check did not pass.' -ForegroundColor Red
        Write-Host ''
        return 1
    }

    $v = Get-ExtensionVersion
    if (-not $v.Valid) {
        Write-Host 'REFUSED: no usable version.' -ForegroundColor Red
        return 1
    }

    # 2. The disclosure gate, first among the package-only refusals because it
    #    is the one that was walked past before.
    $disc = Test-DisclosuresClear
    if (-not $disc.Clear) {
        Write-Host ''
        Write-Host 'REFUSED: disclosures are not published.' -ForegroundColor Red
        Write-Host ("  {0}" -f $disc.Reason) -ForegroundColor DarkGray
        foreach ($i in $disc.Items) { Write-Host ("    {0}" -f $i) -ForegroundColor DarkGray }
        Write-Host ''
        Write-Host '  Publish the documents first, or remove the collection from'
        Write-Host '  this release. There is no third option.'
        Write-Host ''
        return 1
    }
    Write-Host 'disclosures: nothing pending'

    # 3. A dirty tree means the artifact cannot be traced to a commit, so
    #    "is the thing in the store the thing I built" becomes unanswerable.
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        Write-Host 'REFUSED: git is not on PATH, so the tree cannot be verified clean.' -ForegroundColor Red
        return 1
    }

    Push-Location $RepoRoot
    try {
        git rev-parse --verify HEAD 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'REFUSED: no commits. A package must be traceable to one.' -ForegroundColor Red
            return 1
        }
        $dirty = @(git status --porcelain 2>$null | Where-Object { $_ })
        if ($dirty.Count -gt 0) {
            Write-Host ''
            Write-Host 'REFUSED: the working tree is dirty.' -ForegroundColor Red
            foreach ($d in $dirty) { Write-Host ("    {0}" -f $d) -ForegroundColor DarkGray }
            Write-Host ''
            return 1
        }
        $commit = (git rev-parse --short HEAD 2>$null)
    }
    finally { Pop-Location }
    Write-Host ("tree: clean at {0}" -f $commit)

    # 4. A version is packaged once. The Web Store refuses an upload whose
    #    version is not higher than the published one, which is the only free
    #    guard in the whole procedure; this catches the earlier mistake of
    #    building twice from different trees under one number.
    $distDir = Join-Path $RepoRoot 'dist'
    $zipName = 'cg-scope-' + $v.Version + '.zip'
    $zipPath = Join-Path $distDir $zipName
    if (Test-Path -LiteralPath $zipPath) {
        Write-Host ''
        Write-Host ("REFUSED: {0} already exists." -f $zipName) -ForegroundColor Red
        Write-Host '  Bump the version, or delete that file if you are certain it' -ForegroundColor DarkGray
        Write-Host '  was never uploaded. Two packages under one version number is' -ForegroundColor DarkGray
        Write-Host '  the defect this refusal exists for.' -ForegroundColor DarkGray
        Write-Host ''
        return 1
    }

    # 5. Build it.
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue

    $all = Get-ChildItem -LiteralPath $RepoRoot -Recurse -File |
           ForEach-Object { $_.FullName.Substring($RepoRoot.Length).TrimStart('\', '/') }
    $ship = Select-ShippingPaths -Paths $all

    if ($ship.Count -eq 0) {
        Write-Host 'REFUSED: no shipping files found. Nothing was verified.' -ForegroundColor Red
        return 1
    }

    if (-not (Test-Path -LiteralPath $distDir)) {
        New-Item -ItemType Directory -Path $distDir -Force | Out-Null
    }

    # Each entry is written with its name stated here, in sorted order, rather
    # than by CreateFromDirectory walking a staging copy.
    #
    # CreateFromDirectory derives entry names from the filesystem and stamps the
    # platform separator into them, so on Windows it produced names like
    # src\popup\popup.js. The ZIP format specifies forward slashes; a name with
    # backslashes is not a path to anything on a machine that does not use them.
    # See defect log entry 5 in CLAUDE.md.
    #
    # Naming each entry explicitly means the archive says what this script says
    # rather than what the filesystem says. $ship already holds forward-slash
    # relative paths, so there is nothing to convert, and the temporary staging
    # directory went away with the call that needed it.
    $archive = [System.IO.Compression.ZipFile]::Open(
        $zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($rel in ($ship | Sort-Object)) {
            $src = Join-Path $RepoRoot ($rel -replace '/', '\')
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, $src, $rel,
                [System.IO.Compression.CompressionLevel]::Optimal)
        }
    }
    finally { $archive.Dispose() }

    # 6. Look inside it. RELEASING.md step 4: not optional, and not satisfied by
    #    the build printing "done". The zip is opened and read back.
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $entries = @($zip.Entries | ForEach-Object { $_.FullName })

        $manifestEntry = $zip.Entries | Where-Object { $_.FullName -eq 'manifest.json' }
        $packagedVersion = $null
        if ($manifestEntry) {
            $reader = New-Object System.IO.StreamReader($manifestEntry.Open())
            try { $packagedVersion = ($reader.ReadToEnd() | ConvertFrom-Json).version }
            finally { $reader.Dispose() }
        }
    }
    finally { $zip.Dispose() }

    $problems = New-Object System.Collections.ArrayList
    foreach ($p in (Test-PackageEntries -Entries $entries)) { [void]$problems.Add($p) }
    if ($manifestEntry -and $packagedVersion -ne $v.Version) {
        # The previous project stamped a stale version onto six binaries and the
        # check that missed it compared file sizes. This compares the bytes that
        # are actually in the artifact.
        [void]$problems.Add("the packaged manifest says $packagedVersion, the repository says $($v.Version)")
    }

    if ($problems.Count -gt 0) {
        Write-Host ''
        Write-Host 'REFUSED: the package is wrong. Deleting it.' -ForegroundColor Red
        foreach ($p in $problems) { Write-Host ("  {0}" -f $p) -ForegroundColor DarkGray }
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
        Write-Host ''
        return 1
    }

    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
    $size = (Get-Item -LiteralPath $zipPath).Length

    # Recorded next to the artifact so that "is the thing in the store the thing
    # I built" is answerable months later.
    $record = Join-Path $distDir 'RELEASES.txt'
    $line = ('{0}  {1}  {2}  {3} files  {4} bytes  commit {5}' -f
             (Get-Date -Format 'yyyy-MM-dd HH:mm'), $v.Version, $hash, $entries.Count, $size, $commit)
    Add-Content -LiteralPath $record -Value $line -Encoding UTF8

    Write-Host ''
    Write-Host ("package: {0}" -f $zipName) -ForegroundColor Green
    Write-Host ("  {0} files, {1:N0} bytes" -f $entries.Count, $size)
    Write-Host ("  SHA-256 {0}" -f $hash) -ForegroundColor DarkGray
    Write-Host ("  recorded in dist/RELEASES.txt") -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  Contents:' -ForegroundColor DarkGray
    foreach ($e in ($entries | Sort-Object)) { Write-Host ("    {0}" -f $e) -ForegroundColor DarkGray }
    Write-Host ''
    Write-Host '  This verified the package against your intent. It did not verify' -ForegroundColor DarkGray
    Write-Host '  what the store serves. RELEASING.md step B7 is the only thing' -ForegroundColor DarkGray
    Write-Host '  that does, and it means installing from the listing on a clean' -ForegroundColor DarkGray
    Write-Host '  profile and looking.' -ForegroundColor DarkGray
    Write-Host ''
    return 0
}

# ---------------------------------------------------------------------------

switch ($Task) {
    'check'    { exit (Invoke-Check) }
    'selftest' { exit (Invoke-SelfTest) }
    'version'  { exit (Invoke-Version) }
    'package'  { exit (Invoke-Package) }
}
