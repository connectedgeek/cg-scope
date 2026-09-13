# Chrome extension traps

Platform behaviour that is not obvious, and the Web Store rules that decide
whether you ship at all. The policy sections in particular move, so re-read the
linked pages before a submission rather than trusting this file.

## Verification log

Re-reading the sources is only useful if the result is written down. Otherwise
the next person re-reads them from scratch and cannot tell what has already
been settled, or which parts of this file are carried-over memory rather than
something anyone checked.

**2026-09-13, against Google's live pages.** Three claims confirmed, one
corrected, one withdrawn.

- **Confirmed.** The Limited Use tightening is real: announced 1 July 2026,
  effective 1 August 2026, requiring user data to be "strictly necessary to the
  extension's disclosed single purpose". The same update adds the requirement
  to proactively disclose a change in data handling after installation.
  **Note the trap:** the Limited Use policy page itself still carries "Last
  updated 2022-11-01" and does not mention the change. The substance is in the
  blog post. Anyone checking only the policy page will conclude the 2026 change
  does not exist.
- **Confirmed.** All Chrome Web Store visibility settings, public, unlisted and
  private, "have the same policy requirements and will go through the same
  review process". Unlisted is not a lighter path. It changes who can find the
  item and nothing else.
- **Confirmed.** Registration requires a one-time fee.
- **Corrected.** The Manifest V2 paragraph below. The previous wording was
  wrong about what happens and about a year late on when.
- **Withdrawn.** A specific dollar figure for the registration fee was quoted
  in conversation during this project. The documentation does not state one; it
  appears on the registration screen in the developer dashboard. Do not repeat
  a number nobody has read off that screen.

---

**Manifest V3 is the only option, and has been for over a year.**

The previous wording here said "Manifest V2 extensions are removed from Chrome
on 31 August 2026", which conflates two separate events and understates how
long this has been settled.

| Date | What actually happens |
|---|---|
| 24 July 2025 | Manifest V2 disabled everywhere, with Chrome 138. Users can no longer turn them back on. |
| Chrome 139 | The `ExtensionManifestV2Availability` enterprise policy removed. |
| 31 August 2026 | Remaining Manifest V2 extensions removed **from the Chrome Web Store**. Copies already installed on Chrome 138 or earlier keep working, without updates. |

Manifest V2 stopped functioning in the browser fourteen months ago, and the
2026 date is a delisting rather than a shutdown. That date has also already
passed. None of this changes the decision; it removes a reason to think of it
as a deadline still ahead.

---

## 1. The service worker dies, constantly, and that is the design

There is no persistent background page. The service worker starts when an
event needs it and Chrome terminates it again. The documented behaviour:

| Condition | Result |
|---|---|
| 30 seconds with no activity | Terminated |
| A single request taking over 5 minutes | Terminated |
| A `fetch()` whose response takes over 30 seconds | Terminated |

The idle timer is reset by receiving an event, calling an extension API, a
WebSocket message, a long-lived messaging port, an offscreen document message,
or a native messaging connection.

**Every global variable is lost on termination.** A counter, a cache, a
"logged in" flag, a reference to an open connection: gone, silently, and the
next event starts from a fresh script evaluation. `localStorage` is not
available to an extension service worker at all. Persist to `chrome.storage`,
IndexedDB or CacheStorage, or accept losing it.

**`setTimeout` and `setInterval` do not survive.** Use the `chrome.alarms` API
for anything that needs to happen later. A timer set for two minutes on a
worker that idles out after thirty seconds simply never fires.

### The single most common MV3 bug

**Register every event listener synchronously, at the top level of the service
worker script.** Google's own wording is that this "ensures that Chrome will be
able to immediately find and invoke your action's click handler, even if your
extension hasn't finished executing its startup logic."

```js
// CORRECT. Registered during the initial evaluation, so the event that woke
// the worker finds a listener waiting.
chrome.runtime.onMessage.addListener(handleMessage);
chrome.alarms.onAlarm.addListener(handleAlarm);

async function handleMessage(msg, sender, sendResponse) {
  const config = await chrome.storage.local.get('config');   // async work goes HERE
  ...
}
```

```js
// WRONG, and it will work perfectly during development.
(async () => {
  const config = await chrome.storage.local.get('config');
  chrome.runtime.onMessage.addListener(handleMessage);   // too late
})();
```

