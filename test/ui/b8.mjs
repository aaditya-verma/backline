// B8 headless check: Find MIDI. Search → "Find MIDI for …" → links carry the title and artist and open in a new tab;
// songs already in Backline are shown first; a downloaded file with a bad name is imported under the typed names and
// graded ("How good is this file?"); song pages and My files link to Find MIDI. No request goes to the MIDI sites.
// Usage: node test/ui/b8.mjs <base url> <any .mid file> [shots dir]
const pw = await import(process.env.PW || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const [base = 'http://localhost:8765/', midi, shots] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) process.exitCode = 1; };
const errors = [], outside = [];
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } }); const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
ctx.on('request', r => { const h = new URL(r.url()).hostname; if (!/^(localhost|127\.0\.0\.1)$/.test(h) && !/fonts\./.test(h)) outside.push(h); });

// a song that isn't in Lakh: search shows the Find card
await page.goto(base + '#search'); await page.fill('#q', 'tum hi ho'); await page.waitForSelector('.findcta');
ok(/Find MIDI for “tum hi ho”/.test(await page.textContent('.findcta')), 'no results → “Find MIDI for …” card');
await page.click('.findcta'); await page.waitForSelector('#fsrc a');
ok(await page.inputValue('#ft') === 'tum hi ho', 'title carried into Find MIDI');
await page.fill('#fa', 'Arijit Singh');
const links = await page.$$eval('#fsrc a', as => as.map(a => ({ href: a.href, target: a.target, rel: a.rel })));
ok(links.length === 6, '6 sources listed');
ok(links.every(l => /tum(%20|\+)hi(%20|\+)ho/i.test(l.href) && /Arijit/.test(l.href)), 'every link has the title and artist');
ok(links.every(l => l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel)), 'links open in a new tab, noopener noreferrer');
ok(links[0].href.startsWith('https://bitmidi.com/search?q='), 'BitMidi uses its own search');
ok(!(await page.textContent('#fhave')).trim(), 'nothing shown as “already in Backline” for a song not in Lakh');
if (shots) await page.screenshot({ path: shots + '/find.png', fullPage: true });

// a badly named downloaded file takes the typed names, then is graded
await page.setInputFiles('#findfile', midi); await page.waitForSelector('.verdict', { timeout: 15000 });
ok(await page.textContent('h1') === 'tum hi ho' && /Arijit Singh/.test(await page.textContent('.shead .ar')), 'imported under the typed title and artist, not the file name');
const v = await page.$$eval('.verdict li', l => l.length); ok(v >= 3, 'grade card lists ' + v + ' checks');
ok(/[ABC]/.test(await page.textContent('.verdict .badge')), 'grade shown: ' + await page.textContent('.verdict .badge'));
if (shots) await page.screenshot({ path: shots + '/verdict.png', fullPage: true });
await page.goto(base + '#files'); await page.waitForSelector('.lrow');
ok(/tum hi ho/.test(await page.textContent('main')), 'listed in My files'); ok(!!(await page.$('a[href="#find"]')), 'My files links to Find MIDI');

// a song that is in Lakh: shown first, and its page links to Find MIDI with both names
await page.goto(base + '#find&t=Hotel%20California&a=Eagles'); await page.waitForSelector('#fhave .lrow');
ok(/Hotel California/.test(await page.textContent('#fhave')), '“Already in Backline” shows Hotel California');
await page.click('#fhave .lrow'); await page.waitForSelector('.note a[href^="#find"]');
const fh = await page.getAttribute('.note a[href^="#find"]', 'href'); ok(/t=Hotel\+California/.test(fh) && /a=Eagles/.test(fh), 'song page → Find MIDI link: ' + fh);
await page.click('.note a[href^="#find"]'); await page.waitForSelector('#fsrc a'); ok(await page.inputValue('#fa') === 'Eagles', 'artist filled from the song page');
await page.goBack(); await page.waitForSelector('.shead'); ok(/Hotel California/.test(await page.textContent('h1')), 'Back returns to the song');

// nav entry
await page.goto(base); await page.waitForSelector('#bnav'); await page.click('#bnav [data-nav="more"], #bnav .more').catch(() => {});
ok(await page.$$eval('[data-nav="find"]', e => e.length) > 0, 'Find MIDI is in the navigation');

ok(!outside.length, 'no requests to outside sites: ' + [...new Set(outside)].join(', '));
ok(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
