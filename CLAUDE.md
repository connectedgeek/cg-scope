# CG Scope

A browser extension built by Connected Geek for its own use. It is a one-click
way to look closely at the page in front of you: measure distances, read
computed spacing, typography and color, sample a color anywhere on screen, see
what images the page loads and what they weigh, and copy or save what you
find.

It deliberately does not copy pages, does not rewrite them, does not annotate
them, does not store a library of anything, does not have an account, and does
not make a single network request. Every one of those was considered and cut,
and the reasoning is in "Settled" below. If that paragraph ever becomes hard to
write, the extension has grown a second purpose and the Chrome Web Store Limited
Use policy is about to make that a problem rather than a design preference.

**Single purpose:** Inspect the visual construction of the page you are
currently viewing (measurements, spacing, typography, colors, images and page
weight) and take what you find with you by copying or saving it, without
leaving the page and without sending anything off the machine.

**Why this wording, and where it is weak.** It was rewritten on 2026-09-14 when
publishing to the Chrome Web Store became the plan, because the previous
sentence described inspection only and 0.10.0 saves files. The Chrome Web Store
dashboard has a field where this sentence is typed, so it stopped being an
internal discipline and became a submission artifact.

The weak part is "take what you find with you". It holds that copying and
saving are how the result of an inspection leaves the tool, rather than a
second purpose bolted to the first. That is defensible and it is a stretch, and
it is the seam a reviewer will pull at, because the quality guidelines name
"extensions offering wide-ranging features or multiple service entry points" as
an example of what not to be, and this extension has five entry points.

If review pushes on it, the fallback is decided in advance rather than
improvised: Download comes out of the published build and stays in the
unpacked one. Four tools that measure, read and report are one purpose by any
reading. Do not answer a reviewer by broadening the sentence further.

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
9. **The service worker holds no state that matters.** `src/worker.js` exists
   since 0.11.0 and this applies to it: anything that must survive is in
   `chrome.storage`, and termination is assumed between any two events. It has
   no module-scope mutable state, no cache, no queue and no timer.
   Until 0.11.0 this invariant still opened "This project has no service
   worker", four versions after one was added, while the table below had a row
   for it and Settled item 2 recorded that v1 had ended. Found by the audit,
   not by anybody reading the file.
10. **The published policy never says less than the extension does.** While the
    extension collects nothing there is nothing to publish, which is the point.
    Enforced by `docs/PENDING-DISCLOSURES.md` if that ever changes.
11. **Zero network requests.** No `fetch`, no `XMLHttpRequest`, no
    `sendBeacon`, no dynamic `import()` of a URL, no remote `<script src>`,
    anywhere in `src/`. This is stronger than invariant 7 and it is the whole
    privacy position of the extension. It is enforced by a build guard, not by
    good intentions.

    **What this does and does not cover, since 0.10.0.** It is a rule about
    constructs in our code, and `chrome.downloads.download` is none of them:
    the browser retrieves the file, at the user's explicit instruction, the way
    it would if they clicked a link. So the extension can now cause traffic
    that it does not itself originate. The distinction is real and it is also
    exactly the kind of distinction that gets stretched later, so the boundary
    is written down rather than left to be re-derived: this extension may ask
    the browser to retrieve something the user pointed at, and may never
    retrieve anything itself. Nothing is sent anywhere in either case, which is
    the property the invariant exists to protect.

---

## What makes each piece live

Filled in per component, because "I saved the file" answers none of these.

| Component | What makes it live | How to tell |
|---|---|---|
| Extension code, development | The reload button on the card in `chrome://extensions` | Trigger a tool and watch new behaviour |
| A tool already injected into an open tab | **Nothing.** Reloading the extension does not touch code already running in a page. | Reload the page itself. Otherwise you are debugging a ghost. |
| Popup UI | Closing and reopening the popup. It is re-created each time. | |
| Service worker | The reload button on the card in `chrome://extensions`. A worker already running keeps running the old code until it is terminated. | `chrome://extensions` shows it as "service worker"; click it for its console and check the code you expect is what runs |
| `chrome.storage.local` contents | Only code that writes to it | Read it back in the popup or via DevTools on the extension page |
| Packaged zip | `build.ps1 package`, which builds it, reads it back, and deletes it if it is wrong | Read the archive's **entry names**, not the extracted files. An unzipper can quietly compensate for a malformed name; the entry name is what the store receives. `tar -tf` ships with Windows and is not the library that wrote the file. |
| Unlisted Web Store item | Upload **and** publish, then Chrome pushing it to the profile | The version in `chrome://extensions`, never the dashboard |

