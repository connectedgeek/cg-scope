// CG Scope: the only messages the service worker will accept.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// ---------------------------------------------------------------------------
// Why this file exists before the worker does
// ---------------------------------------------------------------------------
// Trust boundary 3 in CLAUDE.md was written when there was no worker and no
// intention of having one, and it specified this file in advance:
//
//   "If a worker is ever added, the messages it accepts are enumerated from a
//    list in code, and the test walks that list and asserts each is refused
//    when it should be. A test that names the messages individually goes stale
//    the day someone adds a fifth."
//
// So the list lives here, exported once. The worker consults it, the selftest
// walks it, and adding a second message type cannot quietly go untested: the
// test fails until that type has a fixture, which is the property being bought.
//
// The reason that boundary is written so strictly is in the same paragraph: on
// the previous project the defect that reached production lived on exactly
// this boundary, one operation out of four that was not gated because it
// returned no data and therefore looked harmless.
//
// ---------------------------------------------------------------------------
// Why an ES module
// ---------------------------------------------------------------------------
// It has two consumers and they are both privileged: the service worker, which
// is declared as a module, and the selftest, which runs it under node. The
// tool modules never see this file. They are classic scripts injected into a
// page and they send a message by name; that name arriving as a string is the
// boundary, and nothing on the page side gets to reach across it.

// Frozen because a list that decides what is allowed should not be editable by
// anything that imports it.
export const ACCEPTED = Object.freeze(['cg-scope:download']);

// A ceiling rather than no limit. Selecting every image on a large gallery and
// pressing Download should not hand Chrome ten thousand jobs; a refusal that
// names the number is better than a browser that appears to hang.
export const MAX_URLS = 200;

// http and https because that is what a page's images are served over, and
// data because an embedded image is the image itself. Everything else is
// refused by omission: blob: from a page does not resolve in the worker,
// file: and chrome-extension: have no business arriving from a content script,
// and a javascript: URL has no business existing here at all.
const ALLOWED_SCHEME = /^(?:https?|data):/i;

export function isAccepted(type) {
  return typeof type === 'string' && ACCEPTED.includes(type);
}

/**
 * Decide whether a message may be acted on, and hand back only the parts that
 * survived checking.
 *
 * Returns { ok: false, reason } or { ok: true, type, urls, refused }.
 *
 * Every caller uses the returned `urls`, never the ones it was sent. That is
 * the point of validating: a validator whose output is discarded is a comment.
 */
export function validate(message) {
  if (!message || typeof message !== 'object') {
    return { ok: false, reason: 'message is not an object' };
  }
  if (!isAccepted(message.type)) {
    return { ok: false, reason: 'message type is not on the accepted list' };
  }

  if (message.type === 'cg-scope:download') {
    if (!Array.isArray(message.urls)) {
      return { ok: false, reason: 'urls must be an array' };
    }
    if (message.urls.length === 0) {
      return { ok: false, reason: 'urls is empty' };
    }
    if (message.urls.length > MAX_URLS) {
      return { ok: false, reason: 'more than ' + MAX_URLS + ' urls in one message' };
    }

    const urls = [];
    let refused = 0;
    for (const candidate of message.urls) {
      if (typeof candidate === 'string' && ALLOWED_SCHEME.test(candidate)) urls.push(candidate);
      else refused += 1;
    }
    if (urls.length === 0) {
      return { ok: false, reason: 'no urls with a scheme this worker will act on' };
    }
    return { ok: true, type: message.type, urls, refused };
  }

  // Reached when a type is added to ACCEPTED and nobody wrote its validator.
  // Refusing is the only safe default: the alternative is that appearing on
  // the list is itself enough to be acted on, which makes the list a
  // convenience rather than a gate. The selftest asserts this branch by
  // walking ACCEPTED and failing on any type with no fixture.
  return { ok: false, reason: 'accepted type has no validator' };
}
