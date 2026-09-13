# Lessons from the Connected Geek Diagnostic Tool

Written 2026-09-11, at the end of the session that shipped 0.9.19.

This is not a summary of what the project does. It is the list of things that
went wrong, what each one cost, and the rule that came out of it. Every item
here is a real defect with a date, because a lesson without a corpse attached
is just an opinion.

Read it once before starting the extension. The next document,
`CLAUDE.md`, is the operational version of the same material, written to be
read by whoever is working in the repo on any given day.

---

## 1. A path that has never executed is not tested, however carefully it was reviewed

This is the only lesson on the list that caused the same failure five separate
times, and it kept happening after it was written down.

| What | How it failed |
|---|---|
| Composite `Resolve` | No action sequence had ever been startable. Nobody had run one. |
| Hidden login bug | Survived because nobody had ever signed in to the dashboard. |
| `network.dns.repair` | The only repair a customer can run, never run from the client build. |
| `cg_issue_technician_code` | Defaulted to 200 uses against a `CHECK (max_uses <= 20)`. **Failed on the very first press, every press.** |
| `cancel` on the privilege boundary | Ungated. Found only when a test was finally written for the boundary. |

The technician code one is the instructive one. Before shipping it I verified
that the function existed, that its grants matched the house pattern, and that
`PUBLIC` had been revoked. I wrote the UI that calls it, the copy describing
it, and the documentation section explaining when to use it.

**I never called it.**

And I had written the rule about this earlier the same day, in the same file,
and then broke it within hours.

**Reviewing a path is not a weak form of running it.** It is a different
activity that produces a different kind of confidence, and the kind it
produces is the kind that survives being wrong. The fix is not "review harder".
It is to find the one action that actually executes the path and do that,
before claiming anything.

For the extension the equivalents are: the first install on a clean profile,
the first update from a previous version, the first run after the service
worker has been terminated, the first run with the permission denied, and the
first submission to the store. All of those are paths, all of them are easy to
reason about and never exercise, and the last two are the ones that bite in
public.

---

## 2. Verify by content. Never by size, and never by a tool's success report

Two failures, same week, different shapes.

**The version file.** `0.9.16` and `0.9.17` are both seven bytes. A sync that
silently did not land was "verified" by checking the size, which proved
nothing. The build then stamped the wrong version onto six binaries and
produced two different programs carrying one version number. Caught by an
unrelated line printing the version twice.

**The file that reported success and wrote stale bytes.** A file was written to
the machine, edited, written again over the same staging path. The second write
returned success with no error, **and the file's modification time on disk
changed**, and the content was the previous version. The timestamp moving while
the content did not is worse than a plain failure, because a timestamp is
exactly what a person reaches for when a hash feels like overkill.

The rule the project already had, and that I had not extended far enough:

> A deploy is not done when the command returns. It is done when the bytes have
> been read back and compared.

That already applied to Vercel deploys, Edge Function deploys and bucket
publishes, each after something had shipped half-done while reporting success.
It now applies to every file write.

For the extension: a packaged `.zip` is not verified because the build printed
"done". Unzip it and check that the files you expect are there and the ones you
do not are absent. An uploaded item is not verified because the dashboard
accepted it. Install it from the store and look.

---

## 3. Prove a guard fails before you rely on it

A guard that cannot fail is decoration that reads like protection, and it is
worse than nothing because it stops anybody looking again.

The technique: write the guard, then deliberately break the thing it protects
and watch it go red. If it stays green, the guard is not testing what you think.

This caught three real cases in one week, **all of them guards that matched
adjacent text rather than their subject**:

- A test asserting a script does not call `Get-Commit` passed because the
  string appeared in the test's own comment
- A test asserting the dashboard renders `with_errors` passed because the
  string appeared in its own comment
- The comment-stripper written to fix the first two passed with half of itself
  disabled, because one counter was shared between line comments and block
  comments

Hence the phrasing that ended up in the project's invariants:

> **Match the construct, never the name of the construct.**

For an extension this bites hardest on permissions and CSP. A test that greps
`manifest.json` for a permission string tells you the string is present. It
tells you nothing about whether the code actually needs it, whether a narrower
one would do, or whether the feature works when the user declines it.

---

## 4. A rule that cannot measure something reports nothing

Recorded as an invariant after a diagnostic rule was found reporting "healthy"
for a machine where the underlying command had failed outright. Silence and
success looked identical.

