// CG Scope: the test trust boundary 3 asked for.
//
// Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
// Co-Authored-By: Connected Geek, LLC <support@connectedgeek.net>
//
// From CLAUDE.md, written before the worker existed:
//
//   "If a worker is ever added, the messages it accepts are enumerated from a
//    list in code, and the test walks that list and asserts each is refused
//    when it should be. A test that names the messages individually goes stale
//    the day someone adds a fifth."
//
// So nothing below names 'cg-scope:download' as the thing under test. It walks
// ACCEPTED. The per-type fixtures are looked up by name, and a type on the list
// with no fixture is itself a failure, which is what stops this going stale:
// adding a message type turns this test red until somebody writes down what a
// good and a bad one look like.
//
// Run by `build.ps1 selftest`, which relays these lines into its own report.
// Prints "pass <name>" or "FAIL <name>" and exits non-zero if anything failed.
// Not shipped: tools/ is excluded by the packaging filter.

import { ACCEPTED, MAX_URLS, validate, isAccepted } from '../src/shared/messages.js';

let failures = 0;

function check(name, condition) {
  if (condition) {
    console.log('pass  ' + name);
  } else {
    console.log('FAIL  ' + name);
    failures += 1;
  }
}

// One entry per accepted type. `good` must validate; every `bad` must not.
const FIXTURES = {
  'cg-scope:download': {
    good: { type: 'cg-scope:download', urls: ['http://example.test/a.png'] },
    bad: [
      ['no urls key', { type: 'cg-scope:download' }],
      ['urls is not an array', { type: 'cg-scope:download', urls: 'a.png' }],
      ['urls is empty', { type: 'cg-scope:download', urls: [] }],
      ['every url has a refused scheme', {
        type: 'cg-scope:download',
        urls: ['javascript:void 0', 'file:///etc/passwd', 'blob:whatever'],
      }],
      ['over the ceiling', {
        type: 'cg-scope:download',
        urls: new Array(MAX_URLS + 1).fill('http://example.test/a.png'),
      }],
    ],
  },
};

// --- the walk ---------------------------------------------------------------

check('the accepted list is not empty', ACCEPTED.length > 0);
check('the accepted list is frozen', Object.isFrozen(ACCEPTED));

for (const type of ACCEPTED) {
  const fixture = FIXTURES[type];

  // The staleness guard. A type added to ACCEPTED without a fixture fails here
  // rather than being silently untested.
  check('"' + type + '" has fixtures in this test', Boolean(fixture));
  if (!fixture) continue;

  check('"' + type + '" is recognised by isAccepted', isAccepted(type));

  const good = validate(fixture.good);
  check('"' + type + '" accepts a well-formed message', good.ok === true);
  check('"' + type + '" returns urls rather than echoing the input',
    good.ok === true && Array.isArray(good.urls) && good.urls.length > 0);

  for (const [label, message] of fixture.bad) {
    const result = validate(message);
    check('"' + type + '" refuses: ' + label, result.ok === false);
  }
}

// --- things no type may permit ----------------------------------------------

for (const junk of [null, undefined, 0, 'cg-scope:download', [], { }]) {
  check('a message that is not an object with a type is refused: ' + JSON.stringify(junk) ,
    validate(junk).ok === false);
}

check('an unknown type is refused', validate({ type: 'cg-scope:anything-else' }).ok === false);
check('a type that merely looks like ours is refused',
  validate({ type: 'cg-scope:download ', urls: ['http://example.test/a.png'] }).ok === false);

// Mixed input: the good url survives and the bad one is counted, rather than
// the whole message being refused. A batch that refuses everything because one
// image was embedded oddly would be worse than one that saves what it can and
// says how many it did not.
const mixed = validate({
  type: 'cg-scope:download',
  urls: ['http://example.test/a.png', 'javascript:void 0'],
});
check('a mixed batch keeps the usable urls', mixed.ok === true && mixed.urls.length === 1);
check('a mixed batch counts what it dropped', mixed.ok === true && mixed.refused === 1);

if (failures > 0) process.exitCode = 1;
