// Navigation check (DrumPath patterns): bottom bar + More sheet on phones, tabs on wide screens, drill-down
// Browse → facet → value → song, tappable facts on the song page, bar sheet, and Back restoring the exact screen + scroll.
const pw = await import(process.env.PW || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const base = process.argv[2] || 'http://localhost:8765/', shots = process.argv[3];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ok = (c, msg) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + msg); if (!c) process.exitCode = 1; };
const errors = [];
const page = await browser.newPage({ viewport: { width: 412, height: 915 } }); page.on('pageerror', e => errors.push(e.message));
await page.goto(base); await page.waitForSelector('.hero');
ok(await page.isVisible('#bnav') && !(await page.isVisible('#tabs')), 'phone: bottom bar shown, tab row hidden');
if (shots) await page.screenshot({ path: shots + '/home.png' });
await page.click('#morebtn'); ok(await page.isVisible('#msheet'), 'More opens the sections sheet');
await page.click('#msheet [data-nav="settings"]'); await page.waitForSelector('[data-theme-set]'); ok(/settings/.test(await page.evaluate(() => location.hash)), 'More → Settings');
await page.click('[data-theme-set="dark"]'); ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'theme switches to dark');
await page.click('#bnav [data-nav="browse"]'); await page.waitForSelector('.tile');
await page.click('.tile[href="#browse=key"]'); await page.waitForSelector('.tile[href*="v=Am"]');
await page.click('.tile[href*="v=Am"]'); await page.waitForSelector('.lrow');
ok(/Key: Am/.test(await page.textContent('h1')), 'drill-down Browse › Key › Am');
if (shots) await page.screenshot({ path: shots + '/browse.png' });
await page.evaluate(() => scrollTo(0, 900)); await page.waitForTimeout(200); const y0 = await page.evaluate(() => scrollY);
const nth = await page.$$('.lrow'); await nth[12].click(); await page.waitForSelector('.cbar');
ok(/Am/.test(await page.textContent('.fact .v')), 'song from the Am list opens');
const backTitle = await page.getAttribute('#backb', 'title'); ok(/Back to Am/.test(backTitle), 'Back button names where it goes: ' + backTitle);
await page.click('#backb'); await page.waitForSelector('.lrow'); await page.waitForTimeout(300);
const y1 = await page.evaluate(() => scrollY); ok(/Key: Am/.test(await page.textContent('h1')) && Math.abs(y1 - y0) < 40, `Back restores the list and its scroll (${y0} → ${y1})`);
await page.goto(base + '#song=eagles--hotel-california'); await page.waitForSelector('.cbar');
await page.click('.fact.tap'); await page.waitForSelector('.lrow'); ok(/Key: Bm/.test(await page.textContent('h1')), 'tapping the Key fact lists songs in Bm');
await page.click('#backb'); await page.waitForSelector('.cbar');
await page.click('.cbar[data-bar="4"]'); await page.waitForSelector('.modal'); ok(/Bar 5/.test(await page.textContent('.modal h2')), 'tapping a bar opens its details');
if (shots) await page.screenshot({ path: shots + '/barsheet.png' });
await page.click('#bloop'); ok(JSON.stringify(await page.evaluate(() => __bl.player.loop)) === '[4,4]', 'Loop this bar');
await page.click('.crumbs a[href^="#artist"]'); await page.waitForSelector('.lrow'); ok(/Eagles/.test(await page.textContent('h1')), 'crumb → artist page');
const wide = await browser.newPage({ viewport: { width: 1280, height: 800 } }); wide.on('pageerror', e => errors.push(e.message));
await wide.goto(base + '#browse'); await wide.waitForSelector('.tile'); ok(await wide.isVisible('#tabs') && !(await wide.isVisible('#bnav')), 'wide screen: tab row, no bottom bar');
ok(await wide.getAttribute('#tabs [data-nav="browse"]', 'class').then(c => /on/.test(c)), 'current tab highlighted');
if (shots) { await wide.goto(base + '#song=eagles--hotel-california'); await wide.waitForSelector('.cbar'); await wide.screenshot({ path: shots + '/sheet-wide.png' }); }
ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
