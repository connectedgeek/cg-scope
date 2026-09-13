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

// Every tool is [shared runtime, tool], injected in that order as classic
// scripts sharing the isolated world's globals. See src/shared/overlay.js for
// why classic scripts rather than ES modules.
const TOOLS = [
  {
    id: 'ruler',
    label: 'Ruler',
    hint: 'Drag to measure',
    files: ['src/shared/overlay.js', 'src/tools/ruler.js'],
  },
  {
    id: 'inspector',
    label: 'Inspector',
    hint: 'Elements, colors, fonts',
    files: ['src/shared/overlay.js', 'src/shared/panel.js', 'src/tools/inspector.js'],
  },
  {
    id: 'colorpicker',
    label: 'Color picker',
    hint: 'Sample any pixel',
    files: ['src/shared/overlay.js', 'src/shared/panel.js', 'src/tools/colorpicker.js'],
  },
];

function showVersion() {
  // The version is read, never written. manifest.json holds the only version
  // literal in the repository; see "Versioning" in CLAUDE.md.
  document.getElementById('version').textContent =
    'v' + chrome.runtime.getManifest().version;
}

async function getActiveTab() {
  // currentWindow rather than lastFocusedWindow: the popup belongs to the
  // window the user clicked in, and lastFocusedWindow can resolve to a
  // different window when more than one is open.
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length ? tabs[0] : null;
}

function renderPage(state) {
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

function setError(message) {
  const el = document.getElementById('tool-error');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.hidden = false;
}

async function runTool(tool, tabId) {
  setError('');
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: tool.files,
    });
    // Close the popup so it is not covering the page the user is about to
    // measure. The injected tool owns the interaction from here.
    window.close();
  } catch (err) {
    // The common causes are a restricted page and a page that finished loading
    // differently than expected. Show what Chrome said rather than a generic
    // failure, because the message is usually the actual diagnosis.
    setError('Could not start ' + tool.label + ': ' + err.message);
  }
}

function renderTools(state, tabId) {
  const list = document.getElementById('tool-list');
  const empty = document.getElementById('tool-empty');
  const usable = state.kind === 'ok' || state.kind === 'file';

  list.textContent = '';

  for (const tool of TOOLS) {
    const button = document.createElement('button');
    button.className = 'tool';
    button.type = 'button';
    button.disabled = !usable || tabId === null;

    const name = document.createElement('span');
    name.className = 'tool-name';
    name.textContent = tool.label;

    const hint = document.createElement('span');
    hint.className = 'tool-hint';
    hint.textContent = tool.hint;

    button.appendChild(name);
    button.appendChild(hint);
    // No inline handlers anywhere: the Manifest V3 content security policy
    // forbids them, and the default cannot be loosened.
    button.addEventListener('click', () => runTool(tool, tabId));
    list.appendChild(button);
  }

  empty.hidden = usable;
}

async function main() {
  showVersion();

  let tab = null;
  try {
    tab = await getActiveTab();
  } catch (err) {
    renderPage({ kind: 'unknown', reason: 'Could not read the active tab: ' + err.message });
    renderTools({ kind: 'unknown' }, null);
    return;
  }

  const state = classifyTab(tab);
  renderPage(state);
  renderTools(state, tab ? tab.id : null);
}

main();
