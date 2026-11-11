// Headless check of the app (B4): search → open a song → sheet renders → player schedules bars → loop and transpose.
// Usage: node test/ui/smoke.mjs <base url> [out dir for screenshots]
const pw = await import(process.env.PW || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const base = process.argv[2] || 'http://localhost:8765/', out = process.argv[3];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const ok = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
await page.goto(base); await page.waitForSelector('#q');
await page.fill('#q', 'hotel california'); await page.waitForSelector('.song');
const first = await page.textContent('.song .t b'); ok(/hotel california/i.test(first), 'search finds Hotel California: ' + first);
if (out) await page.screenshot({ path: out + '/search.png', fullPage: false });
await page.click('.song'); await page.waitForSelector('.bar');
const nBars = await page.$$eval('.bar', b => b.length), tl = await page.evaluate(() => window.__bl.tl.length);
ok(nBars > 20 && nBars === tl, `sheet shows every bar (${nBars})`);
ok(await page.$('#strip button') !== null, 'form strip rendered');
const key0 = await page.textContent('.fact b'); ok(/B minor/.test(key0), 'key shown as consensus B minor: ' + key0);
if (out) await page.screenshot({ path: out + '/sheet.png', fullPage: false });
await page.click('#tup'); await page.click('#tup'); const key2 = await page.textContent('.fact b'); ok(/C♯ minor|D♭ minor/.test(key2), 'transpose +2 → ' + key2);
await page.click('#tdn'); await page.click('#tdn');
await page.click('[data-loop="1"]'); const loop = await page.evaluate(() => window.__bl.player.loop); ok(Array.isArray(loop), 'loop set on item 1: ' + JSON.stringify(loop));
await page.click('#player .play'); await page.waitForTimeout(6000);   // count-in is one bar (3.2 s at 74 BPM)
const st = await page.evaluate(() => ({ playing: window.__bl.player.playing, cur: window.__bl.player.cur, state: window.__bl.player.ctx && window.__bl.player.ctx.state }));
ok(st.playing && st.cur >= loop[0], 'player running inside the loop: ' + JSON.stringify(st));
const now = await page.$('.bar.now'); ok(!!now, 'playhead highlights a bar');
await page.click('#player .play'); ok(!(await page.evaluate(() => window.__bl.player.playing)), 'stop');
await page.goto(base + '#song=eagles--hotel-california&tempo=80&transpose=-2'); await page.waitForTimeout(800);
const deep = await page.evaluate(() => ({ pct: window.__bl.player.pct, shift: window.__bl.player.shift })); ok(deep.pct === 80 && deep.shift === -2, 'deep link tempo/transpose: ' + JSON.stringify(deep));
await page.goto(base + '#credits'); await page.waitForSelector('.credits'); ok(/Lakh MIDI Dataset/.test(await page.textContent('.credits')), 'credits page');
ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