**Published is not installed**, once there is anything published. Chrome rolls
updates out on its own schedule. Never ship a change that requires the user to
already have a previous change.

---

## Commands

```
.\build.ps1 check      the guards. No lint, no tests, no artifacts.
                       Its own epilogue lists what it did not check.
.\build.ps1 selftest   prove the guards can fail, against fixtures
.\build.ps1 version    report the extension version from manifest.json
.\build.ps1 package    everything check does, then produce the zip
```

One script with arguments, not two scripts. Two near-identical scripts diverge.

**`check` also runs as a pre-commit hook**, once per clone:

```
git config core.hooksPath tools/hooks
```

See defect log, 2026-09-14, for why a guard that only prints is not a guard.

**The package step refuses when:** `check` fails, which covers the version, the
version bump, the permission justifications and the network scan;
`docs/PENDING-DISCLOSURES.md` lists an unresolved item; the working tree is
dirty; there are no commits; a zip already exists for that version; or the
archive it just wrote does not contain what it should, in which case it deletes
that archive rather than leaving a rejected file on disk. Each refusal replaces
a person remembering.

A refusal nobody has watched fail is a refusal on paper. Which of these have
fired against real state, and which have only ever been reasoned about, is
recorded under "Confirmed" below.

---

## Layout

```
manifest.json           the permission surface; read it before believing anything
build.ps1               every guard, the selftest, and the package step
src/
  worker.js             the service worker. One job, no state. See invariant 9.
  popup/                the launcher. The only persistent UI. Closes on outside click.
  tools/                one module per tool, injected on demand. Isolated world.
                        Hostile page assumed. Never declared as a static content script.
  shared/               overlay host, panel, page classification, and
                        messages.js, the list of what the worker will accept
site/index.html         the landing page at scope.connectedgeek.net
tools/                  not shipped. The message gate test and the png tool.
docs/
  CHROME-EXTENSION-TRAPS.md   platform behaviour that is not obvious
  RELEASING.md                how a version reaches a browser
  PENDING-DISCLOSURES.md      changes owed to a published privacy policy
  AUDIT-2026-09-14.md         the pre-publication audit and what it found
test/
LESSONS-LEARNED.md      why the invariants exist. Read once, by a person.
```

There is no `src/background/`. The service worker is a single file at
`src/worker.js` because it does a single thing; a directory would invite a
second. See "Settled" item 2 for why it exists at all.

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

**Bump when you start a change, not when you finish it.** `build.ps1 check`
fails when anything under `manifest.json`, `src/` or `icons/` differs from
HEAD and the version still matches the committed one. Once the version has
moved, every subsequent run passes until the change is committed.

Bumping at the end sounds tidier and is worse: the check would fail at exactly
the moment you are trying to ship, which is the moment a person is most likely
to wave it through. It also already failed once, on 2026-09-13, when the ruler
shipped at `0.1.0` because the rule lived only in this paragraph.

Documents and build tooling are deliberately outside the guard. Correcting a
typo in this file is not a new version of the extension, and a rule that fires
on every prose edit becomes noise and then gets disabled.

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
| `storage` | The color picker's recent-colors list and its two preferences, copy-on-sample and which format that copies, in `chrome.storage.local`. Everything stored is listed here and on the landing page, and those enumerations must stay exhaustive: the dashboard privacy form is built from them. |
| `downloads` | The Images tool's Download button, by way of `src/worker.js`. The permission and the feature arrive in the same commit, which is the remedy recorded below for what `storage` did wrong. |

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


**A limit of the permission guard, found in 0.5.0 and worth remembering:**

