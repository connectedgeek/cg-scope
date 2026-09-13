// CG Scope: ruler. Drag a box on the page and read its dimensions.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// Classic script, injected after src/shared/overlay.js and src/shared/panel.js,
// which it relies on for globalThis.__CG_SCOPE__. See the header of overlay.js
// for why this is not an ES module.
//
// ---------------------------------------------------------------------------
// Why the readout is a panel now, and what that cost
// ---------------------------------------------------------------------------
// This tool was written before shared/panel.js existed and kept its own
// readout: dark only, no header, no close button, nothing copyable, and it was
// the only tool in the extension that did not load the shared panel. That is
// why it looked and behaved like a different product, and no amount of
// restyling its private CSS would have changed that. It uses the same panel as
// the other three tools now.
//
// That reverses a decision recorded in the header of shared/panel.js, which
// said a readout glued to the thing it describes was right for the ruler. It
// was right while the readout had no controls on it. The moment it carries a
// close button and rows you click to copy, a readout that follows the drag is
// the inspector's chase-the-panel defect wearing different clothes.
//
// What the old design was genuinely good at was keeping the numbers next to
// the rectangle while dragging, where the eye already is. That is kept, as a
// badge: numbers only, no controls, pointer-events none, glued to the
// rectangle with placeBeside({ stable: false }). The panel holds everything
// that has to be clicked and does not move. Two elements, because there are
// two jobs, and the old readout was doing both of them badly.
//
// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------
// All numbers reported are CSS pixels in viewport coordinates, which is what
// clientX and clientY give and what a person comparing two elements on screen
// expects. They are NOT document coordinates: scroll the page and the same
// element reports a different Y. That is the right answer for "how far is this
// from the top of what I am looking at" and the wrong one for "where is this
// in the document". If the second question ever matters, it needs its own
// readout rather than a redefinition of this one.
//
// ---------------------------------------------------------------------------
// Why the ratio is a decimal and not "16:9"
// ---------------------------------------------------------------------------
// A named-ratio table needs a tolerance, and a tolerance is a number picked by
// eye that decides whether 1.77 counts as 16:9. Reducing by greatest common
// divisor needs no tolerance, but a hand-dragged rectangle lands on a clean
// integer ratio approximately never, so that branch would be dead code shaped
// like a feature. The decimal is the honest answer to "what shape is this" and
// it is correct for every input.

