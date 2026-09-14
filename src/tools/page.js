// CG Scope: page report. What this page is made of, and what it weighs.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// Classic script, injected after src/shared/overlay.js and src/shared/panel.js.
//
// ---------------------------------------------------------------------------
// Why so much of this says "unknown"
// ---------------------------------------------------------------------------
// Resource sizes come from the Resource Timing API. For a cross-origin file,
// the server has to opt in with a Timing-Allow-Origin header before the
// browser will reveal its size; without it, transferSize, encodedBodySize and
// decodedBodySize are all reported as zero.
//
// Zero and unknown look identical in that data and mean completely different
// things. A tool that adds them up and prints a total is confidently wrong on
// any page using a CDN that has not opted in, which is most pages. So each
// resource is classified as measured, cached, or unknown, the total is the sum
// of what was actually measured, and the count of unknowns is printed next to
// it.
//
// This is invariant 5. A number whose broken case and whose working case look
// the same is not a measurement.
//
// ---------------------------------------------------------------------------
// Why saving images is not in this tool
// ---------------------------------------------------------------------------
// It is in the Images tool, since 0.10.0, along with the `downloads`
// permission. This header said "both are gone" until 0.11.0, four versions
// after they came back.
//
// The division is deliberate and worth keeping. This tool answers "what does
// this page weigh", so it counts elements: an image used four times is
// downloaded once and laid out four times. The Images tool answers "which
// images are on this page", so it collapses repeats and offers to save them.
// Two questions, two tools, and the day they both grow a grid of thumbnails is
// the day one of them should be deleted.

