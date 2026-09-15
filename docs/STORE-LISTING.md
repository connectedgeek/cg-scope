# Chrome Web Store listing copy

Everything the dashboard asks for, written down before you are sitting in front
of it. `docs/RELEASING.md` B6 is the procedure; this is the text.

**Do not improvise at the keyboard.** Three of these fields also exist in
`CLAUDE.md`, `manifest.json` and the landing page, and the whole point of the
permission table is that all four say the same thing. If a field here needs to
change, change it in `CLAUDE.md` first, where the reasoning lives, then here.

**How to read this document.** Everything inside a fenced code block is what
goes in the dashboard, verbatim. Everything outside one is reasoning about it
and must never be pasted.

That distinction is stated because it failed. On 2026-09-15 the Description
field was filled with the paragraph explaining why the category is Developer
Tools, because the explanation sat next to the value in ordinary prose and read
like copy. Every paste-ready value is now in a fence, including one-word ones
that did not seem to need it.

---

## Name

```
CG Scope
```

## Short description

The `description` field in `manifest.json` is what the store shows. It is 126
characters against a 132 limit. Do not retype it; it is already correct.

```
Inspect a page's measurements, spacing, type, colors and images, then copy or save what you find. Nothing leaves your machine.
```

## Category

```
Developer Tools
```

Not Productivity, not Accessibility. The alt-text flagging is a feature of an
inspection tool rather than an accessibility product, and miscategorising to
reach a bigger audience is the kind of small dishonesty this project has spent
a lot of effort not committing.

## Single purpose

Paste verbatim from `CLAUDE.md`. This is the field the review turns on.

```
Inspect the visual construction of the page you are currently viewing
(measurements, spacing, typography, colors, images and page weight) and take
what you find with you by copying or saving it, without leaving the page and
without sending anything off the machine.
```

The weak phrase is "take what you find with you", covering the copy and save
features. `CLAUDE.md` says why it is defensible, why it is a stretch, and what
to do if a reviewer pushes on it: Download comes out of the published build and
stays in the unpacked one. **Do not answer a reviewer by broadening this
sentence.** That is how one purpose becomes two.

## Detailed description

```
CG Scope tells you how the page in front of you is put together.

Click the toolbar icon, pick a tool, and it appears over the page you are
already looking at. Escape closes it. Nothing is installed into the page.

RULER
Drag a box anywhere and read its width, height, position and ratio. Click any
value to copy it, or copy ready-made CSS.

INSPECTOR
Point at an element for its computed spacing, typography, borders and colors.
Also lists the colors and font families used across the page, scanning up to
six thousand elements and telling you when it stops.

COLOR PICKER
Sample any pixel on screen, not only inside the page. HEX, RGB and HSL, each
one click to copy, with your last dozen kept.

IMAGES
Every img on the page in a grid, filtered by format, with dimensions and
missing alt text flagged. Copy the URLs, copy a table for a spreadsheet, or
save the files. Background images set in CSS, inline SVG and canvas are not
counted, and the tool says so.

PAGE REPORT
What the page weighs, broken down by resource type, and which images are
loaded far larger than they are displayed.

WHAT IT DOES NOT DO

CG Scope contains no networking code. There is no server, no account, no
analytics and no telemetry. Nothing you do with it is transmitted, logged,
shared or sold, because there is no mechanism in the extension by which that
could happen.

Two things involve your browser making a request, both of them it doing what
you asked: pressing Download makes Chrome retrieve the images you picked, and
the image tools draw thumbnails, which the browser loads the same way the page
already did.

Three things are stored on your own computer and nowhere else: the last twelve
colors you sampled, whether you have turned on copy-on-sample, and which of
HEX, RGB or HSL that copies. Removing the extension removes them.

You do not have to take any of that on trust. The source is public and the
check that enforces it is one command:

  https://github.com/connectedgeek/cg-scope
  https://scope.connectedgeek.net

Free. No account. Nothing to sign up for.
```

## Permission justifications

One per permission, in the dashboard's own field. **"Required for
functionality" is a rejection.** Name the feature.

These are the `CLAUDE.md` table rows with the internal cross-references taken
out. The substance must not drift.

**activeTab**
```
Every tool in the extension. It grants access to the tab the user is looking at
at the moment they click the toolbar icon, and expires. The extension requests
no host permissions, so it has no standing access to any site.
```