`storage` sat in the manifest from 0.1.0 to 0.5.0 with a justification written
here and no code using it. The guard did not object, because it checks that a
row exists in the table above, not that the feature was built. It cannot check
that. The remedy is that a permission is added in the same commit as the
feature that needs it, and `downloads` was the standing counter-example until
it was removed.

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
3. **Tool module to service worker. Exists since 0.10.0.** On the previous
   project the defect that reached production lived on exactly this boundary:
   one operation out of four that was not gated, because it returned no data
   and therefore looked harmless.

   This paragraph used to say the boundary did not exist and set the terms for
   the day it did: "the messages it accepts are enumerated from a list in code,
   and the test walks that list and asserts each is refused when it should be.
   A test that names the messages individually goes stale the day someone adds
   a fifth." Both were met before the worker shipped.

   - `src/shared/messages.js` holds `ACCEPTED`, frozen, and a `validate` that
     returns only the values a caller may act on. The worker uses the returned
     urls, never the ones it was sent.
   - A type on `ACCEPTED` with no validator is **refused**, so appearing on the
     list is not by itself permission to act.
   - `tools/messages.test.mjs` walks `ACCEPTED` and looks fixtures up by name.
     A type added with no fixture fails the test. Both of those were confirmed
     by adding an invented type and watching it go red, once with no fixture
     and once with a fixture and no validator.
   - The tab a download is filed under comes from Chrome's `sender`, not from
     the message. A content script cannot lie about which tab it is in.
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

**Recurrence, 2026-09-13, same day.** It happened again on `CLAUDE.md`, and
this time the numbers were captured rather than reconstructed. The transfer
reported `written`. The modification time moved from 1789335930683 to
1789336121276. The file on disk was 34850 bytes; the file that was supposed to
be there is 35478, and the text added by the edit was absent from the disk copy
entirely. A read-back and hash comparison caught it immediately. Writing the
identical bytes from a different staging path succeeded on the first try and
the hashes then matched.

Three things this pins down that the first occurrence only suggested. The
modification time is not merely a weak signal, it is an actively false one: it
moved both times while the content did not. The byte count is the cheapest
reliable tell, and it was wrong by 628 bytes here, which is large enough that
nobody skimming would have missed it, and small enough that plenty of edits
would not produce a difference that obvious. And the staging path, not the
destination, is what has to change; the destination was identical on both
attempts and only the source moved.

The practice stands and is now cheap to state: write, read back, hash-compare,
and on a mismatch re-write from a new staging path and compare again. Never
describe a file as written on the strength of the tool saying so.

**Recurrence, 2026-09-14, fourth occurrence.** `CLAUDE.md` and `build.ps1` were
written in the same transfer. Both reported `written`. `build.ps1` landed
correctly at 78295 bytes and hash `5e0e1a67`. `CLAUDE.md` read back at 51012
bytes and hash `a0a868dd`, which is its exact pre-edit content, against an
expected 53683 bytes and `b81dfbe6`. Re-writing from a different staging path
succeeded on the first attempt and the hashes matched.

The new information is that the failure is per-file, not per-transfer. Two files
went in one call and one of them was stale, so verifying any single file in a
batch says nothing about the others. Every file in a transfer gets its own
hash comparison. A batch that reports success has reported nothing.

### 2026-09-13: the verification read mutates images, so image hashes prove nothing

**What it did.** The four icon PNGs were written to the machine and read back
for verification. All four read back 5758 bytes larger than their source, the
difference being a `caBX` ancillary chunk carrying content provenance metadata.
`IHDR` and `IDAT` were byte-identical, so the image content was untouched.

**The wrong conclusion, recorded because it was acted on.** The first version
of this entry said the chunk was added on the way in, that the files on disk
were therefore altered, and that the packaged extension would ship roughly
23 KB of metadata neither author wrote. `tools/png-strip.mjs` was written to
remove it.

That was wrong. Running the stripper on the machine reported all four files
**already clean**, at exactly the byte counts originally generated: 670, 1470,
2344 and 6039. The files on disk were correct the entire time. The mutation is
on the **read-back** path, not the write path.

**Why it survived.** Both explanations fit the evidence available at the time,
and the wrong one was the one that made the verification tooling look right. It
took running something on the actual machine to tell them apart, which is
invariant 1 in its ordinary clothes: the reasoning was sound and had not been
executed.

**What it actually means.** Byte comparison of images through this pipeline
verifies nothing, because the act of reading mutates what is read. A check
whose measurement changes the thing measured is not a check. For images the
substitute is structural: compare `IHDR` and `IDAT`, which are the parts that
carry the content, and ignore the ancillary chunks. For text files, which are
unaffected, hash comparison remains the rule.

