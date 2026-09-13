# CG Scope

A browser extension built by Connected Geek for its own use. It is a one-click
way to look closely at the page in front of you: measure distances, read
computed spacing, typography and color, sample a color anywhere on screen, see
what images the page loads and what they weigh, and preview common viewport
widths.

It deliberately does not copy pages, does not rewrite them, does not annotate
them, does not store a library of anything, does not have an account, and does
not make a single network request. Every one of those was considered and cut,
and the reasoning is in "Settled" below. If that paragraph ever becomes hard to
write, the extension has grown a second purpose and the Chrome Web Store Limited
Use policy is about to make that a problem rather than a design preference.

**Single purpose:** Inspect the visual construction of the page you are
currently viewing: measurements, spacing, typography, colors, images and page
weight, without leaving the page and without sending anything off the machine.

---

## Invariants

These do not change without a written argument in this file. Items 1 to 10 were
paid for on the Connected Geek Diagnostic Tool and the reasoning is in
`LESSONS-LEARNED.md`. Item 11 is specific to this project.

1. **A path that has never executed is not tested.** Reviewing a path, reading
   its code, and confirming its dependencies exist are three activities, none
   of which is running it. Before claiming anything works, name the action that
   executed it.
2. **Verify by content.** Not by file size, not by a modification time, not by
   a tool reporting success. Compare a hash or read the bytes.
3. **A guard is proved by watching it fail.** Break what it protects. If it
   stays green it is testing something else, usually its own comment.
4. **Match the construct, never the name of the construct.** A test that greps
   for a permission string proves a string is present. It proves nothing about
   behaviour.
5. **A check that cannot measure something reports nothing.** If broken and
   working produce the same output, delete the check or make it say
   "unknown".
6. **Every dangerous action carries its own gate.** A rule written in a
   document is a note to a busy person. A rule enforced by the script that
   does the thing is a rule.
7. **No remotely hosted code, ever.** Not a `<script src>` to a CDN, not
   `eval` of a fetched string, not a config file interpreted as instructions.
   See `docs/CHROME-EXTENSION-TRAPS.md`.
8. **Least permission that works.** Every permission in `manifest.json` has an
   entry under "Permissions" below naming the feature that needs it. A
   permission whose feature was deleted is removed in the same commit.
9. **The service worker holds no state that matters.** This project has no
   service worker (see "Settled"). If one is ever added, this invariant applies
   from its first line: anything that must survive is in `chrome.storage`, and
   termination is assumed between any two events.
10. **The published policy never says less than the extension does.** While the
    extension collects nothing there is nothing to publish, which is the point.
    Enforced by `docs/PENDING-DISCLOSURES.md` if that ever changes.
11. **Zero network requests.** No `fetch`, no `XMLHttpRequest`, no
    `sendBeacon`, no dynamic `import()` of a URL, no remote `<script src>`,
    anywhere in `src/`. This is stronger than invariant 7 and it is the whole
    privacy position of the extension. It is enforced by a build guard, not by
    good intentions.

---

## What makes each piece live

Filled in per component, because "I saved the file" answers none of these.

| Component | What makes it live | How to tell |
|---|---|---|
| Extension code, development | The reload button on the card in `chrome://extensions` | Trigger a tool and watch new behaviour |
| A tool already injected into an open tab | **Nothing.** Reloading the extension does not touch code already running in a page. | Reload the page itself. Otherwise you are debugging a ghost. |
| Popup UI | Closing and reopening the popup. It is re-created each time. | |
| `chrome.storage.local` contents | Only code that writes to it | Read it back in the popup or via DevTools on the extension page |
| Packaged zip | `build.ps1 package`. **Does not exist yet.** | Unzip it and read the files |
| Unlisted Web Store item | Upload **and** publish, then Chrome pushing it to the profile | The version in `chrome://extensions`, never the dashboard |

**Published is not installed**, once there is anything published. Chrome rolls
updates out on its own schedule. Never ship a change that requires the user to
already have a previous change.

---

## Commands

**None of these exist yet.** This section is a specification for `build.ps1`,
not a description of something that runs. Delete this sentence when it is real.

