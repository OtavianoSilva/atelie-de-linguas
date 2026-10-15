/* Conlang Engine v2 — seed + base -> cifra de primos, fonologia com acento, escrita */
(function (root) {
  'use strict';

  const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const LOWER = "abcdefghijklmnopqrstuvwxyz";
  const ACCENTED = "áàâãäåéèêëíìîïóòôõöúùûüçñ";
  const NUMS = "0123456789";
  const SYMBOLS = ".,!?:;()[]{}\"'-_\\/+*&%@#$^";
  const ALPHABET = (LOWER + LOWER.toUpperCase() + ACCENTED + ACCENTED.toUpperCase() + NUMS + SYMBOLS).split("");
  const UNIVERSAL_CONSONANTS = ["p","b","t","d","k","g","m","n","ŋ","f","v","s","z","ʃ","ʒ","l","r","j","w","h"];
  const UNIVERSAL_VOWELS = ["a","e","i","o","u","æ","ɪ","ʊ","ə"];
  const PATTERNS = ["CV", "CVC", "CVCV", "CVCVC", "CVCVCV"];
  const STRESS_RULES = ["initial", "penult", "final"];
  const MAX_BASE = 1024;       // limite técnico (desempenho da interface); não é limite da cifra
  const PRESET_GLYPHS = 64;    // glifos únicos sugeridos; acima disso, repetem até o usuário desenhar

  const CONSONANT_INFO = {
    p:["oclusiva","bilabial",0], b:["oclusiva","bilabial",1],
    t:["oclusiva","alveolar",0], d:["oclusiva","alveolar",1],
    k:["oclusiva","velar",0],    g:["oclusiva","velar",1],
    m:["nasal","bilabial",1], n:["nasal","alveolar",1], "ŋ":["nasal","velar",1],
    f:["fricativa","labiodental",0], v:["fricativa","labiodental",1],
    s:["fricativa","alveolar",0], z:["fricativa","alveolar",1],
    "ʃ":["fricativa","pós-alveolar",0], "ʒ":["fricativa","pós-alveolar",1],
    h:["fricativa","glotal",0],
    l:["aproximante","alveolar",1], r:["aproximante","alveolar",1],
    j:["aproximante","palatal",1], w:["aproximante","labiovelar",1]
  };
  const VOWEL_INFO = {
    i:["fechada","anterior"], "ɪ":["quase fechada","anterior"], e:["média-fechada","anterior"],
    "æ":["quase aberta","anterior"], a:["aberta","central"], "ə":["média","central"],
    u:["fechada","posterior"], "ʊ":["quase fechada","posterior"], o:["média-fechada","posterior"]
  };
  const isVowel = ch => UNIVERSAL_VOWELS.includes(ch);

  // ---------- PRNG determinístico ----------
  function hashStr(s) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }
  function rng(seed, salt) {
    let a = hashStr(String(seed) + "|" + salt);
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  function shuffle(r, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const sample = (r, arr, k) => shuffle(r, arr.slice()).slice(0, k);

  // ---------- Primos ----------
  function isPrime(n) {
    if (n < 2) return false;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
    return true;
  }
  function firstPrimes(n) { const out = []; for (let c = 2; out.length < n; c++) if (isPrime(c)) out.push(c); return out; }
  function nextPrime(n) { let c = n + 1; while (!isPrime(c)) c++; return c; }
  function buildPrimes(seed) {
    const primes = shuffle(rng(seed, "primes2"), firstPrimes(ALPHABET.length));
    const map = {}; ALPHABET.forEach((c, i) => { map[c] = primes[i]; });
    return { primes: map, multiplier: nextPrime(Math.max(...primes)) };
  }

  // ---------- Fonologia ----------
  function shapeSets(pattern, cons, vows, codas) {
    return pattern.split("").map((ch, i) =>
      ch === "V" ? vows : (i === pattern.length - 1 && pattern.endsWith("C") && pattern.length % 2 === 1 ? codas : cons));
  }
  function enumerateSyllables(pattern, cons, vows, codas) {
    let list = [""];
    for (const set of shapeSets(pattern, cons, vows, codas)) list = list.flatMap(s => set.map(x => s + x));
    return list;
  }
  function buildPhonology(seed, base) {
    const r = rng(seed, "phonology");
    const c = randInt(r, 8, 16), v = randInt(r, 3, 6);
    const consonants = sample(r, UNIVERSAL_CONSONANTS, c);
    const vowels = sample(r, UNIVERSAL_VOWELS, v);
    const codas = sample(r, consonants, randInt(r, 3, Math.min(6, c)));
    let pi = randInt(r, 0, 2);
    const space = p => shapeSets(p, consonants, vowels, codas).reduce((a, s) => a * s.length, 1);
    while (space(PATTERNS[pi]) < base && pi < PATTERNS.length - 1) pi++;
    const pattern = PATTERNS[pi];
    const all = enumerateSyllables(pattern, consonants, vowels, codas);
    const syllables = shuffle(rng(seed, "syllables:" + pattern), all).slice(0, base);
    const rs = rng(seed, "stress"), x = rs();
    const stress = x < 0.5 ? "initial" : x < 0.8 ? "penult" : "final";
    return { consonants, vowels, codas, pattern, syllables, stress };
  }

  // ---------- Glifos ----------
  const COLS = [18, 50, 82], ROWS = [12, 37, 63, 88];
  function genGlyph(seed, i, attempt) {
    const r = rng(seed, "glyph:" + i + ":" + attempt);
    const anchors = []; for (const x of COLS) for (const y of ROWS) anchors.push([x, y]);
    const strokes = [], ns = randInt(r, 1, 3);
    for (let s = 0; s < ns; s++) {
      const np = randInt(r, 2, 4);
      strokes.push(sample(r, anchors, np).map(([x, y]) => [Math.round(x + r() * 8 - 4), Math.round(y + r() * 8 - 4)]));
    }
    return strokes;
  }
  // únicos até PRESET_GLYPHS; depois repetem (i % PRESET_GLYPHS) até o usuário desenhar
  function defaultGlyphs(seed, count) {
    const seen = new Set(), out = [];
    for (let i = 0; i < count; i++) {
      if (i >= PRESET_GLYPHS) { out.push(JSON.parse(JSON.stringify(out[i % PRESET_GLYPHS]))); continue; }
      let g, a = 0, key;
      do { g = genGlyph(seed, i, a++); key = JSON.stringify(g); } while (seen.has(key) && a < 60);
      seen.add(key); out.push(g);
    }
    return out;
  }
  function sanitizeGlyph(g) {
    if (!Array.isArray(g) || g.length > 60) return null;
    const out = [];
    for (const s of g) {
      if (!Array.isArray(s) || s.length > 600) return null;
      const st = [];
      for (const p of s) {
        if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
        st.push([Math.round(Math.max(-5, Math.min(105, p[0])) * 10) / 10, Math.round(Math.max(-5, Math.min(105, p[1])) * 10) / 10]);
      }
      if (st.length) out.push(st);
    }
    return out;
  }
  // índices cujo glifo é vazio ou idêntico a um anterior
  function glyphIssues(lang) {
    const first = new Map(), dups = {}, empties = [];
    for (let i = 0; i < lang.base; i++) {
      const g = lang.glyphs[i] || [], key = JSON.stringify(g);
      if (!g.length) { empties.push(i); continue; }
      if (first.has(key)) dups[i] = first.get(key); else first.set(key, i);
    }
    return { dups, dupCount: Object.keys(dups).length, empties };
  }

  // ---------- Idioma ----------
  const clampBase = b => { b = Math.round(Number(b)); return Math.min(MAX_BASE, Math.max(2, isNaN(b) ? 10 : b)); };
  function createLanguage(seed, base, opts) {
    opts = opts || {};
    seed = String(seed); base = clampBase(base);
    const { primes, multiplier } = buildPrimes(seed);
    const glyphs = defaultGlyphs(seed, base);
    if (Array.isArray(opts.glyphs)) {            // inventário independente da base: preserva também os que sobram
      opts.glyphs.forEach((g, i) => { if (Array.isArray(g)) glyphs[i] = g; });
    }
    return {
      format: "procedural-conlang", version: 2,
      name: opts.name || ("Língua " + seed),
      seed, base, symbols: SYMBOLS, primes, multiplier,
      options: { exact: !(opts.options && opts.options.exact === false) },
      phonology: buildPhonology(seed, base),
      glyphs,
      style: { stroke: (opts.style && opts.style.stroke) || 5 },
      voice: { id: (opts.voice && opts.voice.id) || "aria" }
    };
  }

  function validateLanguage(o) {
    const fail = m => { throw new Error(m); };
    if (!o || typeof o !== "object" || o.format !== "procedural-conlang") fail("Arquivo não é um idioma deste projeto.");
    const base = Number(o.base);
    if (!Number.isInteger(base) || base < 2 || base > MAX_BASE) fail("Base inválida (2 a " + MAX_BASE + ").");
    if (typeof o.seed === "undefined" || o.seed === null || String(o.seed).length > 200) fail("Seed inválida.");
    // primos
    if (!o.primes || typeof o.primes !== "object") fail("Tabela de primos ausente.");
    if (!Number.isInteger(o.multiplier) || o.multiplier < 3 || o.multiplier > 1e7 || !isPrime(o.multiplier)) fail("Multiplicador inválido.");
    const seenP = new Set(); let maxP = 0;
    for (const k of Object.keys(o.primes)) {
      const p = o.primes[k];
      if ([...k].length !== 1) fail("Chave inválida na tabela de primos: " + k);
      if (!Number.isInteger(p) || p < 2 || !isPrime(p)) fail("Valor não primo para '" + k + "'.");
      if (seenP.has(p)) fail("Primo repetido na tabela.");
      seenP.add(p); maxP = Math.max(maxP, p);
    }
    if (!seenP.size) fail("Tabela de primos vazia.");
    if (maxP >= o.multiplier) fail("O multiplicador deve ser maior que todos os primos.");
    // fonologia
    const ph = o.phonology;
    if (!ph || !Array.isArray(ph.syllables)) fail("Fonologia incompleta.");
    if (!PATTERNS.includes(ph.pattern)) fail("Padrão silábico desconhecido: " + ph.pattern);
    for (const [name, list, uni] of [["consoantes", ph.consonants, UNIVERSAL_CONSONANTS], ["vogais", ph.vowels, UNIVERSAL_VOWELS], ["codas", ph.codas, UNIVERSAL_CONSONANTS]]) {
      if (!Array.isArray(list) || !list.length || !list.every(x => uni.includes(x))) fail("Inventário de " + name + " inválido.");
    }
    if (ph.syllables.length < base) fail("Há menos sílabas que dígitos na base.");
    if (new Set(ph.syllables).size !== ph.syllables.length) fail("Sílabas duplicadas.");
    for (const s of ph.syllables) {
      const chars = [...String(s)];
      if (chars.length !== ph.pattern.length) fail("Sílaba fora do padrão: " + s);
      chars.forEach((ch, i) => {
        const wantV = ph.pattern[i] === "V";
        if (wantV ? !ph.vowels.includes(ch) : !ph.consonants.includes(ch)) fail("Sílaba com fonema fora do inventário: " + s);
      });
    }
    const lang = Object.assign({}, o);
    lang.base = base; lang.seed = String(o.seed); lang.version = 2;
    lang.phonology = Object.assign({}, ph, { stress: STRESS_RULES.includes(ph.stress) ? ph.stress : "initial" });
    lang.options = { exact: !!(o.options && o.options.exact) };
    const defs = defaultGlyphs(lang.seed, base);
    const src = Array.isArray(o.glyphs) ? o.glyphs : [];
    lang.glyphs = [];
    for (let i = 0; i < Math.max(base, src.length); i++) {
      const clean = i < src.length ? sanitizeGlyph(src[i]) : null;
      lang.glyphs.push(clean || (i < base ? defs[i] : []));
    }
    lang.style = { stroke: Math.min(14, Math.max(1, Number(o.style && o.style.stroke) || 5)) };
    lang.voice = { id: String((o.voice && o.voice.id) || "aria") };
    lang.name = String(o.name || ("Língua " + lang.seed)).slice(0, 60);
    lang.symbols = SYMBOLS;
    return lang;
  }

  function rt(lang) {
    const sig = lang.seed + "|" + lang.base + "|" + lang.phonology.syllables.length;
    if (lang._rt && lang._rt.sig === sig) return lang._rt;
    const reverse = {}; for (const c in lang.primes) reverse[lang.primes[c]] = c;
    const sylToDigit = {}; lang.phonology.syllables.slice(0, lang.base).forEach((s, i) => { sylToDigit[s] = i; });
    const data = { sig, reverse, sylToDigit, M: BigInt(lang.multiplier) };
    Object.defineProperty(lang, "_rt", { value: data, enumerable: false, configurable: true, writable: true });
    return data;
  }

  // ---------- Texto <-> número ----------
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const digitLabel = (lang, i) => (lang.base <= 62 ? DIGITS[i] : String(i));

  function preprocess(text) {
    return String(text).normalize("NFC").replace(/\r\n?/g, "\n")
      .replace(/[“”«»„]/g, '"').replace(/[‘’‚`´]/g, "'").replace(/[–—−]/g, "-").replace(/…/g, "...")
      .replace(/[\t ]+/g, " ");
  }
  const foldChar = ch => ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function mapChar(lang, ch) {
    if (lang.options && lang.options.exact && has(lang.primes, ch)) return ch;
    const f = foldChar(ch);
    return f.length === 1 && has(lang.primes, f) ? f : null;
  }
  function tokenize(lang, text) {
    const raw = preprocess(text).match(/[\p{L}\p{N}]+|\n|[^\s]/gu) || [];
    const tokens = []; let skipped = 0, nl = 0;
    for (const r of raw) {
      if (r === "\n") { nl++; if (tokens.length && nl <= 2) tokens.push({ kind: "nl", token: "\n" }); continue; }
      nl = 0;
      let s = ""; for (const ch of r) { const m = mapChar(lang, ch); if (m === null) skipped++; else s += m; }
      if (!s) continue;
      tokens.push({ kind: /^[\p{L}\p{N}]/u.test(r) ? "word" : "punct", token: s });
    }
    while (tokens.length && tokens[tokens.length - 1].kind === "nl") tokens.pop();
    return { tokens, skipped };
  }

  function wordToNumber(lang, word) {
    const M = rt(lang).M; let total = 0n, mult = 1n;
    for (const ch of word) { total += BigInt(lang.primes[ch]) * mult; mult *= M; }
    return total;
  }
  function numberToWord(lang, n) {
    const { reverse, M } = rt(lang); let out = "", ok = true;
    while (n > 0n) {
      const rem = Number(n % M);
      if (has(reverse, rem)) out += reverse[rem]; else { out += "\uFFFD"; ok = false; }
      n /= M;
    }
    return { word: out, ok };
  }
  function toDigits(n, base) {
    if (n === 0n) return [0];
    const b = BigInt(base), out = [];
    while (n > 0n) { out.push(Number(n % b)); n /= b; }
    return out.reverse();
  }
  function fromDigits(d, base) { const b = BigInt(base); let v = 0n; for (const x of d) v = v * b + BigInt(x); return v; }

  // Sílabas reais de uma palavra (as "unidades" de dígito podem ter 1 ou mais sílabas)
  function syllabify(str) {
    const ph = [...str], vi = [];
    ph.forEach((c, i) => { if (isVowel(c)) vi.push(i); });
    if (!vi.length) return [str];
    const sylls = [];
    let start = 0;
    for (let k = 0; k < vi.length; k++) {
      let end;
      if (k === vi.length - 1) end = ph.length;
      else {
        const m = vi[k + 1] - vi[k] - 1;           // consoantes entre as vogais
        end = vi[k] + 1 + (m >= 2 ? m - 1 : 0);    // 1 consoante vai para o onset da próxima
      }
      sylls.push(ph.slice(start, end).join("")); start = end;
    }
    return sylls;
  }
  function stressIndex(rule, n) {
    if (n <= 1) return 0;
    return rule === "final" ? n - 1 : rule === "penult" ? n - 2 : 0;
  }
  function formatIPA(sylls, stress) {
    if (sylls.length === 1) return sylls[0];
    return sylls.map((s, i) => (i === 0 ? (stress === 0 ? "ˈ" : "") : (i === stress ? "ˈ" : ".")) + s).join("");
  }

  function encodeText(lang, text) {
    const { tokens, skipped } = tokenize(lang, text);
    const words = tokens.map(t => {
      if (t.kind === "nl") return { kind: "nl", token: "\n", digits: [], units: [], digitStr: "", sylls: [], stress: 0, ipa: "" };
      const digits = toDigits(wordToNumber(lang, t.token), lang.base);
      const units = digits.map(d => lang.phonology.syllables[d]);
      const sylls = syllabify(units.join("")), stress = stressIndex(lang.phonology.stress, sylls.length);
      return {
        kind: t.kind, token: t.token, digits, units,
        digitStr: lang.base <= 62 ? digits.map(d => DIGITS[d]).join("") : digits.join("-"),
        sylls, stress, ipa: formatIPA(sylls, stress)
      };
    });
    return { words, skipped };
  }

  const isWordTok = t => !!t && /^[\p{L}\p{N}]/u.test(t);
  function detokenize(tokens) {
    let out = "", dq = false, sq = false, glue = false, prev = null;
    tokens.forEach((t, i) => {
      let space = true; const next = tokens[i + 1];
      if (i === 0 || prev === "\n" || t === "\n" || glue) space = false;
      else if (/^[.,!?:;)\]}]$/.test(t)) space = false;
      else if (/^[(\[{]$/.test(prev)) space = false;
      glue = false;
      if (t === '"') { if (dq) space = false; else glue = true; dq = !dq; }
      else if (t === "'") {
        if (isWordTok(prev) && isWordTok(next)) { space = false; glue = true; }
        else { if (sq) space = false; else glue = true; sq = !sq; }
      } else if (/^[-\/\\_]$/.test(t) && isWordTok(prev) && isWordTok(next)) { space = false; glue = true; }
      else if (/^[(\[{]$/.test(t)) glue = true;
      out += (space ? " " : "") + t; prev = t;
    });
    return out;
  }

  function decodeDigits(lang, digits) { return numberToWord(lang, fromDigits(digits, lang.base)); }

  function decodeGeneric(lang, str, parseWord) {
    const errors = [], tokens = [];
    String(str).split(/\r?\n/).forEach((line, li, arr) => {
      for (const w of line.trim().split(/\s+/).filter(Boolean)) {
        const d = parseWord(w);
        if (!d) { errors.push(w); tokens.push("[?]"); continue; }
        const r = decodeDigits(lang, d);
        if (!r.ok) errors.push(w);
        tokens.push(r.word);
      }
      if (li < arr.length - 1 && tokens.length) {
        const k = tokens.length;
        if (!(tokens[k - 1] === "\n" && tokens[k - 2] === "\n")) tokens.push("\n");   // no máximo uma linha em branco
      }
    });
    while (tokens.length && tokens[tokens.length - 1] === "\n") tokens.pop();
    return { text: detokenize(tokens), errors };
  }
  function decodeDigitText(lang, str) {
    return decodeGeneric(lang, str, w => {
      const d = lang.base <= 62 ? [...w].map(c => DIGITS.indexOf(c)) : w.split("-").map(x => (/^\d+$/.test(x) ? Number(x) : -1));
      return d.length && d.every(x => x >= 0 && x < lang.base) ? d : null;
    });
  }
  function decodePhoneticText(lang, str) {
    const { sylToDigit } = rt(lang), len = lang.phonology.pattern.length;
    return decodeGeneric(lang, str, w => {
      const clean = [...w].filter(c => !".ˈˌ·‿-".includes(c));
      if (!clean.length || clean.length % len) return null;
      const digits = [];
      for (let i = 0; i < clean.length; i += len) {
        const s = clean.slice(i, i + len).join("");
        if (!has(sylToDigit, s)) return null;
        digits.push(sylToDigit[s]);
      }
      return digits;
    });
  }

  // ---------- Glifos -> SVG ----------
  function strokePath(pts) {
    const f = n => Math.round(n * 10) / 10;
    if (!pts.length) return "";
    if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}l.1 0`;
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    if (pts.length === 2) return d + `L${f(pts[1][0])} ${f(pts[1][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
    }
    const l = pts[pts.length - 1];
    return d + `L${f(l[0])} ${f(l[1])}`;
  }
  const glyphPath = strokes => strokes.map(strokePath).join("");

  function layoutScript(words, size, maxWidth) {
    const adv = size * 0.78, wordGap = size * 0.55, lineH = size * 1.25, items = [];
    let x = 0, y = 0, maxX = 0;
    for (const w of words) {
      if (w.kind === "nl") { x = 0; y += lineH; continue; }
      const wlen = w.digits.length * adv;
      if (x > 0 && x + wlen > maxWidth) { x = 0; y += lineH; }
      w.digits.forEach((d, i) => items.push({ x: x + i * adv, y, d }));
      x += wlen + wordGap; maxX = Math.max(maxX, x - wordGap);
    }
    return { items, width: Math.max(maxX, size), height: y + lineH, adv };
  }
  function scriptSVG(lang, words, size, maxWidth, color) {
    const L = layoutScript(words, size, maxWidth), k = size / 100;
    let g = "";
    for (const it of L.items) g += `<path transform="translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) scale(${k})" d="${glyphPath(lang.glyphs[it.d] || [])}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width.toFixed(1)} ${L.height.toFixed(1)}" width="${L.width.toFixed(0)}" height="${L.height.toFixed(0)}" fill="none" stroke="${color || "currentColor"}" stroke-width="${(lang.style.stroke * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${g}</svg>`;
  }

  const api = {
    DIGITS, SYMBOLS, ALPHABET, UNIVERSAL_CONSONANTS, UNIVERSAL_VOWELS, PATTERNS, STRESS_RULES,
    MAX_BASE, PRESET_GLYPHS, CONSONANT_INFO, VOWEL_INFO, isVowel,
    hashStr, rng, createLanguage, validateLanguage, clampBase, digitLabel, glyphIssues, sanitizeGlyph,
    tokenize, encodeText, decodeDigitText, decodePhoneticText, detokenize, syllabify,
    wordToNumber, numberToWord, toDigits, fromDigits,
    strokePath, glyphPath, layoutScript, scriptSVG, defaultGlyphs, genGlyph
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Conlang = api;
})(typeof window !== "undefined" ? window : globalThis);