**scripting**
```
chrome.scripting.executeScript is how a tool is placed onto the page the user
clicked from. activeTab grants the right to touch that tab; this is the API
that exercises it. No static content scripts are declared, so nothing runs on
any page until the user clicks the icon.
```

**storage**
```
chrome.storage.local holds the color picker's last twelve sampled colors and
its two settings: whether sampling copies to the clipboard automatically, and
which of HEX, RGB or HSL it copies. That is the complete list. Nothing is
synced and nothing is sent anywhere.
```

**downloads**
```
The Download button in the Images tool. The user selects images from the page
they are inspecting and the browser saves them, the same way it would if they
had clicked a link. Content scripts cannot call chrome.downloads, so a service
worker performs it; that worker does one thing and holds no state.
```

## Data use declarations

Answer **no** to every collection category. Then confirm it by reading, not by
running a command: `build.ps1 check` inspects networking constructs,
permissions, version format and JavaScript syntax, and examines nothing about
storage or the clipboard.

The three things stored locally are listed under `storage` above. Local storage
that never leaves the device is not collection, and declaring it as such would
be its own kind of inaccuracy, but the list must stay exhaustive: if it ever
grows, `docs/PENDING-DISCLOSURES.md` gets an entry the same day.

Certifications, all true:

- Not being sold to third parties
- Not being used or transferred for any purpose unrelated to the single purpose
- Not being used or transferred to determine creditworthiness or for lending

## Privacy policy URL

```
https://scope.connectedgeek.net/#privacy
```

Not required for an extension that handles no user data, and published anyway,
because a claim with a permanent address is worth more than one made in a form.

## Homepage URL

```
https://scope.connectedgeek.net
```

## Support email

```
support@connectedgeek.net
```

---

## Graphic assets

Verified against Google's live listing documentation on 2026-09-14. This section
did not exist until then, and its absence is why the first pass through this
document would have reached the dashboard with only screenshots in hand.

| Asset | Size | Required | Status |
|---|---|---|---|
| Store icon | 128x128 | yes | `icons/icon128.png`, already in the package |
| Screenshots | 1280x800 | at least one, up to five | taken 2026-09-15, in `promo/screenshots/` |
| Small promo tile | 440x280 | yes | built 2026-09-14 |
| Marquee promo tile | 1400x560 | optional | built 2026-09-14 |
| Promotional video | YouTube link | listed as required | none |

The tiles were rendered from `icons/icon128.png` and the landing page palette so
the store and the site do not look like two different products. They are plain
on purpose. A promo tile that oversells is the first thing a reviewer compares
against the single purpose sentence.

On the video: the documentation lists it among the assets you must provide, and
the dashboard has historically accepted submissions without one. Do not plan
around the lenient reading. If the form blocks, record the five tools on one
page in a single silent pass and upload that. It is thirty seconds with the
extension already loaded.

---

## Screenshots

Five, 1280x800, taken from Chrome on a real page. **Not** the panels on the
landing page: those are the extension's own stylesheet rebuilt in HTML, which
makes them accurate and still drawings.

Pick a page that is not `connectedgeek.net`. It is the page everything has been
tested on, which makes it the page least likely to reveal anything, and a
reviewer seeing your own site in every shot learns nothing about whether this
works elsewhere.

| # | Tool | What should be on screen |
|---|---|---|
| 1 | Ruler | A box dragged around a real element, the panel showing width, height, X/Y and ratio. Pick something whose size is obviously right, so the numbers are checkable at a glance. |
| 2 | Inspector | Pointing at a heading or a button, with the box model, typography and colors filled in. The frozen state reads better than mid-hover. |
| 3 | Color picker | A sampled color with HEX, RGB and HSL populated and several chips in Recent, so it is visibly a tool rather than an empty shell. |
| 4 | Images | The grid with two or three cards selected, a format chip filtering, and the count line reading "N of M images". |
| 5 | Page report | The Overview tab with a real byte breakdown, ideally on a page heavy enough that the numbers are interesting. |

A screenshot of an empty panel is a screenshot of nothing. Use the tool first,
then capture.

### What was actually shot, 2026-09-15

All five on `en.wikipedia.org/wiki/Bird`, in `promo/screenshots/`, each verified
1280x800. Upload them in numbered order; the first is the one most people see.

