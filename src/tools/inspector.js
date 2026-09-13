// CG Scope: inspector. Point at an element and read how it is built, and see
// every colour and font the page uses.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// Classic script, injected after src/shared/overlay.js and src/shared/panel.js.
// See overlay.js for why these are not ES modules.
//
// ---------------------------------------------------------------------------
// Why this overlay does not capture pointer events
// ---------------------------------------------------------------------------
// The ruler's overlay captures the pointer, because a drag has to be caught
// rather than passed through. This one must do the opposite: with a capturing
// overlay, document.elementFromPoint returns the overlay host rather than the
// element under the cursor, and the tool is impossible.
//
// So the host is pointer-events: none and the listeners are on `document` in
// capture phase. The panel sets pointer-events: auto on itself, and hit tests
// that land on the host are ignored, which is both correct (the tool must not
// inspect itself) and useful (the reading holds while the cursor is on the
// panel, so its buttons can be reached).
//
// ---------------------------------------------------------------------------
// The page is hostile
// ---------------------------------------------------------------------------
//   - Class lists can be enormous. They are truncated for display.
//   - Every value read from the page is written with textContent, never as
//     markup.
//   - elementFromPoint returns null over scrollbars and outside the viewport.
//   - A document can have tens of thousands of elements. The page-wide scans
//     are capped and say so, because a partial list presented as complete is
//     worse than no list.

