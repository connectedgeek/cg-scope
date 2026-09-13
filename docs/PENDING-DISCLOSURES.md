# Pending disclosure changes

Changes to what this extension collects, stores or transmits that have not yet
reached the published documents.

## Why this file exists

Published documents are revised in batches, not on every commit, because a
policy revised eleven times in a week is harder to review than one revised
once. That is only safe if nothing is forgotten in between, and this file is
what makes it safe: **every change that will need to reach a published
document is written here, in the same commit as the code.**

The eventual revision is then a mechanical edit rather than an attempt to
reconstruct three weeks of work from memory.

## The gate

**This file must be empty before a version is published to the Chrome Web
Store.**

That rule existed, in bold, in two documents on the previous project, and was
walked past anyway. It had no teeth because nothing enforced it. So:

- `docs/RELEASING.md` step 1 is reading this file, **before** anything else,
  rather than a check near the end that a person is already past
- The package step refuses to build while an item below is unresolved

If you find yourself tempted to publish with something below unresolved, the
honest options are to publish the documents first or to remove the collection
from the release. There is no third one.

## The three places a disclosure lives

They must agree, and none of them updates the others:

| Where | Updated by |
|---|---|
| Privacy policy on your own site | You, on the site |
| Privacy practices tab, Web Store dashboard | You, in the dashboard, separately from uploading the package |
| In-extension disclosure or consent screen | The code |

The dashboard form is the one that gets forgotten, because publishing a package
does not touch it and nothing complains.

**The in-extension disclosure must never say less than the code does.** Where
this can be enforced by a test that fails the build, enforce it there. On the
previous project that test existed, caught a real drift, and needed no
maintenance afterwards.

## Existing users

The 2026 Chrome Web Store policy requires proactively disclosing a change in
data handling practices to people who have already installed. Updating a page
on your website is not that. Record here, per item, **how existing users will
be told**.

## Two questions per change, not one

A change gets both:

1. What does it do to the user's system or data?
2. What does it **say** to the user?

On the previous project a change was checked carefully against the first
question, correctly, and the second one was the one that mattered: an
automated email promised something the terms said was not promised.

---

---

## CG Scope specific: this file should never gain an entry

CG Scope collects nothing and transmits nothing. That is enforced by invariant
11 in `CLAUDE.md` and by the zero-network guard in `build.ps1 check`, not by
intention.

So for this project the file is not a queue that fills and drains. **An entry
appearing here at all is the alarm.** It means the extension has started
collecting or transmitting something, which means the single purpose sentence
needs re-reading before any disclosure gets written. Handle it in that order:
purpose first, then decide whether the collection survives, then write the
disclosure for whatever is left.


## Pending

*(empty)*

<!--
Template:

## <date>: <what changed>

**Code:** <what the extension now collects, stores or sends, precisely>

**Privacy policy:** <the exact text to add, written now while it is fresh>

**Dashboard privacy tab:** <which category, what justification>

**In-extension:** <what the user is shown, or "nothing, and here is why">

**Existing users:** <how they will be told, or why no notice is owed>

**Resolved:** <date published, or blank>
-->
