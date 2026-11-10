// Builds the plain-script copy of the engine for pages without modules (DrumPath vendors this file).
// engine/backline.js (ES module) → engine/dist/backline-engine.<VERSION>.js (sets window.Backline / module.exports)
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(ROOT, 'engine/backline.js'), 'utf8');
const VERSION = src.match(/export const VERSION = '([^']+)'/)[1];
let body = src.replace(/^export default Backline;\s*$/m, '').replace(/^export (const|function|class) /gm, '$1 ');
if (/^\s*export\b/m.test(body)) throw new Error('unhandled export left in engine source');
const out = `/* Backline engine ${VERSION} — plain-script build of engine/backline.js (generated; do not edit).
   https://github.com/aaditya-verma/backline · Lakh MIDI Dataset credit: see README. */
(function (root) {
'use strict';
${body}
if (typeof module !== 'undefined' && module.exports) module.exports = Backline; else root.Backline = Backline;
})(typeof window !== 'undefined' ? window : globalThis);
`;
const dir = path.join(ROOT, 'engine/dist'); fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `backline-engine.${VERSION}.js`); fs.writeFileSync(file, out);
// smoke check: loads as a plain script and exposes the API
const ctx = vm.createContext({}); vm.runInContext(out, ctx);
if (ctx.Backline.VERSION !== VERSION || typeof ctx.Backline.analyse !== 'function') throw new Error('built file does not load');
console.log('wrote', path.relative(ROOT, file), out.length, 'bytes');