The wrong version works while you are testing, because the worker is already
warm from the last thing you did. It fails in the field, intermittently,
whenever the worker had gone to sleep. This is the `LESSONS-LEARNED.md` item 1
shape exactly: a path that only executes on a cold start, which is the one
state you never see while developing.

**Test it deliberately.** In `chrome://extensions`, stop the service worker,
then trigger the event and confirm it is handled. Do this for every event the
extension listens to, not just the one you were working on.

---

## 2. No remotely hosted code. Not "discouraged", not allowed

Google's requirement is that "the full functionality of an extension must be
easily discernible from its submitted code". Prohibited:

- `<script>` tags pointing anywhere outside the package
- `eval()` or equivalent on a remotely fetched string
- **A remote interpreter**: fetching "commands" as data and executing them.
  Calling it configuration does not help. Google names this case explicitly.

Permitted: syncing user data with a server, fetching a configuration file for
A/B testing **where all the logic is already in the extension**, loading images
and other non-functional resources, and server-side processing of data.
Narrow exemptions exist for the Debugger API and the User Scripts API.

Practically this means bundling. Everything ships in the zip, no CDN, no
Google Fonts link, no analytics snippet loaded at runtime. Inline your CSS and
JS or package the files; embed fonts and images.

---

## 3. Permissions are the main reason submissions get rejected

Three separate places must agree, and none of them validates the others:

1. `manifest.json`
2. The justification text for each permission in the Web Store submission
3. What the code actually does

Rules worth adopting before you need them:

- **`activeTab` instead of host permissions**, wherever the interaction begins
  with the user clicking your extension. It grants access to the current tab on
  invocation, produces no install-time warning, and is far easier to justify
  than `<all_urls>`.
- **Narrow host patterns** over broad ones. `https://example.com/*` reviews
  cleanly; `*://*/*` invites a request for justification and a scary install
  warning that costs you users.
- **`optional_permissions`** for anything a subset of users need. Request at
  the moment the feature is used, with the feature visible on screen, so the
  prompt makes sense.
- **Delete permissions when the feature goes.** A permission whose feature was
  removed is an unexplained capability that will be queried at the next review.

**Handle the denial path.** `chrome.permissions.request()` can return false and
the user can revoke later. An extension that breaks silently when a permission
is declined is the classic never-executed path.

---

## 4. Limited Use, strengthened 1 August 2026 (verified 2026-09-13)

This is the one most likely to catch you out, because it is the opposite of how
the diagnostic tool was designed.

> Any user data collected by an extension must be strictly necessary to the
> extension's disclosed **single purpose**.

The diagnostic tool collects thirty-three categories because a technician might
want any of them. **An extension may not reason that way.** If you cannot point
from a piece of data to the one stated purpose, you may not collect it.

Also in force:

- Collection and use of **web browsing activity is prohibited** except where it
  powers a prominent user-facing feature
- No personalised advertising use
- No selling or transferring to data brokers, advertising platforms or
  resellers
- No using the data for credit-worthiness or lending decisions
- **No human reading raw user data without explicit user consent**, with narrow
  security and legal exceptions

That last one deserves attention if you intend to look at what users send, the
way a technician reads a diagnostic report. On the previous project that is
exactly the workflow, and it works because the person clicks a consent box
naming it. Plan the equivalent from the start.

### Disclosure, including after install

The 2026 update requires prominent notification of all data collection
regardless of how it relates to the stated function, and requires developers to
**proactively disclose if data handling practices change after installation**.

An updated page on your website is not proactive disclosure to somebody who
installed six months ago. Decide now how you will reach existing users when
this happens, because it will.

This is the `PENDING-DISCLOSURES.md` gate from the previous project with a
legal deadline attached. Keep the file, and treat "publish the extension
update" as the choke point the way "open the download page" was before.

### Three places the disclosure lives

- The **privacy policy** on your own site, linked from the listing
- The **privacy practices tab** in the developer dashboard, which is a separate
  form and is what users see on the listing
- The **in-extension consent**, if you collect anything meaningful

They must agree. On the previous project the equivalent three drifted twice,
and the fix was a test that fails the build when the on-screen disclosure lists
fewer categories than the code collects. Write that test early; it costs
almost nothing and it never needs maintenance.

