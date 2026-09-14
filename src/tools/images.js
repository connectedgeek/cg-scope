// CG Scope: images. Find every image on the page, filter it, and copy it.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// Classic script, injected after src/shared/overlay.js and src/shared/panel.js.
// See the header of overlay.js for why these are not ES modules.
//
// ---------------------------------------------------------------------------
// Where the saving happens, and why it is not here
// ---------------------------------------------------------------------------
// chrome.downloads is not available to content scripts, and this is a content
// script. Chrome permits an extension page, which the popup is but which
// closes the moment the user clicks into the page, or a service worker. So
// Download sends the selected urls to src/worker.js and that calls Chrome.
//
// Nothing about the selection crosses with them. The worker is handed a list
// of urls and takes the tab from Chrome's own `sender`, not from anything this
// file says, because a content script cannot lie about which tab it is in and
// can say whatever it likes about everything else.
//
// The message name is checked against a list in src/shared/messages.js, which
// the worker imports and the selftest walks. See trust boundary 3 in CLAUDE.md
// for why that list exists and why naming the messages in the test instead
// would have been the wrong shape.
//
// There is no middle path worth looking for. Reading image bytes needs either
// the browser retrieving them on our behalf, which is the permission, or a
// network request, which invariant 11 forbids and the build guard rejects
// outright (this sentence is worded around the construct on purpose: the guard
// matches identifiers anywhere in a file, prose included, and the documented
// remedy is to reword rather than to weaken the pattern), or
// a canvas, which throws a SecurityError for any image from another origin and
// so would work unpredictably on precisely the pages where it matters.
//
// ---------------------------------------------------------------------------
// Why the format badge is a guess, and says so
// ---------------------------------------------------------------------------
// The authoritative answer is the response's Content-Type, which needs a
// request. What is available without one is the URL: a file extension in the
// path, or the MIME type inside a `data:` URI. A CDN serving /image?id=8842
// has neither, and that is a normal way to serve images rather than an edge
// case. Those are labelled `other`, which here means "cannot tell from the
// URL" and not "unusual format". A badge that guessed confidently would be
// worse than one that admits the limit, because a wrong PNG label is a thing
// someone would act on.
//
// ---------------------------------------------------------------------------
// Why one card per URL rather than one per element
// ---------------------------------------------------------------------------
// The page report counts elements, because it is answering "what does this
// page weigh" and an image used four times is downloaded once but laid out
// four times. This tool is answering "which images are on this page", and four
// cards showing one logo is noise in a grid and four identical lines in a
// clipboard. Repeats are collapsed and the card carries a count.

