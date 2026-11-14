// Backline — backing-track player. Everything is synthesised with Web Audio (no samples, nothing to license).
// The song is a list of bars: {chords:[name per segment], groove:{sub,bars,v:{lane:'x..'}}|null, grooveBar, beats}.
import { voicing } from './music.js';

const LOOKAHEAD = 0.12, TICK = 25;
const midiHz = n => 440 * Math.pow(2, (n - 69) / 12);

export class Player {
  constructor() {
    this.ctx = null; this.bars = []; this.bpm = 100; this.pct = 100; this.shift = 0; this.swing = 0.5;
    this.mute = { drums: false, bass: false, chords: false, click: true }; this.countIn = true;
    this.loop = null; this.playing = false; this.onBar = null; this.onStop = null; this.marks = [];
    this.fileMode = false; this.trackMute = new Set();   // own MIDI files: play the file's own notes; tracks can be muted one by one
    this.midiOut = null; this.kit = false;                // Web MIDI out (B6): drums to a drum module, on/off apart from the device's own drums
  }
  _init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
    const ctx = this.ctx;
    this.out = ctx.createDynamicsCompressor(); this.out.threshold.value = -14; this.out.ratio.value = 4; this.out.connect(ctx.destination);
    this.bus = {}; for (const [k, g] of Object.entries({ drums: 0.9, bass: 0.55, chords: 0.22, click: 0.5, file: 0.5 })) { const n = ctx.createGain(); n.gain.value = g; n.connect(this.out); this.bus[k] = n; }
    const len = ctx.sampleRate; this.noise = ctx.createBuffer(1, len, ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  load({ bars, bpm, swing }) { this.stop(); this.bars = bars; this.bpm = bpm || 100; this.swing = swing || 0.5; }
  get tempo() { return this.bpm * this.pct / 100; }
  setMute(part, on) { this.mute[part] = on; if (this.bus && this.bus[part]) this.bus[part].gain.setTargetAtTime(on ? 0 : { drums: 0.9, bass: 0.55, chords: 0.22, click: 0.5 }[part], this.ctx.currentTime, 0.02); }
  async play(fromBar = 0) {
    this._init(); if (this.ctx.state !== 'running') await this.ctx.resume();
    Object.keys(this.mute).forEach(k => this.setMute(k, this.mute[k]));
    this.stop(true); this.playing = true; this.cur = fromBar; this.marks = [];
    this.next = this.ctx.currentTime + 0.08;
    if (this.countIn) { const beats = this.bars[fromBar] ? this.bars[fromBar].beats : 4, spb = 60 / this.tempo;
      for (let b = 0; b < beats; b++) { this._click(this.next + b * spb, b === 0, true); this.marks.push({ t: this.next + b * spb, bar: -1, beat: b }); } this.next += beats * spb; }
    this.timer = setInterval(() => this._schedule(), TICK); this._schedule();
    const raf = () => { if (!this.playing) return; const t = this.ctx.currentTime; let m = null; while (this.marks.length && this.marks[0].t <= t) m = this.marks.shift();
      if (m && this.onBar) this.onBar(m.bar, m.beat || 0); this.raf = requestAnimationFrame(raf); };
    this.raf = requestAnimationFrame(raf);
  }
  /** silence the drum module at once (all notes off on channel 10) */
  _midiPanic() { if (this.midiOut) try { this.midiOut.send([0xB9, 123, 0]); } catch (e) { /* unplugged */ } }
  stop(quiet) {
    if (this.timer) clearInterval(this.timer); this.timer = null; if (this.raf) cancelAnimationFrame(this.raf);
    const was = this.playing; this.playing = false; if (this.kit) this._midiPanic();
    if (this.ctx && this.voices) for (const v of this.voices) try { v.stop(this.ctx.currentTime + 0.03); } catch (e) { /* already stopped */ }
    this.voices = [];
    if (was && !quiet && this.onStop) this.onStop();
  }
  _schedule() {
    while (this.playing && this.next < this.ctx.currentTime + LOOKAHEAD) {
      if (this.loop && (this.cur > this.loop[1] || this.cur < this.loop[0])) this.cur = this.loop[0];
      if (this.cur >= this.bars.length) { const end = this.next; setTimeout(() => this.stop(), Math.max(0, (end - this.ctx.currentTime) * 1000)); this.marks.push({ t: end, bar: -2 }); this.playing = false; clearInterval(this.timer); this.timer = null; return; }
      this._bar(this.bars[this.cur], this.next);
      const spb = 60 / this.tempo; for (let k = 0; k < this.bars[this.cur].beats; k++) this.marks.push({ t: this.next + k * spb, bar: this.cur, beat: k });
      this.next += this.bars[this.cur].beats * 60 / this.tempo; this.cur++;
    }
  }
  _bar(bar, t0) {
    const spb = 60 / this.tempo, dur = bar.beats * spb;
    // click on every beat
    for (let b = 0; b < bar.beats; b++) this._click(t0 + b * spb, b === 0, false);
    // drums
    if (this.fileMode && bar.notes) {
      for (const n of bar.notes) { if (this.trackMute.has(n.tr)) continue; const t = t0 + n.f * dur;
        if (n.lane) this._hit(n.lane, n.v > 100 ? 'X' : n.v < 50 ? 'g' : n.open ? 'o' : 'x', t);
        else this._note(n.n, t, Math.max(0.06, n.d * dur), n.v, n.prog); }
    }
    const g = this.fileMode ? null : bar.groove;
    if (g && g.v) {
      const lanes = Object.entries(g.v), stepsAll = lanes.length ? lanes[0][1].length : 0, perBar = Math.max(1, Math.round(stepsAll / (g.bars || 1)));
      const off = (bar.grooveBar % (g.bars || 1)) * perBar, stepDur = dur / perBar, sw = (this.swing - 0.5) * 2 * stepDur;
      for (const [lane, str] of lanes) for (let s = 0; s < perBar; s++) { const ch = str[off + s]; if (!ch || ch === '.') continue;
        const t = t0 + s * stepDur + (s % 2 ? sw : 0); this._hit(lane, ch, t); }
    }
    // bass and pad, one per chord segment
    const segs = bar.chords || [], segDur = dur / Math.max(1, segs.length);
    segs.forEach((c, i) => { const v = voicing(c, this.shift); if (!v) return; const t = t0 + i * segDur;
      // bass: root on every beat of the segment, short and round
      const beats = Math.max(1, Math.round(segDur / spb)); for (let b = 0; b < beats; b++) this._bass(v.bass, t + b * spb, spb * 0.85);
      this._pad(v.pad, t, segDur * 0.96); });
  }
  _keep(n) { this.voices.push(n); if (this.voices.length > 400) this.voices.splice(0, 200); return n; }
  _env(t, a, d, peak, bus) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); g.connect(bus); return g; }
  _noise(t, d, type, freq, q, peak, bus) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    s.connect(f); f.connect(this._env(t, 0.002, d, peak, bus)); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05); this._keep(s); }
  _tone(t, f0, f1, d, type, peak, bus) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
    o.connect(this._env(t, 0.002, d, peak, bus)); o.start(t); o.stop(t + d + 0.05); this._keep(o); }
  // one drum hit: the device's synth (silent when Drums is muted) and, when Kit is on, the drum module over MIDI
  _hit(lane, ch, t) { if (!this.mute.drums) this._drum(lane, ch, t); if (this.kit && this.midiOut) this._midi(lane, ch, t); }
  _midi(lane, ch, t) {
    const note = { K: 36, S: ch === 'r' ? 37 : 38, HH: ch === 'o' ? 46 : 42, HP: 44, T1: 48, T2: 45, T3: 43, C: 49, R: 51 }[lane]; if (!note) return;
    const vel = ch === 'X' ? 118 : ch === 'g' ? 42 : 92;
    let at; try { const ts = this.ctx.getOutputTimestamp(); at = ts.performanceTime + (t - ts.contextTime) * 1000; } catch (e) { at = performance.now() + (t - this.ctx.currentTime) * 1000; }
    try { this.midiOut.send([0x99, note, vel], at); this.midiOut.send([0x89, note, 0], at + 60); } catch (e) { /* device unplugged: drop the hit */ }
  }
  _drum(lane, ch, t) {
    const B = this.bus.drums, v = ch === 'X' ? 1 : ch === 'g' ? 0.3 : 0.75;
    switch (lane) {
      case 'K': this._tone(t, 140, 45, 0.28, 'sine', 1.0 * v, B); this._noise(t, 0.012, 'lowpass', 2500, 0.7, 0.25 * v, B); break;
      case 'S': if (ch === 'r') { this._noise(t, 0.04, 'bandpass', 2200, 3, 0.5 * v, B); break; }
        this._tone(t, 220, 180, 0.09, 'triangle', 0.45 * v, B); this._noise(t, 0.16, 'highpass', 1400, 0.7, 0.6 * v, B);
        if (ch === 'f' || ch === 'd') this._noise(t - 0.03, 0.06, 'highpass', 1400, 0.7, 0.25, B); break;
      case 'HH': this._noise(t, ch === 'o' ? 0.32 : 0.045, 'highpass', 7500, 0.7, 0.32 * v, B); break;
      case 'HP': this._noise(t, 0.03, 'bandpass', 6000, 1.2, 0.2, B); break;
      case 'T1': this._tone(t, 240, 170, 0.26, 'sine', 0.7 * v, B); break;
      case 'T2': this._tone(t, 180, 125, 0.3, 'sine', 0.7 * v, B); break;
      case 'T3': this._tone(t, 130, 85, 0.36, 'sine', 0.75 * v, B); break;
      case 'C': this._noise(t, 1.4, 'highpass', 4500, 0.5, 0.3 * v, B); break;
      case 'R': this._noise(t, 0.35, 'bandpass', 5200, 2, 0.22 * v, B); this._tone(t, 3200, 3200, 0.2, 'sine', 0.03 * v, B); break;
    }
  }
  _click(t, accent, count) { const o = this.ctx.createOscillator(); o.frequency.value = accent ? 1600 : 1100; o.connect(this._env(t, 0.001, 0.05, count ? 0.6 : 0.5, count ? this.out : this.bus.click)); o.start(t); o.stop(t + 0.08); this._keep(o); }
  _bass(n, t, d) { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(n); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + d);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.01); g.gain.setValueAtTime(0.9, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f); f.connect(g); g.connect(this.bus.bass); o.start(t); o.stop(t + d + 0.05); this._keep(o); }
  // one note of the user's own file: a plain synth voice by General MIDI family (bass, keys, strings/pads, leads)
  _note(n, t, d, vel, prog) {
    const fam = prog >> 3, o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = fam === 4 ? 'sawtooth' : fam === 6 || fam === 11 ? 'sawtooth' : fam === 10 || fam === 9 ? 'square' : 'triangle';
    o.frequency.value = midiHz(n); f.type = 'lowpass'; f.frequency.value = fam === 4 ? 700 : 2400;
    const pk = 0.08 + 0.22 * (vel / 127), sus = fam === 0 || fam === 3 ? 0.35 : 0.8, rel = Math.min(0.25, d * 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + 0.008); g.gain.exponentialRampToValueAtTime(pk * sus + 0.0001, t + Math.min(d, 0.3));
    g.gain.setValueAtTime(pk * sus + 0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.0001, t + d + rel);
    o.connect(f); f.connect(g); g.connect(this.bus.file); o.start(t); o.stop(t + d + rel + 0.05); this._keep(o); }
  _pad(notes, t, d) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.04); g.gain.setValueAtTime(0.5, t + Math.max(0.05, d - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800; f.connect(g); g.connect(this.bus.chords);
    for (const n of notes) for (const det of [-6, 6]) { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + d + 0.05); this._keep(o); } }
}
