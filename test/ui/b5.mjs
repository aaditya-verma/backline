// B5 headless check: own MIDI file (analysed on device, parts incl. melody, plays the file), setlist (add, reorder,
// share link opens on a second "phone" and saves), jam mode (chord shown, beats move, closes).
// Usage: node test/ui/b5.mjs <base url> <a .mid file named "Artist - Title.mid"> [shots dir]
const pw = await import(process.env.PW || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const [base = 'http://localhost:8765/', midi, shots] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) process.exitCode = 1; };
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } }); const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));

// own file
await page.goto(base + '#files'); await page.waitForSelector('#ownfile', { state: 'attached' });
await page.setInputFiles('#ownfile', midi); await page.waitForSelector('.tracks', { timeout: 15000 });
ok(/^#own=own-/.test(await page.evaluate(() => location.hash)), 'own file opens as #own=…');
const parts = await page.$$eval('[data-track]', b => b.map(x => x.textContent)); ok(parts.some(t => /melody/i.test(t)), 'parts listed incl. the melody: ' + parts.join(', '));
ok(/^G\b/.test((await page.textContent('.fact .v')).trim()), 'own file key G major');
await page.click('#player .play'); await page.waitForTimeout(3500);
const st = await page.evaluate(() => ({ playing: __bl.player.playing, fileMode: __bl.player.fileMode, notes: __bl.tl[0].notes.length }));
ok(st.playing && st.fileMode && st.notes > 0, 'plays the file’s own notes: ' + JSON.stringify(st));
await page.click('#player .play');
await page.click('[data-track]'); ok(await page.evaluate(() => __bl.player.trackMute.size === 1), 'a part can be muted');
if (shots) await page.screenshot({ path: shots + '/own.png' });
await page.goto(base + '#files'); await page.waitForSelector('.lrow'); ok(/Test Song/.test(await page.textContent('main')), '“My files” lists it after a reload');

// setlist: two index songs, reorder, share
for (const [q, tempo] of [['hotel california', 80], ['sweet child o mine', 100]]) {
  await page.goto(base + '#search'); await page.fill('#q', q); await page.waitForSelector('.lrow .t b'); await page.click('.lrow'); await page.waitForSelector('#addset');
  await page.evaluate(t => { __bl.player.pct = t; }, tempo);
  await page.click('#addset'); await page.waitForSelector('.modal');
  if (await page.$('[data-set]')) await page.click('[data-set]'); else { await page.fill('#newset', 'Friday jam'); await page.click('#mkset'); }
}
await page.goto(base + '#sets'); await page.click('.lrow'); await page.waitForSelector('.setsongs');
ok((await page.$$('.setsongs .lrow')).length === 2, 'setlist has 2 songs');
await page.click('[data-dn="0"]'); ok(/Sweet Child/i.test(await page.textContent('.setsongs .lrow b')), 'reorder moves Sweet Child up');
await page.click('#start'); await page.waitForSelector('.setbar'); ok(/1 of 2/.test(await page.textContent('.setbar')), 'opened from the setlist: 1 of 2');
await page.click('#setnext'); await page.waitForTimeout(800); ok(/Hotel California/.test(await page.textContent('h1')), 'Next › opens song 2');
ok(await page.evaluate(() => __bl.player.pct) === 80, 'song 2 opens at its saved 80% tempo');
const setId = await page.evaluate(() => __bl.Sets.allSets()[0].id);
const link = await page.evaluate(id => __bl.Sets.shareLink(__bl.Sets.getSet(id), location.href), setId);
const phone2 = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage(); phone2.on('pageerror', e => errors.push(e.message));
await phone2.goto(link); await phone2.waitForSelector('#saveset'); ok((await phone2.$$('.list .lrow')).length === 2, 'share link shows 2 songs on a second phone');
await phone2.click('#saveset'); await phone2.waitForSelector('.setsongs'); ok(await phone2.evaluate(() => __bl.Sets.allSets().length === 1), 'second phone saved it');
if (shots) await phone2.screenshot({ path: shots + '/shared.png' });

// jam mode
await page.goto(base + '#song=eagles--hotel-california'); await page.waitForSelector('#addset');
await page.click('#jambtn'); await page.waitForSelector('#jam #jnow'); ok(/B/.test(await page.textContent('#jnow')), 'jam mode shows the first chord: ' + await page.textContent('#jnow'));
await page.click('#jplay'); await page.waitForTimeout(5000);
const jb = await page.evaluate(() => ({ beats: document.querySelectorAll('#jbeats span').length, on: document.querySelectorAll('#jbeats .on').length, bar: document.querySelector('#jbar').textContent }));
ok(jb.beats === 4 && jb.on === 1 && /bar/.test(jb.bar), 'jam beats move: ' + JSON.stringify(jb));
if (shots) await page.screenshot({ path: shots + '/jam.png' });
await page.click('#jx'); ok(!(await page.$('#jam')), 'jam mode closes');
ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