(() => {
  'use strict';

  const scope = globalThis.__CG_SCOPE__;
  if (!scope || !scope.overlay || !scope.panel) {
    console.error('[CG Scope] inspector: overlay and panel must be injected first.');
    return;
  }

  const MAX_SELECTOR = 90;

  // Cap on the page-wide colour and font scans. Chosen so the scan stays under
  // roughly a frame or two on a large document; getComputedStyle is the
  // expensive part and it is called once per element.
  const SCAN_CAP = 6000;

  function px(v) {
    // Computed lengths arrive as "0px" or "7.5px". Round for display, for the
    // same reason the ruler does: a decimal implies precision the eye cannot
    // use. Keywords such as "auto" and "normal" pass through unchanged.
    const n = parseFloat(v);
    return Number.isFinite(n) ? String(Math.round(n)) : String(v);
  }

  function edge(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n === 0) return '-';
    return Math.round(n) + 'px';
  }

  function toHex(value) {
    // Computed colours arrive as rgb() or rgba(). Hex is what a person pastes
    // into a design tool. Fully transparent returns null so it can be skipped
    // rather than listed as a colour the page "uses".
    const m = String(value).match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const parts = m[1].split(/[,\s/]+/).map((s) => parseFloat(s)).filter((n) => Number.isFinite(n));
    if (parts.length < 3) return null;
    if (parts.length > 3 && parts[3] === 0) return null;
    const hex = parts
      .slice(0, 3)
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('');
    return '#' + hex.toUpperCase();
  }

  function firstFamily(value) {
    const first = String(value).split(',')[0];
    return first ? first.replace(/["']/g, '').trim() : '';
  }

  function describe(el) {
    let out = el.tagName ? el.tagName.toLowerCase() : 'node';
    if (el.id) out += '#' + el.id;
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    if (cls) out += '.' + cls.split(/\s+/).filter(Boolean).join('.');
    return out.length > MAX_SELECTOR ? out.slice(0, MAX_SELECTOR - 1) + '…' : out;
  }

  async function copy(text, button, label) {
    try {
      // No clipboardWrite permission is declared. CLAUDE.md records that as an
      // assumption to be settled by running something; this is what settles it.
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch (err) {
      button.textContent = 'Copy failed: ' + err.name;
      console.error('[CG Scope] clipboard write failed:', err);
    }
    setTimeout(() => { button.textContent = label; }, 1300);
  }

  /**
   * Walk the document once, collecting colours and font families with a count
   * of how many elements use each.
   *
   * The count is the point. A flat list says a page uses forty colours; the
   * counts say which three are the design and which thirty-seven are noise
   * from a widget.
   *
   * Returns { colors, fonts, scanned, total, capped }. `capped` is reported to
   * the user rather than swallowed: a list that silently covers the first
   * 6000 of 20000 elements looks exactly like a complete one.
   */
  function scanPage() {
    const all = document.querySelectorAll('*');
    const total = all.length;
    const limit = Math.min(total, SCAN_CAP);

    const colors = new Map();
    const fonts = new Map();

    const bump = (map, key) => {
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    };

    for (let i = 0; i < limit; i++) {
      const el = all[i];
      let cs;
      try {
        cs = getComputedStyle(el);
      } catch {
        continue;
      }
      bump(colors, toHex(cs.color));
      bump(colors, toHex(cs.backgroundColor));
      if (parseFloat(cs.borderTopWidth) > 0) bump(colors, toHex(cs.borderTopColor));
      bump(fonts, firstFamily(cs.fontFamily));
    }

    const sort = (map) =>
      Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    return {
      colors: sort(colors),
      fonts: sort(fonts),
      scanned: limit,
      total,
      capped: limit < total,
    };
  }

  scope.overlay.toggle(
    'inspector',
    (shadow, api) => {
      const style = document.createElement('style');
      style.textContent = `
        .highlight {
          position: absolute;
          outline: 1px solid #e67a0f;
          background: rgba(230, 122, 15, 0.10);
          pointer-events: none;
          display: none;
        }

        .sel {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 11px;
          color: var(--cgp-accent);
          word-break: break-all;
        }

        /* Box model. Nested boxes with the numbers on the edge they describe,
           because "12 24 12 24" requires the reader to remember an order and
           a picture does not. */
        .bm { border-radius: 4px; text-align: center; font-size: 11px; }
        .bm-margin {
          margin: 8px 0 12px;
          padding: 18px 0;
          background: rgba(230, 122, 15, 0.16);
          border: 1px dashed rgba(230, 122, 15, 0.55);
          position: relative;
        }
        .bm-padding {
          margin: 0 30px;
          padding: 16px 0;
          background: rgba(120, 170, 90, 0.20);
          border: 1px solid rgba(120, 170, 90, 0.55);
          position: relative;
        }
        .bm-content {
          margin: 0 30px;
          padding: 10px 4px;
          background: rgba(80, 150, 190, 0.24);
          border: 1px solid rgba(80, 150, 190, 0.6);
          font-weight: 600;
          word-break: break-all;
        }
        .bm-name {
          position: absolute;
          left: 6px;
          top: 3px;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--cgp-muted);
        }
        .bm-t, .bm-b { position: absolute; left: 0; right: 0; }
        .bm-t { top: 3px; }
        .bm-b { bottom: 3px; }
        .bm-l, .bm-r { position: absolute; top: 50%; transform: translateY(-50%); }
        .bm-l { left: 5px; }
        .bm-r { right: 5px; }

        .group { margin-top: 10px; }
        .group h2 {
          margin: 0 0 5px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--cgp-muted);
        }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
        .cell {
          padding: 5px 7px;
          border: 1px solid var(--cgp-line);
          border-radius: 4px;
          min-width: 0;
        }
        .cell b { display: block; font-size: 10px; font-weight: 500; color: var(--cgp-muted); }
        .cell span { display: block; word-break: break-all; }

        .swatch {
          display: inline-block;
          width: 10px; height: 10px;
          margin-right: 6px;
          border: 1px solid var(--cgp-line);
          border-radius: 2px;
          vertical-align: -1px;
        }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

        .btn {
          display: block;
          width: 100%;
          margin-top: 10px;
          padding: 7px;
          border: 1px solid var(--cgp-line);
          border-radius: 5px;
          background: var(--cgp-soft);
          color: inherit;
          font: inherit;
          cursor: pointer;
        }
        .btn:hover { border-color: var(--cgp-accent); }

        .hint { margin-top: 8px; font-size: 10px; color: var(--cgp-muted); }
        .hint.frozen { color: var(--cgp-accent); }

        .list { display: grid; gap: 5px; }
        .item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--cgp-line);
          border-radius: 5px;
          background: var(--cgp-bg);
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .item:hover { border-color: var(--cgp-accent); }
        .item .count { font-size: 10px; color: var(--cgp-muted); flex: none; }
        .item .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chip {
          width: 26px; height: 18px; flex: none;
          border-radius: 3px;
          border: 1px solid var(--cgp-line);
        }
        .note { margin: 0 0 8px; font-size: 10px; color: var(--cgp-muted); }
        .note.warn { color: var(--cgp-accent); }
      `;
      shadow.appendChild(style);

      const highlight = document.createElement('div');
      highlight.className = 'highlight';
      shadow.appendChild(highlight);

      const ui = scope.panel.create(shadow, {
        tabs: [
          { id: 'inspect', label: 'Inspector' },
          { id: 'colors', label: 'Colors' },
          { id: 'fonts', label: 'Fonts' },
        ],
        onClose: api.close,
        onTab: (id) => {
          // Page-wide scans run when their tab is first opened, not at
          // startup: most uses of this tool never open them, and a scan of
          // every element is not worth spending on a tab nobody looked at.
          if (id === 'colors' || id === 'fonts') ensureScan();
        },
      });

      // ---------------------------------------------------------------- tab 1
      const inspectPane = ui.pane('inspect');
      inspectPane.innerHTML = `
        <div class="sel" id="sel">Point at an element</div>

        <div class="bm bm-margin">
          <span class="bm-name">margin</span>
          <span class="bm-t" id="m-t">-</span>
          <span class="bm-l" id="m-l">-</span>
          <span class="bm-r" id="m-r">-</span>
          <span class="bm-b" id="m-b">-</span>
          <div class="bm bm-padding">
            <span class="bm-name">padding</span>
            <span class="bm-t" id="p-t">-</span>
            <span class="bm-l" id="p-l">-</span>
            <span class="bm-r" id="p-r">-</span>
            <span class="bm-b" id="p-b">-</span>
            <div class="bm bm-content" id="size">-</div>
          </div>
        </div>

        <div class="group">
          <h2>Typography and layout</h2>
          <div class="grid">
            <div class="cell"><b>Family</b><span id="family">-</span></div>
            <div class="cell"><b>Size</b><span id="fsize">-</span></div>
            <div class="cell"><b>Leading</b><span id="lh">-</span></div>
            <div class="cell"><b>Weight</b><span id="weight">-</span></div>
            <div class="cell"><b>Tracking</b><span id="ls">-</span></div>
            <div class="cell"><b>Display</b><span id="display">-</span></div>
            <div class="cell"><b>Position</b><span id="position">-</span></div>
            <div class="cell"><b>Direction</b><span id="flexdir">-</span></div>
          </div>
        </div>

        <div class="group">
          <h2>Border</h2>
          <div class="grid">
            <div class="cell"><b>Width</b><span id="bw">-</span></div>
            <div class="cell"><b>Style</b><span id="bs">-</span></div>
            <div class="cell"><b>Radius</b><span id="br">-</span></div>
            <div class="cell"><b>Color</b><span id="c-border">-</span></div>
          </div>
        </div>

        <div class="group">
          <h2>Color</h2>
          <div class="grid">
            <div class="cell"><b>Text</b><span id="c-text">-</span></div>
            <div class="cell"><b>Background</b><span id="c-bg">-</span></div>
          </div>
        </div>

        <button class="btn" type="button" id="copy">Copy CSS</button>
        <div class="hint" id="hint">Point here to hold. Click the page to freeze. Esc to exit.</div>
      `;

      const $ = (id) => inspectPane.querySelector('#' + id);
      const out = {
        sel: $('sel'), size: $('size'),
        mt: $('m-t'), ml: $('m-l'), mr: $('m-r'), mb: $('m-b'),
        pt: $('p-t'), pl: $('p-l'), pr: $('p-r'), pb: $('p-b'),
        family: $('family'), fsize: $('fsize'), lh: $('lh'),
        weight: $('weight'), ls: $('ls'), display: $('display'),
        position: $('position'), flexdir: $('flexdir'),
        bw: $('bw'), bs: $('bs'), br: $('br'),
        cText: $('c-text'), cBg: $('c-bg'), cBorder: $('c-border'),
        copy: $('copy'), hint: $('hint'),
      };

      function setColorCell(cell, value) {
        cell.textContent = '';
        const hex = toHex(value);
        if (hex) {
          const sw = document.createElement('span');
          sw.className = 'swatch';
          sw.style.background = value;
          cell.appendChild(sw);
        }
        const label = document.createElement('span');
        label.className = 'mono';
        label.style.display = 'inline';
        // textContent, never markup. The value is browser-computed here, but
        // the habit is the point.
        label.textContent = hex || String(value);
        cell.appendChild(label);
      }

      let lastCss = '';

      function update(el) {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        highlight.style.display = 'block';
        highlight.style.left = rect.left + 'px';
        highlight.style.top = rect.top + 'px';
        highlight.style.width = rect.width + 'px';
        highlight.style.height = rect.height + 'px';

        out.sel.textContent = describe(el);
        out.size.textContent =
          Math.round(rect.width) + ' × ' + Math.round(rect.height);

        out.mt.textContent = edge(cs.marginTop);
        out.mr.textContent = edge(cs.marginRight);
        out.mb.textContent = edge(cs.marginBottom);
        out.ml.textContent = edge(cs.marginLeft);
        out.pt.textContent = edge(cs.paddingTop);
        out.pr.textContent = edge(cs.paddingRight);
        out.pb.textContent = edge(cs.paddingBottom);
        out.pl.textContent = edge(cs.paddingLeft);

        out.family.textContent = firstFamily(cs.fontFamily) || '-';
        out.fsize.textContent = px(cs.fontSize) + 'px';
        out.lh.textContent = cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight) + 'px';
        out.weight.textContent = cs.fontWeight;
        out.ls.textContent = cs.letterSpacing === 'normal' ? 'normal' : cs.letterSpacing;
        out.display.textContent = cs.display;
        out.position.textContent = cs.position;
        out.flexdir.textContent = cs.display.indexOf('flex') >= 0 ? cs.flexDirection : '-';

        out.bw.textContent = edge(cs.borderTopWidth);
        out.bs.textContent = cs.borderTopStyle === 'none' ? '-' : cs.borderTopStyle;
        out.br.textContent = parseFloat(cs.borderTopLeftRadius) > 0 ? cs.borderRadius : '-';

        setColorCell(out.cText, cs.color);
        setColorCell(out.cBg, cs.backgroundColor);
        setColorCell(out.cBorder, cs.borderTopColor);

        // The copy block keeps the original rgb/rgba values rather than the
        // hex shown above, because dropping alpha silently would produce CSS
        // that does not match what is on screen.
        lastCss = [
          '/* ' + describe(el) + ' */',
          'font-family: ' + cs.fontFamily + ';',
          'font-size: ' + cs.fontSize + ';',
          'font-weight: ' + cs.fontWeight + ';',
          'line-height: ' + cs.lineHeight + ';',
          'letter-spacing: ' + cs.letterSpacing + ';',
          'color: ' + cs.color + ';',
          'background-color: ' + cs.backgroundColor + ';',
          'margin: ' + cs.margin + ';',
          'padding: ' + cs.padding + ';',
          'border: ' + cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor + ';',
          'border-radius: ' + cs.borderRadius + ';',
        ].join('\n');
      }

      out.copy.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (lastCss) copy(lastCss, out.copy, 'Copy CSS');
      });

      // ------------------------------------------------------- tabs 2 and 3
      const colorsPane = ui.pane('colors');
      const fontsPane = ui.pane('fonts');
      let scan = null;

      function noteFor(result) {
        const note = document.createElement('p');
        note.className = result.capped ? 'note warn' : 'note';
        note.textContent = result.capped
          ? 'Scanned the first ' + result.scanned + ' of ' + result.total +
            ' elements. This list is incomplete.'
          : 'From all ' + result.total + ' elements on the page.';
        return note;
      }

      function renderColors(result) {
        colorsPane.textContent = '';
        colorsPane.appendChild(noteFor(result));
        const list = document.createElement('div');
        list.className = 'list';
        if (!result.colors.length) {
          const p = document.createElement('p');
          p.className = 'note';
          p.textContent = 'No colours found.';
          colorsPane.appendChild(p);
          return;
        }
        for (const [hex, count] of result.colors) {
          const row = document.createElement('button');
          row.className = 'item';
          row.type = 'button';

          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.style.background = hex;

          const label = document.createElement('span');
          label.className = 'label mono';
          label.textContent = hex;

          const n = document.createElement('span');
          n.className = 'count';
          n.textContent = count + (count === 1 ? ' use' : ' uses');

          row.appendChild(chip);
          row.appendChild(label);
          row.appendChild(n);
          row.addEventListener('click', (ev) => {
            ev.stopPropagation();
            copy(hex, label, hex);
          });
          list.appendChild(row);
        }
        colorsPane.appendChild(list);
      }

      function renderFonts(result) {
        fontsPane.textContent = '';
        fontsPane.appendChild(noteFor(result));
        const list = document.createElement('div');
        list.className = 'list';
        if (!result.fonts.length) {
          const p = document.createElement('p');
          p.className = 'note';
          p.textContent = 'No fonts found.';
          fontsPane.appendChild(p);
          return;
        }
        for (const [family, count] of result.fonts) {
          const row = document.createElement('button');
          row.className = 'item';
          row.type = 'button';

          const label = document.createElement('span');
          label.className = 'label';
          label.textContent = family;
          // Render each name in its own face, which is the whole reason to
          // look at a font list. Quoted so families with spaces resolve, and
          // with a fallback so an unavailable face does not render as nothing.
          label.style.fontFamily = '"' + family.replace(/"/g, '') + '", sans-serif';
          label.style.fontSize = '15px';

          const n = document.createElement('span');
          n.className = 'count';
          n.textContent = count + (count === 1 ? ' use' : ' uses');

          row.appendChild(label);
          row.appendChild(n);
          row.addEventListener('click', (ev) => {
            ev.stopPropagation();
            copy(family, n, count + (count === 1 ? ' use' : ' uses'));
          });
          list.appendChild(row);
        }
        fontsPane.appendChild(list);
      }

      function ensureScan() {
        if (scan) return;
        scan = scanPage();
        renderColors(scan);
        renderFonts(scan);
      }

      // ------------------------------------------------------------ pointing
      let frozen = false;
      let current = null;
      let queued = false;
      let mouseX = 0;
      let mouseY = 0;

      function onMove(ev) {
        if (frozen || ui.isDragging()) return;
        mouseX = ev.clientX;
        mouseY = ev.clientY;
        if (queued) return;
        // One read per frame. getComputedStyle on every mousemove is enough
        // work to make a heavy page feel broken, and the extra reads would be
        // discarded before anything painted them.
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          if (frozen || ui.isDragging()) return;
          const el = document.elementFromPoint(mouseX, mouseY);

          // Our own overlay. Hit tests inside a closed shadow root report the
          // host, so pointing at the panel reports the host rather than
          // anything in the page. Without this the tool inspects itself.
          // Returning also holds the last reading, so the panel's controls can
          // be reached without freezing first.
          if (el === api.host) return;
          if (!el || el === current) return;

          current = el;
          try {
            update(el);
          } catch (err) {
            console.error('[CG Scope] inspector: could not read element:', err);
          }
        });
      }

      function onClick(ev) {
        if (ev.target === api.host) return;

        // The page must not act on this click: on a link, freezing the
        // inspector and navigating away at the same time loses the thing the
        // user was looking at.
        ev.preventDefault();
        ev.stopPropagation();

        frozen = !frozen;
        out.hint.textContent = frozen
          ? 'Frozen. Click the page again to resume. Esc to exit.'
          : 'Point here to hold. Click the page to freeze. Esc to exit.';
        out.hint.classList.toggle('frozen', frozen);
      }

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);

      // Returned to the overlay, which calls it on close. These listeners are
      // on document and window, outside the shadow root, so removing the host
      // does not remove them.
      return () => {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        ui.destroy();
      };
    },
    { pointerEvents: 'none' }
  );
})();