(() => {
  'use strict';

  const scope = globalThis.__CG_SCOPE__;
  if (!scope || !scope.overlay || !scope.panel) {
    console.error('[CG Scope] page report: overlay and panel must be injected first.');
    return;
  }

  // Chrome's resource timing buffer defaults to 250 entries. At that number
  // the list is probably truncated, and saying so is the difference between a
  // report and a guess.
  const TIMING_BUFFER = 250;

  // An image whose natural size is this many times its displayed area is
  // carrying bytes nobody sees. Two is deliberate: it allows for a 2x display
  // without complaining, and flags anything beyond that.
  const OVERSIZE_RATIO = 2;

  function bytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /**
   * Classify one resource timing entry.
   *
   * measured  the browser told us how many bytes crossed the network
   * cached    served from cache, so the body size is known but the transfer
   *           was free. Counting it as zero would understate the page; counting
   *           the transfer would overstate it. It is reported separately.
   * unknown   cross-origin with no Timing-Allow-Origin. Nothing is knowable.
   */
  function classify(entry) {
    if (entry.transferSize > 0) {
      return { state: 'measured', size: entry.transferSize };
    }
    if (entry.decodedBodySize > 0 || entry.encodedBodySize > 0) {
      return { state: 'cached', size: entry.encodedBodySize || entry.decodedBodySize };
    }
    return { state: 'unknown', size: 0 };
  }

  function collect() {
    let entries = [];
    try {
      entries = performance.getEntriesByType('resource') || [];
    } catch (err) {
      console.error('[CG Scope] resource timing unavailable:', err);
    }

    const byUrl = new Map();
    let measured = 0;
    let cachedBytes = 0;
    let unknownCount = 0;
    const byType = new Map();

    for (const e of entries) {
      const c = classify(e);
      byUrl.set(e.name, c);
      if (c.state === 'measured') measured += c.size;
      else if (c.state === 'cached') cachedBytes += c.size;
      else unknownCount++;

      const t = e.initiatorType || 'other';
      const agg = byType.get(t) || { count: 0, size: 0, unknown: 0 };
      agg.count++;
      if (c.state === 'unknown') agg.unknown++;
      else agg.size += c.size;
      byType.set(t, agg);
    }

    // Images, from the DOM rather than from the timing list, because that is
    // where alt text and displayed size live.
    const images = [];
    for (const img of Array.from(document.images || [])) {
      const url = img.currentSrc || img.src || '';
      const rect = img.getBoundingClientRect();
      const info = byUrl.get(url) || { state: 'unknown', size: 0 };
      const naturalArea = (img.naturalWidth || 0) * (img.naturalHeight || 0);
      const shownArea = Math.round(rect.width) * Math.round(rect.height);
      images.push({
        el: img,
        url,
        natural: { w: img.naturalWidth || 0, h: img.naturalHeight || 0 },
        shown: { w: Math.round(rect.width), h: Math.round(rect.height) },
        size: info.size,
        state: info.state,
        // An alt attribute that is absent is a defect; alt="" is a deliberate
        // statement that the image is decorative, and is not flagged.
        missingAlt: !img.hasAttribute('alt'),
        oversize: shownArea > 0 && naturalArea > shownArea * OVERSIZE_RATIO * OVERSIZE_RATIO,
      });
    }

    images.sort((a, b) => b.size - a.size);

    return {
      url: location.href,
      title: document.title || '',
      elements: document.querySelectorAll('*').length,
      scripts: document.scripts ? document.scripts.length : 0,
      sheets: document.styleSheets ? document.styleSheets.length : 0,
      htmlBytes: (document.documentElement && document.documentElement.outerHTML)
        ? document.documentElement.outerHTML.length
        : 0,
      resources: entries.length,
      truncated: entries.length >= TIMING_BUFFER,
      measured,
      cachedBytes,
      unknownCount,
      byType: Array.from(byType.entries()).sort((a, b) => b[1].size - a[1].size),
      images,
    };
  }

  scope.overlay.toggle(
    'page',
    (shadow, api) => {
      const style = document.createElement('style');
      style.textContent = `
        .flash {
          position: absolute;
          outline: 2px solid #e67a0f;
          background: rgba(230, 122, 15, 0.18);
          pointer-events: none;
          display: none;
        }
        .stat {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 2px;
          border-bottom: 1px solid var(--cgp-line);
        }
        .stat:last-of-type { border-bottom: 0; }
        .stat dt { color: var(--cgp-muted); }
        .stat dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
        h2 {
          margin: 14px 0 4px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--cgp-muted);
        }
        .note { margin: 6px 0 0; font-size: 10px; line-height: 1.45; color: var(--cgp-muted); }
        .note.warn { color: var(--cgp-accent); }
        .list { display: grid; gap: 5px; margin-top: 4px; }
        .row {
          display: flex;
          gap: 9px;
          width: 100%;
          padding: 7px 9px;
          border: 1px solid var(--cgp-line);
          border-radius: 5px;
          background: var(--cgp-bg);
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
          align-items: center;
        }
        .row:hover { border-color: var(--cgp-accent); }
        .thumb {
          width: 34px; height: 34px; flex: none;
          border-radius: 3px;
          border: 1px solid var(--cgp-line);
          object-fit: cover;
          background: var(--cgp-soft);
        }
        /* Every flex item that is allowed to shrink needs min-width: 0, or its
           content sets the floor and pushes the row wider than its container.
           That is what put the size column outside the panel. */
        .meta { flex: 1 1 auto; min-width: 0; max-width: 100%; }
        .meta .top {
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .meta .top .dims { flex: none; }
        .meta .top .size { flex: none; margin-left: auto; white-space: nowrap; }
        .meta .sub {
          display: block;
          min-width: 0;
          max-width: 100%;
          font-size: 10px;
          color: var(--cgp-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tag {
          display: inline-block;
          margin-right: 5px;
          padding: 0 5px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          background: var(--cgp-accent);
          color: #1f2328;
        }
        .tag.quiet { background: var(--cgp-line); color: var(--cgp-muted); }
      `;
      shadow.appendChild(style);

      const flash = document.createElement('div');
      flash.className = 'flash';
      shadow.appendChild(flash);

      const ui = scope.panel.create(shadow, {
        tabs: [
          { id: 'overview', label: 'Overview' },
          { id: 'images', label: 'Images' },
        ],
        onClose: api.close,
        width: 440,
      });

      const data = collect();

      // ------------------------------------------------------------ overview
      const ov = ui.pane('overview');

      function stat(dl, label, value) {
        const row = document.createElement('dl');
        row.className = 'stat';
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        row.appendChild(dt);
        row.appendChild(dd);
        dl.appendChild(row);
      }

      const structure = document.createElement('div');
      stat(structure, 'Elements', String(data.elements));
      stat(structure, 'Scripts', String(data.scripts));
      stat(structure, 'Stylesheets', String(data.sheets));
      stat(structure, 'Images', String(data.images.length));
      stat(structure, 'HTML source', bytes(data.htmlBytes));

      const h1 = document.createElement('h2');
      h1.textContent = 'Structure';
      ov.appendChild(h1);
      ov.appendChild(structure);

      const h2 = document.createElement('h2');
      h2.textContent = 'Transferred';
      ov.appendChild(h2);

      const weight = document.createElement('div');
      stat(weight, 'Measured', bytes(data.measured));
      if (data.cachedBytes > 0) stat(weight, 'From cache', bytes(data.cachedBytes));
      stat(weight, 'Resources', String(data.resources));
      ov.appendChild(weight);

      // The honesty paragraph. This is the part that separates a report from a
      // confident guess, and it is deliberately not hidden behind a tooltip.
      const caveat = document.createElement('p');
      if (data.unknownCount > 0) {
        caveat.className = 'note warn';
        caveat.textContent =
          data.unknownCount + ' of ' + data.resources + ' resources did not report a size. ' +
          'They are cross-origin and their server did not send Timing-Allow-Origin, so the ' +
          'browser will not reveal it. The measured total above excludes them and the real ' +
          'page is heavier by an unknown amount.';
      } else {
        caveat.className = 'note';
        caveat.textContent = 'Every resource reported a size, so the total above is complete.';
      }
      ov.appendChild(caveat);

      if (data.truncated) {
        const trunc = document.createElement('p');
        trunc.className = 'note warn';
        trunc.textContent =
          'The browser stopped recording after ' + data.resources + ' resources, which is its ' +
          'buffer limit. There are probably more than this and none of the numbers above ' +
          'include them.';
        ov.appendChild(trunc);
      }

      if (data.byType.length) {
        const h3 = document.createElement('h2');
        h3.textContent = 'By type';
        ov.appendChild(h3);
        const types = document.createElement('div');
        for (const [type, agg] of data.byType) {
          const detail = agg.unknown
            ? bytes(agg.size) + '  (' + agg.unknown + ' unknown)'
            : bytes(agg.size);
          stat(types, type + '  ×' + agg.count, detail);
        }
        ov.appendChild(types);
      }

      // -------------------------------------------------------------- images
      const im = ui.pane('images');

      const missing = data.images.filter((i) => i.missingAlt).length;
      const oversized = data.images.filter((i) => i.oversize).length;

      const summary = document.createElement('p');
      summary.className = missing || oversized ? 'note warn' : 'note';
      summary.textContent = data.images.length
        ? data.images.length + ' images. ' +
          missing + ' with no alt attribute, ' +
          oversized + ' loaded at more than twice the size they are shown at.'
        : 'This page has no img elements. Background images set in CSS are not counted.';
      im.appendChild(summary);

      const list = document.createElement('div');
      list.className = 'list';

      for (const img of data.images) {
        const row = document.createElement('button');
        row.className = 'row';
        row.type = 'button';

        const thumb = document.createElement('img');
        thumb.className = 'thumb';
        // The URL comes from the page. It is only ever used as an image source
        // inside our own shadow root, never interpreted, never navigated to.
        thumb.src = img.url;
        thumb.alt = '';

        const meta = document.createElement('div');
        meta.className = 'meta';

        const top = document.createElement('div');
        top.className = 'top';
        const dims = document.createElement('span');
        dims.className = 'dims';
        // An image that has not decoded reports 0 x 0, which is not its size.
        // images.js has always said "size unknown" for this; this file printed
        // a confident zero. See docs/AUDIT-2026-09-14.md H6.
        dims.textContent = (img.natural.w && img.natural.h)
          ? img.natural.w + ' × ' + img.natural.h
          : 'size unknown';
        const size = document.createElement('span');
        size.className = 'size';
        size.textContent =
          img.state === 'unknown' ? 'unknown' :
          img.state === 'cached' ? bytes(img.size) + ' cached' :
          bytes(img.size);
        top.appendChild(dims);
        top.appendChild(size);

        const sub = document.createElement('div');
        sub.className = 'sub';
        if (img.missingAlt) {
          const t = document.createElement('span');
          t.className = 'tag';
          t.textContent = 'no alt';
          sub.appendChild(t);
        }
        if (img.oversize) {
          const t = document.createElement('span');
          t.className = 'tag';
          t.textContent = 'oversized';
          sub.appendChild(t);
        }
        const shown = document.createElement('span');
        shown.className = 'tag quiet';
        shown.textContent = 'shown ' + img.shown.w + '×' + img.shown.h;
        sub.appendChild(shown);
        const name = document.createElement('span');
        // textContent, so a filename crafted to look like markup stays text.
        name.textContent = img.url.split('/').pop() || img.url;
        sub.appendChild(name);

        meta.appendChild(top);
        meta.appendChild(sub);
        row.appendChild(thumb);
        row.appendChild(meta);

        row.addEventListener('mouseenter', () => {
          const r = img.el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) { flash.style.display = 'none'; return; }
          flash.style.display = 'block';
          flash.style.left = r.left + 'px';
          flash.style.top = r.top + 'px';
          flash.style.width = r.width + 'px';
          flash.style.height = r.height + 'px';
        });
        row.addEventListener('mouseleave', () => { flash.style.display = 'none'; });

        row.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          img.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          try {
            await navigator.clipboard.writeText(img.url);
            size.textContent = 'URL copied';
            setTimeout(() => {
              size.textContent =
                img.state === 'unknown' ? 'unknown' :
                img.state === 'cached' ? bytes(img.size) + ' cached' :
                bytes(img.size);
            }, 1200);
          } catch (err) {
            console.error('[CG Scope] clipboard write failed:', err);
          }
        });

        list.appendChild(row);
      }

      im.appendChild(list);

      return () => {
        ui.destroy();
      };
    },
    { pointerEvents: 'none' }
  );
})();
