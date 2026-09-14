# Getting a version into a browser

Adapted for CG Scope from the runbook carried out of the Connected Geek
Diagnostic Tool. **What changed and why:** that runbook assumed Web Store
distribution from day one. CG Scope runs unpacked for now (`CLAUDE.md`,
Settled, item 5), so the store procedure is real but deferred. Part A is what
you do today. Part B is the public Chrome Web Store path, and it is live as of
2026-09-14.

Nothing in Part B has been executed. It is a specification, not a description,
and it stays that way until the first submission has been through it.

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
- [ ] Reload the extension with a tool open, then click a link on the page.
      An orphaned content script keeps its document listeners; Escape still
      reaches it, and nothing signposts that

### A4. The guard that matters most

`build.ps1 check` enforces invariant 11, zero network requests. It is not
trusted until it has been watched failing. Break it deliberately, confirm red,
restore, confirm green. Repeat that after any change to the guard itself.

---

## Part B: the public Web Store path

**Decided 2026-09-14.** This was written for an *unlisted* listing, gated behind
items 10 and 11 of Outstanding, on the reasoning in Settled item 5: publish once
the tools have stopped changing, because there are no hot fixes. That was
overruled deliberately, not forgotten. Recording it here so that nobody later
reads the old gate and assumes the sequence was followed.

What that costs you, stated once: every correction waits on review. A mistake
found the day after launch is fixed when Google finishes reviewing the next
version and Chrome decides to push it. Nothing below removes that. It only
reduces how many mistakes are available to find.

Unlisted is not a lighter path, verified against Google's documentation on
2026-09-13: every visibility setting carries identical policy requirements and
the same review.

### B1. Before anything, read `docs/PENDING-DISCLOSURES.md`

If it lists an unresolved item, stop and publish the documents first.

This is first rather than last on purpose. On the previous project the same gate
was written down twice, in bold, and walked past anyway, because it sat at the
end of a procedure a person was already three steps into. It was open for three
days and found by an audit rather than by anything failing.

While CG Scope collects nothing, this file should stay empty permanently. **An
entry appearing in it is itself the alarm**, not a routine step: it means the
extension started collecting something, which means the single purpose sentence
needs re-reading before the code does.

Note that until 0.11.1 the gate could not see an entry written below the
template, which is where the template tells you to write one. Fixed, with a case
that fails without the fix. If you are reading this on an older checkout, read
the file with your eyes.

### B2. Re-read the policy pages

Verified 2026-09-14 against Google's live documentation. Recorded so the next
person re-checks rather than re-derives:

- **Single purpose**: "An extension must have a single purpose that is narrow
  and easy to understand." The violation example that applies here is
  "extensions offering wide-ranging features or multiple service entry points".
  CG Scope has five entry points. The single purpose sentence in `CLAUDE.md` is
  the text to paste into the dashboard field, and the paragraph under it names
  the fallback if a reviewer pushes: Download comes out of the published build.
- **Limited Use**, strengthened 1 August 2026: "Any user data collected by an
  extension must now be strictly necessary to the extension's disclosed single
  purpose." CG Scope collects nothing, so this is the easiest requirement on the
  page and the strongest thing it has to say publicly.
- **Privacy policy**: required only "if your Product handles any user data".
  CG Scope does not. The data-use disclosure form is still completed. The policy
  is published anyway at `https://scope.connectedgeek.net/#privacy`, because a
  claim with a permanent address is worth more than one made in a form.
- **Publication limit**: a new publisher gets two extensions by default,
  increasable on request. Relevant only if the image tool is ever split out.
- The **Featured badge is discontinued** and ratings weight recent reviews.
  Discovery on the store is weaker than it was, which is why the landing page
  matters.

These move. Verify before a first submission, not from memory.

### B3. Decide the version, then bump it

`CLAUDE.md` Versioning says the first submission is `1.0.0`. That is a decision
to take deliberately at this step, not a number to drift into.

`manifest.json` `version` is the one Chrome reads. The Web Store refuses an
upload whose version is not higher than the published one. Since 0.11.1 the bump
guard also refuses a version that goes *backwards*, which it previously allowed,
so a typo is caught here rather than by a rejected submission.

### B4. Build and package

```
.\build.ps1 selftest
.\build.ps1 package
```

`selftest` first, and this is not ceremony: `package` runs `check`, and `check`
does not run `selftest`. A guard that has quietly stopped being able to fail
will let `package` through.

`package` refuses when, and this list is what the code does rather than what was
once specified for it:

