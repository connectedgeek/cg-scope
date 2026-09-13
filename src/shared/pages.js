// CG Scope: which pages an extension is allowed to run on, and how to say so.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>

// Chrome refuses to inject into its own pages, the Web Store, and other
// extensions' pages. This is a platform boundary, not a bug, and it is not
// something activeTab or any permission can change.
//
// The reason this lives in its own module rather than inline in the popup:
// every tool needs the same answer, and the honest response to a restricted
// page is an explanation rather than silence. A tool that appears to do
// nothing is indistinguishable from a broken tool, which is invariant 5.

const RESTRICTED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'extension:',
  'about:',
  'view-source:',
  'data:',
];

// Hosts Chrome blocks regardless of scheme. Kept as hostname suffixes rather
// than full URLs so that locale and path variants are covered.
const RESTRICTED_HOSTS = [
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
];

/**
 * Classify the active tab.
 *
 * Returns one of:
 *   { kind: 'ok',         origin, host }
 *   { kind: 'restricted', reason }   A URL we can see and Chrome blocks.
 *   { kind: 'no-access',  reason }   Chrome gave us no URL at all.
 *   { kind: 'file',       reason }   Allowed only if the user has enabled
 *                                    file access for this extension.
 *   { kind: 'unknown',    reason }   A URL we have and cannot parse.
 *
 * On 'no-access' versus 'restricted', which cost a defect on 2026-09-13:
 *
 * activeTab is granted when the user invokes the extension on a page it is
 * allowed to run on. On a chrome:// page, the Web Store, or another
 * extension's page it is never granted, so chrome.tabs.query returns a tab
 * with NO url property at all. The extension therefore cannot see the URL it
 * would need in order to say which restricted page it is.
 *
 * We will not take the "tabs" permission to fix that. It grants the URL and
 * title of every tab, which is browsing activity, which is a prohibited
 * category under Limited Use, and paying that price to improve one message
 * would be absurd.
 *
 * So the honest answer is a separate kind that says what we know (no URL) and
 * what it almost always means (a page extensions cannot run on), without
 * claiming to have identified which one. Reporting this as 'unknown' was the
 * defect: it used the message reserved for the case nobody can explain to
 * describe the single most common case.
 */
export function classifyTab(tab) {
  if (!tab) {
    return { kind: 'unknown', reason: 'Chrome reported no active tab.' };
  }
  if (!tab.url) {
    return {
      kind: 'no-access',
      reason:
        'Chrome did not provide a URL for this tab, which means CG Scope was ' +
        'not granted access to it. That is normally a page extensions cannot ' +
        'run on: a chrome:// page, the Chrome Web Store, or another extension.',
    };
  }
  return classifyUrl(tab.url);
}

/**
 * Classify a URL string. Exported separately so it can be reasoned about and
 * tested without a tab object.
 */
export function classifyUrl(rawUrl) {
  if (!rawUrl) {
    return { kind: 'unknown', reason: 'No URL was provided.' };
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'unknown', reason: 'The active tab URL did not parse.' };
  }

  if (url.protocol === 'file:') {
    return {
      kind: 'file',
      reason:
        'Local file. This works only if "Allow access to file URLs" is enabled ' +
        'for CG Scope on the extensions page.',
    };
  }

  if (RESTRICTED_SCHEMES.includes(url.protocol)) {
    return {
      kind: 'restricted',
      reason: `Chrome does not allow extensions to run on ${url.protocol} pages.`,
    };
  }

  const host = url.hostname.toLowerCase();
  for (const blocked of RESTRICTED_HOSTS) {
    if (host === blocked || host.endsWith('.' + blocked)) {
      return {
        kind: 'restricted',
        reason: `Chrome does not allow extensions to run on ${host}.`,
      };
    }
  }

  return { kind: 'ok', origin: url.origin, host: url.hostname };
}