(() => {
  'use strict';

  const scope = globalThis.__CG_SCOPE__;
  if (!scope || !scope.overlay || !scope.panel) {
    console.error('[CG Scope] images: overlay and panel must be injected first.');
    return;
  }

  // Wider than the inspector's 348, because two columns of thumbnails below
  // about 400 leaves each card too small to recognise the image in, which
  // defeats the point of showing a thumbnail at all. panel.create clamps this
  // to the window width, so a narrow window still gets a usable panel.
  const PANEL_WIDTH = 430;

  // The formats worth naming separately. Anything else, including a URL with
  // no extension at all, lands in `other`.
  const KNOWN = ['png', 'jpg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp', 'tiff'];

  // jpeg and jpg are the same format with two spellings, and splitting them
  // into two filter chips would be a distinction that helps nobody. Same for
  // tif. The label shown is the left-hand side.
  const ALIAS = { jpeg: 'jpg', tif: 'tiff', svgxml: 'svg' };

  function formatOf(url) {
    const u = String(url || '');
    if (!u) return 'other';

    // data:image/png;base64,... carries its type in the URI itself, which is
    // the one case where this is not a guess at all.
    if (u.startsWith('data:')) {
      const m = /^data:image\/([a-z0-9.+-]+)/i.exec(u);
      if (!m) return 'other';
      const raw = m[1].toLowerCase().replace(/[^a-z0-9]/g, '');
      const norm = ALIAS[raw] || raw;
      return KNOWN.includes(norm) ? norm : 'other';
    }

    // Everything else: the last dot-segment of the path, with the query string
    // and fragment removed first. Parsed with URL rather than by hand so that
    // a query containing a dot, or a fragment, cannot be mistaken for an
    // extension. A URL the parser rejects is `other` rather than a crash.
    let path = u;
    try {
      path = new URL(u, location.href).pathname;
    } catch (err) {
      return 'other';
    }
    const dot = path.lastIndexOf('.');
    if (dot < 0 || dot === path.length - 1) return 'other';
    const raw = path.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm = ALIAS[raw] || raw;
    return KNOWN.includes(norm) ? norm : 'other';
  }

  // Collapsed to one entry per URL. `count` is how many elements used it,
  // `natural` is the intrinsic size, which is a property of the file and so is
  // the same for every use of it.
  function collect() {
    const byUrl = new Map();
    for (const img of Array.from(document.images || [])) {
      const url = img.currentSrc || img.src || '';
      if (!url) continue;
      const existing = byUrl.get(url);
      if (existing) {
        existing.count += 1;
        if (!img.hasAttribute('alt')) existing.missingAlt = true;
        continue;
      }
      byUrl.set(url, {
        url,
        format: formatOf(url),
        w: img.naturalWidth || 0,
        h: img.naturalHeight || 0,
        count: 1,
        // An absent alt attribute is a defect. alt="" is a deliberate
        // statement that the image is decorative and is not flagged.
        missingAlt: !img.hasAttribute('alt'),
      });
    }
    // Largest first: on a page full of icons, the images somebody came looking
    // for are usually the big ones.
    return Array.from(byUrl.values()).sort((a, b) => (b.w * b.h) - (a.w * a.h));
  }

  scope.overlay.toggle(
    'images',
    (shadow, api) => {
      const style = document.createElement('style');
      style.textContent = `
        .bar {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .bar .count { font-weight: 600; }
        .bar .where {
          color: var(--cgp-muted);
          font-size: 11px;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          direction: rtl;
          text-align: right;
        }

        /* Chips rather than the drop-down menu the reference used. Same
           function, and in a 430px panel a menu that overlays the grid hides
           the thing it is filtering. Each chip carries its own count, which
           the menu could not show without becoming a table. */
        .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 9px 0 4px; }
        .chip {
          padding: 3px 8px;
          border: 1px solid var(--cgp-line);
          border-radius: 999px;
          background: var(--cgp-bg);
          color: var(--cgp-muted);
          font: inherit;
          font-size: 11px;
          cursor: pointer;
        }
        .chip[aria-pressed="true"] {
          border-color: var(--cgp-accent);
          color: var(--cgp-ink);
          font-weight: 600;
        }
        .chip:hover { border-color: var(--cgp-accent); }

        .tools { display: flex; align-items: center; gap: 10px; margin: 8px 0 2px; }
        .tools label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; }
        .tools input { margin: 0; cursor: pointer; accent-color: var(--cgp-accent); }
        .tools .spacer { flex: 1 1 auto; }
        .tools .sel { color: var(--cgp-muted); font-size: 11px; }

        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }

        .card {
          position: relative;
          display: block;
          width: 100%;
          min-width: 0;
          padding: 0;
          border: 1px solid var(--cgp-line);
          border-radius: 6px;
          background: var(--cgp-bg);
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
          overflow: hidden;
        }
        .card:hover { border-color: var(--cgp-accent); }
        .card[aria-pressed="true"] {
          border-color: var(--cgp-accent);
          box-shadow: inset 0 0 0 1px var(--cgp-accent);
        }

        /* A fixed box with the image contained inside it, so a panorama and a
           square icon produce the same grid and nothing is cropped. The
           checkerboard makes a transparent PNG distinguishable from a white
           one, which on this palette is otherwise invisible. */
        .shot {
          height: 86px;
          display: grid;
          place-items: center;
          background-color: var(--cgp-soft);
          background-image:
            linear-gradient(45deg, var(--cgp-line) 25%, transparent 25%),
            linear-gradient(-45deg, var(--cgp-line) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, var(--cgp-line) 75%),
            linear-gradient(-45deg, transparent 75%, var(--cgp-line) 75%);
          background-size: 12px 12px;
          background-position: 0 0, 0 6px, 6px -6px, -6px 0;
        }
        .shot img { max-width: 100%; max-height: 86px; display: block; }

        .tick {
          position: absolute;
          left: 6px;
          top: 6px;
          width: 16px;
          height: 16px;
          border-radius: 3px;
          border: 1px solid var(--cgp-line);
          background: var(--cgp-bg);
          display: grid;
          place-items: center;
          font-size: 11px;
          line-height: 1;
          color: transparent;
        }
        .card[aria-pressed="true"] .tick {
          background: var(--cgp-accent);
          border-color: var(--cgp-accent);
          color: #fff;
        }

        .badge {
          position: absolute;
          right: 6px;
          top: 6px;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid var(--cgp-line);
          background: var(--cgp-bg);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--cgp-muted);
        }
        /* "other" means the URL did not say. Muted further so it does not read
           as a format name. */
        .badge.unknown { font-style: italic; letter-spacing: 0; text-transform: none; }

        .cap {
          padding: 6px 8px;
          border-top: 1px solid var(--cgp-line);
          font-size: 11px;
          color: var(--cgp-muted);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .cap b { color: var(--cgp-ink); font-weight: 600; }
        .cap .tag { color: var(--cgp-accent); }

        .actions { display: flex; gap: 6px; margin-top: 10px; }
        .actions .cgp-btn { margin-top: 0; }
      `;
      shadow.appendChild(style);

      const ui = scope.panel.create(shadow, {
        tabs: [{ id: 'images', label: 'Images' }],
        onClose: api.close,
        width: PANEL_WIDTH,
      });

      const pane = ui.pane('images');
      const all = collect();
      const selected = new Set();
      // Every format present on this page, in the order KNOWN declares, with
      // `other` last. Formats that are not on the page get no chip: a filter
      // for something that cannot be there is a control that does nothing.
      const present = KNOWN.concat('other').filter((f) => all.some((i) => i.format === f));
      const active = new Set(present);

      // --- static chrome, authored here and never built from page data ------
      const bar = document.createElement('div');
      bar.className = 'bar';
      const countEl = document.createElement('span');
      countEl.className = 'count';
      const whereEl = document.createElement('span');
      whereEl.className = 'where';
      // textContent, not innerHTML. This is the page's own host name and the
      // page chooses it.
      whereEl.textContent = location.host || location.href;
      whereEl.title = location.href;
      bar.appendChild(countEl);
      bar.appendChild(whereEl);
      pane.appendChild(bar);

      const chips = document.createElement('div');
      chips.className = 'chips';
      pane.appendChild(chips);

      const tools = document.createElement('div');
      tools.className = 'tools';
      const allLabel = document.createElement('label');
      const allBox = document.createElement('input');
      allBox.type = 'checkbox';
      const allText = document.createElement('span');
      allText.textContent = 'Select all';
      allLabel.appendChild(allBox);
      allLabel.appendChild(allText);
      const spacer = document.createElement('span');
      spacer.className = 'spacer';
      const selCount = document.createElement('span');
      selCount.className = 'sel';
      tools.appendChild(allLabel);
      tools.appendChild(spacer);
      tools.appendChild(selCount);
      pane.appendChild(tools);

      const grid = document.createElement('div');
      grid.className = 'grid';
      pane.appendChild(grid);

      const note = document.createElement('p');
      note.className = 'cgp-note';
      pane.appendChild(note);

      const actions = document.createElement('div');
      actions.className = 'actions';
      const copyUrls = document.createElement('button');
      copyUrls.className = 'cgp-btn';
      copyUrls.type = 'button';
      copyUrls.textContent = 'Copy URLs';
      const copyTable = document.createElement('button');
      copyTable.className = 'cgp-btn';
      copyTable.type = 'button';
      copyTable.textContent = 'Copy table';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'cgp-btn';
      saveBtn.type = 'button';
      saveBtn.textContent = 'Download';
      actions.appendChild(copyUrls);
      actions.appendChild(copyTable);
      actions.appendChild(saveBtn);
      pane.appendChild(actions);

      const tip = document.createElement('p');
      tip.className = 'cgp-tip';
      // Two things a person cannot work out by looking. The first is the rule,
      // and the alternative is selecting all thirteen images every time because
      // nothing looks like it means nothing. The second is Chrome's own "Ask
      // where to save each file" setting, which turns a batch of nine into nine
      // dialogs; there is no API to read that setting, so the only honest
      // option is to say it might happen rather than let someone discover it at
      // the fourth prompt and conclude the tool is broken.
      tip.textContent =
        'These act on your selection, or on everything shown when nothing is ' +
        'selected. If Chrome is set to ask where to save each file, Download ' +
        'prompts once per image; turn that off in Chrome settings, under ' +
        'Downloads, to save a batch in one go.';
      pane.appendChild(tip);

      // --- state ------------------------------------------------------------
      function visible() {
        return all.filter((i) => active.has(i.format));
      }

      // What the buttons act on. Nothing selected means the whole visible set,
      // because a person who filtered to SVG and pressed Copy meant the SVGs,
      // and making them select all first would be ceremony.
      function target() {
        const vis = visible();
        const picked = vis.filter((i) => selected.has(i.url));
        return picked.length ? picked : vis;
      }

      function setNote(text, warn) {
        note.textContent = text || '';
        note.classList.toggle('warn', !!warn);
      }

      function refreshCounts() {
        const vis = visible();
        const picked = vis.filter((i) => selected.has(i.url)).length;
        countEl.textContent =
          all.length === vis.length
            ? all.length + (all.length === 1 ? ' image' : ' images')
            : vis.length + ' of ' + all.length + ' images';
        allBox.checked = vis.length > 0 && picked === vis.length;
        allBox.indeterminate = picked > 0 && picked < vis.length;
        // The count lives in the line above rather than in the button labels:
        // three buttons whose text changes length do not fit a 430px row
        // without reflowing every time the selection changes.
        const n = target().length;
        selCount.textContent = picked
          ? picked + ' selected'
          : vis.length + (vis.length === 1 ? ' shown' : ' shown');
        copyUrls.disabled = n === 0;
        copyTable.disabled = n === 0;
        saveBtn.disabled = n === 0;
      }

      function renderChips() {
        chips.textContent = '';
        for (const f of present) {
          const n = all.filter((i) => i.format === f).length;
          const b = document.createElement('button');
          b.className = 'chip';
          b.type = 'button';
          b.setAttribute('aria-pressed', String(active.has(f)));
          b.textContent = (f === 'other' ? 'other' : f.toUpperCase()) + ' ' + n;
          if (f === 'other') b.title = 'The URL did not say what these are';
          b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (active.has(f)) active.delete(f); else active.add(f);
            // Every chip off shows nothing at all, which looks like a broken
            // tool rather than an empty filter, so the last one cannot be
            // turned off.
            if (active.size === 0) active.add(f);
            b.setAttribute('aria-pressed', String(active.has(f)));
            renderChips();
            renderGrid();
          });
          chips.appendChild(b);
        }
      }

      function renderGrid() {
        grid.textContent = '';
        const vis = visible();
        for (const item of vis) {
          const card = document.createElement('button');
          card.className = 'card';
          card.type = 'button';
          card.setAttribute('aria-pressed', String(selected.has(item.url)));
          card.title = item.url;

          const shot = document.createElement('div');
          shot.className = 'shot';
          const thumb = document.createElement('img');
          // The URL comes from the page. It is used only as an image source
          // inside our own closed shadow root: never interpreted, never
          // navigated to, never written into markup.
          thumb.src = item.url;
          thumb.alt = '';
          thumb.loading = 'lazy';
          shot.appendChild(thumb);

          const tick = document.createElement('span');
          tick.className = 'tick';
          tick.textContent = '✓';

          const badge = document.createElement('span');
          badge.className = item.format === 'other' ? 'badge unknown' : 'badge';
          badge.textContent = item.format === 'other' ? 'other' : item.format;

          const cap = document.createElement('div');
          cap.className = 'cap';
          const dims = document.createElement('b');
          dims.textContent = item.w && item.h ? item.w + ' × ' + item.h : 'size unknown';
          cap.appendChild(dims);
          if (item.count > 1) {
            const times = document.createElement('span');
            times.textContent = '  ×' + item.count;
            cap.appendChild(times);
          }
          if (item.missingAlt) {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = '  no alt';
            cap.appendChild(tag);
          }

          card.appendChild(shot);
          card.appendChild(tick);
          card.appendChild(badge);
          card.appendChild(cap);

          card.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (selected.has(item.url)) selected.delete(item.url);
            else selected.add(item.url);
            card.setAttribute('aria-pressed', String(selected.has(item.url)));
            refreshCounts();
          });

          grid.appendChild(card);
        }

        if (!vis.length) {
          const empty = document.createElement('p');
          empty.className = 'cgp-note';
          empty.textContent = all.length
            ? 'No images of the selected formats.'
            : 'No img elements on this page. Background images set in CSS, ' +
              'inline svg and canvas are not counted.';
          grid.appendChild(empty);
        }
        refreshCounts();
      }

      // --- copying ----------------------------------------------------------
      // `label` is the button's resting text, passed in rather than read off
      // the button at click time. Reading it captured "Copied" on a second
      // click inside the timeout, and the later timer then wrote that back as
      // the resting label, permanently. ruler.js documents this exact trap and
      // avoids it; this file had the bug the comment warns about.
      // See docs/AUDIT-2026-09-14.md H5.
      async function write(text, button, label, done) {
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = done;
        } catch (err) {
          button.textContent = 'Copy failed';
          console.error('[CG Scope] clipboard write failed:', err);
        }
        setTimeout(() => { button.textContent = label; refreshCounts(); }, 1300);
      }

      // Tabs rather than commas: the destination is a spreadsheet, and a URL
      // will eventually contain a comma and break a quoting rule nobody
      // remembered to write. Fields are stripped of tabs and newlines rather
      // than trusted, because one stray tab silently shifts every column after
      // it and the result still looks like a table.
      function field(v) {
        return String(v === null || v === undefined ? '' : v).replace(/[\t\r\n]+/g, ' ');
      }

      function asTable(items) {
        const rows = [['URL', 'Format', 'Width', 'Height', 'Uses', 'Alt'].join('\t')];
        for (const i of items) {
          rows.push([
            field(i.url),
            // The word, not a guessed extension, so a spreadsheet column of
            // these can be filtered without anyone thinking `other` is a file
            // type.
            field(i.format === 'other' ? 'unknown' : i.format),
            field(i.w || ''),
            field(i.h || ''),
            field(i.count),
            field(i.missingAlt ? 'missing' : 'present'),
          ].join('\t'));
        }
        // CRLF, because this is going into the Windows clipboard and on to
        // Excel most of the time.
        return rows.join('\r\n');
      }

      copyUrls.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const items = target();
        if (!items.length) return;
        write(items.map((i) => i.url).join('\r\n'), copyUrls, 'Copy URLs', 'Copied');
      });

      copyTable.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const items = target();
        if (!items.length) return;
        write(asTable(items), copyTable, 'Copy table', 'Copied');
      });

      saveBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();

        // Only images the browser has actually decoded are offered for saving.
        // naturalWidth is non-zero only after a successful decode, which is the
        // cheapest proof available here that the resource IS an image. Until
        // 0.11.0 this sent every <img> with a src, so a page could put an
        // arbitrary file behind a button labelled Download and a grid of
        // thumbnails. They stay in the list and stay copyable; they are simply
        // not saved. See docs/AUDIT-2026-09-14.md B6.
        const chosen = target();
        const items = chosen.filter((i) => i.w > 0);
        const notLoaded = chosen.length - items.length;

        if (!items.length) {
          setNote(
            notLoaded
              ? 'Nothing to save: ' + notLoaded + (notLoaded === 1 ? ' image has' : ' images have') +
                ' not loaded, so the browser has not confirmed they are images.'
              : 'Nothing to save.',
            true
          );
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving';
        setNote('');

        // sendMessage throws synchronously, not through the callback, when the
        // extension has been reloaded since this page loaded. Without this the
        // button stayed disabled and reading "Saving" for the life of the tab,
        // with the only trace in a console nobody is looking at.
        try {
          chrome.runtime.sendMessage(
            { type: 'cg-scope:download', urls: items.map((i) => i.url) },
            (res) => {
              saveBtn.textContent = 'Download';
              refreshCounts();

              // Checked before res, and never ignored. This is set when the
              // worker did not answer at all, and without reading it the failure
              // is a button that flickers and does nothing.
              const err = chrome.runtime.lastError;
              if (err) {
                setNote('The extension background did not answer: ' + err.message, true);
                return;
              }
              if (!res) {
                setNote('The extension background answered with nothing.', true);
                return;
              }
              if (!res.ok) {
                setNote('Refused: ' + (res.reason || 'no reason given') + '.', true);
                return;
              }

              const parts = [res.started + (res.started === 1 ? ' image sent' : ' images sent') +
                             ' to Downloads, in ' + res.folder];
              if (res.refused) parts.push(res.refused + ' skipped for an unsupported URL scheme');
              if (res.failed) parts.push(res.failed + ' refused by Chrome, see the console');
              if (notLoaded) {
                parts.push(notLoaded + (notLoaded === 1 ? ' image was' : ' images were') +
                           ' skipped because they have not loaded');
              }
              setNote(parts.join('. ') + '.', !!(res.refused || res.failed || notLoaded));
            }
          );
        } catch (err) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Download';
          refreshCounts();
          setNote(
            'Could not reach the extension background: ' + err.message +
            '. If CG Scope was reloaded or updated since this page loaded, ' +
            'reload the page.',
            true
          );
        }
      });

      allBox.addEventListener('click', (ev) => ev.stopPropagation());
      allBox.addEventListener('change', () => {
        const vis = visible();
        if (allBox.checked) for (const i of vis) selected.add(i.url);
        else for (const i of vis) selected.delete(i.url);
        renderGrid();
      });

      renderChips();
      renderGrid();

      const dataUris = all.filter((i) => i.url.startsWith('data:')).length;
      if (dataUris) {
        setNote(
          dataUris + (dataUris === 1 ? ' image is' : ' images are') +
          ' embedded in the page as a data URI. Copying those copies the whole ' +
          'image, which can be very large.'
        );
      }

      return () => {
        ui.destroy();
      };
    },
    // 'none', not 'auto'. This tool has no interaction surface of its own: its
    // only content is the panel, which sets pointer-events: auto on itself. A
    // full-viewport host set to 'auto' swallowed every click and every scroll
    // on the page underneath, with nothing on screen to explain why, which the
    // inspector and the page report had already got right.
    // See docs/AUDIT-2026-09-14.md H5.
    { pointerEvents: 'none' }
  );
})();
