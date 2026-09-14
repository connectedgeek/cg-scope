# Chrome Web Store listing copy

Everything the dashboard asks for, written down before you are sitting in front
of it. `docs/RELEASING.md` B6 is the procedure; this is the text.

**Do not improvise at the keyboard.** Three of these fields also exist in
`CLAUDE.md`, `manifest.json` and the landing page, and the whole point of the
permission table is that all four say the same thing. If a field here needs to
change, change it in `CLAUDE.md` first, where the reasoning lives, then here.

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

`Developer Tools`.

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
Point at an element for its computed spacing, typography, borders and colours.
Also lists the colours and font families used across the page, scanning up to
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
colours you sampled, whether you have turned on copy-on-sample, and which of
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
chrome.storage.local holds the colour picker's last twelve sampled colours and
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
| Screenshots | 1280x800 | at least one, up to five | shot list below |
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
| 2 | Inspector | Pointing at a heading or a button, with the box model, typography and colours filled in. The frozen state reads better than mid-hover. |
| 3 | Color picker | A sampled colour with HEX, RGB and HSL populated and several chips in Recent, so it is visibly a tool rather than an empty shell. |
| 4 | Images | The grid with two or three cards selected, a format chip filtering, and the count line reading "N of M images". |
| 5 | Page report | The Overview tab with a real byte breakdown, ideally on a page heavy enough that the numbers are interesting. |

A screenshot of an empty panel is a screenshot of nothing. Use the tool first,
then capture.

---

## After it is live

`site/index.html` has two `EDIT:` markers. The Add to Chrome button currently
states that the listing does not exist, which is honest and will stop being
true the moment it is approved.
