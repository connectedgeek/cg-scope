// CG Scope: the overlay host every tool sits on.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// ---------------------------------------------------------------------------
// Why this is a classic script and not an ES module
// ---------------------------------------------------------------------------
// chrome.scripting.executeScript({ files: [...] }) injects classic scripts.
// A static `import` statement in an injected file fails. The idiomatic
// workaround is a loader that dynamically imports a package-relative URL from
// chrome.runtime.getURL, and that is forbidden here: the build guard rejects
// dynamic import outright, with no exception for in-package URLs.
//
// (This paragraph is worded around the construct rather than naming it,
// because the guard matches identifiers anywhere in a file, comments included.
// That is deliberate, and the documented remedy for a false positive is to
// reword the comment rather than weaken the pattern. This is that remedy.)
//
// The exception could have been carved out. It was not, because a guard with
// one narrow exception is a guard that acquires a second one, and the cost of
// leaving it absolute is small: classic scripts injected in order share the
// isolated world's global scope, so an earlier file can define a namespace a
// later file uses. That is what this file does.
//
// So the repository has two script styles on purpose:
//   src/popup/   and pages.js   ES modules. The popup is a real extension page.
//   src/shared/overlay.js
//   src/tools/*                 classic scripts, injected in order, sharing
//                               globalThis.__CG_SCOPE__ in the isolated world.
//
// ---------------------------------------------------------------------------
// Why a closed shadow root
// ---------------------------------------------------------------------------
// The page and this overlay share a DOM. Without a shadow root the page's CSS
// restyles the tool and the tool's CSS leaks into the page. That is the
// difference between something that works on one site and something that works
// on a client's theme with four stylesheets fighting each other.
//
// The host element itself is still exposed to page CSS, because it lives in
// the page's tree. Its critical properties are therefore set inline with
// !important, which outranks any page stylesheet, and `all: initial` clears
// anything inherited.
//
// ---------------------------------------------------------------------------
// Why the host is also a popover
// ---------------------------------------------------------------------------
// Fixed, full-viewport and at a very high z-index is not enough, and on
// 2026-09-13 both of the ways it is not enough were reproduced deliberately on
// test/hostile.html rather than waited for.
//
// An element at z-index 2147483647 covers this overlay, because this overlay
// sits at 2147483000 on purpose, so that a genuinely higher element stays
// visible rather than being silently hidden. When that element also takes
// pointer events, which any cookie wall or modal backdrop does, the tool
// becomes unreachable and gives no sign of it: the popup launches it, nothing
// errors, and the page simply stops responding to the drag.
//
// A `transform` on `html` breaks it differently and more confusingly. A
// transformed ancestor becomes the containing block for its fixed-position
// descendants, so the host is positioned against the transformed root instead
// of the viewport. The readings stay correct, because clientX and clientY are
// viewport coordinates that a transform does not touch. Only the drawing
// moves, so the tool reports accurately and cannot be aimed.
//
// Both are answered by the top layer: elements in it paint above all normal
// content irrespective of z-index, and are positioned against the viewport
// rather than against a transformed ancestor. The Popover API is how an
// ordinary element gets there without being a dialog.
//
// What this does NOT do. It does not put the overlay above another top-layer
// element. A page showing a modal <dialog>, or running something fullscreen,
// is in the same layer and the later entrant wins. That case has not been
// tested and nothing here claims it works.
//
// What this reverses. The Z_INDEX below was chosen under the maximum
// specifically so that an element the page had placed higher would stay
// visible instead of being hidden behind this overlay. The top layer discards
// that: CG Scope now covers page furniture at any z-index, including the
// maximum, which is exactly what trap 1 demonstrates. That is the right call
// for a tool whose entire job is to sit over a page and be used, and it is a
// reversal rather than an improvement, so it is written here instead of being
// left for someone to discover from a screenshot.
//
// The z-index, the fixed position and the full-viewport size all stay. When
// showPopover is unavailable or throws, they are the entire mechanism again,
// which is exactly what shipped through 0.7.0.