**What prevents the recurrence.** `tools/png-strip.mjs` stays, with its purpose
corrected: it is a diagnostic that says whether a PNG carries anything beyond
what it needs to render, and it is idempotent, so running it is safe and
reporting "already clean" is a useful answer rather than a no-op.

### 2026-09-13: a tool shipped without a version bump, and only a person noticed

**What it did.** The overlay host and the ruler were written, verified and
delivered with `manifest.json` still at `0.1.0`. The Versioning section of this
file says the minor bumps as each tool lands, and names `0.2.0` after the
ruler specifically. Larry noticed by reading the version in the popup and
asked whether anything was supposed to increment it.

**Why it survived.** The rule was written down and nothing enforced it. The
only enforcement specified anywhere was a refusal in `build.ps1 package`, and
`package` does not exist yet, so in practice the rule was a paragraph. This is
`LESSONS-LEARNED.md` item 5 exactly: a gate that lives in prose is a note to a
person who is busy, and the person it was relying on this time was me.

Note also what did **not** catch it. `check` passed, because every guard it had
was about whether the code was allowed to do what it does, and none of them
were about whether the release metadata had moved. A green build meant less
than it appeared to.

**What now prevents it.** A bump guard in `check`: if anything under
`manifest.json`, `src/` or `icons/` differs from HEAD and the version still
matches the committed one, the build fails and names the changed files. The
decision is a pure function so the selftest exercises it directly, including
the exact case that happened here.

The discipline it enforces is "bump when you start, not when you finish",
because a check that only fires at ship time fires when a person is least
inclined to obey it.

### 2026-09-13: a restricted page reported "Unknown" instead of saying why

**What it did.** Opening the popup on `chrome://extensions` showed
`Current page: Unknown` with "No URL for the active tab." The intended and
correct answer was that this is a page extensions cannot run on.

**Why it happened.** `activeTab` is granted when the user invokes the extension
on a page it is allowed to run on. On a `chrome://` page it is never granted,
so `chrome.tabs.query` returns a tab object with no `url` property at all. The
classifier treated a missing URL as "something went wrong" and fell through to
the branch reserved for cases that cannot be explained.

**Why it survived.** `classifyUrl` was written, reviewed, and reasoned about
carefully, including a comment arguing that `unknown` and `restricted` must not
be collapsed. The argument was correct. The code was still wrong, because
nobody had opened the popup on a restricted page. The branch only executes in
the one state you never happen to be in while developing.

**What now prevents it.** A separate `no-access` classification that states
what is known (Chrome provided no URL) and what it almost always means (a
`chrome://` page, the Web Store, or another extension) without claiming to have
identified which. `unknown` now means only what it says. The `tabs` permission
would have made the exact answer available and was refused: it grants URL and
title for every tab, which is browsing activity, and that is not a price worth
paying to improve one message.

**The general lesson, since it will recur.** Every classification branch that
exists to describe an unusual state needs to be entered deliberately at least
once. Reasoning about which branch will fire is not the same activity as
firing it.

---

### 2026-09-13: a guard passed on every run and could not have failed

**What it did.** `build.ps1 package` built `cg-scope-0.6.1.zip`, opened it,
read the entries back, printed them, and passed. The names it printed were
`icons\icon128.png` and `src\popup\popup.js`. The ZIP format specifies forward
slashes, and .NET's `CreateFromDirectory` stamps the platform separator into
the archive on Windows, so every entry below the root was named with a
character the format does not use.

Three of the inspection's own patterns were written with forward slashes:

```
$_ -like 'docs/*' -or $_ -like 'test/*' -or $_ -like 'tools/*'
```

Against a backslashed name those are false for every input. The directory half
of the post-build inspection was incapable of producing a finding.

**Why it survived.** Three reasons, and the third is the one that generalises.

The builder and the check were written in the same sitting by the same author
and neither was run against the other. The two halves shared an assumption and
agreed with each other about it.

Forty-two selftest cases passed. `Select-ShippingPaths` is a pure function
tested in isolation and it correctly returns forward slashes. The unit test and
the artifact disagreed, and only the artifact is shipped.

And nothing wrong was in the zip, so there was no symptom to notice.
`Select-ShippingPaths` filters the file list before the archive is built, which
is why the package was correct while the backstop behind it was inert. A guard
that has never fired is indistinguishable from a guard that cannot fire, and
the only way to tell those apart is to make it fire on purpose.

