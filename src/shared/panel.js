// CG Scope: the draggable, tabbed panel that tools present their findings in.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// Classic script, injected after src/shared/overlay.js. See that file's header
// for why this is not an ES module.
//
// ---------------------------------------------------------------------------
// Why the panel does not position itself
// ---------------------------------------------------------------------------
// The inspector's first design placed its panel automatically, beside whatever
// was being inspected. That made the panel a moving target: reaching its Copy
// button meant chasing it around the screen.
//
// So this panel stays where it is put and the user puts it there. The cost is
// one drag; the benefit is that every control on it can be reached.
//
// This comment used to carve out an exception for the ruler, on the grounds
// that its readout belonged to the rectangle being dragged. That held only
// while the readout had no controls on it. The ruler now uses this panel and
// keeps a separate badge, carrying numbers and nothing else, glued to the
// rectangle. The rule is not "panels beside tools that measure" but "anything
// you have to click at stays still, anything you only read can follow".
//
// It lives in shared/ rather than in the inspector because page analysis and
// the image inventory both want the same thing. Two near-identical panels
// diverge, and then nobody can explain why one behaves differently from the
// other. See LESSONS-LEARNED.md item 9.

(() => {
  'use strict';

  const NS = '__CG_SCOPE__';
  const state = globalThis[NS] || (globalThis[NS] = {});
  if (state.panel) return;

  // Light and dark both defined. The panel floats over an arbitrary page, so
  // it cannot borrow the page's colours and must carry its own.
  const CSS = `
    .cgp {
      position: absolute;
      left: 16px;
      top: 16px;
      width: 348px;
      max-height: calc(100vh - 32px);
      display: flex;
      flex-direction: column;
      border-radius: 8px;
      overflow: hidden;
      pointer-events: auto;
      background: var(--cgp-bg);
      color: var(--cgp-ink);
      box-shadow: 0 6px 28px rgba(0, 0, 0, 0.30), 0 0 0 1px var(--cgp-line);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Helvetica, Arial, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    .cgp, .cgp * { box-sizing: border-box; }

    .cgp {
      --cgp-bg: #ffffff;
      --cgp-soft: #f6f7f9;
      --cgp-ink: #1f2328;
      --cgp-muted: #6a737d;
      --cgp-line: #e0e4e8;
      --cgp-accent: #e67a0f;
    }
    @media (prefers-color-scheme: dark) {
      .cgp {
        --cgp-bg: #16191d;
        --cgp-soft: #1d2126;
        --cgp-ink: #e6edf3;
        --cgp-muted: #9aa4ae;
        --cgp-line: #2b3138;
      }
    }

    .cgp-head {
      display: flex;
      align-items: stretch;
      border-bottom: 1px solid var(--cgp-line);
      background: var(--cgp-soft);
      flex: none;
    }
    .cgp-tabs { display: flex; flex: 1 1 auto; min-width: 0; }
    .cgp-tab {
      flex: 1 1 0;
      min-width: 0;
      padding: 9px 6px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--cgp-muted);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cgp-tab[aria-selected="true"] {
      color: var(--cgp-ink);
      border-bottom-color: var(--cgp-accent);
      background: var(--cgp-bg);
    }
    .cgp-tab:focus-visible { outline: 2px solid var(--cgp-accent); outline-offset: -2px; }

    .cgp-grip, .cgp-close {
      flex: none;
      width: 32px;
      border: 0;
      background: transparent;
      color: var(--cgp-muted);
      cursor: grab;
      display: grid;
      place-items: center;
      padding: 0;
    }
    .cgp-grip:active { cursor: grabbing; }
    .cgp-close { cursor: pointer; }
    .cgp-close:hover, .cgp-grip:hover { color: var(--cgp-ink); }
    .cgp-grip svg, .cgp-close svg { display: block; }

    /* Vertical only. A panel that scrolls sideways is a panel whose content
       escaped, and the scrollbar hides the fact by making it look deliberate.
       The page report shipped with its size column pushed off the right edge
       and a scrollbar underneath implying that was the design. */
    .cgp-body { overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }
    .cgp-pane { display: none; padding: 12px; min-width: 0; }
    .cgp-pane.is-on { display: block; }

    /* -----------------------------------------------------------------------
       Shared controls
       -----------------------------------------------------------------------
       The colour picker drew a headline figure, a stack of click-to-copy rows
       and a caption, and the ruler needed the same three things. Drawing them
       twice is how two panels start behaving differently for reasons nobody
       can reconstruct afterwards. See LESSONS-LEARNED.md item 9.

       These carry the cgp- prefix instead of the bare .val, .btn and .note the
       tools already define privately. Tool CSS and this CSS land in the same
       shadow root, so a shared rule named .btn would sit alongside the
       inspector's own .btn and one would win by source order, which is not a
       decision anybody made. A prefix nothing else uses cannot collide, and
       migrating each tool onto these becomes a visible change to one tool at a
       time rather than a silent restyle of three working tools at once.

       Outstanding: the colour picker still has its own copies of .val, .btn
       and .tip. They are byte-identical to these. They come out once the ruler
       has proven these in Chrome, not before, because deleting the working
       copy and adding the untested one in the same commit means a failure has
       two candidate causes. */

    .cgp-figure {
      height: 74px;
      border-radius: 6px;
      border: 1px solid var(--cgp-line);
      background: var(--cgp-soft);
      display: grid;
      place-items: center;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .cgp-figure.is-empty {
      font-family: inherit;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: 0;
      color: var(--cgp-muted);
    }

    .cgp-vals { display: grid; gap: 5px; margin-top: 10px; }
    .cgp-val {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      /* min-width: 0 on the row and on the span below. Without both, a long
         value refuses to shrink, pushes the row past the panel's width, and
         the body grows a horizontal scrollbar that makes the overflow look
         deliberate. That shipped once in the page report. */
      min-width: 0;
      padding: 7px 10px;
      border: 1px solid var(--cgp-line);
      border-radius: 5px;
      background: var(--cgp-bg);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .cgp-val:hover { border-color: var(--cgp-accent); }
    .cgp-val b { font-size: 10px; font-weight: 600; color: var(--cgp-muted); flex: none; }
    .cgp-val span {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cgp-btn {
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
    .cgp-btn:hover { background: var(--cgp-bg); }
    /* A button that cannot act says so by looking inert. The alternative is a
       button that does nothing when pressed, which reads as a broken tool
       rather than an empty selection. */
    .cgp-btn:disabled { opacity: 0.45; cursor: default; }
    .cgp-btn:disabled:hover { background: var(--cgp-soft); }

    .cgp-tip { margin: 6px 2px 0; font-size: 10px; color: var(--cgp-muted); }
    .cgp-note { margin: 8px 0 0; font-size: 11px; color: var(--cgp-muted); }
    .cgp-note.warn { color: var(--cgp-accent); }
  `;

  // Inline SVG rather than an image file: an <img> would be another package
  // resource to resolve at runtime, and these are nine path commands.
  const GRIP = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5v13M1.5 8h13M8 1.5 5.8 3.7M8 1.5l2.2 2.2M8 14.5l-2.2-2.2M8 14.5l2.2-2.2M1.5 8l2.2-2.2M1.5 8l2.2 2.2M14.5 8l-2.2-2.2M14.5 8l-2.2 2.2"/></svg>';
  const CLOSE = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6.4"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/></svg>';

  /**
   * Build a panel inside a shadow root.
   *
   * opts.tabs   [{ id, label }]  at least one
   * opts.onClose                 called when the close button is pressed
   * opts.onTab  (id) => {}       called when a tab becomes visible, including
   *                              the first one at creation time, so a tab can
   *                              do its work lazily instead of on startup
   *
   * Returns { root, pane(id), show(id), current() }.
   */
  function create(shadow, opts) {
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'cgp';

    // Tools set their own width. 348 suits the inspector's two-column cells;
    // the page report needs more because its rows carry a dimension, a size
    // and a filename on the same line. Clamped so that a tool cannot ask for
    // something wider than the window it floats in.
    if (opts.width) {
      const max = Math.max(280, document.documentElement.clientWidth - 32);
      root.style.width = Math.min(opts.width, max) + 'px';
    }

    const head = document.createElement('div');
    head.className = 'cgp-head';

    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'cgp-tabs';

    const grip = document.createElement('button');
    grip.className = 'cgp-grip';
    grip.type = 'button';
    grip.title = 'Drag to move';
    grip.innerHTML = GRIP;

    const close = document.createElement('button');
    close.className = 'cgp-close';
    close.type = 'button';
    close.title = 'Close';
    close.innerHTML = CLOSE;

    head.appendChild(tabsWrap);
    head.appendChild(grip);
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'cgp-body';

    root.appendChild(head);
    root.appendChild(body);
    shadow.appendChild(root);

    const panes = new Map();
    const buttons = new Map();
    let currentId = null;

    function show(id) {
      if (!panes.has(id) || id === currentId) return;
      currentId = id;
      for (const [tid, pane] of panes) pane.classList.toggle('is-on', tid === id);
      for (const [tid, btn] of buttons) btn.setAttribute('aria-selected', String(tid === id));
      if (typeof opts.onTab === 'function') opts.onTab(id);
    }

    for (const tab of opts.tabs) {
      const btn = document.createElement('button');
      btn.className = 'cgp-tab';
      btn.type = 'button';
      btn.textContent = tab.label;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); show(tab.id); });
      tabsWrap.appendChild(btn);
      buttons.set(tab.id, btn);

      const pane = document.createElement('div');
      pane.className = 'cgp-pane';
      body.appendChild(pane);
      panes.set(tab.id, pane);
    }

    close.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (typeof opts.onClose === 'function') opts.onClose();
    });

    // --- dragging ---------------------------------------------------------
    // The grip is the only drag surface. Dragging by the whole header would
    // mean a mis-aimed click on a tab starts a drag instead of switching tabs,
    // which is the kind of thing that feels broken without being explicable.
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    function clampInView() {
      const r = root.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      // A panel dragged mostly off screen is unrecoverable without a reset, so
      // keep a margin of it reachable at all times.
      const keep = 48;
      let left = r.left;
      let top = r.top;
      left = Math.min(left, vw - keep);
      left = Math.max(left, keep - r.width);
      top = Math.min(top, vh - keep);
      top = Math.max(top, 0);
      root.style.left = Math.round(left) + 'px';
      root.style.top = Math.round(top) + 'px';
    }

    grip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const r = root.getBoundingClientRect();
      offsetX = ev.clientX - r.left;
      offsetY = ev.clientY - r.top;
      dragging = true;
      grip.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      ev.stopPropagation();
    });

    grip.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      root.style.left = Math.round(ev.clientX - offsetX) + 'px';
      root.style.top = Math.round(ev.clientY - offsetY) + 'px';
      ev.preventDefault();
    });

    function endDrag(ev) {
      if (!dragging) return;
      dragging = false;
      if (grip.hasPointerCapture(ev.pointerId)) grip.releasePointerCapture(ev.pointerId);
      clampInView();
    }
    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);

    const onResize = () => clampInView();
    window.addEventListener('resize', onResize);

    if (opts.tabs.length) show(opts.tabs[0].id);

    return {
      root,
      pane: (id) => panes.get(id),
      show,
      current: () => currentId,
      isDragging: () => dragging,
      // Called by the tool's teardown. The resize listener is on window, so it
      // outlives the shadow root and has to be removed explicitly.
      destroy: () => window.removeEventListener('resize', onResize),
    };
  }

  state.panel = { create };
})();