- `check` fails, which covers the version format, the version bump, the
  permission justifications, the network scan and the JavaScript syntax guard
- `check` cannot run its syntax guard because node is missing. It returns
  UNKNOWN, not PASS. Before 0.11.1 it returned PASS, which would have shipped a
  release in which nothing was parsed
- `docs/PENDING-DISCLOSURES.md` lists an unresolved item
- the working tree is dirty
- there are no commits
- a zip already exists for that version
- the archive it just wrote does not contain what it should, in which case it
  **deletes the archive** rather than leaving a rejected file on disk

### B5. Look inside the package

Not optional, and not satisfied by the build printing "done". `package` does
most of this itself now and prints what it found; your job is to read it rather
than scroll past it.

- [ ] The version in the packaged `manifest.json` is the one you intended
- [ ] Permissions are exactly `activeTab`, `downloads`, `scripting`, `storage`
- [ ] File count and total size are close to last time. A sudden jump means
      something got swept in. On 2026-09-14 a `git add -A` swept a folder of
      generated files into a commit; the same thing can happen to a package
- [ ] The entry names use forward slashes. Until 0.9.0 they did not, and the
      inspection that was supposed to catch it was comparing against the wrong
      strings, so it had never been able to fire

Confirm the entry names with something that is not the library that wrote the
file:

```
tar -tf dist\cg-scope-<version>.zip
```

`dist/RELEASES.txt` records the date, version, SHA-256, file count, byte count
and commit for every package, so "is the thing in the store the thing I built"
is answerable months later.

### B6. Upload and submit

- [ ] **Package** uploaded, version correct
- [ ] **Single purpose**: paste the sentence from `CLAUDE.md`. Do not improvise
      a broader one at the keyboard; if it needs to change, change it in
      `CLAUDE.md` first, where the reasoning lives
- [ ] **Store listing**: description matches what it does. The `manifest.json`
      description is 126 characters and is the short one
- [ ] **Screenshots**: five, 1280x800, one per tool, taken from Chrome. The
      panels on the landing page are the extension's stylesheet rebuilt in
      HTML. They are accurate and they are drawings. Do not submit them
- [ ] **Privacy practices**: every permission justified individually and
      specifically. "Required for functionality" is a rejection; name the
      feature. The permission table in `CLAUDE.md` is the text to use, and it is
      the same text as the landing page's table by design
- [ ] **Data collection**: declare none. Confirm it by reading, not by running
      `check`: `check` inspects networking constructs, permissions, versions and
      syntax, and nothing in it examines `chrome.storage` or the clipboard. This
      step used to say "confirm by running build.ps1 check rather than by
      remembering", which read as mechanical verification and was a memory check
      wearing a command's clothes. It is how an undisclosed preference survived
      until the 2026-09-14 audit
- [ ] **What is stored**, and this must stay exhaustive because three documents
      are built from it: the last twelve sampled colours, the copy-on-sample
      toggle, and which format it copies. All in `chrome.storage.local`. If that
      list ever grows, `docs/PENDING-DISCLOSURES.md` gets an entry the same day
- [ ] **Privacy policy URL**: `https://scope.connectedgeek.net/#privacy`
- [ ] **Distribution**: public

### B7. Verify what the store actually serves

Everything before this verified your build against your intent. This is the only
step that verifies what users get.

- [ ] Install from the public listing on a **clean profile**, not the unpacked
      development copy
- [ ] Confirm the version in `chrome://extensions` matches
- [ ] Read the install warning. It should be exactly one, "Manage your
      downloads", and the landing page says so. If Chrome shows anything else,
      the manifest and the page disagree and the page is wrong
- [ ] Run every tool end to end from that installed copy
- [ ] Open the landing page and walk its own three verification steps as a
      stranger would, including clicking through to the repository

A published item is not verified because the dashboard says published.

### B8. Keep the artifact

To roll back you resubmit, which means another review. Keep the previous
version's zip and its hash. `dist/` is gitignored, so this is a deliberate act
rather than something git does for you.

### B9. After it is live

- [ ] The landing page's Add to Chrome button still says "Coming to the Chrome
      Web Store" until you edit it. The two edits are marked `EDIT:` in
      `site/index.html`
- [ ] Ratings weight recent reviews, so the first few matter more than they
      will later

---

## After anything goes wrong

Write the defect log entry in `CLAUDE.md` the same day. Not a summary next
week. The same day, while you still remember the detail you would not have
thought to mention.
