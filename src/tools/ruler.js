// CG Scope: ruler. Drag a box on the page and read its dimensions.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// Classic script, injected after src/shared/overlay.js, which it relies on for
// globalThis.__CG_SCOPE__.overlay. See the header of that file for why this is
// not an ES module.
//
// All numbers reported are CSS pixels in viewport coordinates, which is what
// clientX and clientY give and what a person comparing two elements on screen
// expects. They are NOT document coordinates: scroll the page and the same
// element reports a different Y. That is the right answer for "how far is this
// from the top of what I am looking at" and the wrong one for "where is this
// in the document". If the second question ever matters, it needs its own
// readout rather than a redefinition of this one.

(() => {
  'use strict';

  const scope = globalThis.__CG_SCOPE__;
  if (!scope || !scope.overlay) {
    console.error('[CG Scope] ruler: overlay host was not injected first.');
    return;
  }

  scope.overlay.toggle('ruler', (shadow) => {
    const style = document.createElement('style');
    style.textContent = `
      :host, * { box-sizing: border-box; }
      .surface {
        position: absolute;
        inset: 0;
        cursor: crosshair;
        background: transparent;
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
              Helvetica, Arial, sans-serif;
      }
      .box {
        position: absolute;
        border: 1px solid #e67a0f;
        background: rgba(230, 122, 15, 0.12);
        pointer-events: none;
      }
      .box.idle { display: none; }
      .readout {
        position: absolute;
        left: 12px;
        top: 12px;
        min-width: 132px;
        padding: 10px 12px;
        border-radius: 6px;
        background: #16191d;
        color: #e6edf3;
        box-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
        pointer-events: none;
        font-variant-numeric: tabular-nums;
      }
      .readout dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; }
      .readout dt { color: #9aa4ae; }
      .readout dd { margin: 0; text-align: right; font-weight: 600; }
      .hint {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #2b3138;
        color: #9aa4ae;
        font-size: 11px;
        text-align: left;
      }
    `;

    const surface = document.createElement('div');
    surface.className = 'surface';

    const box = document.createElement('div');
    box.className = 'box idle';

    const readout = document.createElement('div');
    readout.className = 'readout';
    // innerHTML with a literal authored here, never with anything read from
    // the page. The convention in CLAUDE.md is about page-sourced content:
    // measurements below go in with textContent, which is the line that
    // matters, because those numbers come from a hostile document.
    readout.innerHTML =
      '<dl>' +
      '<dt>Width</dt><dd id="w">0</dd>' +
      '<dt>Height</dt><dd id="h">0</dd>' +
      '<dt>X</dt><dd id="x">0</dd>' +
      '<dt>Y</dt><dd id="y">0</dd>' +
      '</dl>' +
      '<div class="hint">Drag to measure. Esc to exit.</div>';

    surface.appendChild(box);
    shadow.appendChild(style);
    shadow.appendChild(surface);
    shadow.appendChild(readout);

    const out = {
      w: readout.querySelector('#w'),
      h: readout.querySelector('#h'),
      x: readout.querySelector('#x'),
      y: readout.querySelector('#y'),
    };

    let dragging = false;
    let startX = 0;
    let startY = 0;

    // Gap between the measured box and the readout, so the two do not touch
    // and the box border stays legible against the panel edge.
    const GAP = 10;

    /**
     * Keep the readout beside the measurement rather than on top of it.
     *
     * A fixed corner does not work: the first real use of this tool measured
     * something in the top right and the panel covered the corner being
     * measured. Any fixed position has a region of the screen it ruins.
     *
     * Candidates are tried in order and the first one that fits entirely in
     * the viewport wins, so the panel moves out of the way rather than
     * hugging one side. If nothing fits, which needs a box nearly the size of
     * the window, the position is clamped into view and allowed to overlap,
     * because a readout you cannot see is worse than one in the way.
     */
    function placeReadout(bx, by, bw, bh) {
      const rw = readout.offsetWidth;
      const rh = readout.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;

      const candidates = [
        [bx, by + bh + GAP],        // below, left edges aligned
        [bx, by - rh - GAP],        // above, left edges aligned
        [bx + bw + GAP, by],        // to the right
        [bx - rw - GAP, by],        // to the left
      ];

      for (const [cx, cy] of candidates) {
        if (cx >= 0 && cy >= 0 && cx + rw <= vw && cy + rh <= vh) {
          readout.style.left = cx + 'px';
          readout.style.top = cy + 'px';
          return;
        }
      }

      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      readout.style.left = clamp(bx, 0, Math.max(0, vw - rw)) + 'px';
      readout.style.top = clamp(by + bh + GAP, 0, Math.max(0, vh - rh)) + 'px';
    }

    function paint(x, y, w, h) {
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
      // Math.round, not toFixed: a measurement of 122.4px is 122px on screen,
      // and a decimal implies a precision the eye cannot use.
      out.w.textContent = Math.round(w);
      out.h.textContent = Math.round(h);
      out.x.textContent = Math.round(x);
      out.y.textContent = Math.round(y);
      placeReadout(x, y, w, h);
    }

    function onDown(ev) {
      if (ev.button !== 0) return;
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      box.classList.remove('idle');
      paint(startX, startY, 0, 0);
      // Pointer capture keeps events coming even if the pointer leaves the
      // surface, so a drag that runs off the window edge still ends cleanly
      // instead of leaving the tool stuck mid-drag.
      surface.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    }

    function onMove(ev) {
      if (!dragging) return;
      const x = Math.min(startX, ev.clientX);
      const y = Math.min(startY, ev.clientY);
      paint(x, y, Math.abs(ev.clientX - startX), Math.abs(ev.clientY - startY));
      ev.preventDefault();
    }

    function onUp(ev) {
      if (!dragging) return;
      dragging = false;
      if (surface.hasPointerCapture(ev.pointerId)) {
        surface.releasePointerCapture(ev.pointerId);
      }
      ev.preventDefault();
    }

    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onUp);

    // Listeners are on elements inside the shadow root, which the overlay host
    // removes wholesale on close, so there is nothing here that outlives the
    // overlay and no teardown function to return.
  });
})();
