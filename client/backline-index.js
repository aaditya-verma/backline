/* Backline index client for DrumPath (B7). Plain script, no dependencies: load it like the engine, as a pinned copy
   (vendor/backline-index.<version>.js). Exposes window.BacklineIndex (or module.exports under Node).

   BacklineIndex.base                       → 'https://aaditya-verma.github.io/backline/data/v1/' (same origin as DrumPath)
   await BacklineIndex.manifest()           → {schema, engine, built, counts, search:[files], source, citation}
   await BacklineIndex.search('hotel cal', {limit, minQuality}) → [{id, title, artist, bpm, key, meter, feel, quality, drumsLvl, gtrLvl, year, genre}]
   await BacklineIndex.song(id)             → the song JSON (consensus, versions, analysis …), see docs/drumpath-integration.md
   BacklineIndex.toDrumPath(song, MidiAnalyse, lessons) → the object DrumPath's analyser returns, so fromAnalysis()
       and reviewSheet() work unchanged: {features, patterns, sections, confidence, suggestedTags, level, draftSong, unmapped, backline:{…}}
   BacklineIndex.link(id, {sec, tempo, transpose}) → 'https://aaditya-verma.github.io/backline/#song=<id>&…' (Open in Backline ↗)
   Data: Lakh MIDI Dataset v0.1 (C. Raffel, CC BY 4.0) — credit it wherever this data shows. */
(function (root) {
  'use strict';
  const VERSION = '0.1.0';
  const SITE = 'https://aaditya-verma.github.io/backline/';
  const api = { VERSION, base: SITE + 'data/v1/', site: SITE };
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const getJSON = async url => { const r = await fetch(url); if (!r.ok) throw new Error('Backline: ' + r.status + ' for ' + url); return r.json(); };
  let MAN = null, ROWS = null;
  api.manifest = async () => MAN || (MAN = await getJSON(api.base + 'manifest.json'));
  async function rows() {
    if (ROWS) return ROWS; const m = await api.manifest();
    const parts = await Promise.all(m.search.map(f => getJSON(api.base + f)));
    // v1 rows only ever grow: [id, title, artist, bpm, key, meter, feel, quality, drumsLvl, gtrLvl, year, genre]
    ROWS = parts.flat().map(r => ({ id: r[0], title: r[1], artist: r[2], bpm: r[3], key: r[4], meter: r[5], feel: r[6], quality: r[7], drumsLvl: r[8], gtrLvl: r[9], year: r[10] ?? null, genre: r[11] ?? null, _n: norm(r[1] + ' ' + r[2]), _t: norm(r[1]) }));
    return ROWS;
  }
  api.search = async (q, opt = {}) => {
    const words = norm(q).split(' ').filter(Boolean), minQ = opt.minQuality ?? 60, limit = opt.limit ?? 30; if (!words.length) return [];
    const hits = (await rows()).filter(s => s.quality >= minQ && words.every(w => s._n.includes(w)))
      .map(s => [(s._t === words.join(' ') ? 3 : 0) + (s._t.startsWith(words[0]) ? 2 : 0) + s.quality / 100, s]).sort((a, b) => b[0] - a[0]);
    return hits.slice(0, limit).map(([, s]) => { const { _n, _t, ...r } = s; return r; });
  };
  api.song = id => getJSON(`${api.base}songs/${id.slice(0, 2)}/${encodeURIComponent(id)}.json`);
  api.link = (id, o = {}) => SITE + '#song=' + encodeURIComponent(id) + (o.sec ? '&sec=' + o.sec : '') + (o.tempo ? '&tempo=' + o.tempo : '') + (o.transpose ? '&transpose=' + o.transpose : '');
  /** turn a Backline song into what DrumPath's MidiAnalyse.analyse() returns, using DrumPath's own rule table and
   *  pattern similarity (they stay in DrumPath, brief §2). Drum features, patterns and sections are produced by the
   *  same code DrumPath used (moved into the Backline engine in B1; output identical on all 1,150 Groove files). */
  api.toDrumPath = (song, MA, lessons) => {
    const A = song.analysis, D = A.drums, c = song.consensus || {};
    if (!D) throw new Error('Backline: this song has no drum part');
    const F = D.features, tags = MA.ruleTags(F);
    if (lessons && D.patterns && D.patterns.main) MA.simTags(D.patterns.main, lessons).forEach(t => { const o = tags.find(x => x.id === t.id);
      if (o) { o.confidence = Math.min(0.95, o.confidence + 0.15); o.reason += ' · pattern match ' + Math.round(t.sim * 100) + '%'; } else tags.push(t); });
    const lv = id => +String(id).split('.')[0], core = tags.filter(t => t.weight === 2);
    const level = core.length ? Math.max(...core.map(t => lv(t.id))) : tags.length ? Math.max(...tags.map(t => lv(t.id))) : 1;
    const bpm = Math.round(c.bpm || F.pulseBpm || F.bpm);
    return { features: F, patterns: D.patterns, sections: D.sections, confidence: { ...D.confidence, bpm: c.bpmSure ? 0.97 : D.confidence.bpm, tags: 0.6 },
      suggestedTags: tags, level, unmapped: F.unmapped || 0,
      draftSong: { title: song.title, artist: song.artist, genre: MA.guessGenre(F), bpm, bpmSure: !!c.bpmSure, meter: c.meter || F.meter,
        core: tags.filter(t => t.weight === 2).map(t => t.id), support: tags.filter(t => t.weight === 1).map(t => t.id) },
      backline: { id: song.id, quality: A.quality, key: c.key ? c.key + (c.mode === 'minor' ? 'm' : '') : null, year: c.year ?? null, genre: c.genre ?? null,
        form: A.form, versions: (song.versions || []).length, link: api.link(song.id), source: 'Lakh MIDI Dataset (CC BY 4.0)' } };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BacklineIndex = api;
})(typeof window !== 'undefined' ? window : globalThis);