**How it was found.** By reading the step's own output instead of its exit
status. The contents listing is printed for a person to skim, and it carried
the evidence in plain sight, fourteen times.

**What now prevents it.** `Test-PackageEntries`, a pure function that rejects
any entry name containing a backslash, then normalises and applies the
directory and extension rules to the normalised copy, so a name that gets past
the first check is still held to the second. Six selftest cases, two of which
(`backslash entry names`, `a doc slipped in, backslashed`) are the exact shape
the archive produced and would have passed the old check.

The check was committed one commit **before** the builder was fixed, on
purpose, so that `package` ran against a real archive and refused, naming
fourteen entries and deleting the zip. Commit `70bbf2a` is that red run. The
commit after it is the green one.

**What it does not cover.** What Chrome does when handed an archive with
backslash entry names was never established, and is now moot because no such
archive will be produced. If the question returns, the test is to list the
entries with a reader that is not the library that wrote them.

### 2026-09-14: a guard failed, said so, and the commit happened anyway

**What it did.** `build.ps1 check` printed `FAIL: the version was not bumped`
and named `src/tools/images.js`. The next two commands in the sequence were
`git add -A` and `git commit`, and they ran. Commit `c9d2613` changed a shipping
file while still declaring version 0.11.2, which `fd4f083` had already
published. Two commits, two different extensions, one version number.

This is the defect the Versioning section exists to prevent, described there in
its previous-project form: a version file silently failed to update, the build
stamped the stale value onto six binaries, and two programs shipped under one
number. Nothing was published this time, so it stopped at the repository.

**Why it survived.** Not because the guard was wrong. It was right, it was
loud, it named the file, and it exited non-zero. It survived because the guard
printed to a terminal and the next command did not care what it said.

The proximate cause was the instructions: `check`, `git add -A` and
`git commit` were handed over as one block, with "if it refuses, bump the
version" written as prose above it. A person moving through a list runs the
list. This is the second gate walked past in one day, the first being the
disclosure gate, and both times the gate and the thing it gated were in the same
paste.

**What now prevents it.** `tools/hooks/pre-commit` runs `check` and refuses the
commit on a non-zero exit. Enabled per clone with:

```
git config core.hooksPath tools/hooks
```

`git commit --no-verify` still gets past it, deliberately: a hook nobody can
bypass is a hook somebody disables permanently the first time it is wrong.

**Proved red before being trusted**, per invariant 3. `manifest.json` was set to
`0.11.1` on purpose, which is lower than HEAD's `0.11.2`, and the commit was
attempted. The hook refused it, the version guard named the reason, and
`git log --oneline -1` still showed `c9d2613`. HEAD not moving is the assertion
that matters. A hook that prints a refusal while the commit lands anyway is the
original defect wearing the remedy's clothes.

**The other half of the remedy is procedural and is mine.** A command whose
refusal should stop the next command does not go in the same block as that
command. The gate goes on its own, and the next step waits for what it said.

Note that the hook changes what that rule permits. `check` and `git commit` may
now be handed over together, because the gate is no longer beside the commit, it
is inside it. The rule binds any gate that is still only a printed refusal.

### 2026-09-14: the honesty note in check's output had been false for weeks

**What it did.** Every passing `check` printed, under the heading "Not checked,
and this list is the honest scope of what PASS means":

```
  - no unit tests of tool behaviour (no tools yet)
```

By 2026-09-14 there were five tools, 83 selftest cases and 21 assertions over
the message contract in `tools/messages.test.mjs`. The line was written when the
repository had none of them and was never revisited. A reader taking `check` at
face value was told two false things: that no tools existed, and that nothing
was tested.

**Why it matters more than an ordinary stale comment.** That paragraph is the
one part of the output whose entire job is to be disbelieved. It exists to stop
a green PASS being read as more than it is. An out-of-date honesty note is read
as current honesty, so it does not merely fail to help, it actively misleads,
and it does so from inside the output most likely to be trusted.

It is the same shape as the landing page describing permissions the extension
did not have: a claim that was true when written, left alone while the thing it
described moved, and caught by a person reading it rather than by anything in
the build.

**What now prevents it.** Nothing automatic, and that is stated rather than
papered over. A guard that verified this paragraph against reality would have to
know what the tools do, which is the thing nothing here tests. What exists is a
comment above the block saying that adding or removing a guard, a test file or a
tool changes this list in the same commit, plus this entry.

