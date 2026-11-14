// "Gap after every chord" check (14 Nov): record every pad/bass note the player schedules for Hotel California and
// confirm (1) a chord that repeats is not re-struck, (2) each new chord starts before the previous one has faded,
// (3) the bass notes touch end to end, and (4) the audio level never drops to silence between chords while playing.
const pw = await import(process.env.PW || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const base = process.argv[2] || 'http://localhost:8765/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) process.exitCode = 1; };
const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(base + '#song=eagles--hotel-california&tempo=120'); await page.waitForSelector('.cbar');
await page.evaluate(() => { const P = __bl.player; P.countIn = false; window.__pads = []; window.__bass = []; window.__lv = [];
  const pad = P._pad.bind(P), bass = P._bass.bind(P); P._pad = (n, t, d) => { __pads.push([t, d, n.join(' ')]); pad(n, t, d); }; P._bass = (n, t, d) => { __bass.push([t, d]); bass(n, t, d); }; });
await page.click('#player .play'); await page.waitForTimeout(300);
await page.evaluate(() => { const P = __bl.player, an = P.ctx.createAnalyser(); an.fftSize = 2048; P.bus.chords.connect(an); const buf = new Float32Array(an.fftSize);
  window.__iv = setInterval(() => { an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; __lv.push(Math.sqrt(s / buf.length)); }, 20); });
await page.waitForTimeout(9000); await page.evaluate(() => clearInterval(__iv)); await page.click('#player .play');
const r = await page.evaluate(() => ({ pads: __pads, bass: __bass, lv: __lv, tl: __bl.tl.slice(0, 12).map(b => b.chords.join('/')) }));
const changes = r.tl.flatMap(x => x.split('/')).filter((c, i, a) => i === 0 || c !== a[i - 1]).length;
ok(r.pads.length > 0 && r.pads.length <= changes + 1, `pads struck only on chord changes (${r.pads.length} pads, first bars: ${r.tl.slice(0, 6).join(' | ')})`);
// _pad gets the chord's length; it then rings 350 ms past it, so the next chord (due exactly at the end) overlaps that tail
let overlaps = true; for (let i = 1; i < r.pads.length; i++) { const [t0, d0] = r.pads[i - 1], [t1] = r.pads[i]; if (t1 > t0 + d0 + 0.35 - 0.05 || t1 < t0 + d0 - 0.01) overlaps = false; }
ok(overlaps, 'every new chord starts while the previous one is still sounding (crossfade)');
let legato = true; for (let i = 1; i < r.bass.length; i++) { const [t0, d0] = r.bass[i - 1], [t1] = r.bass[i]; if (t1 - (t0 + d0) > 0.005) legato = false; }
ok(legato, `bass notes touch end to end (${r.bass.length} notes)`);
const lv = r.lv.slice(15), floor = Math.min(...lv), mean = lv.reduce((a, b) => a + b, 0) / lv.length;
ok(floor > mean * 0.15, `chord level never drops to silence while playing (min ${floor.toFixed(4)}, mean ${mean.toFixed(4)})`);
ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