(() => {
  'use strict';

  const scope = globalThis.__CG_SCOPE__;
  if (!scope || !scope.overlay || !scope.panel) {
    console.error('[CG Scope] ruler: overlay and panel must be injected first.');
    return;
  }

  // Below this, a pointer gesture is a stray click and not a measurement. Two
  // CSS pixels: a deliberate one-pixel drag is not something a hand does, and
  // a click that lands on the page produces zero or one.
  const MIN_DRAG = 2;

  // pointerEvents 'auto', stated rather than left to the default: the ruler IS
  // the interaction surface, because a drag has to be captured rather than
  // passed through to the page.
  scope.overlay.toggle(
    'ruler',
    (shadow, api) => {
      const style = document.createElement('style');
      style.textContent = `
        /* Named elements rather than *, so this cannot reach into the panel
           and argue with panel.js over the same properties.

           border-box is not cosmetic here. The box carries a 1px border and
           its width is set from the measurement, so under content-box a
           rectangle reported as 340 would be drawn 342 wide. A measuring tool
           that draws two pixels wider than the number it prints is wrong in
           the one way it is not allowed to be wrong. */
        .surface, .box, .badge { box-sizing: border-box; }

        .surface {
          position: absolute;
          inset: 0;
          cursor: crosshair;
          background: transparent;
        }
        .box {
          position: absolute;
          border: 1px solid #e67a0f;
          background: rgba(230, 122, 15, 0.12);
          pointer-events: none;
        }
        .box.idle { display: none; }

        /* Dark in both themes on purpose. This floats over arbitrary page
           content rather than inside the panel, so it needs to be legible
           against a screenshot of anything, not against the panel's surface. */
        .badge {
          position: absolute;
          left: 12px;
          top: 12px;
          padding: 4px 8px;
          border-radius: 5px;
          background: #16191d;
          color: #e6edf3;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
          font: 600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas,
                monospace;
          font-variant-numeric: tabular-nums;
          pointer-events: none;
          white-space: nowrap;
        }
        .badge.idle { display: none; }

        .hint {
          margin: 10px 0 0;
          padding-top: 9px;
          border-top: 1px solid var(--cgp-line);
          font-size: 11px;
          color: var(--cgp-muted);
        }
      `;
      shadow.appendChild(style);

      const surface = document.createElement('div');
      surface.className = 'surface';

      const box = document.createElement('div');
      box.className = 'box idle';
      surface.appendChild(box);
      shadow.appendChild(surface);

      const badge = document.createElement('div');
      badge.className = 'badge idle';
      shadow.appendChild(badge);

      // Appended after the surface, so it stacks above it and takes the
      // pointer. A pointerdown on the panel therefore never reaches the
      // surface's listener and never starts a drag.
      const ui = scope.panel.create(shadow, {
        tabs: [{ id: 'ruler', label: 'Ruler' }],
        onClose: api.close,
      });

      const pane = ui.pane('ruler');
      // innerHTML with a literal authored here, never with anything read from
      // the page. The convention in CLAUDE.md is about page-sourced content:
      // the measurements below go in with textContent, which is the line that
      // matters, because those numbers are derived from a hostile document.
      pane.innerHTML = `
        <div class="cgp-figure is-empty" id="figure">Nothing measured yet</div>
        <div class="cgp-vals">
          <button class="cgp-val" type="button" id="v-w"><b>W</b><span>-</span></button>
          <button class="cgp-val" type="button" id="v-h"><b>H</b><span>-</span></button>
          <button class="cgp-val" type="button" id="v-xy"><b>X, Y</b><span>-</span></button>
          <button class="cgp-val" type="button" id="v-ratio"><b>RATIO</b><span>-</span></button>
          <button class="cgp-val" type="button" id="v-css"><b>CSS</b><span>-</span></button>
        </div>
        <p class="cgp-tip">Click a value to copy it.</p>
        <p class="cgp-note" id="note"></p>
        <p class="hint">Drag anywhere on the page to measure. Esc to exit.</p>
      `;

      const $ = (id) => pane.querySelector('#' + id);
      const figure = $('figure');
      const note = $('note');
      const rows = {
        w: $('v-w'),
        h: $('v-h'),
        xy: $('v-xy'),
        ratio: $('v-ratio'),
        css: $('v-css'),
      };

      const EMPTY = { w: '-', h: '-', xy: '-', ratio: '-', css: '-' };
      let values = Object.assign({}, EMPTY);
      let hasReading = false;

      function setNote(text, warn) {
        note.textContent = text || '';
        note.classList.toggle('warn', !!warn);
      }

      async function copyValue(el, key) {
        const span = el.querySelector('span');
        try {
          await navigator.clipboard.writeText(values[key]);
          span.textContent = 'copied';
        } catch (err) {
          span.textContent = 'copy failed';
          console.error('[CG Scope] clipboard write failed:', err);
        }
        // Restored from the current value rather than from whatever the span
        // said a moment ago. Two quick clicks on one row would otherwise
        // restore the word "copied" and leave it sitting there as the value.
        setTimeout(() => { span.textContent = values[key]; }, 1100);
      }

      for (const key of Object.keys(rows)) {
        rows[key].addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (!hasReading || values[key] === '-') return;
          copyValue(rows[key], key);
        });
      }

      // Math.round, not toFixed: a measurement of 122.4px is 122px on screen,
      // and a decimal implies a precision the eye cannot use.
      function render(x, y, w, h) {
        const rw = Math.round(w);
        const rh = Math.round(h);
        const rx = Math.round(x);
        const ry = Math.round(y);

        values = {
          w: rw + 'px',
          h: rh + 'px',
          xy: rx + ', ' + ry,
          // A zero height has no ratio. Reporting Infinity, or NaN, or a
          // confident 0.00, would all be the tool inventing an answer.
          ratio: rh > 0 ? (rw / rh).toFixed(2) + ' : 1' : '-',
          css: 'width: ' + rw + 'px; height: ' + rh + 'px;',
        };

        const headline = rw + ' × ' + rh;
        figure.textContent = headline;
        figure.classList.remove('is-empty');
        badge.textContent = headline;

        for (const key of Object.keys(rows)) {
          rows[key].querySelector('span').textContent = values[key];
        }
      }

      function paint(x, y, w, h) {
        box.style.left = x + 'px';
        box.style.top = y + 'px';
        box.style.width = w + 'px';
        box.style.height = h + 'px';
        // Glued rather than stable. Placement lives in the overlay module,
        // shared with the panel, because two copies diverge and then nobody
        // can explain why two things behave differently. This badge carries no
        // controls, so following the drag costs nothing; the panel, which does
        // carry controls, stays where the user put it.
        scope.overlay.placeBeside(
          badge,
          { left: x, top: y, width: w, height: h },
          { stable: false }
        );
      }

      let dragging = false;
      let startX = 0;
      let startY = 0;

      function onDown(ev) {
        if (ev.button !== 0) return;
        dragging = true;
        startX = ev.clientX;
        startY = ev.clientY;
        box.classList.remove('idle');
        paint(startX, startY, 0, 0);
        // Deliberately not rendering here. Until the gesture passes MIN_DRAG
        // it might be a stray click, and a stray click must not overwrite the
        // reading already on the panel with 0 x 0.
        //
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
        const w = Math.abs(ev.clientX - startX);
        const h = Math.abs(ev.clientY - startY);
        paint(x, y, w, h);
        if (w >= MIN_DRAG || h >= MIN_DRAG) {
          badge.classList.remove('idle');
          hasReading = true;
          render(x, y, w, h);
          setNote('');
        }
        ev.preventDefault();
      }

      function onUp(ev) {
        if (!dragging) return;
        dragging = false;
        if (surface.hasPointerCapture(ev.pointerId)) {
          surface.releasePointerCapture(ev.pointerId);
        }

        const w = Math.abs(ev.clientX - startX);
        const h = Math.abs(ev.clientY - startY);
        if (w < MIN_DRAG && h < MIN_DRAG) {
          // A click that never became a drag leaves the previous measurement
          // alone. Discarding a reading because the mouse was put down in the
          // wrong place is the tool throwing away work the user did on
          // purpose, and it is silent, which makes it look like a bug in the
          // measurement rather than in the click.
          box.classList.add('idle');
          badge.classList.add('idle');
          if (!hasReading) {
            setNote('Drag, do not click: a measurement needs two corners.');
          }
        }
        ev.preventDefault();
      }

      surface.addEventListener('pointerdown', onDown);
      surface.addEventListener('pointermove', onMove);
      surface.addEventListener('pointerup', onUp);
      surface.addEventListener('pointercancel', onUp);

      // The listeners above are on elements inside the shadow root, which the
      // overlay host removes wholesale on close. The panel's resize listener is
      // on window, so it outlives the shadow root and has to be removed here.
      return () => {
        ui.destroy();
      };
    },
    { pointerEvents: 'auto' }
  );
})();