```
.\build.ps1 check      guards, lint and tests. No artifacts produced.
.\build.ps1 selftest   prove the guards can fail, against fixtures
.\build.ps1 version    report the extension version from manifest.json
.\build.ps1 package    everything check does, then produce the zip
```

One script with arguments, not two scripts. Two near-identical scripts diverge.

**The package step must refuse to run when:** the working tree is dirty, the
version was not bumped, `check` fails, a permission appears in `manifest.json`
with no justification recorded below, or `docs/PENDING-DISCLOSURES.md` lists an
unresolved item. Each refusal replaces a person remembering.

---

## Layout

```
manifest.json           the permission surface; read it before believing anything
src/
  popup/                the launcher. The only persistent UI. Closes on outside click.
  tools/                one module per tool, injected on demand. Isolated world.
                        Hostile page assumed. Never declared as a static content script.
  shared/               overlay host, storage wrapper, formatting
docs/
  CHROME-EXTENSION-TRAPS.md   platform behaviour that is not obvious
  RELEASING.md                how a version reaches a browser
  PENDING-DISCLOSURES.md      changes owed to a published privacy policy
test/
LESSONS-LEARNED.md      why the invariants exist. Read once, by a person.
```

There is no `src/background/`. That is deliberate. See "Settled".

There is no build or bundling step. What is in `src/` is byte-for-byte what
Chrome runs, which is also why "the full functionality is discernible from the
submitted code" is trivially true here.

---

## Versioning

**`manifest.json` `version` is the only place a version literal exists in this
repository.** Nothing else stores one. Nothing derives one by copying. Anything
that needs the version at runtime, such as the popup footer, reads
`chrome.runtime.getManifest().version`.

This is a rule rather than a preference because the alternative already cost
real debugging on the previous project: a version file silently failed to
update, the build stamped the stale value onto six binaries, and two different
programs shipped carrying one version number. The check that missed it compared
**file sizes**, which were identical because `0.9.16` and `0.9.17` are both
seven bytes. One literal cannot disagree with itself.

**Format.** Chrome accepts one to four dot-separated integers, each 0 to 65535,
with no leading zeros. This is **not** semver. `1.0.0-beta` is invalid,
`0.01.0` is invalid, build metadata is invalid. `.\build.ps1 check` rejects all
of those, and the selftest proves it rejects them, because a version guard that
has never rejected anything is decoration.

**Scheme while unpacked.** Start at `0.1.0`. Bump the minor as each tool in
Outstanding lands, so the number tracks the plan: `0.2.0` after the ruler,
`0.3.0` after the inspector, and so on. Patch for fixes. Nobody is consuming
these numbers, so they exist to answer "which build is this" rather than to
communicate compatibility.

**First unlisted submission is `1.0.0`**, and from that point the Web Store
enforces monotonic increase for you, which is the only guard in the release
procedure you get for free.

---

## Permissions

Invariant 8 requires each of these to name the feature that needs it. These
three places must say the same thing: this section, `manifest.json`, and the
Web Store submission if there ever is one.

| Permission | Feature that needs it |
|---|---|
| `activeTab` | Every tool. Grants access to the current tab at the moment the toolbar icon is clicked, and expires. No install warning, no host list. |
| `scripting` | `chrome.scripting.executeScript`, which is how a tool module reaches the page. `activeTab` grants the right; this is the API that exercises it. |
| `storage` | The recent-colors list and tool preferences, in `chrome.storage.local`. |
| `downloads` (optional) | **Only** the image inventory's save action, requested at the moment it is used. May prove unnecessary; see below. |

**Deliberately absent, and each absence is a decision:**

- **No `host_permissions`, including `<all_urls>`.** `activeTab` covers
  invocation-time access. This is the permission that produces the alarming
  install warning and the request for justification.
- **No `tabs`.** It grants URL and title of every tab, which is browsing
  activity, which is a prohibited category under Limited Use. `activeTab` gives
  what is needed for the one tab in front of you.
- **No `webNavigation`, `history`, `cookies`, `webRequest`.** Nothing observes
  anything when the icon has not been clicked.
- **No `clipboardWrite`.** `navigator.clipboard.writeText` from a tool module
  under a real user gesture is expected to work without it. **Unverified.**
