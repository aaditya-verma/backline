// Layout check (RULES C8 sizes + 125% text): no page wider than the screen, no control spilling off-screen,
// the player never covers the last bar of the chart. Usage: node test/ui/layout.mjs <base url> [shots dir]
const pw = await import(process.env.PW || 'playwright'); const chromium = pw.chromium || pw.default.chromium;
const base = process.argv[2] || 'http://localhost:8765/', shots = process.argv[3];
const SIZES = [[640, 937], [1024, 553], [360, 780], [780, 360], [412, 915], [915, 412], [800, 1280], [1280, 800]];
const PAGES = [['search', '#'], ['results', '#', 'love'], ['sheet', '#song=eagles--hotel-california'], ['credits', '#credits']];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let problems = 0;
for (const zoom of [1, 1.25]) for (const [w, h] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  for (const [name, hash, q] of PAGES) {
    await page.goto(base + hash); await page.waitForTimeout(400);
    if (zoom !== 1) await page.addStyleTag({ content: `html{zoom:${zoom}}` });
    if (q) { await page.fill('#q', q); await page.waitForTimeout(300); }
    if (name === 'sheet') await page.waitForSelector('.bar');
    const r = await page.evaluate(() => {
      const out = [], W = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > W + 1) out.push(`page ${document.documentElement.scrollWidth}px wide`);
      document.querySelectorAll('button, a.btn, input, select, .fact, .bar').forEach(el => { if (el.closest('.formstrip') || el.closest('#player .r2')) return; const b = el.getBoundingClientRect();
        if (b.width && (b.right > W + 1 || b.left < -1)) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${el.className} spills (${Math.round(b.left)}–${Math.round(b.right)})`); });
      const pl = document.querySelector('#player'); if (pl && !pl.hidden) { window.scrollTo(0, document.documentElement.scrollHeight); const bars = document.querySelectorAll('.bar'), last = bars[bars.length - 1];
        if (last && last.getBoundingClientRect().bottom > pl.getBoundingClientRect().top + 1 && document.querySelector('footer').getBoundingClientRect().bottom > pl.getBoundingClientRect().top + 1) out.push('player covers the end of the page'); }
      return out;
    });
    if (r.length) { problems += r.length; console.log(`✗ ${w}×${h} ${zoom * 100}% ${name}: ${r.slice(0, 4).join('; ')}`); }
    if (shots && zoom === 1 && [360, 915].includes(w)) await page.screenshot({ path: `${shots}/${name}-${w}x${h}.png` });
  }
  await page.close();
}
console.log(problems ? `${problems} layout problems` : 'layout: 0 problems on 4 screens × 8 sizes × 2 text sizes');
process.exitCode = problems ? 1 : 0; await browser.close();