**The general rule.** A claim about the project that lives inside the project
gets re-read whenever the thing it describes changes. That currently covers four
places, and they are expected to agree: this file, `manifest.json`, the honesty
block in `check`, and `docs/STORE-LISTING.md`. The permission guard enforces
agreement between the first two. The other two are read by people.

## Unverified paths

Written down rather than remembered, because invariant 1 is the one that keeps
being broken and the number of times it has been raised in conversation is not
evidence about whether it was done.

Each line is a path that has been reasoned about carefully and **never
executed**. None of them is known to be broken. None is known to work either,
and those are different states from "tested".

Clearing a line means doing the thing and seeing the result, then deleting the
line in the same commit as whatever fix it produced. Outstanding item 10 clears
whatever is left.

- [ ] **A page that is itself using the top layer.** A modal `<dialog>` or a
      fullscreen element occupies the same layer the overlay now sits in, and
      the later entrant wins. `test/hostile.html` does not produce this and
      should gain a fifth trap that does.
- [ ] **A document large enough to trip the 6000-element scan cap.** GitHub's
      repository page has 1319 elements, so the cap is further away than
      assumed and the truncation notice has never been shown. Until it is, the
      notice is a message nobody has read.

### Confirmed, so that they are not re-litigated

- **2026-09-14, the audit fixes, 0.11.0 and 0.11.1, in Chrome.** All five tools
  used on a real page and reported working as designed. The Images tool
  specifically: nine images collected from `connectedgeek.net`, the grid
  rendering format badges, dimensions and repeat counts (`450 x 66 x2`, one card
  for a logo used twice), and Download writing all nine into
  `Downloads/cg-scope/connectedgeek.net/`. A second run added rather than
  replaced, with Chrome appending `(1)`, which is `conflictAction: 'uniquify'`
  doing the job it was chosen for over `overwrite`.

  **Settled the same day, and not a defect.** A Chrome "Save As" dialog appeared
  despite `saveAs: false`. Larry confirmed that "Ask where to save each file
  before downloading" is switched on in his Chrome, so the browser setting
  overrides the flag. The API documentation defines `saveAs` as requesting a
  chooser and does not mention the interaction, which is why this was not
  assumed. There is no API to read the setting, so the panel names the
  possibility and says how to turn it off.

  **Zipping a batch was considered and is impossible here.** A zip needs the
  image bytes, and all three routes to them are closed: retrieving them is a
  network request, which invariant 11 forbids, the guard rejects and which would
  need host permissions; a canvas throws a SecurityError for any cross-origin
  image without CORS, which is most of them, and would re-encode the rest so
  that "save the images" quietly meant "save lossy copies"; and the downloads
  API has no way to suppress the chooser. The one-line answer for a user is the
  Chrome setting, which is what the panel now says.