The generalised form is the one that matters: **any check whose failure mode is
indistinguishable from its success mode is not a check.** If the answer when
things are broken looks the same as the answer when things are fine, delete it
or make it say "I could not tell".

The same week, the nightly retention purge had six runs recorded, all `ok`, all
zeros. That is exactly correct for a week-old system with nothing yet expired,
and it is also exactly what a completely broken purge looks like. The only way
to tell them apart was to backdate one record and watch.

---

## 5. Prose enforced by nobody is not a rule

The project had a written gate: a file tracking every change that needed to
reach the published Privacy Policy, with the rule, in bold, in two separate
documents, that **the file must be empty before the download page opens**.

The download page opened on 9 September. The file was not empty. Nobody noticed
for three days, and it was found by an audit rather than by anything failing.

What saved it from being serious was luck: every download in that window was to
one of my own addresses. No third party ever relied on the understated policy.

The lesson is not "write the rule more clearly". The rule was already clear and
already bold. The lesson is that **a rule belongs at a choke point, enforced by
the thing that does the dangerous action**, and until it is there it is a note
to a person who is busy.

The right place was the one command that opens the download page. It already
refuses half a dozen other conditions. It should have refused this one.

---

## 6. Pushing to git does not deploy anything

Three sessions were lost to this. A fix was written, committed, pushed and
believed live. Two of three systems auto-deploy on push. The third does not,
and nothing said so, so every test run afterwards was testing the old code and
producing confusing results.

Write down, per component, **what makes it live**, and how you can tell whether
it is. For this project: two websites redeploy on push, the serverless function
only moves when a person deploys it, the database only changes when SQL is run,
the downloadable binary only changes when a new file reaches the bucket and a
row is registered, and the remote-support tool only changes when somebody
uploads it by hand. Five components, five different answers, one of which is
"never, silently".

A Chrome extension has the most brutal version of this: **published is not
installed.** Users get the update when Chrome decides to give it to them.

---

## 7. When a convenience and a security bound disagree, the bound is not the thing that is wrong

The technician code function defaulted to 200 uses. The table's constraint
capped it at 20. The tempting fix was to raise the constraint, because 200 was
what my own UI copy promised.

That is backwards. The constraint was the considered answer, written weeks
earlier, to "how many uploads does one leaked code buy an attacker". The copy
was a sentence I had written that afternoon. The function was changed to
respect the table and the copy was corrected.

Write the reasoning next to the bound, so that the person tempted to widen it
later, who may be you, has to argue with the argument rather than with a number.

---

## 8. The shape of the check matters more than the diligence behind it

A change introduced an automated email to customers. It was checked against the
Terms of Service, deliberately and in writing, and the conclusion was "nothing
needed: this section describes what the software does to the Client's
equipment, and an email changes none of that."

Correct about the equipment. But the email said *"a technician will review
it"*, and the Terms said no obligation to respond arises. The check asked the
right question about the wrong dimension.

Every change now gets two questions: **what does it do to the system, and what
does it say to the person?** The second one is where the promises hide.

---

## 9. Two near-identical scripts will diverge

Two documents were being produced by two copies of the same generator. One had
been fixed and one had not, so the same input produced visibly different
output, and nobody could reconstruct why.

Parameterise it. One code path, arguments for the differences. This is obvious
advice that everybody ignores because copying the file takes ten seconds and
parameterising it takes ten minutes.

---

## 10. Two about working with an AI on this, learned the hard way

**The number of times you have looked is not evidence about what is left to
find.** I once argued that eight requests for "what's next" having each
produced a real improvement was itself a reason to stop. That is not an
argument, it is fatigue wearing an argument's clothes. Larry said so, I
conceded, and the next look immediately found a permission gap affecting four
tables instead of one.

**Verify your own work; take the other person's word for theirs.** Late in the
session I fetched a cached copy of a web page, found it stale, and told Larry
his site was not updated when he was looking straight at it. Checking is
valuable when it is pointed at claims I made. Pointed at what a person directly
observes, with a tool that is worse-informed than they are, it is just noise
with a confident voice.

---

## The short version

If you keep nothing else from this file:

1. Run the path. Reviewing it does not count.
2. Compare bytes, not sizes, and never trust "success".
3. Break the thing the guard protects and watch it go red.
4. If broken and working look the same, it is not a check.
5. Put the rule at the choke point or accept that it will be walked past.
6. Know, per component, what makes it live.
7. Bounds beat convenience. Write down why.
8. Ask what it does and what it says.