(() => {
  'use strict';

  const NS = '__CG_SCOPE__';

  // Re-injection is expected: the user clicks a tool twice, or clicks a second
  // tool. If this file has already run in this frame, leave the existing
  // namespace alone. Replacing it would orphan overlays that are currently
  // open, and their close handlers with them.
  if (globalThis[NS] && globalThis[NS].overlay) return;

  const state = globalThis[NS] || (globalThis[NS] = {});
  const open = new Map(); // id -> { host, shadow, teardown }

  // Originally chosen to sit above essentially all page furniture without using
  // the maximum, so that a genuinely higher element would stay visible rather
  // than be silently hidden behind us.
  //
  // That reasoning no longer describes what happens. Where the top layer is
  // available this overlay is above everything in normal content, the maximum
  // included, and the header of this file records that reversal and why it is
  // wanted. The value is unchanged and still matters: where showPopover is
  // unavailable or throws, this is the entire mechanism, it is the mechanism
  // every version up to 0.7.0 shipped on, and under it the original sentence
  // is true again.
  const Z_INDEX = '2147483000';

  function makeHost(id, pointerEvents) {
    const host = document.createElement('cg-scope-overlay');
    host.setAttribute('data-cg-tool', id);

    // Inline !important beats page stylesheets, including `* { ... !important }`
    // rules, which real sites do have. `all: initial` clears inheritance.
    const rules = {
      all: 'initial',
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      'z-index': Z_INDEX,
      margin: '0',
      padding: '0',
      border: '0',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      transform: 'none',
      filter: 'none',
      // 'auto' for a tool that is itself the interaction surface, such as the
      // ruler's drag. 'none' for a tool that needs to see what is underneath
      // it: with 'auto', document.elementFromPoint returns this host rather
      // than the page element the user is pointing at, which makes inspection
      // impossible. A tool using 'none' listens on document instead, and sets
      // pointer-events: auto on its own panel so its buttons still work.
      'pointer-events': pointerEvents === 'none' ? 'none' : 'auto',
    };
    for (const [prop, val] of Object.entries(rules)) {
      host.style.setProperty(prop, val, 'important');
    }

    // documentElement rather than body: body can be missing during early load,
    // and some pages apply transforms to body, which would make a fixed-position
    // child position relative to body instead of the viewport.
    document.documentElement.appendChild(host);

    // Then the top layer, where the browser offers it.
    //
    // showPopover() requires the element to be in the document, so this cannot
    // move up with the style rules. The attribute is set immediately before the
    // call rather than alongside them for the same reason: a popover that is
    // never shown is display:none by UA rule, and the inline display:block
    // above would spend the intervening moment arguing with it for no purpose.
    if (typeof host.showPopover === 'function') {
      try {
        host.setAttribute('popover', 'manual');
        host.showPopover();
      } catch (err) {
        // Not fatal, and deliberately not silent. Everything underneath still
        // applies: the host is fixed, full-viewport and at Z_INDEX, which is
        // how this worked before and still works on every page with no
        // transformed root and nothing at the maximum stacking order.
        console.warn('[CG Scope] top layer unavailable, using z-index only:', err);
        host.removeAttribute('popover');
      }
    }
    return host;
  }

  // Removing an open popover from the document takes it out of the top layer on
  // its own, so the explicit hide is belt and braces rather than a requirement.
  // It is here because a host stranded in the top layer would make the page
  // unusable and would be a thoroughly confusing thing to debug, and the call
  // costs nothing.
  function removeHost(host) {
    if (!host) return;
    try {
      if (host.hasAttribute('popover') && typeof host.hidePopover === 'function') {
        host.hidePopover();
      }
    } catch (err) {
      // Hiding a popover that is not showing throws. That is not a problem
      // worth reporting: the removal below is what actually matters, and it
      // runs either way.
    }
    if (host.parentNode) host.parentNode.removeChild(host);
  }

  // Gap between the thing being described and the panel describing it.
  const GAP = 10;

  /**
   * Position a panel beside a rectangle instead of on top of it.
   *
   * Shared rather than copied into each tool, because two near-identical
   * implementations diverge and then nobody can reconstruct why two panels
   * behave differently. See LESSONS-LEARNED.md item 9.
   *
   * Candidates are tried in order and the first that fits entirely in the
   * viewport wins. If none fits, which needs a rectangle close to the size of
   * the window, the position is clamped into view and allowed to overlap: a
   * panel you cannot see is worse than one in the way.
   *
   * `panel` must be absolutely positioned inside a host that spans the
   * viewport, so that its coordinates and the rectangle's are the same space.
   *
   * The panel stays where it is unless it would actually cover the rectangle
   * or has fallen outside the viewport. Repositioning on every update looks
   * responsive and is unusable: the inspector's panel moved on every hover,
   * so reaching its Copy button meant chasing it around the screen. A panel
   * that only moves when it is in the way is still correct and stops being a
   * moving target. Pass { stable: false } for the rare case that wants the
   * panel glued to the rectangle.
   */
  function placeBeside(panel, rect, opts) {
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    if (!opts || opts.stable !== false) {
      // Measured rather than read back from style, so that a panel which has
      // never been positioned in script still reports where CSS put it.
      const pr = panel.getBoundingClientRect();
      const fits = pr.left >= 0 && pr.top >= 0 && pr.right <= vw && pr.bottom <= vh;
      const clear =
        pr.right + GAP <= rect.left ||
        pr.left >= rect.left + rect.width + GAP ||
        pr.bottom + GAP <= rect.top ||
        pr.top >= rect.top + rect.height + GAP;
      if (fits && clear) return;
    }

    const candidates = [
      [rect.left, rect.top + rect.height + GAP],  // below, left edges aligned
      [rect.left, rect.top - ph - GAP],           // above, left edges aligned
      [rect.left + rect.width + GAP, rect.top],   // to the right
      [rect.left - pw - GAP, rect.top],           // to the left
    ];

    for (const [cx, cy] of candidates) {
      if (cx >= 0 && cy >= 0 && cx + pw <= vw && cy + ph <= vh) {
        panel.style.left = cx + 'px';
        panel.style.top = cy + 'px';
        return;
      }
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    panel.style.left = clamp(rect.left, 0, Math.max(0, vw - pw)) + 'px';
    panel.style.top = clamp(rect.top + rect.height + GAP, 0, Math.max(0, vh - ph)) + 'px';
  }

  function close(id) {
    const entry = open.get(id);
    if (!entry) return false;
    open.delete(id);

    // Teardown first, so a tool can read the DOM it created before it goes.
    try {
      if (typeof entry.teardown === 'function') entry.teardown();
    } catch (err) {
      // A tool's cleanup throwing must not leave the host element behind.
      // A stuck full-viewport overlay makes the page unusable, which is worse
      // than whatever the cleanup was trying to do.
      console.error('[CG Scope] teardown for "' + id + '" threw:', err);
    }

    document.removeEventListener('keydown', entry.onKey, true);
    removeHost(entry.host);
    return true;
  }

  function closeAll() {
    for (const id of Array.from(open.keys())) close(id);
  }

  /**
   * Open an overlay, or close it if that id is already open.
   *
   * Returns true if the overlay is now open, false if this call closed it.
   * Toggling is the behaviour the user expects from a toolbar button, and it
   * is also what makes double-injection harmless.
   *
   * build(shadow, api) populates the shadow root. It may return a function,
   * which is called on close.
   */
  function toggle(id, build, opts) {
    if (open.has(id)) {
      close(id);
      return false;
    }

    // One tool at a time. Two full-viewport overlays both capturing pointer
    // events is a bug that looks like a frozen page.
    closeAll();

    const options = opts || {};
    const host = makeHost(id, options.pointerEvents);
    const shadow = host.attachShadow({ mode: 'closed' });

    const api = {
      id,
      close: () => close(id),
      // Exposed because a tool listening on `document` needs to recognise its
      // own UI. Events originating inside a closed shadow root are retargeted
      // to the host when observed from outside it, so `ev.target === api.host`
      // is how a document-level handler says "this click was mine".
      host,
      placeBeside,
    };

    // A tool can suspend Escape while a browser-level picker is on screen.
    // Chrome's EyeDropper is cancelled with Escape, and without this the same
    // keypress would cancel the pick AND close the whole tool, which is two
    // outcomes from one key and the wrong one is not recoverable.
    let escapeEnabled = true;
    api.setEscapeEnabled = (on) => { escapeEnabled = !!on; };

    const onKey = (ev) => {
      if (!escapeEnabled) return;
      if (ev.key !== 'Escape') return;
      // Capture phase and stopPropagation: pages bind their own Escape
      // handlers, and the user pressing Escape means "close this tool", not
      // "close whatever modal the page thinks is open".
      ev.stopPropagation();
      ev.preventDefault();
      close(id);
    };
    document.addEventListener('keydown', onKey, true);

    let teardown = null;
    try {
      teardown = build(shadow, api);
    } catch (err) {
      // If a tool fails while building, do not leave a blank overlay swallowing
      // every click on the page.
      console.error('[CG Scope] tool "' + id + '" failed to start:', err);
      document.removeEventListener('keydown', onKey, true);
      removeHost(host);
      return false;
    }

    open.set(id, { host, shadow, teardown, onKey });
    return true;
  }

  state.overlay = {
    toggle,
    close,
    closeAll,
    placeBeside,
    isOpen: (id) => open.has(id),
    Z_INDEX,
  };
})();
