// CG Scope: color picker. Sample any pixel on screen and keep the last dozen.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// Classic script, injected after src/shared/overlay.js and src/shared/panel.js.
//
// ---------------------------------------------------------------------------
// Why there is a "click anywhere" step
// ---------------------------------------------------------------------------
// EyeDropper.open() requires transient user activation. The click that opened
// the popup is spent by the time this script is injected, so the tool cannot
// simply start sampling: it has to earn a fresh gesture first.
//
// That is a platform constraint, not a design choice. Every extension with
// this feature has the same step, which is why BarnumPT shows a "Click to
// Activate Color Picker" panel before it does anything.
//
// The same rule applies to picking again. Each open() consumes the activation,
// so every subsequent sample needs its own click.
//
// ---------------------------------------------------------------------------
// Why this tool justifies the `storage` permission
// ---------------------------------------------------------------------------
// `storage` has been declared in manifest.json since 0.1.0 with nothing using
// it. Invariant 8 says a permission whose feature does not exist is removed,
// and the permission guard does not catch this case: it checks that a
// justification is written down, not that the feature was built. The recent
// colours list is the feature. If it is ever removed, the permission goes with
// it in the same commit.

(() => {
  'use strict';

  const scope = globalThis.__CG_SCOPE__;
  if (!scope || !scope.overlay || !scope.panel) {
    console.error('[CG Scope] color picker: overlay and panel must be injected first.');
    return;
  }

  const STORE_KEY = 'recentColors';
  const PREF_KEY = 'pickerPrefs';
  const KEEP = 12;

  // Copying on sample defaults to OFF.
  //
  // It was written defaulting to ON, on the reasoning that the point of
  // sampling a colour is to use it somewhere else. That reasoning is fine and
  // it was not the question being asked: the rows already copy on click, and
  // the actual problem was that nothing said so. Turning on a behaviour that
  // overwrites the user's clipboard, because code to do it happened to exist,
  // is sunk cost wearing a decision's clothes.
  //
  // When it is on it is never silent: the panel says which format was copied,
  // so nothing is lost from the clipboard without the reason being visible.
  const DEFAULT_PREFS = { autoCopy: false, format: 'hex' };

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
      else if (max === gn) h = ((bn - rn) / d + 2);
      else h = ((rn - gn) / d + 4);
      h /= 6;
    }
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  // Relative luminance, so the hex can be written on top of its own swatch in
  // a colour that is actually readable. Guessing from the green channel alone
  // gets oranges and yellows wrong, which is most of the Connected Geek
  // palette.
  //
  // The threshold is 0.179, not a round number picked by eye. That is the
  // luminance at which contrast against black and contrast against white are
  // equal, so it is the point where the better choice of text colour changes.
  //
  // The first version used 0.36, which was wrong in a way worth recording:
  // #E67A0F has luminance 0.308, so it fell on the dark side and was given
  // white text at a contrast ratio of 2.9. Dark text on that orange is 5.6.
  // The bug only showed on mid-luminance colours, which is exactly the range
  // this brand lives in, and a test with the brand's own orange in it is what
  // found it.
  const TEXT_FLIP = 0.179;

  function isLight(r, g, b) {
    const f = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) > TEXT_FLIP;
  }

  scope.overlay.toggle(
    'colorpicker',
    (shadow, api) => {
      const style = document.createElement('style');
      style.textContent = `
        .stage {
          position: absolute;
          inset: 0;
          cursor: crosshair;
          background: transparent;
        }
        .prompt {
          position: absolute;
          left: 50%;
          top: 42%;
          transform: translate(-50%, -50%);
          padding: 14px 20px;
          border-radius: 8px;
          background: #16191d;
          color: #e6edf3;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
          font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                Helvetica, Arial, sans-serif;
          text-align: center;
          pointer-events: none;
        }
        .prompt b { display: block; font-size: 15px; margin-bottom: 3px; }
        .prompt span { color: #9aa4ae; font-size: 11px; }
        .prompt.gone { display: none; }

        .swatch-big {
          height: 74px;
          border-radius: 6px;
          border: 1px solid var(--cgp-line);
          display: grid;
          place-items: center;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 17px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .vals { display: grid; gap: 5px; margin-top: 10px; }
        .val {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          padding: 7px 10px;
          border: 1px solid var(--cgp-line);
          border-radius: 5px;
          background: var(--cgp-bg);
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;
        }
        .val:hover { border-color: var(--cgp-accent); }
        .val b { font-size: 10px; font-weight: 600; color: var(--cgp-muted); flex: none; }
        .val span { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

        .btn {
          display: block;
          width: 100%;
          margin-top: 10px;
          padding: 8px;
          border: 1px solid var(--cgp-accent);
          border-radius: 5px;
          background: var(--cgp-soft);
          color: inherit;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .btn:hover { background: var(--cgp-bg); }

        /* The rows have always copied on click and nothing said so, which is
           the same defect as a tool that silently does nothing: the behaviour
           existed and was invisible. */
        .tip {
          margin: 6px 2px 0;
          font-size: 10px;
          color: var(--cgp-muted);
        }

        .opt {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 9px;
          padding: 7px 10px;
          border: 1px solid var(--cgp-line);
          border-radius: 5px;
          font-size: 12px;
          cursor: pointer;
        }
        .opt input { margin: 0; cursor: pointer; accent-color: var(--cgp-accent); }
        .opt span { flex: 1 1 auto; }
        .opt select {
          font: inherit;
          padding: 2px 4px;
          border: 1px solid var(--cgp-line);
          border-radius: 4px;
          background: var(--cgp-bg);
          color: inherit;
          cursor: pointer;
        }
        .opt select:disabled { opacity: 0.45; cursor: default; }

        h2 {
          margin: 14px 0 6px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--cgp-muted);
        }
        .recents { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; }
        .chip {
          height: 28px;
          border-radius: 4px;
          border: 1px solid var(--cgp-line);
          cursor: pointer;
          padding: 0;
        }
        .chip:hover { border-color: var(--cgp-accent); }
        .note { margin: 0; font-size: 11px; color: var(--cgp-muted); }
        .note.warn { color: var(--cgp-accent); }
      `;
      shadow.appendChild(style);

      const stage = document.createElement('div');
      stage.className = 'stage';
      shadow.appendChild(stage);

      const prompt = document.createElement('div');
      prompt.className = 'prompt';
      prompt.innerHTML =
        '<b>Click anywhere to sample a color</b>' +
        '<span>The browser needs a fresh click before it will open the eyedropper. Esc to exit.</span>';
      shadow.appendChild(prompt);

      const ui = scope.panel.create(shadow, {
        tabs: [{ id: 'picker', label: 'Color Picker' }],
        onClose: api.close,
      });

      const pane = ui.pane('picker');
      pane.innerHTML = `
        <div class="swatch-big" id="swatch">no color yet</div>
        <div class="vals">
          <button class="val" type="button" id="v-hex"><b>HEX</b><span>-</span></button>
          <button class="val" type="button" id="v-rgb"><b>RGB</b><span>-</span></button>
          <button class="val" type="button" id="v-hsl"><b>HSL</b><span>-</span></button>
        </div>
        <p class="tip">Click a value to copy it.</p>
        <button class="btn" type="button" id="again">Sample a color</button>
        <label class="opt">
          <input type="checkbox" id="auto">
          <span>Copy on sample</span>
          <select id="fmt">
            <option value="hex">HEX</option>
            <option value="rgb">RGB</option>
            <option value="hsl">HSL</option>
          </select>
        </label>
        <h2>Recent</h2>
        <div class="recents" id="recents"></div>
        <p class="note" id="note"></p>
      `;

      const $ = (id) => pane.querySelector('#' + id);
      const swatch = $('swatch');
      const vHex = $('v-hex');
      const vRgb = $('v-rgb');
      const vHsl = $('v-hsl');
      const again = $('again');
      const auto = $('auto');
      const fmt = $('fmt');
      const recents = $('recents');
      const note = $('note');

      let currentHex = null;
      let picking = false;
      let prefs = Object.assign({}, DEFAULT_PREFS);
      // The three representations of the current colour, kept so that the
      // auto-copy does not have to re-derive or re-parse what is on screen.
      let values = { hex: '', rgb: '', hsl: '' };

      function setNote(text, warn) {
        note.textContent = text || '';
        note.classList.toggle('warn', !!warn);
      }

      async function copyValue(el, text) {
        const span = el.querySelector('span');
        const was = span.textContent;
        try {
          await navigator.clipboard.writeText(text);
          span.textContent = 'copied';
        } catch (err) {
          span.textContent = 'copy failed';
          console.error('[CG Scope] clipboard write failed:', err);
        }
        setTimeout(() => { span.textContent = was; }, 1100);
      }

      function show(hex) {
        currentHex = hex.toUpperCase();
        const rgb = hexToRgb(currentHex);
        if (!rgb) return;
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

        values = {
          hex: currentHex,
          rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
          hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
        };

        swatch.style.background = currentHex;
        swatch.style.color = isLight(rgb.r, rgb.g, rgb.b) ? '#1f2328' : '#ffffff';
        swatch.textContent = currentHex;

        vHex.querySelector('span').textContent = values.hex;
        vRgb.querySelector('span').textContent = values.rgb;
        vHsl.querySelector('span').textContent = values.hsl;
      }

      // --- preferences ------------------------------------------------------
      function applyPrefs() {
        auto.checked = !!prefs.autoCopy;
        fmt.value = prefs.format;
        fmt.disabled = !prefs.autoCopy;
      }

      async function loadPrefs() {
        try {
          const got = await chrome.storage.local.get(PREF_KEY);
          const saved = got && got[PREF_KEY];
          if (saved && typeof saved === 'object') {
            // Merged onto the defaults rather than used as-is, so that a value
            // stored by an older version with fewer keys, or a format that no
            // longer exists, cannot leave the tool in a state it cannot render.
            prefs = Object.assign({}, DEFAULT_PREFS, saved);
            if (!['hex', 'rgb', 'hsl'].includes(prefs.format)) {
              prefs.format = DEFAULT_PREFS.format;
            }
          }
        } catch (err) {
          console.error('[CG Scope] could not read picker preferences:', err);
        }
        applyPrefs();
      }

      async function savePrefs() {
        try {
          await chrome.storage.local.set({ [PREF_KEY]: prefs });
        } catch (err) {
          console.error('[CG Scope] could not save picker preferences:', err);
          setNote('That setting will not persist: ' + err.message, true);
        }
      }

      // --- recents, the feature that justifies the storage permission -------
      function renderRecents(list) {
        recents.textContent = '';
        for (const hex of list) {
          const b = document.createElement('button');
          b.className = 'chip';
          b.type = 'button';
          b.style.background = hex;
          b.title = hex;
          b.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            show(hex);
            try {
              await navigator.clipboard.writeText(hex);
              setNote(hex + ' copied.');
            } catch {
              setNote('Could not copy ' + hex + '.', true);
            }
          });
          recents.appendChild(b);
        }
        if (!list.length) {
          const p = document.createElement('span');
          p.className = 'note';
          p.style.gridColumn = '1 / -1';
          p.textContent = 'Nothing sampled yet.';
          recents.appendChild(p);
        }
      }

      async function loadRecents() {
        try {
          const got = await chrome.storage.local.get(STORE_KEY);
          const list = got && Array.isArray(got[STORE_KEY]) ? got[STORE_KEY] : [];
          renderRecents(list);
          return list;
        } catch (err) {
          // Storage failing must not take the tool with it. Sampling still
          // works; only the history is lost, and the user is told which.
          console.error('[CG Scope] could not read stored colors:', err);
          renderRecents([]);
          setNote('Recent colors are unavailable: ' + err.message, true);
          return [];
        }
      }

      async function remember(hex) {
        try {
          const got = await chrome.storage.local.get(STORE_KEY);
          const prev = got && Array.isArray(got[STORE_KEY]) ? got[STORE_KEY] : [];
          const next = [hex].concat(prev.filter((c) => c !== hex)).slice(0, KEEP);
          await chrome.storage.local.set({ [STORE_KEY]: next });
          renderRecents(next);
        } catch (err) {
          console.error('[CG Scope] could not save color:', err);
          setNote('Sampled, but could not be saved: ' + err.message, true);
        }
      }

      // --- sampling ---------------------------------------------------------
      async function pick() {
        if (picking) return;

        if (typeof globalThis.EyeDropper !== 'function') {
          setNote(
            'This browser does not provide the EyeDropper API, so screen sampling ' +
            'is unavailable. The Inspector still reads colors from elements.',
            true
          );
          prompt.classList.add('gone');
          return;
        }

        picking = true;
        prompt.classList.add('gone');
        setNote('');

        // Escape belongs to the eyedropper while it is open. Without this the
        // one keypress would both cancel the pick and close this tool.
        api.setEscapeEnabled(false);

        try {
          const result = await new globalThis.EyeDropper().open();
          show(result.sRGBHex);
          await remember(result.sRGBHex.toUpperCase());

          if (prefs.autoCopy) {
            const text = values[prefs.format] || values.hex;
            try {
              await navigator.clipboard.writeText(text);
              // Never silent. This overwrote whatever the user had on the
              // clipboard, and they are entitled to know what replaced it.
              setNote(prefs.format.toUpperCase() + ' copied: ' + text);
            } catch (err2) {
              setNote('Sampled, but the clipboard write failed: ' + err2.name, true);
              console.error('[CG Scope] clipboard write failed:', err2);
            }
          }
        } catch (err) {
          // Cancelling is a normal outcome, not a failure, and must not be
          // reported as one.
          if (err && err.name !== 'AbortError') {
            setNote('Sampling failed: ' + err.message, true);
            console.error('[CG Scope] eyedropper failed:', err);
          }
        } finally {
          picking = false;
          api.setEscapeEnabled(true);
        }
      }

      stage.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        pick();
      });

      again.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pick();
      });

      vHex.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (currentHex) copyValue(vHex, currentHex);
      });
      vRgb.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (currentHex) copyValue(vRgb, vRgb.querySelector('span').textContent);
      });
      vHsl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (currentHex) copyValue(vHsl, vHsl.querySelector('span').textContent);
      });

      auto.addEventListener('click', (ev) => ev.stopPropagation());
      auto.addEventListener('change', () => {
        prefs.autoCopy = auto.checked;
        fmt.disabled = !prefs.autoCopy;
        savePrefs();
      });

      fmt.addEventListener('click', (ev) => ev.stopPropagation());
      fmt.addEventListener('change', () => {
        prefs.format = fmt.value;
        savePrefs();
      });

      loadPrefs();
      loadRecents();

      return () => {
        ui.destroy();
      };
    },
    { pointerEvents: 'auto' }
  );
})();