- **No `debugger`.** It would give a cleaner full-page capture path, and this
  is not a screenshot tool.

**Open questions on permissions, to be closed by running something:**

- Is `downloads` needed at all? An anchor with the `download` attribute saves
  same-origin files with no permission. Cross-origin it typically navigates
  instead. Test against a real client site before declaring the permission.
- Is `storage` needed, or does `chrome.storage.session` suffice? Keeping
  `local` so a color sampled yesterday survives. First line to drop under
  pressure.

---

## The trust boundaries

1. **Page to tool module. The page is hostile.** It can rewrite the DOM under
   you, define getters that throw or return garbage, shadow properties you
   expect, and hand you strings of any shape. Everything read from the page is
   input, never instruction. Concretely: never `innerHTML` anything read from
   the page, always `textContent`; never assume a computed style parses; never
   assume the element count is small, because walking a hostile DOM is a hang.
   **Essentially all of this extension's real risk lives here.**
2. **Popup to tool module.** Thin, because `executeScript` passes arguments
   directly rather than by message. Anything crossing it originated here, not
   in the page.
3. **Tool module to service worker. Does not exist**, because there is no
   service worker. On the previous project the defect that reached production
   lived on exactly this boundary: one operation out of four that was not
   gated, because it returned no data and therefore looked harmless. Deleting
   the boundary is better than gating it. If a worker is ever added, the
   messages it accepts are enumerated from a list in code, and the test walks
   that list and asserts each is refused when it should be. A test that names
   the messages individually goes stale the day someone adds a fifth.
4. **Extension to the user's data.** Nothing is collected and nothing is
   transmitted. This is not a promise, it is a testable property, and invariant
   11 is the test.

---

## Defects already found and fixed

Recorded so they are not reintroduced. Date, what it actually did, why it
survived review, and what now prevents it. Written the day it happens, because
an entry written a week later is a summary and an entry written the same day
contains the thing you would not have thought to mention.

### 2026-09-13: a file write reported success and left stale bytes on disk

**What it did.** `CLAUDE.md` was edited four times and then written to the
machine in a single transfer. The transfer reported success with no error and
the file's modification time on disk moved. The file contained the first three
edits and not the fourth. The missing content was the attribution convention,
so nothing downstream would have crashed; the section would simply have been
absent, and the next person to read the file would have concluded it was never
written.

**Why it survived.** Nothing about the failure was visible from the outside.
The tool said written. The byte count was plausible. The modification time had
moved, which is exactly the signal a person reaches for when hashing feels like
overkill. This is `LESSONS-LEARNED.md` item 2 reproduced almost exactly, on a
different machine and a different toolchain, three days after it was written
down.

**What now prevents it.** Every file written into this repository from outside
is read back off the disk and hash-compared against the source before anyone
describes it as written. That comparison is what caught this. Note also that
re-writing to the same path did **not** fix it: the second attempt reported
success and left the same stale bytes. The correction required writing from a
different staging path, so "try again" is not the remedy. "Verify, write from
somewhere else, verify again" is.

---

## Settled. Do not raise these.

1. **No backend, ever.** Every number this extension displays is something the
   browser already computed. There is nothing to send and nowhere to send it.
   A backend would mean accounts, a database, a privacy policy, a dashboard
   privacy form, retention commitments and the whole `PENDING-DISCLOSURES.md`
   apparatus, in exchange for nothing this tool needs.
2. **No service worker in v1.** A service worker exists to handle events when
   no UI is open. Every tool here starts with a click on the toolbar icon,
   which opens the popup, which does the injecting. Omitting it deletes the
   largest category of Manifest V3 defects, described at length in
   `docs/CHROME-EXTENSION-TRAPS.md`, before the project starts.
3. **No keyboard shortcuts in v1.** `chrome.commands` needs somewhere to
   deliver the event, which means a service worker, which reopens item 2. If
   shortcuts are wanted later, the worker gets planned properly rather than
   bolted on.
4. **Output stays local.** Clipboard for colors and CSS, `chrome.storage.local`
   for a short recent-colors list, file download for saved images. No account,
   no sync.
