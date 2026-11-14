// B6 Kit check with a fake MIDI output: choose the module, turn Kit on, play → note-ons on channel 10 with future
// timestamps; Drums (device) and Kit toggle independently; stop sends all-notes-off.
const pw = await import(process.env.PW || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const base = process.argv[2] || 'http://localhost:8765/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) process.exitCode = 1; };
const page = await browser.newPage({ viewport: { width: 412, height: 915 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => { window.__sent = []; const out = { name: 'Alesis DM7X', manufacturer: 'Alesis', state: 'connected', send: (d, t) => window.__sent.push([d, t ?? null]) };
  navigator.requestMIDIAccess = async () => ({ outputs: new Map([['o1', out]]), onstatechange: null }); });
await page.goto(base + '#song=eagles--hotel-california'); await page.waitForSelector('.cbar');
ok(await page.isVisible('#kitbtn'), 'Kit button shown when Web MIDI exists');
await page.click('#kitbtn'); await page.waitForSelector('.modal [data-out]'); await page.click('.modal [data-out]');
await page.waitForTimeout(200); ok(await page.evaluate(() => __bl.player.kit && __bl.player.midiOut.name === 'Alesis DM7X'), 'module chosen, Kit on');
await page.evaluate(() => { __bl.player.countIn = false; }); await page.click('#player .play'); await page.waitForTimeout(2500);
const sent = await page.evaluate(() => window.__sent.filter(([d]) => d[0] === 0x99));
ok(sent.length > 4 && sent.every(([d]) => [36, 37, 38, 42, 44, 45, 46, 43, 48, 49, 51].includes(d[1])), `note-ons on channel 10 with GM drum notes (${sent.length})`);
ok(sent.some(([, t]) => t > 0), 'note-ons carry timestamps');
const synthOn = await page.evaluate(() => !__bl.player.mute.drums); ok(synthOn, 'device drums still on (both play)');
await page.click('[data-mute="drums"]'); ok(await page.evaluate(() => __bl.player.mute.drums && __bl.player.kit), 'device drums off, Kit still on');
await page.click('#player .play'); ok(await page.evaluate(() => window.__sent.some(([d]) => d[0] === 0xB9 && d[1] === 123)), 'stop sends all-notes-off');
await page.click('#kitbtn'); ok(await page.evaluate(() => !__bl.player.kit), 'Kit turns off');
ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