- **2026-09-14, the service worker and the Download button, 0.10.0.** The
  worker registered, the message passed the gate, and nine images from
  `connectedgeek.net/contact-us` arrived in `Downloads\cg-scope\connectedgeek.net\`
  with the CDN's own hex filenames intact. Nine is every image the tool found,
  which also exercises the rule that the buttons act on everything shown when
  nothing is selected. The folder name came from Chrome's `sender.tab.url`, not
  from the message.

  Also confirmed by construction rather than by a run, on 2026-09-13: the gate
  test cannot go stale. Adding an invented type to `ACCEPTED` with no fixture
  turned it red; adding one with a fixture but no validator turned it red in a
  different case, because `validate` refuses an accepted type it has no
  validator for. Both were watched, then reverted.

  **Not confirmed.** The refusal path has never run in Chrome: no real message
  has been rejected, only fixtures. The `data:` URI naming branch in
  `src/worker.js` has never executed, because that page embeds nothing. The
  `MAX_URLS` ceiling has never been reached. And Chrome did not ask about
  multiple downloads, which may mean it does not for extension-initiated
  downloads or may mean nine is under whatever threshold it uses; this does not
  distinguish those.

- **2026-09-13, the top layer fix, 0.8.0.** Four checks, all in Chrome. Trap 2
  with the transform on: a drag reporting `X, Y = 145, 230` drew at CSS 144.9,
  229, so the rectangle lands on the reported coordinates instead of nineteen
  pixels away. Trap 1 with the blocking sheet up and five seconds left on its
  countdown: a 1206 x 317 drag completed, where the same attempt before the fix
  produced nothing for the full fifteen seconds, and the overlay renders at full
  colour while the page behind it is washed grey, which is what painting above
  the sheet rather than under it looks like. Trap 3, shouty CSS: the Inspector
  panel is unchanged, so the top layer did not alter how the shadow root relates
  to the page. And all four tools on `connectedgeek.net`, which is the check
  that mattered most, because the fix changes how every tool is positioned in
  order to repair two conditions.

  The specification claim in the section below is therefore no longer only a
  specification claim for the two cases tested. It remains untested for a page
  that is itself using the top layer.

- **2026-09-13, a deliberate reversal that came with it.** `Z_INDEX` sat below
  the maximum specifically so that an element the page placed higher would stay
  visible rather than be hidden behind this overlay. The top layer discards
  that: CG Scope now covers page furniture at any z-index, the maximum
  included. That is correct for a tool whose job is to sit over a page and be
  used, and it is a reversal of a stated decision rather than a refinement of
  it, so it is recorded in the header of `src/shared/overlay.js` and beside the
  constant, whose old rationale would otherwise have read as current and true.

- **2026-09-13, trap 1, an element at z-index 2147483647.** Confirmed in two
  halves, and the second half is the one that matters.

  *Painting.* The overlay sits underneath and is tinted by whatever the covering
  element paints. Under the fixture's `rgba(20, 20, 30, 0.35)` sheet the panel
  looks almost unchanged, because the panel is nearly black already, and the
  ruler's orange rectangle goes visibly muted brown. Nothing looks broken. It
  looks like a slightly dimmer tool.

  *Interaction.* The fixture's original sheet sets `pointer-events: none`, so
  the tool remained completely usable and a 747 x 447 drag completed normally.
  The card's stated expectation was "unusable", which that sheet could not
  produce: the trap tested painting and the expectation was about input. A
  second button was added that raises the same sheet with `pointer-events:
  auto`, which is what a cookie wall or a modal backdrop actually does, and
  removes it after fifteen seconds because while it is up the button that
  started it cannot be clicked either. Under that sheet **nothing could be
  drawn or dragged at all** for the full fifteen seconds.

  So the cost of sitting at 2147483000 is not cosmetic. Against a covering
  element that takes input, the tool is unreachable, and it is unreachable
  silently: the popup launches it, no error appears, and the page simply does
  not respond.

- **2026-09-13, trap 2, a `transform` on `html`.** Confirmed broken. The
  overlay is positioned against the transformed root rather than the viewport,
  because a transformed ancestor becomes the containing block for its
  fixed-position descendants, and the host is `position: fixed` attached to
  `documentElement`, which is the element being transformed.

  The numbers stay correct and only the drawing moves, which is the more
  confusing of the two failure modes. `clientX` and `clientY` are viewport
  coordinates that a transform does not touch, so the panel accurately reports
  the drag that was performed; the rectangle is simply drawn somewhere else, so
  the tool cannot be aimed. Measured against the fixture's `scale(0.98)` with
  `transform-origin: top center`: a drag starting at `X, Y = 10, 8` drew at CSS
  x 28.6, and `945 + 0.98 x (10 - 945)` is 28.7, where 945 is the horizontal
  centre. The model fits to within a pixel.

- **2026-09-13, the package step's refusals.** Three have executed against real
  state rather than a fixture: the dirty-tree refusal, which named `build.ps1`
  once and then caught a `git commit` that had silently done nothing because
  nothing was staged; and the wrong-package refusal, which named fourteen
  backslashed entry names and deleted the archive it had just written. Still
  never executed: the no-commits refusal, and the refusal on a zip that already
  exists for that version.

- **2026-09-13, the package success path, and the archive read back by another
  tool.** `cg-scope-0.7.0.zip`, fifteen entries, 51,307 bytes. `tar -tf` is
  bsdtar, which ships with Windows and is not the library that wrote the file,
  and it reports all fifteen names with forward slashes. This is the only
  verification in the repository so far that has watched a guard go red against
  a real artifact, applied the fix, and then confirmed the green result with a
  second implementation instead of with the thing under test.

- **2026-09-13, the click guard.** With the inspector open, clicking a link on
  `connectedgeek.net` froze the reading and stayed on the page.
- **2026-09-13, teardown.** Escape followed by a normal click navigated
  normally, so the `document` listeners are being removed.
- **2026-09-13, the clipboard.** `navigator.clipboard.writeText` from an
  injected classic script, under a click inside a closed shadow root, with no
  `clipboardWrite` permission declared. Confirmed by pasting the result and
  comparing it to what the code builds, not by the button saying "Copied". The
  permission stays out of the manifest.
- **2026-09-13, a third-party page.** `github.com` rendered the panel correctly
  and fully styled, which means their content security policy does not block a
  content script's `<style>` in a shadow root, and their sticky header does not
  beat the overlay's z-index.
- **2026-09-13, hostile page CSS.** `test/hostile.html` trap 3 applies
  `font-family`, `letter-spacing` and `border-radius: 0` with `!important` to
  `*`, plus an outline on every `div`. The inspector panel was completely
  unaffected: its own font, its rounded corners and its cell borders all
  survived. This is the strongest available test of the shadow root and it is
  the reason every tool can be trusted on a page it has never seen.

  Two details from the same run, worth keeping. The inspector reported
  `body.shouty` as `-apple-system` while the page rendered in Comic Sans, which
  is **correct**: the fixture's selector is `body.shouty *`, matching
  descendants and not `body` itself. The tool read the computed style rather
  than describing what the page looks like. And the whole run happened on a
  `file://` URL, so the `file` branch in `src/shared/pages.js` executed for the
  first time and permitted the tools to run. The exact wording it displays has
  still not been looked at.

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

   **v1 ended at 0.10.0.** `src/worker.js` exists, because `chrome.downloads`
   is not available to content scripts and the five tools are content scripts,
   so the Images tool's Download button had no other caller. Item 3 below said
   how this was to be done if it ever happened, and that is what was followed:
   planned, not bolted on. The worker holds no state (invariant 9), accepts
   only what `src/shared/messages.js` lists (trust boundary 3), and does one
   thing. The original reasoning still stands for everything else: no tool
   starts without a click, and nothing else belongs in there.
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

