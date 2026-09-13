// CG Scope: the popup. The launcher, and the only persistent UI.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// The popup is destroyed the moment the user clicks into the page, so it can
// never host anything that needs to run while the user interacts with the
// page. That is what the injected tool modules are for.
//
// There is no service worker in this extension. Nothing here posts a message
// to one, and nothing should be added that assumes one exists without first
// reading "Settled" item 2 in CLAUDE.md.

import { classifyTab } from '../shared/pages.js';

// The version is read, never written. manifest.json holds the only version
// literal in the repository; see "Versioning" in CLAUDE.md.
function showVersion() {
  const el = document.getElementById('version');
  el.textContent = 'v' + chrome.runtime.getManifest().version;
}

async function getActiveTab() {
  // currentWindow rather than lastFocusedWindow: the popup belongs to the
  // window the user clicked in, and lastFocusedWindow can resolve to a
  // different window when more than one is open.
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

function render(state) {
  const value = document.getElementById('page-value');
  const note = document.getElementById('page-note');

  value.classList.toggle('blocked', state.kind !== 'ok');

  if (state.kind === 'ok') {
    value.textContent = state.host;
    note.hidden = true;
    note.textContent = '';
    return;
  }

  // Every non-ok case says which one it is and why. A tool that silently does
  // nothing is indistinguishable from a broken tool (invariant 5), and the
  // reasons a page is unusable need different responses from the user.
  //
  // 'no-access' is separate from 'unknown' on purpose: it is the common case
  // and it has a known cause, whereas 'unknown' means we genuinely cannot say.
  // Labelling the common case "Unknown" was the 2026-09-13 defect.
  const heading = {
    restricted: 'Restricted page',
    'no-access': 'No page access',
    file: 'Local file',
    unknown: 'Unknown',
  };

  value.textContent = heading[state.kind] || 'Unknown';
  note.textContent = state.reason;
  note.hidden = false;
}

async function main() {
  showVersion();

  let tab = null;
  try {
    tab = await getActiveTab();
  } catch (err) {
    render({ kind: 'unknown', reason: 'Could not read the active tab: ' + err.message });
    return;
  }

  render(classifyTab(tab));
}

main();