| File | What is in it |
|---|---|
| `01-ruler.png` | A 705x367 box around the lead paragraphs, all four edges enclosed, W/H/X,Y/RATIO/CSS populated and the glued badge showing |
| `02-inspector.png` | `span.mw-page-title-main` frozen, box model, typography and both color rows filled |
| `03-images.png` | 113 images, chips reading PNG 27 / JPG 80 / SVG 5 / WEBP 1, missing alt flagged in the grid |
| `04-page-report.png` | 16,616 elements, 2.25 MB of HTML, 609.7 KB measured, 900 KB of images across 52 files, and the line confirming the total is complete |
| `05-color-picker.png` | `#3366CC` sampled, HEX/RGB/HSL populated, twelve chips in Recent, copy-on-sample on |

**Three things learned doing it**, so the next set costs less:

1. **Dismiss the site's own banners first.** The first Ruler attempt was
   dominated by a Wikimedia fundraising appeal, which made that one shot look
   unrelated to the other four and put someone else's branding in front of the
   product.
2. **Keep the drawn region in the left two thirds.** A capture from a wide
   high-DPI display is about 2.2:1, the store wants 1.6:1, so roughly a quarter
   of the width is discarded from the right. A box drawn across the whole page
   loses its right edge and stops reading as a rectangle.
3. **The native size does not matter.** Captures came in at 3728x1692 and were
   cropped to the widest 1.6 slice at full height, then scaled. That keeps the
   panel text near its original size. Scaling the whole frame to fit would have
   shrunk everything by about a third and made the panels hard to read.

---

## The account, and what is public about it

| Field | Value |
|---|---|
| Developer account | `larry@connectedgeek.net`, cannot be changed |
| Publisher display name | Connected Geek |
| Publisher ID | `a6dbba2e-49df-400e-89e5-27d4b4496c6d` |
| Contact email | `support@connectedgeek.net`, verified, publicly displayed |
| Trader declaration | **Trader** |
| Extension limit | 2 for a new publisher |

**Trader was the correct declaration** and it is not a preference. The European
Commission test is whether you act for purposes relating to your trade or
business, not whether money changes hands. CG Scope is free and is published
under Connected Geek's name, site and support address, so it is published in the
course of the business.

The consequence, which Google states plainly: verified trader information is
shown on the public listing. The name, address and phone on the Google payments
profile are therefore public, and they are not recorded in this repository,
because this repository is public too.

## The submission

| | |
|---|---|
| Item ID | `dfpomlgaiakahanfcnmhollkibnifpkg` |
| Version | 1.0.0 |
| Package | `cg-scope-1.0.0.zip`, 18 files, 68,949 bytes |
| Package SHA-256 | `18530BDDC89DB283C127C13E0B44984F3776DE831440B362D2251F4930C9864F` |
| Commit | `947e8ba` |
| Submitted | 2026-09-15 |

**Two answers that were wrong in the form before submission**, recorded because
they are the ones to check first next time:

- **Remote code defaulted to Yes.** CG Scope loads no external script, no
  off-package module and no `eval`, which is what the network guard scans
  thirteen files to enforce on every commit. Answering Yes invites a reviewer to
  look for remote code, find none, and stop trusting the rest of the form.
- **The Description field received the category explanation** rather than the
  detailed description, for the reason now stated at the top of this document.

**The privacy policy URL is the scope page, not the company policy.** The
Connected Geek policy at `connectedgeek.net/privacy-policy` never mentions CG
Scope and describes collecting IP addresses, device information and diagnostic
reports for other products. Pointing a reviewer at it would make them work out
that none of it applies. `scope.connectedgeek.net/#privacy` says what this
extension does and does not do, in the same words as the declaration. Verified
2026-09-15 that the `#privacy` anchor exists on the live GHL page.

## After it is live

`site/index.html` has an `EDIT:` marker on the Add to Chrome button, which
currently states that the listing does not exist. That stops being true on
approval, and the store URL for `dfpomlgaiakahanfcnmhollkibnifpkg` replaces it.

Then `RELEASING.md` B7, which is the only step that verifies what users actually
get: install from the public listing on a clean profile, confirm the version,
confirm the install warning is exactly "Manage your downloads", and run every
tool from that installed copy.