---

## 5. Content scripts

- They run in an **isolated world**: your JavaScript objects and the page's are
  separate, even though you share the DOM. You cannot read the page's variables
  and it cannot read yours. To reach page JavaScript you have to inject into
  the main world deliberately, which is a decision, not a detail.
- **The page is hostile.** It can rewrite the DOM under you, define properties
  that shadow what you expect, and feed you anything. Treat everything read
  from the page as untrusted input.
- Content scripts do **not** get most `chrome.*` APIs. They message the service
  worker, which holds the permissions. That message is a trust boundary: the
  content script is next to hostile content, the worker is not.
- **Validate `sender`** in `chrome.runtime.onMessage`. If `externally_connectable`
  is set, pages you listed can message you too.
- Reloading the extension does not reload content scripts already injected into
  open tabs. Reload the page as well, or you will debug a ghost.

---

## 6. The extension CSP

Manifest V3 forbids inline scripts and `eval` in extension pages by default,
and the default cannot be loosened to allow remote code. Practical effects:

- No `onclick="..."` attributes; attach listeners in JavaScript
- No inline `<script>` blocks in your popup or options HTML
- No `eval`, no `new Function`, and no libraries that rely on them at runtime
  (some template engines and older bundler configurations do; check before
  adopting)

---

## 7. Storage

| API | Use it for | Watch out |
|---|---|---|
| `chrome.storage.local` | Everything by default | Larger quota, stays on the device |
| `chrome.storage.sync` | Small settings the user wants across machines | Tight per-item and total quotas, write-rate limits, and **it silently stops writing when you exceed them** |
| `chrome.storage.session` | In-memory, cleared on browser restart | Good for a worker's "state" that should not outlive the browser |
| IndexedDB | Large structured data | |

`chrome.storage.sync` quota exhaustion is a textbook item 4 case: the write
fails and the extension carries on looking normal. Check for the error.

---

## 8. Getting through review

- **Single purpose.** Write it in one sentence before writing code. An
  extension that does two unrelated things is rejected, and "unrelated" is
  Google's judgement, not yours.
- **Justify every permission** in the submission, specifically, naming the
  feature. "Required for functionality" is a rejection.
- **Privacy policy URL** is required if you handle any user data. It must be
  reachable, and it must actually describe what the extension does.
- **The listing must match the extension.** Screenshots of features that do not
  exist, or a description promising more than it does, is a rejection.
- **Unlisted is not a lighter path.** Verified 2026-09-13: all visibility
  settings, public, unlisted and private, "have the same policy requirements
  and will go through the same review process". Choosing unlisted changes who
  can find the item. It does not skip review, the privacy practices form, or
  any program policy. Decide distribution on its merits, not in the hope of an
  easier submission.
- **Expect review latency and plan for it.** This is a release constraint, not
  an inconvenience: you cannot hot-fix. A bug that reaches the store stays
  there until a new version is reviewed and rolled out.
- **Keep the previous version's zip.** Rolling back means resubmitting, so you
  need the artifact.

---

## 9. What to test that nobody tests

Each of these is a path that is easy to reason about and almost never run.

- [ ] First install on a clean profile, with no existing storage
- [ ] Update from the previous published version, with existing storage
      present, including any migration
- [ ] Cold start: stop the service worker in `chrome://extensions`, then fire
      each event the extension listens to
- [ ] Every optional permission declined, then granted, then revoked mid-session
- [ ] The backend unreachable, if there is one
- [ ] A page that actively fights the content script, or at minimum one that
      rewrites the DOM after load
- [ ] `chrome.storage.sync` at quota
- [ ] Uninstall, and whatever cleanup you promised in the privacy policy

---

## Sources

Checked on 2026-09-13, with the result recorded in the verification log at the
top of this file rather than left as "I looked at it".

- [Manifest V2 support timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline)
- [Prepare to publish: set up distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Register as a Chrome Web Store developer](https://developer.chrome.com/docs/webstore/register)
- [The extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Migrate to a service worker](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
- [Chrome Web Store policy updates: Enhancing user privacy and platform integrity](https://developer.chrome.com/blog/cws-policy-updates-2026)
- [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Additional Requirements for Manifest V3](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
