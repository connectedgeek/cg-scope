# Getting a version into a browser

Adapted for CG Scope from the runbook carried out of the Connected Geek
Diagnostic Tool. **What changed and why:** that runbook assumed Web Store
distribution from day one. CG Scope runs unpacked for now (`CLAUDE.md`,
Settled, item 5), so the store procedure is real but deferred. Part A is what
you do today. Part B is dormant until item 11 of Outstanding.

Nothing in Part B has been executed. It is a specification, not a description.

---

## Part A: unpacked, which is where this lives now

### A1. What actually makes a change live

| You changed | What makes it live |
|---|---|
| Anything in `src/` or `manifest.json` | The reload button on the card in `chrome://extensions` |
| A tool that is already injected into an open tab | **Nothing.** Reload the page. Reloading the extension does not touch code already running in a page. |
| The popup | Close and reopen it |

The second row is the one that costs an hour. You reload the extension, trigger
the tool in the tab you already had open, watch the old behaviour, and conclude
the fix did not work. Reload the page.

### A2. Before you believe a change works

Name the action that executed the path. Not "I read it and it looks right."

For a tool module the action is: open a page that is not
`connectedgeek.net`, click the icon, run the tool, and look at the result.
`connectedgeek.net` is the page you have been testing on all along, which makes
it the page least likely to reveal anything.

### A3. Once a week, or after anything structural

Run the cold-path list in `docs/CHROME-EXTENSION-TRAPS.md` section 9, minus the
store-only items. In particular:

- [ ] A fresh Chrome profile with no `chrome.storage` contents
- [ ] A restricted page (`chrome://extensions`, the Web Store) and confirm the
      message is a clear explanation rather than silence
- [ ] A page that rewrites its DOM after load
- [ ] A page with aggressive global CSS, to prove the shadow root holds
- [ ] A page whose images are cross-origin from a host that does not expose
      resource timing, and confirm the image inventory says "unknown" rather
      than reporting a confident zero. See invariant 5: if broken and working
      look the same, it is not a check.
- [ ] Every optional permission declined, then granted, then revoked mid-session

### A4. The guard that matters most

`build.ps1 check` enforces invariant 11, zero network requests. It is not
trusted until it has been watched failing. Break it deliberately, confirm red,
restore, confirm green. Repeat that after any change to the guard itself.

---

## Part B: the unlisted Web Store path, dormant

Do not start this before item 10 of Outstanding is done. The whole reason for
the ordering is that **you cannot hot-fix.** A website is corrected in minutes.
An extension is corrected when Google finishes reviewing the next version and
Chrome decides to push it out.

### B1. Before anything, read `docs/PENDING-DISCLOSURES.md`

If it lists an unresolved item, stop and publish the documents first.

This is first rather than last on purpose. On the previous project the same
gate was written down twice, in bold, and walked past anyway, because it sat at
the end of a procedure a person was already three steps into. It was open for
three days and found by an audit rather than by anything failing.

While CG Scope collects nothing, this file should stay empty permanently. **An
entry appearing in it is itself the alarm**, not a routine step: it means the
extension started collecting something, which means the single purpose sentence
needs re-reading before the code does.

### B2. Re-read the policy pages

The sources listed at the end of `docs/CHROME-EXTENSION-TRAPS.md` move, and the
dates recorded in that file have not been verified against Google's live
documentation. Verify before a first submission, not from memory.

### B3. Bump the version

`manifest.json` `version` is the one Chrome reads. The Web Store refuses an
upload whose version is not higher than the published one, which is the only
guard in this procedure you get for free.

If the version appears anywhere else, they change in the same commit and
something checks. On the previous project a version file silently failed to
update and the check that missed it compared **file sizes**, which were
identical between the two versions. Compare content.

### B4. Build and package

```
.\build.ps1 package
```

It refuses when the tree is dirty, the version was not bumped, `check` fails, a
permission has no justification in `CLAUDE.md`, `PENDING-DISCLOSURES.md` has an
unresolved item, or a prohibited pattern is present.

### B5. Look inside the package

Not optional, and not satisfied by the build printing "done".

- [ ] The version in the packaged `manifest.json` is the one you intended
- [ ] Permissions are exactly the expected set, no extras
- [ ] No source maps, no `.env`, no test fixtures, no notes to yourself
- [ ] No remote script references
- [ ] File count and total size are close to last time. A sudden jump means
      something got swept in.

Record the package's SHA-256 next to the version, so "is the thing in the store
the thing I built" is answerable later.

### B6. Upload and submit

- [ ] **Package** uploaded, version correct
- [ ] **Store listing**: description matches what it actually does, screenshots
      show features that exist
- [ ] **Privacy practices**: single purpose stated, every permission justified
      individually and specifically. "Required for functionality" is a
      rejection; name the feature. The permission table in `CLAUDE.md` is the
      text to use.
- [ ] **Data collection**: declare none, and confirm that is still true by
      running `build.ps1 check` rather than by remembering
- [ ] **Distribution**: unlisted

### B7. Verify what the store actually serves

Everything before this verified your build against your intent. This is the
only step that verifies what users get.

- [ ] Install from the unlisted link on a **clean profile**, not the unpacked
      development copy
- [ ] Confirm the version in `chrome://extensions` matches
- [ ] Run every tool end to end from that installed copy

A published item is not verified because the dashboard says published.

### B8. Keep the artifact

To roll back you resubmit, which means another review. Keep the previous
version's zip and its hash.

---

## After anything goes wrong

Write the defect log entry in `CLAUDE.md` the same day. Not a summary next
week. The same day, while you still remember the detail you would not have
thought to mention.
