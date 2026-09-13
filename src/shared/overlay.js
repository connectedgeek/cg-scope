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

  // Chosen to sit above essentially all page furniture without using the
  // maximum, so that a genuinely higher element is still possible and visible
  // rather than silently hidden behind us.
  const Z_INDEX = '2147483000';

  function makeHost(id) {
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
      'pointer-events': 'auto',
    };
    for (const [prop, val] of Object.entries(rules)) {
      host.style.setProperty(prop, val, 'important');
    }

    // documentElement rather than body: body can be missing during early load,
    // and some pages apply transforms to body, which would make a fixed-position
    // child position relative to body instead of the viewport.
    document.documentElement.appendChild(host);
    return host;
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
    if (entry.host && entry.host.parentNode) {
      entry.host.parentNode.removeChild(entry.host);
    }
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
  function toggle(id, build) {
    if (open.has(id)) {
      close(id);
      return false;
    }

    // One tool at a time. Two full-viewport overlays both capturing pointer
    // events is a bug that looks like a frozen page.
    closeAll();

    const host = makeHost(id);
    const shadow = host.attachShadow({ mode: 'closed' });

    const api = {
      id,
      close: () => close(id),
    };

    const onKey = (ev) => {
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
      if (host.parentNode) host.parentNode.removeChild(host);
      return false;
    }

    open.set(id, { host, shadow, teardown, onKey });
    return true;
  }

  state.overlay = {
    toggle,
    close,
    closeAll,
    isOpen: (id) => open.has(id),
    Z_INDEX,
  };
})();
