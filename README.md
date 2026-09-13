# CG Scope

A Chrome extension, built by Connected Geek for its own use, that tells you how
the page in front of you is put together. Measure distances, read an element's
spacing, type and colour, sample any pixel on screen, and see what the page
weighs and which of its images are oversized or missing alt text.

Runs unpacked. Makes no network requests. Stores nothing outside the browser.

## Where to start

**`CLAUDE.md`** is the file that matters. It carries the single purpose
sentence, the invariants, the permission surface with every line justified, the
trust boundaries, the defect log, the decisions that are settled, and the
numbered plan. Read it before changing anything, including the parts that look
like they only need a small edit.

Everything else in the repository is downstream of that file, and this one is
deliberately thin so that the two cannot drift apart. Its Layout section names
every other file and what each is for; that list is not repeated here, because
a description written in two places is a description that will eventually
disagree with itself.

## Running it

```
chrome://extensions  ->  Developer mode  ->  Load unpacked  ->  this folder
```

Reloading the extension does not reload code already injected into an open tab.
Reload the page too, or you will debug a version that is no longer on disk.

## Checking it

```powershell
.\build.ps1 check      guards: version, version bump, permissions, no network
.\build.ps1 selftest   proves those guards can fail, against fixtures
.\build.ps1 version    the version, from manifest.json, its only home
```

`check` passing does not mean the extension works. It means the code is allowed
to do what it does. Only Chrome runs the extension, and `check` says so itself
every time it passes.
