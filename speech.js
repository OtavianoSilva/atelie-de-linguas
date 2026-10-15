/* Speech — sintetizador de formantes em DSP puro (estilo Klatt). Determinístico e sem WebAudio:
   a mesma entrada gera exatamente as mesmas amostras em qualquer aparelho.
   Fonte glótica contínua -> cascata de ressonadores (F1..F5) + anti-ressonador nasal + ramo de fricção. */
(function (root) {
  'use strict';
  const C = (typeof module !== "undefined" && module.exports) ? require('./engine.js') : root.Conlang;
  const SR = 22050;      // taxa de amostragem
  const CR = 2000;       // taxa dos controles (trilhas de parâmetros)
  const MAX_SECONDS = 90;

  const VOICES = {
    aria:  { label: "Aria (aguda, suave)", f0: 205, scale: 1.10, rate: 1.00, oq: 0.62, tilt: 3400, breath: 0.05, jitter: 0.006, saw: false, flat: false, ng: 1.00 },
    bruno: { label: "Bruno (grave)",       f0: 105, scale: 0.90, rate: 0.95, oq: 0.55, tilt: 2600, breath: 0.04, jitter: 0.007, saw: false, flat: false, ng: 0.86 },
    pip:   { label: "Pip (infantil)",      f0: 300, scale: 1.28, rate: 1.10, oq: 0.66, tilt: 4200, breath: 0.05, jitter: 0.008, saw: false, flat: false, ng: 2.08 },
    robo:  { label: "Autômato (robótica)", f0: 125, scale: 1.00, rate: 1.05, oq: 0.60, tilt: 5000, breath: 0.00, jitter: 0.000, saw: true,  flat: true,  ng: 3.31 }
  };

  // formantes alvo [F1,F2,F3] em Hz para trato vocal de referência
  const VOWF = { a:[800,1250,2600], e:[500,1900,2650], i:[300,2250,3000], o:[500,900,2500], u:[320,850,2300],
                 "æ":[700,1750,2550], "ɪ":[400,1950,2550], "ʊ":[450,1050,2400], "ə":[520,1450,2500] };
  const APPF = { l:[360,1300,2800], r:[420,1250,1650], j:[270,2200,3000], w:[300,720,2300] };
  const NASF = { m:{f:[250,1000,2200], z:1100}, n:{f:[250,1450,2400], z:1700}, "ŋ":{f:[250,1900,2500], z:2300} };
  const LOCUS = { bilabial: 800, alveolar: 1700, velar: 1900, labiodental: 1100, "pós-alveolar": 1800, glotal: 1400, palatal: 2000, labiovelar: 700 };

  // Ganhos calibrados (ver teste de níveis): dB relativos à vogal tônica ficam perto dos alvos naturais.
  const G = {
    vowel: 1.0, weak: 0.82, approx: 0.8, nasal: 0.7, voicedFric: 0.05, closureBar: 0.12, vot: 0.4,
    fric: {                          // freq, largura de banda, ganho (calibrado contra a vogal vizinha)
      f: { f: 4800, bw: 5000, g: 0.0101 }, v: { f: 4800, bw: 5000, g: 0.006 },
      s: { f: 6800, bw: 2200, g: 0.0084 }, z: { f: 6500, bw: 2400, g: 0.005 },
      "ʃ": { f: 3300, bw: 1600, g: 0.0404 }, "ʒ": { f: 3100, bw: 1700, g: 0.0087 }
    },
    h: 0.0234,                       // aspiração filtrada pelas formantes da vogal vizinha
    burst: { bilabial: { f: 1100, bw: 1800, g: 0.2043 }, alveolar: { f: 4500, bw: 2200, g: 0.0593 }, velar: { f: 2300, bw: 1500, g: 0.0858 } },
    asp: 0.0254,
    // intensidade intrínseca das vogais equalizada pela resposta da cascata (independe de f0)
    vgain: { a: 0.383, e: 0.766, i: 0.9, o: 1.204, u: 3.39, "æ": 0.449, "ɪ": 1.08, "ʊ": 1.665, "ə": 1.12 }
  };

  const DUR = { v: .125, approx: .065, nasal: .075, fric: .10, stopVL: .095, stopV: .07, h: .07, burst: .012 };

  // ---------- plano: tempos, acentos, frases ----------
  function plan(items, voice, opts) {
    const rate = (voice.rate || 1) * (opts && opts.rate || 1);
    const events = [], phrases = [];
    let t = 0.12, cur = null, lastPause = 0;
    const pause = d => { d = Math.min(0.8, d) / Math.sqrt(rate); events.push({ kind: "pause", t0: t, d }); t += d; lastPause = d; };
    const startPhrase = () => { if (!cur) { cur = { start: t, end: t, kind: "end", accents: [] }; phrases.push(cur); } };
    const endPhrase = k => { if (cur) { cur.kind = k; cur = null; } };

    const finalWord = i => { for (let j = i + 1; j < items.length; j++) { if (items[j].kind === "word") return false; if (items[j].kind === "nl" || /^[.,!?:;]$/.test(items[j].token)) return true; } return true; };

    for (let wi = 0; wi < items.length && t < MAX_SECONDS; wi++) {
      const it = items[wi];
      if (it.kind === "nl") { endPhrase("."); pause(0.7); continue; }
      if (it.kind === "punct") {
        if (/^[,;:]$/.test(it.token)) { endPhrase(","); pause(it.token === "," ? 0.26 : 0.34); }
        else if (/^[.!?]$/.test(it.token)) { endPhrase(it.token); pause(0.55); }
        continue;                              // outros símbolos não são pronunciados
      }
      if (it.kind !== "word") continue;
      startPhrase();
      const nS = it.sylls.length, pf = finalWord(wi);
      it.sylls.forEach((s, si) => {
        const stressed = nS > 1 && si === it.stress, lastS = si === nS - 1;
        [...s].forEach((ph, pi) => {
          const isV = C.isVowel(ph); let cls, d;
          if (isV) { cls = "v"; d = DUR.v; if (stressed) d *= 1.2; else if (nS > 1) d *= 0.88; if (lastS) d *= 1.1; if (lastS && pf) d *= 1.45; }
          else {
            const info = C.CONSONANT_INFO[ph]; cls = info[0];
            d = cls === "oclusiva" ? (info[2] ? DUR.stopV : DUR.stopVL) : cls === "fricativa" ? (ph === "h" ? DUR.h : DUR.fric * ((ph === "s" || ph === "z" || ph === "ʃ" || ph === "ʒ") ? 1.1 : 0.95)) : cls === "nasal" ? DUR.nasal : DUR.approx;
            if (pi === 0 && stressed) d *= 1.05;
          }
          d /= rate;
          events.push({ kind: "ph", ph, cls, t0: t, d, stressed, vowel: isV });
          if (isV && stressed) cur.accents.push(t + d / 2);
          t += d; cur.end = t;
        });
      });
      lastPause = 0;
      events.push({ kind: "pause", t0: t, d: 0.03 / rate, gap: true }); t += 0.03 / rate;
    }
    endPhrase("end");
    const total = t + 0.25;
    return { events, phrases, total };
  }

  // ---------- trilhas de parâmetros ----------
  function buildTracks(pl, voice) {
    const sc = voice.scale, ng = voice.ng || 1;
    const st = { av: 0, ah: 0, af: 0, ff: 4000, fbw: 2000, f1: 500 * sc, f2: 1500 * sc, f3: 2500 * sc, b1: 80, b2: 100, b3: 150, nz: 0, zf: 1500 };
    const tracks = {}; for (const k in st) tracks[k] = [[0, st[k]]];
    function frame(t0, d, tr, v) {
      tr = Math.min(tr, d * 0.9);
      for (const k in st) {
        const val = (k in v) ? v[k] : (k === "av" || k === "ah" || k === "af" || k === "nz") ? 0 : st[k];
        tracks[k].push([t0 + tr, val]); tracks[k].push([t0 + d, val]); st[k] = val;
      }
    }
    const ev = pl.events;
    // vogal de contexto: a próxima na frase; se não houver, a anterior
    function ctxVowel(idx) {
      for (let j = idx + 1; j < ev.length; j++) { if (ev[j].kind === "pause" && !ev[j].gap) break; if (ev[j].kind === "ph" && ev[j].vowel) return ev[j].ph; }
      for (let j = idx - 1; j >= 0; j--) { if (ev[j].kind === "pause" && !ev[j].gap) break; if (ev[j].kind === "ph" && ev[j].vowel) return ev[j].ph; }
      return "ə";
    }
    const vf = ph => { const F = VOWF[ph] || VOWF["ə"]; return { f1: F[0] * sc, f2: F[1] * sc, f3: F[2] * sc }; };

    ev.forEach((e, idx) => {
      const { t0, d } = e;
      if (e.kind === "pause") { frame(t0, d, 0.03, { av: 0, ah: 0, af: 0, nz: 0 }); return; }
      const ph = e.ph;
      if (e.vowel) {
        frame(t0, d, Math.min(0.05, d * 0.5), Object.assign({ av: (e.stressed ? G.vowel : G.weak) * (G.vgain[ph] || 1), ah: voice.breath, b1: 70, b2: 90, b3: 140, nz: 0 }, vf(ph)));
        return;
      }
      const info = C.CONSONANT_INFO[ph], cls = e.cls, voiced = !!info[2], nv = vf(ctxVowel(idx));
      if (cls === "aproximante") {
        const F = APPF[ph];
        frame(t0, d, Math.min(0.045, d * 0.6), { av: G.approx, ah: 0.02, f1: F[0] * sc, f2: F[1] * sc, f3: F[2] * sc, b1: 90, b2: 110, b3: 170, nz: 0 });
      } else if (cls === "nasal") {
        const N = NASF[ph];
        frame(t0, d, Math.min(0.03, d * 0.5), { av: G.nasal, ah: 0, f1: N.f[0] * sc, f2: N.f[1] * sc, f3: N.f[2] * sc, b1: 110, b2: 200, b3: 220, nz: 1, zf: N.z * sc });
      } else if (cls === "fricativa") {
        if (ph === "h") { frame(t0, d, 0.02, Object.assign({ av: 0, ah: G.h * ng, af: 0, nz: 0, b1: 120, b2: 150, b3: 200 }, nv)); return; }
        const P = G.fric[ph];
        frame(t0, d, 0.02, Object.assign({ av: voiced ? G.voicedFric : 0, ah: 0, af: P.g * ng, ff: P.f, fbw: P.bw, nz: 0 }, nv));
      } else {  // oclusiva: fechamento, soltura (burst), aspiração/VOT
        const place = info[1], B = G.burst[place] || G.burst.alveolar, loc = LOCUS[place] || 1500;
        const dc = d * 0.55, db = DUR.burst, da = Math.max(0.008, d - dc - db);
        const closeF = { f1: 250 * sc, f2: (loc * 0.5 + nv.f2 / sc * 0.5) * sc, f3: nv.f3 };
        frame(t0, dc, 0.015, Object.assign({ av: voiced ? G.closureBar : 0, ah: 0, af: 0, nz: 0, b1: 90, b2: 120, b3: 170 }, closeF));
        frame(t0 + dc, db, 0.002, Object.assign({ av: voiced ? 0.3 : 0, ah: 0, af: B.g * ng, ff: B.f * (place === "velar" ? Math.min(1.3, nv.f2 / sc / 1500 + 0.3) : 1), fbw: B.bw, nz: 0 }, nv));
        frame(t0 + dc + db, da, 0.004, Object.assign({ av: voiced ? G.vot : 0, ah: voiced ? 0 : G.asp * ng, af: 0, nz: 0 }, nv));
      }
    });
    return tracks;
  }

  // ---------- contorno de tom ----------
  function buildF0(pl, voice, seed) {
    const n = Math.ceil(pl.total * CR) + 2, f = new Float32Array(n).fill(voice.f0);
    if (voice.flat) return f;
    const FALL = { ".": 0.12, "!": 0.08, ",": -0.04, "?": -0.20, end: 0.12 };
    let prevEnd = 0, prevVal = voice.f0 * 1.05;
    for (const ph of pl.phrases) {
      const s = Math.floor(ph.start * CR), e = Math.min(n - 1, Math.ceil(ph.end * CR)), startVal = voice.f0 * 1.08;
      for (let i = Math.floor(prevEnd * CR); i < s && i < n; i++) f[i] = prevVal + (startVal - prevVal) * ((i - prevEnd * CR) / Math.max(1, s - prevEnd * CR));
      const dur = Math.max(0.05, ph.end - ph.start), fallDur = Math.min(0.18, dur * 0.4), fall = FALL[ph.kind] != null ? FALL[ph.kind] : 0.12;
      for (let i = s; i <= e; i++) {
        const t = i / CR, u = (t - ph.start) / dur; let v = voice.f0 * (1.08 - 0.17 * u);
        if (t > ph.end - fallDur) v *= 1 - fall * ((t - (ph.end - fallDur)) / fallDur);
        f[i] = v;
      }
      prevVal = f[e]; prevEnd = ph.end;
      for (const ta of ph.accents) {
        for (let i = Math.max(0, Math.floor((ta - 0.25) * CR)); i < Math.min(n, Math.ceil((ta + 0.25) * CR)); i++) {
          const x = (i / CR - ta) / 0.075; f[i] *= 1 + 0.09 * Math.exp(-x * x);
        }
      }
    }
    for (let i = Math.floor(prevEnd * CR); i < n; i++) f[i] = prevVal;
    // microvariação lenta e suavização
    const r = C.rng(seed, "jitter"); let j = 0;
    for (let i = 0; i < n; i++) { j = 0.985 * j + 0.015 * (r() * 2 - 1) * 6; f[i] *= 1 + voice.jitter * j; }
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -3; k <= 3; k++) { const q = i + k; if (q >= 0 && q < n) { a += f[q]; c++; } } g[i] = a / c; }
    return g;
  }

  function rasterize(keys, nc) {
    const out = new Float32Array(nc); let j = 0;
    for (let c = 0; c < nc; c++) {
      const t = c / CR;
      while (j + 1 < keys.length && keys[j + 1][0] <= t) j++;
      if (j + 1 >= keys.length) out[c] = keys[j][1];
      else { const a = keys[j], b = keys[j + 1]; out[c] = b[0] === a[0] ? b[1] : a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
    }
    return out;
  }

  // ---------- síntese amostra a amostra ----------
  function render(pl, voice, seed) {
    const N = Math.ceil(pl.total * SR), nc = Math.ceil(pl.total * CR) + 2;
    const tr = buildTracks(pl, voice), A = {};
    for (const k in tr) A[k] = rasterize(tr[k], nc);
    const f0 = buildF0(pl, voice, seed);
    const rn = C.rng(seed, "noise");
    const out = new Float32Array(N);
    const R = []; for (let i = 0; i < 6; i++) R.push({ a: 0, b: 0, c: 0, y1: 0, y2: 0 });   // F1,F2,F3,F4,F5, fricção
    const Z = { a: 1, b: 0, c: 0, x1: 0, x2: 0 };
    const sc = voice.scale, tiltA = 1 - Math.exp(-2 * Math.PI * voice.tilt / SR);
    const setRes = (r, f, bw) => { f = Math.min(Math.max(f, 50), SR * 0.45); bw = Math.max(bw, 20);
      const c = -Math.exp(-2 * Math.PI * bw / SR), b = 2 * Math.exp(-Math.PI * bw / SR) * Math.cos(2 * Math.PI * f / SR); r.a = 1 - b - c; r.b = b; r.c = c; };
    const setZero = (f, bw) => { f = Math.min(Math.max(f, 50), SR * 0.45);
      const c = -Math.exp(-2 * Math.PI * bw / SR), b = 2 * Math.exp(-Math.PI * bw / SR) * Math.cos(2 * Math.PI * f / SR), a = 1 - b - c;
      Z.a = 1 / a; Z.b = -b / a; Z.c = -c / a; };
    let phase = 0, gPrev = 0, lp = 0, yPrev = 0, av = 0, ah = 0, af = 0, nz = 0, F0 = voice.f0;
    const noise = () => (rn() + rn() + rn() - 1.5) * 1.15;
    for (let n = 0; n < N; n++) {
      const cpos = n * CR / SR, i0 = cpos | 0, fr = cpos - i0;
      if ((n & 7) === 0) {
        const g = a => a[i0] + (a[i0 + 1] - a[i0]) * fr;
        av = g(A.av); ah = g(A.ah); af = g(A.af); nz = g(A.nz); F0 = g(f0);
        setRes(R[0], g(A.f1), g(A.b1)); setRes(R[1], g(A.f2), g(A.b2)); setRes(R[2], g(A.f3), g(A.b3));
        setRes(R[3], 3300 * sc, 250); setRes(R[4], 3750 * sc, 200); setRes(R[5], g(A.ff), g(A.fbw));
        setZero(g(A.zf), 100);
      }
      // fonte glótica
      phase += F0 / SR; if (phase >= 1) phase -= 1;
      let src;
      if (voice.saw) src = (2 * phase - 1) * 2.2;
      else {
        const oq = voice.oq, tp = oq * 0.7, tn = oq * 0.3; let gl;
        if (phase < tp) gl = 0.5 * (1 - Math.cos(Math.PI * phase / tp));
        else if (phase < tp + tn) gl = Math.cos(Math.PI * 0.5 * (phase - tp) / tn); else gl = 0;
        src = (gl - gPrev) * (SR / F0) * 0.12; gPrev = gl;
      }
      lp += tiltA * (src - lp);
      let x = av * lp + ah * noise();
      // cascata
      let y = R[0].a * x + R[0].b * R[0].y1 + R[0].c * R[0].y2; R[0].y2 = R[0].y1; R[0].y1 = y;
      if (nz > 0.001) { const yz = Z.a * y + Z.b * Z.x1 + Z.c * Z.x2; Z.x2 = Z.x1; Z.x1 = y; y = (1 - nz) * y + nz * yz; } else { Z.x2 = Z.x1; Z.x1 = y; }
      for (let k = 1; k < 5; k++) { const r = R[k]; const yy = r.a * y + r.b * r.y1 + r.c * r.y2; r.y2 = r.y1; r.y1 = yy; y = yy; }
      const rad = y - 0.95 * yPrev; yPrev = y;
      // fricção (ruído filtrado)
      let fric = 0;
      if (af > 0.0005) { const r = R[5]; const xn = noise() * af; fric = r.a * xn + r.b * r.y1 + r.c * r.y2; r.y2 = r.y1; r.y1 = fric; }
      else { R[5].y2 = R[5].y1; R[5].y1 = 0; }
      out[n] = rad + fric;
    }
    // normaliza o pico e aplica fade curto nas pontas
    let mx = 0; for (let i = 0; i < N; i++) { const a = Math.abs(out[i]); if (a > mx) mx = a; }
    const k = mx > 0 ? 0.9 / mx : 1, fade = Math.floor(SR * 0.008);
    for (let i = 0; i < N; i++) { let v = out[i] * k; if (i < fade) v *= i / fade; if (N - i < fade) v *= (N - i) / fade; out[i] = v; }
    return out;
  }

  function synthesize(items, voiceId, opts) {
    opts = opts || {};
    const voice = VOICES[voiceId] || VOICES.aria;
    const pl = plan(items, voice, opts);
    const samples = render(pl, voice, opts.seed || "0");
    return { samples, sr: SR, duration: samples.length / SR, events: pl.events, plan: pl };
  }

  function wavBytes(samples, sr) {
    const n = samples.length, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Uint8Array(buf);
  }

  const api = { VOICES, SR, G, DUR, synthesize, wavBytes, plan };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Speech = api;
})(typeof window !== "undefined" ? window : globalThis);