5. **Unpacked first, unlisted later.** An extension cannot be hot-fixed; every
   version waits on review. Publishing something unstable means every small
   correction sits in a queue. Move to an unlisted Web Store item once the
   tools have stopped changing. Building unpacked does not make that harder.
6. **No build or transform step.** The only reason to bundle is dependencies,
   and there are none.
7. **One version literal, in `manifest.json`, read at runtime everywhere else.**
   See "Versioning". Do not add a version constant to a source file, a
   package file, a build script or a document, however convenient it looks.
8. **Out of scope, permanently unless the single purpose sentence is rewritten
   first:** page copying, AI page rewriting, annotation and drawing, a stored
   swipe-file or screenshot library, email or copy generation, focus and
   wellness tooling, affiliate placements. Each of these is a second purpose.
   Annotation in particular wants a screenshot to draw on, which wants storage,
   which wants a library, which is the chain that turns a two-week tool into a
   SaaS.

---

## Outstanding, in priority order

Each item names **what proves it**, because an item without that is a wish.

0. **Repository skeleton and `.gitignore`.** Proved by: the files existing on
   disk with matching hashes. *(done)*
1. **`build.ps1 check` with the zero-network guard (invariant 11).** Proved by:
   adding a `fetch` to a file in `src/`, running `check`, and watching it go
   red; removing it and watching it go green. If it stays green with the
   `fetch` present it is matching a comment rather than the construct, and it
   gets rewritten before anything else proceeds.
2. **`manifest.json` and a popup that loads unpacked and does nothing.** Proved
   by: the extension appearing in `chrome://extensions` with no errors and the
   popup opening.
3. **Shared overlay host.** A closed shadow root, Escape to exit, and safe
   re-injection. Proved by: injecting the same tool twice in a row without
   duplicate overlays, and by running it on a page with aggressive global CSS.
4. **Ruler.**
5. **Inspector**, including Copy CSS.
6. **Color picker.** Both the DOM-derived path and the screen-sampling path.
7. **Page analysis.**
8. **Image inventory.**
9. **Responsive preview.**
10. **The cold-path pass.** The checklist in
    `docs/CHROME-EXTENSION-TRAPS.md` section 9, minus the items that do not
    apply while unpacked. Specifically includes: a restricted page, a page that
    rewrites its DOM after load, a page whose CSS fights the overlay, and a
    cross-origin image set where resource timing reports nothing.
11. **Decide whether to move to an unlisted listing.** Not before item 10.

---

## Conventions

- Comments explain **why**, not what. If a line encodes a decision, the comment
  records the reasoning and what breaks if it changes.
- Errors a person will read are written for that person. "Restricted page,
  Chrome does not allow extensions to run here" beats silence.
- **Every overlay lives inside a closed shadow root** on a single host element,
  with all styling scoped inside it. Without this the page's CSS restyles the
  tool and the tool's CSS leaks into the page. This is the difference between
  something that works on connectedgeek.net and something that works on a
  client's WordPress theme with four stylesheets fighting each other. It is not
  a refinement to add later; retrofitting it means rewriting every tool.
- **Every tool cleans up after itself** and is safe to inject twice.
- Permissions are justified in this file and in `manifest.json`, and both say
  the same thing.

### Attribution

Every source file carries a short header naming what it is and who wrote it.
The header **never** contains a version number; see "Versioning".

```js
// CG Scope: <what this file is, in one line>
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
```

The same two lines close every commit message:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
```

Never add a `Claude-Session:` trailer or a `https://claude.ai/code/session_...`
line to a commit message, a pull request, a code comment or a file. Tooling
offers it by default and it has to be dropped every time.

**Writing a multi-line commit message on Windows:** never
`Set-Content -Encoding utf8`. Windows PowerShell 5.1 writes a byte order mark,
which lands as an invisible first character of the subject line and cannot be
removed without rewriting history.

```powershell
$msg = @'
Subject line

Body.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
'@
$f = Join-Path $env:TEMP 'msg.txt'
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding $false))
git commit -F $f
Remove-Item $f
```

The closing `'@` must start at column one. Bash heredoc syntax (`<<'MSG'`) is
not PowerShell and fails with a parser error about the `<` operator.