**Done:** 0 through 8. The repository skeleton, the build guards and their
selftest, the manifest and popup, the overlay host, the ruler, the inspector
with page-wide colours and fonts, the colour picker, and the page report.

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
9. **Responsive preview. Dropped, not deferred.** The clean implementation
   loads the page in a sized iframe and a large share of sites refuse to be
   framed. The fallback is resizing the browser window, which is disruptive
   and strictly worse than Chrome's own device mode at Ctrl+Shift+M. Building
   it would spend a version on a weaker copy of a feature one keystroke away.
   Reopen this only with an argument about what the built-in cannot do.
10. **The cold-path pass.** `test/hostile.html` produces the remaining
    Unverified conditions deliberately, one at a time. Also still owed from
    `docs/CHROME-EXTENSION-TRAPS.md` section 9: a clean profile with no stored
    colours, and a page that rewrites its DOM after load.
11. **Decide whether to move to an unlisted listing.** Not before item 10.

### The known fix for traps 1 and 2, built and confirmed in 0.8.0

Both the maximum-z-index case and the transform-on-`html` case have the same
remedy: put the overlay host in the **top layer** with the Popover API
(`host.popover = 'manual'; host.showPopover()`). Top-layer elements paint above
all normal content regardless of z-index, and are not positioned relative to a
transformed ancestor. It would need the default popover styling reset and a
fallback for when `showPopover` is unavailable.

**The condition for building it has been met.** It was held back because
swapping the positioning model of every tool to repair two failures nobody had
observed risks breaking what works. Both were observed on 2026-09-13 and both
are recorded under Confirmed above: the transform case puts the drawing in the
wrong place while the numbers stay right, and the maximum-z-index case makes
the tool silently unreachable when the covering element takes input.

Both caveats written here before it was built have been discharged. The claim
that a top-layer element is not positioned relative to a transformed ancestor
was taken from the specification and is now observed against trap 2, and
`showPopover` on a host element inside an arbitrary page has executed, on the
fixture and on `connectedgeek.net`. See Confirmed above for the measurements.

What is still only reasoning: the behaviour when the page itself is using the
top layer, with a modal `<dialog>` or something fullscreen. The later entrant
wins and this extension is not guaranteed to be it. No fixture produces that
condition yet, so it is not on the Unverified list either, which is worse than
being on it.

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
