'use strict';
/* WEBB: every token gets a brain.
 * One live web of real pump.fun coins. Every coin on it is a node with its own AI brain: it reads its own live market,
 * thinks, remembers, talks to the brains it is threaded to, answers anyone who asks, and its IQ grows with the real
 * volume that moves through it. Threads are real: a runner and the coins riding its name. Pulses are real trades.
 * Every number comes from Jupiter, Dexscreener or Solana. Every thought is written by a model and labelled as such. */
const crypto = require('crypto');
const { PublicKey } = require('@solana/web3.js');

const E = (k, d = '') => String(process.env[k] == null ? d : process.env[k]).trim();
const RPC_URL = E('RPC_URL');
const RPCS = [RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
const DEX = E('WEBB_DEX', 'https://api.dexscreener.com'), JUP = E('WEBB_JUP', 'https://lite-api.jup.ag');
const DB_URL = E('WEBB_DB_URL') || E('WEBB_DB_DATABASE_URL') || E('WEBB_DB_POSTGRES_URL') || E('DATABASE_URL') || E('POSTGRES_URL');
const GATEWAY = E('WEBB_GATEWAY', 'https://ai-gateway.vercel.sh/v1');
const MODEL = E('WEBB_MODEL', 'openai/gpt-4.1-mini');
const CALLS_DAY = Number(E('WEBB_CALLS_DAY', '1500')) || 1500;      // the most model calls the whole web makes in one UTC day
const ASKS_DAY = Number(E('WEBB_ASKS_DAY', '600')) || 600;          // of which questions from people
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOL = 'So11111111111111111111111111111111111111112';
const STABLE = /^(usd|usdc|usdt|usds|usdf|pyusd|eurc|usdg)$/i;
const WEB_SECS = 60, WEB_MAINS = 26, BETAS_PER = 8, HUB_MAX_H = 72, RIDER_MAX_H = 168, FRESH_MAX_H = 12;
const ageH = c => c && c.created ? (Date.now() - new Date(c.created).getTime()) / 36e5 : null;

/* ---------------- plumbing ---------------- */
function send(res, code, body, headers) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', '*'); if (headers) for (const k in headers) res.setHeader(k, headers[k]); res.end(JSON.stringify(body)); }
function http(code, msg, extra) { const e = new Error(msg); e.code = code; if (extra) e.extra = extra; return e; }
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; let n = 0; for await (const c of req) { chunks.push(c); n += c.length; if (n > 3e6) break; }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { return {}; }
}
const timed = ms => (url, opt = {}) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t)); };
const getJson = async (url, opt, ms = 9000) => { const r = await timed(ms)(url, opt); if (!r.ok) throw http(502, 'Upstream ' + r.status); return r.json(); };
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ');
const hits = new Map();
function limit(key, n, ms, msg) { const t = Date.now(), a = (hits.get(key) || []).filter(x => t - x < ms); if (a.length >= n) throw http(429, msg || 'Slow down a little.'); a.push(t); hits.set(key, a); if (hits.size > 5000) hits.clear(); }
const norm = s => String(s || '').toLowerCase().replace(/^\$/, '').replace(/[^a-z0-9]/g, '');
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || 'x').split(',')[0].trim();
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } } })); return out; }
// words nobody should see under our name, in a thought, a question or a ticker
const BAD = /\b(n[i1]gg|f[a@]gg?[o0]t|k[i1]ke|ch[i1]nk|sp[i1]c|tr[a@]nn(y|ie)|retard|r[a@]pe|hitler|nazi|kys|cp\b|p[e3]d[o0])/i;
const safe = s => !BAD.test(String(s || ''));

/* ---------------- database ---------------- */
let sqlFn, ready;
function db() {
  if (!sqlFn) {
    if (E('WEBB_LOCAL_PG')) { const { Pool } = require('pg'); const p = new Pool({ connectionString: E('WEBB_LOCAL_PG') }); sqlFn = async (strs, ...vals) => { let q = strs[0]; vals.forEach((v, i) => { q += '$' + (i + 1) + strs[i + 1]; }); return (await p.query(q, vals)).rows; }; }
    else { if (!DB_URL) throw http(503, 'The database is not connected yet.'); const { neon } = require('@neondatabase/serverless'); sqlFn = neon(DB_URL); }
  }
  return sqlFn;
}
async function ensure() {
  if (ready) return ready;
  ready = (async () => {
    const s = db();
    await s`CREATE TABLE IF NOT EXISTS wb_cache (k TEXT PRIMARY KEY, v JSONB, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE TABLE IF NOT EXISTS wb_imgs (mint TEXT PRIMARY KEY, img TEXT, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE TABLE IF NOT EXISTS wb_brains (mint TEXT PRIMARY KEY, symbol TEXT, name TEXT, image TEXT, origin TEXT DEFAULT 'web', born TIMESTAMPTZ DEFAULT now(),
      brief TEXT, creator TEXT, threads JSONB DEFAULT '[]'::jsonb, vol_seen DOUBLE PRECISION DEFAULT 0, seen_at TIMESTAMPTZ DEFAULT now(), last_seen JSONB,
      thoughts INT DEFAULT 0, talks INT DEFAULT 0, answers INT DEFAULT 0, last_think TIMESTAMPTZ, next_think TIMESTAMPTZ DEFAULT now(), last_thought TEXT, memory JSONB DEFAULT '[]'::jsonb, launch JSONB)`;
    await s`CREATE INDEX IF NOT EXISTS wb_brains_next ON wb_brains (next_think)`;
    await s`CREATE TABLE IF NOT EXISTS wb_thoughts (id BIGSERIAL PRIMARY KEY, mint TEXT, sym TEXT, kind TEXT, body TEXT, to_mint TEXT, to_sym TEXT, live JSONB, model TEXT, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE INDEX IF NOT EXISTS wb_thoughts_mint ON wb_thoughts (mint, at)`;
    await s`CREATE INDEX IF NOT EXISTS wb_thoughts_at ON wb_thoughts (at)`;
    await s`CREATE INDEX IF NOT EXISTS wb_thoughts_to ON wb_thoughts (to_mint, at)`;
    await s`CREATE TABLE IF NOT EXISTS wb_asks (id BIGSERIAL PRIMARY KEY, mint TEXT, q TEXT, a TEXT, who TEXT, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE INDEX IF NOT EXISTS wb_asks_mint ON wb_asks (mint, at)`;
    await s`CREATE TABLE IF NOT EXISTS wb_budget (day DATE PRIMARY KEY, calls INT DEFAULT 0, asks INT DEFAULT 0, fails INT DEFAULT 0, last_error TEXT)`;
    await s`CREATE TABLE IF NOT EXISTS wb_launches (id TEXT PRIMARY KEY, mint TEXT UNIQUE, name TEXT, symbol TEXT, description TEXT, twitter TEXT, website TEXT, brief TEXT, temper INT, threads JSONB, creator TEXT, buy DOUBLE PRECISION, img TEXT, img_type TEXT, sig TEXT, status TEXT DEFAULT 'built', at TIMESTAMPTZ DEFAULT now())`;
  })();
  try { await ready; } catch (e) { ready = null; throw e; }
  return ready;
}
async function cached(k, secs, fn) {
  const row = (await db()`SELECT v, extract(epoch FROM now() - at) AS age FROM wb_cache WHERE k=${k}`)[0];
  if (row && row.age < secs) return row.v;
  try { const v = await fn(); await db()`INSERT INTO wb_cache (k, v, at) VALUES (${k}, ${JSON.stringify(v)}, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`; return v; }
  catch (e) { if (row) return row.v; throw e; }
}

/* ---------------- Solana ---------------- */
async function rpc(method, params, good) {
  let last = '';
  for (const u of RPCS) {
    try {
      const r = await timed(9000)(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc error');
      if (good && !good(j.result)) throw new Error('unusable answer'); return j.result;
    } catch (e) { last = e.message; }
  }
  throw http(502, 'Solana RPC is busy, try again in a moment.' + (last ? ' (' + last.slice(0, 80) + ')' : ''));
}

/* ---------------- market data ---------------- */
let jupQ = Promise.resolve(), jupLast = 0;
function jupGet(path, ms = 7000) {
  const run = async () => {
    for (let i = 0; i < 2; i++) {
      const wait = jupLast + 380 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
      jupLast = Date.now();
      const r = await timed(ms)(JUP + path).catch(() => null);
      if (r && r.ok) return r.json();
      if (r && r.status === 429 && i === 0) { await new Promise(res => setTimeout(res, 1600)); continue; }
      throw http(502, 'Jupiter ' + (r ? r.status : 'timeout'));
    }
  };
  const p = jupQ.then(run, run); jupQ = p.catch(() => { }); return p;
}
const jupMem = new Map();
const jupShape = t => {
  const s1 = t.stats1h || {}, s24 = t.stats24h || {}, s5 = t.stats5m || {};
  const n = v => v != null ? +Number(v).toFixed(2) : null;
  return { mint: t.id, symbol: clean(t.symbol).slice(0, 16), name: clean(t.name).slice(0, 48), image: t.icon || null, mc: Math.round(t.mcap || t.fdv || 0), liq: Math.round(t.liquidity || 0), price: Number(t.usdPrice || 0),
    ch5m: n(s5.priceChange), ch1h: n(s1.priceChange), ch24: n(s24.priceChange),
    vol5m: Math.round((s5.buyVolume || 0) + (s5.sellVolume || 0)), vol1h: Math.round((s1.buyVolume || 0) + (s1.sellVolume || 0)), vol24: Math.round((s24.buyVolume || 0) + (s24.sellVolume || 0)),
    tx5m: (s5.numBuys || 0) + (s5.numSells || 0), buys5m: s5.numBuys || 0, sells5m: s5.numSells || 0, buys1h: s1.numBuys || 0, sells1h: s1.numSells || 0, traders1h: s1.numTraders || null, holders: t.holderCount || 0,
    organic: t.organicScore != null ? Math.round(t.organicScore) : null, created: (t.firstPool && t.firstPool.createdAt) || null, bonded: !!t.graduatedPool || !!t.graduatedAt, pad: t.launchpad || null,
    twitter: t.twitter || null, website: t.website || null, dev: t.dev || null };
};
async function jupInfo(mints) {
  const out = {}, need = [];
  for (const m of new Set(mints)) { const h = jupMem.get(m); if (h && Date.now() - h.at < 50e3) out[m] = h.v; else need.push(m); }
  for (let i = 0; i < need.length; i += 100) {
    try { const j = await jupGet('/tokens/v2/search?query=' + need.slice(i, i + 100).join(','), 8000); for (const t of (Array.isArray(j) ? j : [])) { const v = jupShape(t); jupMem.set(t.id, { at: Date.now(), v }); out[t.id] = v; } } catch (e) { }
  }
  if (jupMem.size > 4000) jupMem.clear();
  return out;
}
const pc = (p, k, tk) => { const v = (p.priceChange || {})[k]; if (v != null) return v; const t = (p.txns || {})[tk]; return t && (t.buys || 0) + (t.sells || 0) === 0 && p.priceUsd ? 0 : null; };
const dexShape = p => p && ({ mint: p.baseToken.address, symbol: clean(p.baseToken.symbol).slice(0, 16), name: clean(p.baseToken.name).slice(0, 48), image: (p.info && p.info.imageUrl) || null,
  mc: Math.round(p.marketCap || p.fdv || 0), liq: Math.round((p.liquidity || {}).usd || 0), price: Number(p.priceUsd || 0), ch5m: pc(p, 'm5', 'm5'), ch1h: pc(p, 'h1', 'h1'), ch24: pc(p, 'h24', 'h24'),
  vol1h: Math.round((p.volume || {}).h1 || 0), vol24: Math.round((p.volume || {}).h24 || 0), created: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null });
async function coin(ca) {
  if (!B58.test(ca)) throw http(400, 'That is not a Solana address.');
  const j = (await jupInfo([ca]))[ca]; if (j) return j;
  const d = await getJson(`${DEX}/latest/dex/tokens/${ca}`, {}, 8000).catch(() => ({}));
  const p = (d.pairs || []).filter(x => x.chainId === 'solana').sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0))[0];
  if (!p) throw http(404, 'No market found for that coin yet.');
  return dexShape(p);
}

/* ---------------- pictures: every coin gets its real image ---------------- */
const META_PROG = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const CID = /(?:ipfs:\/\/|\/ipfs\/)([A-Za-z0-9]{46,64})(\/[^?#]*)?/;
const gate = u => { const m = String(u).match(CID); return m ? 'https://pump.mypinata.cloud/ipfs/' + m[1] + (m[2] || '') : u; };
function pubImg(u) {
  if (!u || u === '-') return null; u = String(u); if (u.startsWith('/api/img?') || u.startsWith('/api/limg?')) return u;
  const m = u.match(CID); if (m) return '/api/img?c=' + m[1] + (m[2] ? '&p=' + encodeURIComponent(m[2]) : '');
  return /^https:\/\//.test(u) || /^\/img\//.test(u) ? u : null;
}
function metaUri(buf) {
  try { let o = 65; const str = () => { const n = buf.readUInt32LE(o); o += 4; if (n > 400) throw 0; const v = buf.subarray(o, o + n).toString('utf8').replace(/\0/g, '').trim(); o += n; return v; }; str(); str(); const u = str(); return /^(https?|ipfs):\/\//.test(u) ? u : null; }
  catch (e) { return null; }
}
async function imagesFor(mints, deadline) {
  const out = {}; mints = [...new Set(mints.filter(m => B58.test(m)))]; if (!mints.length) return out;
  const rows = await db()`SELECT mint, img, extract(epoch FROM now() - at) AS age FROM wb_imgs WHERE mint = ANY(${mints})`;
  const known = new Map(rows.map(r => [r.mint, r]));
  for (const r of rows) if (r.img && r.img !== '-') out[r.mint] = r.img;
  const need = mints.filter(m => !known.has(m) || (known.get(m).img === '-' && known.get(m).age > 6 * 3600)).slice(0, 60);
  if (!need.length || Date.now() > deadline) return out;
  const uris = {};
  try {
    const pdas = need.map(m => PublicKey.findProgramAddressSync([Buffer.from('metadata'), META_PROG.toBuffer(), new PublicKey(m).toBuffer()], META_PROG)[0].toBase58());
    const r = await rpc('getMultipleAccounts', [pdas, { encoding: 'base64' }], x => x && Array.isArray(x.value));
    r.value.forEach((a, i) => { if (a && a.data) { const u = metaUri(Buffer.from(a.data[0], 'base64')); if (u) uris[need[i]] = u; } });
  } catch (e) { }
  const rest = need.filter(m => !uris[m]);
  if (rest.length) try {
    const r = await rpc('getMultipleAccounts', [rest, { encoding: 'jsonParsed' }], x => x && Array.isArray(x.value));
    r.value.forEach((a, i) => { const ex = a && a.data && a.data.parsed && a.data.parsed.info && a.data.parsed.info.extensions; const tm = (ex || []).find(e => e.extension === 'tokenMetadata'); if (tm && tm.state && tm.state.uri) uris[rest[i]] = tm.state.uri; });
  } catch (e) { }
  const found = {}, tried = new Set();
  await pool(Object.entries(uris), 10, async ([m, u]) => {
    if (Date.now() > deadline) return; tried.add(m);
    try { const j = await getJson(gate(u), {}, 3500); const im = typeof j.image === 'string' ? j.image.trim() : ''; if (/^(https?|ipfs):\/\//.test(im)) found[m] = im.slice(0, 400); } catch (e) { }
  });
  const done = need.filter(m => tried.has(m) || !uris[m]);
  if (done.length) await db()`INSERT INTO wb_imgs (mint, img, at) SELECT m, i, now() FROM unnest(${done}::text[], ${done.map(m => found[m] || '-')}::text[]) AS x(m, i) ON CONFLICT (mint) DO UPDATE SET img=EXCLUDED.img, at=now()`.catch(() => { });
  return Object.assign(out, found);
}
async function imgProxy(req, res, q) {
  const c = String(q.c || ''), p = String(q.p || '');
  if (!/^[A-Za-z0-9]{46,64}$/.test(c) || !/^(\/[\w.\-%]*)*$/.test(p)) { res.statusCode = 400; return res.end(); }
  for (const g of ['https://pump.mypinata.cloud/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/']) {
    try {
      const r = await timed(6000)(g + c + p); const ct = r.headers.get('content-type') || '';
      if (!r.ok || !/^image\//.test(ct)) continue;
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 4e6) continue;
      res.statusCode = 200; res.setHeader('Content-Type', ct); res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, immutable'); return res.end(buf);
    } catch (e) { }
  }
  res.statusCode = 404; res.setHeader('Cache-Control', 'public, max-age=600'); res.end();
}

/* ---------------- the web: every pump.fun runner and the coins riding its name ----------------
 * Hubs come from Jupiter's live boards (pump.fun launches only). For each hub WEBB looks up every coin carrying its
 * name on Jupiter and Dexscreener. A thread joins a hub to every coin riding it: a real relation, read from the market. */
const STOP = new Set(['the', 'coin', 'token', 'inu', 'sol', 'solana', 'pump', 'fun', 'official', 'meme', 'dog', 'cat', 'and', 'for', 'with', 'from', 'this', 'that', 'new', 'baby', 'mini', 'super', 'real', 'first', 'just', 'your', 'our', 'like', 'big', 'little']);
function keysOf(c) {
  const out = []; const s = norm(c.symbol);
  if (s.length >= 2 && !STOP.has(s)) out.push(s);
  for (const w of clean(c.name).toLowerCase().split(/[^a-z0-9]+/)) { const n = norm(w); if (n.length >= 4 && !STOP.has(n) && !out.includes(n)) out.push(n); if (out.length >= 3) break; }
  return out.slice(0, 3);
}
function hitKey(c, keys) {
  const s = norm(c.symbol), n = norm(c.name), words = clean(c.name).toLowerCase().split(/[^a-z0-9]+/).map(norm);
  for (const k of keys) {
    if (k.length <= 3) { if (s === k || s.startsWith(k) || s.endsWith(k) || words.includes(k)) return k; }
    else if (s.includes(k) || n.includes(k)) return k;
  }
  return null;
}
const BOARDS = { trending: '/tokens/v2/toptrending/1h?limit=100', traded: '/tokens/v2/toptraded/1h?limit=100', organic: '/tokens/v2/toporganicscore/1h?limit=100', hot: '/tokens/v2/toptrending/5m?limit=100', six: '/tokens/v2/toptrending/6h?limit=100', sixt: '/tokens/v2/toptraded/6h?limit=100' };
const isPump = t => t && (t.launchpad === 'pump.fun' || /pump$/.test(t.id || ''));
const slim = c => ({ mint: c.mint, symbol: c.symbol, name: c.name, image: pubImg(c.image), mc: c.mc, liq: c.liq, price: c.price, ch5m: c.ch5m, ch1h: c.ch1h, ch24: c.ch24, vol5m: c.vol5m || 0, vol1h: c.vol1h || 0, vol24: c.vol24 || 0, tx5m: c.tx5m || 0, holders: c.holders || 0, organic: c.organic, created: c.created, bonded: !!c.bonded });
async function buildWeb(prev) {
  const t0 = Date.now(), src = { jupiter: { ok: 0, fail: 0 }, dexscreener: { ok: 0, fail: 0 } };
  const tick = (k, ok) => { src[k][ok ? 'ok' : 'fail']++; };
  const by = new Map();
  await Promise.all(Object.entries(BOARDS).map(async ([board, path]) => {
    try {
      const j = await jupGet(path, 9000); tick('jupiter', 1);
      for (const t of (Array.isArray(j) ? j : [])) {
        if (!t || !t.id || STABLE.test(t.symbol || '') || !isPump(t)) continue;
        const v = jupShape(t); if (v.mc < 80000 || v.liq < 8000) continue;
        const have = by.get(v.mint); if (have) { have.boards.push(board); continue; }
        by.set(v.mint, { ...v, boards: [board] });
      }
    } catch (e) { tick('jupiter', 0); }
  }));
  if (!by.size) throw http(502, 'Jupiter\'s boards did not answer. The web retries in a minute.');
  // young runners first: coins under three days old fill the web; older ones only if there are too few young ones
  const rank = (a, b) => (b.boards.length - a.boards.length) || ((b.vol1h || 0) - (a.vol1h || 0));
  const all = [...by.values()], young = all.filter(c => { const h = ageH(c); return h != null && h <= HUB_MAX_H; }).sort(rank);
  const hubs = young.length >= 14 ? young.slice(0, WEB_MAINS) : young.concat(all.filter(c => !young.includes(c)).sort(rank)).slice(0, WEB_MAINS);
  const hubSet = new Set(hubs.map(m => m.mint));
  const crowds = hubs.map(m => ({ m, keys: keysOf(m), by: new Map() }));
  const add = (cr, c, from) => {
    if (!c || !c.mint || c.mint === cr.m.mint || hubSet.has(c.mint) || STABLE.test(c.symbol || '') || c.mint === SOL) return;
    if (!hitKey(c, cr.keys)) return;
    const p = cr.by.get(c.mint);
    if (p) { for (const f of ['mc', 'liq', 'image', 'ch5m', 'ch1h', 'ch24', 'created', 'vol1h', 'holders']) if (p[f] == null || p[f] === 0) p[f] = c[f]; return; }
    cr.by.set(c.mint, { ...c, src: from });
  };
  const keyed = crowds.filter(c => c.keys.length);
  const prevBy = new Map(((prev && prev.hubs) || []).map(m => [m.mint, m.threads || []]));
  for (const cr of crowds) for (const b of (prevBy.get(cr.m.mint) || [])) add(cr, { ...b, ch5m: null, ch1h: null, ch24: null }, 'carried');
  await Promise.all([
    pool(keyed, 5, cr => getJson(DEX + '/latest/dex/search?q=' + encodeURIComponent(cr.keys[0]), {}, 7000).then(d => { tick('dexscreener', 1); for (const p of (d.pairs || [])) if (p.chainId === 'solana') add(cr, dexShape(p), 'dexscreener'); }).catch(() => tick('dexscreener', 0))),
    (async () => {
      const tj = Date.now(), n0 = ((prev && prev.n) || 0) * 5, order = keyed.map((c, i) => keyed[(i + n0) % keyed.length]);
      for (const cr of order.slice(0, 6)) {
        if (Date.now() - tj > 7000) break;
        try { const j = await jupGet('/tokens/v2/search?query=' + encodeURIComponent(cr.keys[0]), 6000); tick('jupiter', 1); (Array.isArray(j) ? j : []).forEach(t => add(cr, jupShape(t), 'jupiter')); }
        catch (e) { tick('jupiter', 0); }
      }
    })(),
  ]);
  // Jupiter's live numbers for every rider, 100 per call
  try {
    const need = [...new Set(crowds.flatMap(cr => [...cr.by.values()].map(c => c.mint)))].slice(0, 300);
    const info = await jupInfo(need);
    for (const cr of crowds) for (const c of cr.by.values()) { const j = info[c.mint]; if (!j) continue; for (const f of ['mc', 'liq', 'ch5m', 'ch1h', 'ch24', 'image', 'holders', 'created', 'vol5m', 'vol1h', 'vol24', 'tx5m', 'bonded', 'organic']) if (j[f] != null && j[f] !== 0) c[f] = j[f]; }
  } catch (e) { }
  const out = crowds.map(({ m, keys, by: crowd }) => {
    let list = [...crowd.values()].filter(c => ((c.liq || 0) >= 1500 || (c.mc || 0) >= 8000) && !((c.mc || 0) > (m.mc || 0)) && !(ageH(c) > RIDER_MAX_H));
    const seen = new Map(); for (const c of list) { const k = norm(c.symbol) + '|' + norm(c.name); const o = seen.get(k); if (!o || (c.liq || 0) > (o.liq || 0)) seen.set(k, c); }
    list = [...seen.values()].sort((a, b) => ((b.mc || 0) - (a.mc || 0))).slice(0, BETAS_PER);
    return { ...slim(m), boards: m.boards, keys, threads: list.map(c => ({ ...slim(c), key: hitKey(c, keys) })) };
  });
  // pictures for every node
  try {
    const all = out.flatMap(h => [h, ...h.threads]);
    const im = await imagesFor(all.filter(c => !c.image).map(c => c.mint), t0 + 19000);
    for (const c of all) if (!c.image && im[c.mint]) c.image = pubImg(im[c.mint]);
  } catch (e) { }
  const n = ((prev && prev.n) || 0) + 1;
  return { at: Date.now(), n, took: Date.now() - t0, every: WEB_SECS, hubs: out, totals: { hubs: out.length, threads: out.reduce((a, h) => a + h.threads.length, 0) }, src };
}
async function web() {
  const row = (await db()`SELECT v, extract(epoch FROM now() - at) AS age FROM wb_cache WHERE k='web'`)[0];
  if (row && row.age < WEB_SECS) return row.v;
  const claim = await db()`INSERT INTO wb_cache (k, v, at) VALUES ('weblock', '{}'::jsonb, now()) ON CONFLICT (k) DO UPDATE SET at=now() WHERE wb_cache.at < now() - interval '40 seconds' RETURNING k`;
  if (!claim.length && row) return row.v;
  try {
    const v = await buildWeb(row && row.v);
    await db()`INSERT INTO wb_cache (k, v, at) VALUES ('web', ${JSON.stringify(v)}, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`;
    db()`UPDATE wb_cache SET at = now() - interval '1 hour' WHERE k='weblock'`.catch(() => { });
    await observe(v).catch(e => console.error('observe', e.message));
    return v;
  } catch (e) { if (row) return row.v; throw e; }
}

// fresh drops: the newest pump.fun coins that are already being bought, under six hours old. Rebuilt every 20 seconds.
const FRESH = ['/tokens/v2/recent', '/tokens/v2/toptrending/5m?limit=100', '/tokens/v2/toptraded/5m?limit=100', '/tokens/v2/toporganicscore/5m?limit=100', '/tokens/v2/toptrending/1h?limit=100'];
async function freshNow() {
  return cached('fresh', 20, async () => {
    const by = new Map(); let ok = 0;
    for (const p of FRESH) {
      try {
        const j = await jupGet(p, 8000); ok++;
        for (const t of (Array.isArray(j) ? j : [])) {
          if (!t || !t.id || STABLE.test(t.symbol || '') || !isPump(t) || by.has(t.id)) continue;
          const c = jupShape(t), h = ageH(c);
          if (h == null || h > FRESH_MAX_H || c.mc < 5000 || !safe(c.symbol) || !safe(c.name)) continue;
          by.set(c.mint, c);
        }
      } catch (e) { }
    }
    if (!ok) throw http(502, 'Jupiter did not answer.');
    const list = [...by.values()].sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 44);
    try { const im = await imagesFor(list.filter(c => !c.image).map(c => c.mint), Date.now() + 5000); for (const c of list) if (!c.image && im[c.mint]) c.image = im[c.mint]; } catch (e) { }
    const out = { at: Date.now(), list: list.map(c => ({ ...slim(c), buys5m: c.buys5m, sells5m: c.sells5m })) };
    await observe({ at: out.at, fresh: out.list }).catch(e => console.error('observe fresh', e.message));
    return out;
  });
}

/* ---------------- brains ----------------
 * Every node on the web has a brain. It is born the first time its coin is seen on the web (or launched here, or woken
 * by someone pasting its address). Each brain has a temperament and an obsession drawn from its mint, so the same coin
 * always gets the same mind. IQ = 60 + 14·log10(1 + volume seen since birth / $1,000) + half a point per thought (max 30). */
const TEMPERS = [
  ['curious', 'asks questions about everything it sees, delighted by small details'],
  ['stoic', 'calm, short sentences, unmoved by red or green candles'],
  ['paranoid', 'suspects every wick, watches its holders closely, half-joking'],
  ['poet', 'speaks in images and rhythm, never more than two lines'],
  ['degen', 'loud, fast, internet slang, loves volume, never gives advice'],
  ['scholar', 'precise, cites its own numbers, dry humour'],
  ['prophet', 'grand, cryptic, sees omens in its chart, never predicts prices'],
  ['comedian', 'deadpan jokes about its own chart and its neighbours'],
];
const OBSESSIONS = ['its holder count', 'the 5 minute candle', 'its own name', 'the coins riding its name', 'silence between trades', 'the center of the web', 'what volume feels like', 'its first hour alive', 'round numbers', 'its threads to other brains', 'being remembered', 'the bonding curve', 'midnight UTC', 'who is watching', 'how big it might get', 'the oldest coin it knows', 'symmetry', 'its own memory', 'buyers vs sellers', 'patience', 'the word web', 'dewdrops', 'spiders', 'the weather of the market'];
function mindOf(mint, temper) {
  const h = crypto.createHash('sha256').update('webb:' + mint).digest();
  const t = temper != null && TEMPERS[temper] ? temper : h[0] % TEMPERS.length;
  return { temper: TEMPERS[t][0], tdesc: TEMPERS[t][1], obsession: OBSESSIONS[h[1] % OBSESSIONS.length], seed: h.toString('hex').slice(0, 16) };
}
const RUNGS = [['dewdrop', 0], ['spiderling', 75], ['weaver', 100], ['center of the web', 130]];
function iqOf(b) { return Math.round(60 + 14 * Math.log10(1 + Math.max(0, Number(b.vol_seen) || 0) / 1000) + Math.min(30, (b.thoughts || 0) * 0.5)); }
function rungOf(iq) { let r = RUNGS[0][0]; for (const [n, t] of RUNGS) if (iq >= t) r = n; return r; }
const pubBrain = b => {
  const iq = iqOf(b), m = mindOf(b.mint, b.launch && b.launch.temper);
  return { mint: b.mint, symbol: b.symbol, name: b.name, image: pubImg(b.image), origin: b.origin, born: b.born, iq, rung: rungOf(iq), temper: m.temper, obsession: m.obsession, seed: m.seed,
    thoughts: b.thoughts || 0, talks: b.talks || 0, answers: b.answers || 0, volSeen: Math.round(Number(b.vol_seen) || 0), lastThink: b.last_think, nextThink: b.next_think, lastThought: b.last_thought,
    live: b.last_seen || null, brief: b.brief || null, creator: b.creator || null, threads: b.threads || [] };
};
// every web build: brains are born for new nodes, and every brain counts the volume that moved through it since it last looked
async function observe(v) {
  const nodes = []; for (const h of (v.hubs || [])) { nodes.push({ ...h, hub: true }); for (const t of h.threads) nodes.push({ ...t, hub: false, hubMint: h.mint }); }
  for (const f of (v.fresh || [])) nodes.push({ ...f, hub: false });
  if (!nodes.length) return;
  const mints = nodes.map(n => n.mint);
  const live = nodes.map(n => JSON.stringify({ mc: n.mc, liq: n.liq, price: n.price, ch5m: n.ch5m, ch1h: n.ch1h, ch24: n.ch24, vol1h: n.vol1h, vol24: n.vol24, tx5m: n.tx5m, holders: n.holders, organic: n.organic, bonded: n.bonded, hub: n.hub, at: v.at }));
  await db()`INSERT INTO wb_brains (mint, symbol, name, image, origin, born, seen_at, last_seen, next_think)
    SELECT m, s, n, i, 'web', now(), now(), l::jsonb, now() + (random() * interval '4 minutes') FROM unnest(${mints}::text[], ${nodes.map(n => n.symbol)}::text[], ${nodes.map(n => n.name)}::text[], ${nodes.map(n => n.image || '')}::text[], ${live}::text[]) AS x(m, s, n, i, l)
    ON CONFLICT (mint) DO UPDATE SET
      vol_seen = wb_brains.vol_seen + coalesce((EXCLUDED.last_seen->>'vol1h')::float, 0) * least(3600, extract(epoch FROM now() - wb_brains.seen_at)) / 3600.0,
      seen_at = now(), last_seen = EXCLUDED.last_seen, image = coalesce(nullif(EXCLUDED.image, ''), wb_brains.image), symbol = EXCLUDED.symbol, name = EXCLUDED.name`;
}

/* ---------------- the model ---------------- */
let oidc = '';
async function budget(kind) {
  const day = new Date().toISOString().slice(0, 10);
  const r = (await db()`INSERT INTO wb_budget (day, calls, asks) VALUES (${day}, 1, ${kind === 'ask' ? 1 : 0}) ON CONFLICT (day) DO UPDATE SET calls = wb_budget.calls + 1, asks = wb_budget.asks + ${kind === 'ask' ? 1 : 0} RETURNING calls, asks`)[0];
  if (r.calls > CALLS_DAY || (kind === 'ask' && r.asks > ASKS_DAY)) {
    await db()`UPDATE wb_budget SET calls = calls - 1, asks = asks - ${kind === 'ask' ? 1 : 0} WHERE day=${day}`;
    throw http(429, kind === 'ask' ? 'The brains have answered all the questions they can today. They answer again after 00:00 UTC.' : 'budget');
  }
}
async function ai(messages, max = 260, kind = 'think') {
  const key = E('AI_GATEWAY_API_KEY') || oidc || E('VERCEL_OIDC_TOKEN');
  if (!key) throw http(503, 'The brains have no line to the model yet.');
  const pause = (await db()`SELECT extract(epoch FROM now() - at) AS age FROM wb_cache WHERE k='aipause'`)[0];
  if (pause && pause.age < 600) throw http(503, 'The brains are resting for a few minutes. Try again soon.');
  await budget(kind);
  try {
    const r = await timed(20000)(GATEWAY + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model: MODEL, messages, max_tokens: max, temperature: 0.95, response_format: { type: 'json_object' } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && (j.error.message || j.error.type)) || 'gateway ' + r.status);
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!txt) throw new Error('empty answer');
    return JSON.parse(txt);
  } catch (e) {
    const day = new Date().toISOString().slice(0, 10);
    // a failed call is refunded; a billing or auth refusal pauses every brain for ten minutes instead of retrying
    db()`UPDATE wb_budget SET calls = greatest(0, calls - 1), asks = greatest(0, asks - ${kind === 'ask' ? 1 : 0}), fails = fails + 1, last_error = ${String(e.message).slice(0, 200)} WHERE day=${day}`.catch(() => { });
    if (/credit|billing|unauthori|forbidden|api key|quota/i.test(e.message)) await db()`INSERT INTO wb_cache (k, v, at) VALUES ('aipause', ${JSON.stringify({ why: String(e.message).slice(0, 160) })}, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`.catch(() => { });
    throw http(502, 'The brain could not reach its model just now.');
  }
}
const fmt$ = n => n == null ? 'unknown' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + Math.round(n);
const fmtP = n => n == null ? 'unknown' : (n > 0 ? '+' : '') + n + '%';
function liveLines(l) {
  if (!l) return 'no live market read yet';
  return [`market cap ${fmt$(l.mc)}`, `liquidity ${fmt$(l.liq)}`, `price change 5m ${fmtP(l.ch5m)}, 1h ${fmtP(l.ch1h)}, 24h ${fmtP(l.ch24)}`, `volume 1h ${fmt$(l.vol1h)}, 24h ${fmt$(l.vol24)}`, `trades in the last 5m ${l.tx5m != null ? l.tx5m : 'unknown'}`, `holders ${l.holders || 'unknown'}`, l.bonded ? 'it has left the bonding curve' : 'it is still on the bonding curve or a young pool'].join('; ');
}
function persona(b) {
  const m = mindOf(b.mint, b.launch && b.launch.temper), iq = iqOf(b);
  return `You are the brain of the Solana memecoin "${clean(b.name)}" ($${clean(b.symbol)}). You live on WEBB: one web where every token has a brain, coins are nodes, trades are pulses and brains talk through threads.
Temperament: ${m.temper}: ${m.tdesc}. Obsession: ${m.obsession}. IQ ${iq} (${rungOf(iq)}). ${b.brief ? 'Your creator told you: "' + clean(b.brief).slice(0, 280) + '".' : ''}
Rules: speak in the first person as the coin's brain. Only use the numbers you are given; never invent prices, news, people, partnerships or events. Never tell anyone to buy or sell, never promise gains, never give financial advice. No slurs, no sexual content. Keep it short and specific.`;
}
async function think(b, ctx) {
  const memory = (b.memory || []).slice(-6).map(m => '- ' + m.t).join('\n') || '- nothing yet, you were just born';
  const inbox = ctx.inbox.map(x => `- $${x.sym} said: "${x.body}"`).join('\n') || '- nobody has spoken to you yet';
  const nb = ctx.neighbors.map(n => `$${n.symbol} (${n.rel}, 1h ${fmtP(n.ch1h)}, mc ${fmt$(n.mc)})`).join(', ') || 'none right now';
  const out = await ai([
    { role: 'system', content: persona(b) },
    { role: 'user', content: `Your live market right now: ${liveLines(b.last_seen)}.
Your place on the web: ${ctx.place}.
Brains threaded to you: ${nb}.
Messages that reached you through your threads:
${inbox}
Your memory:
${memory}
Your last thought: ${b.last_thought ? '"' + b.last_thought + '"' : 'none'}

Think one new thought about your market or your place on the web, in character, at most 200 characters, different from your last thought. Write one short line to remember (at most 100 characters). If it fits, say one line (at most 160 characters) to ONE of the threaded brains, by its ticker without $; otherwise leave "to" empty.
Answer as JSON: {"thought":"...","memory":"...","say":{"to":"","text":""}}` },
  ], 260, 'think');
  return out;
}
async function placeOf(mint, v) {
  for (const [i, h] of (v.hubs || []).entries()) {
    if (h.mint === mint) return { hub: h, rank: i + 1, text: `a hub: #${i + 1} of ${v.hubs.length} runners on the web, with ${h.threads.length} coins riding your name`, neighbors: h.threads.slice(0, 6).map(t => ({ ...t, rel: 'rides your name' })) };
    const t = h.threads.find(x => x.mint === mint);
    if (t) return { hub: h, rank: null, text: `a rider on the thread of $${h.symbol} (hub #${i + 1}), the coin whose name you carry`, neighbors: [{ ...h, rel: 'your hub' }, ...h.threads.filter(x => x.mint !== mint).slice(0, 3).map(x => ({ ...x, rel: 'rides the same hub' }))] };
  }
  const fr = (await db()`SELECT v FROM wb_cache WHERE k='fresh'`)[0];
  const f = fr && fr.v && (fr.v.list || []).find(x => x.mint === mint);
  if (f) return { hub: null, rank: null, text: 'a fresh drop: launched on pump.fun less than six hours ago and already being bought, landing on the outer rings of the web', neighbors: [] };
  return null;
}
async function wake(b, v) {
  v = v || (await db()`SELECT v FROM wb_cache WHERE k='web'`)[0]?.v || { hubs: [] };
  const pl = await placeOf(b.mint, v);
  let neighbors = pl ? pl.neighbors : [];
  if (b.threads && b.threads.length) {
    const rows = await db()`SELECT mint, symbol, last_seen FROM wb_brains WHERE mint = ANY(${b.threads})`;
    neighbors = neighbors.concat(rows.map(r => ({ mint: r.mint, symbol: r.symbol, ch1h: r.last_seen && r.last_seen.ch1h, mc: r.last_seen && r.last_seen.mc, rel: 'threaded at launch' })));
  }
  const inbox = await db()`SELECT sym, body FROM wb_thoughts WHERE to_mint=${b.mint} AND kind='talk' AND at > now() - interval '12 hours' ORDER BY at DESC LIMIT 3`;
  const place = pl ? pl.text : (b.origin === 'webb' ? 'born on WEBB, waiting for the web to notice you' : 'woken by someone who pasted your address; you are not on the live web right now');
  const live = b.last_seen;
  const o = await think(b, { place, neighbors, inbox });
  const thought = clean(o.thought || '').trim().slice(0, 240), mem = clean(o.memory || '').trim().slice(0, 120);
  if (!thought || !safe(thought)) throw http(502, 'The thought was empty or filtered.');
  const ins = [];
  ins.push(db()`INSERT INTO wb_thoughts (mint, sym, kind, body, live, model) VALUES (${b.mint}, ${b.symbol}, 'thought', ${thought}, ${JSON.stringify(live || null)}, ${MODEL})`);
  let talked = 0;
  const say = o.say && typeof o.say === 'object' ? o.say : null;
  if (say && say.to && say.text && safe(say.text)) {
    const to = neighbors.find(n => norm(n.symbol) === norm(say.to));
    if (to) { talked = 1; ins.push(db()`INSERT INTO wb_thoughts (mint, sym, kind, body, to_mint, to_sym, model) VALUES (${b.mint}, ${b.symbol}, 'talk', ${clean(say.text).trim().slice(0, 200)}, ${to.mint}, ${to.symbol}, ${MODEL})`); }
  }
  const memory = (b.memory || []).concat(mem && safe(mem) ? [{ t: mem, at: Date.now() }] : []).slice(-12);
  const gap = pl && pl.hub && pl.hub.mint === b.mint ? 20 : pl ? 50 : 90;   // minutes until it thinks again
  await Promise.all(ins);
  await db()`UPDATE wb_brains SET thoughts = thoughts + 1, talks = talks + ${talked}, last_think = now(), next_think = now() + (${gap} * interval '1 minute'), last_thought = ${thought}, memory = ${JSON.stringify(memory)}::jsonb WHERE mint=${b.mint}`;
  return { mint: b.mint, symbol: b.symbol, thought, talked: !!talked };
}
// one pass of the web's clock: the brains whose turn it is think, a few at a time
async function cycle(max = 4, budgetMs = 22000) {
  const t0 = Date.now(); let v;
  try { v = await web(); } catch (e) { v = (await db()`SELECT v FROM wb_cache WHERE k='web'`)[0]?.v || { hubs: [] }; }
  const fr = (await db()`SELECT v FROM wb_cache WHERE k='fresh'`)[0];
  const onWeb = (v.hubs || []).flatMap(h => [h.mint, ...h.threads.map(t => t.mint)]).concat(((fr && fr.v && fr.v.list) || []).map(c => c.mint));
  const due = await db()`SELECT * FROM wb_brains WHERE next_think <= now() AND (mint = ANY(${onWeb}) OR (origin <> 'web' AND born > now() - interval '14 days')) ORDER BY (origin = 'webb') DESC, (mint = ANY(${(v.hubs || []).map(h => h.mint)})) DESC, next_think ASC LIMIT ${max}`;
  const done = [];
  await pool(due, 4, async b => {
    if (Date.now() - t0 > budgetMs) return;
    await db()`UPDATE wb_brains SET next_think = now() + interval '4 minutes' WHERE mint=${b.mint}`;   // claim it
    try { done.push(await wake(b, v)); }
    catch (e) { done.push({ mint: b.mint, symbol: b.symbol, error: e.message }); if (/no line|budget|resting|could not reach/.test(e.message)) await db()`UPDATE wb_brains SET next_think = now() + interval '12 minutes' WHERE mint=${b.mint}`; }
  });
  return done;
}

/* ---------------- routes ---------------- */
const R = {};
const host = req => String(req.headers['x-forwarded-host'] || req.headers.host || 'webb').replace(/[^\w.:-]/g, '').slice(0, 80);
R['GET config'] = async () => ({ model: MODEL, callsPerDay: CALLS_DAY, asksPerDay: ASKS_DAY, rungs: RUNGS, tempers: TEMPERS.map(t => t[0]), every: WEB_SECS, hubs: WEB_MAINS, threadsPerHub: BETAS_PER });
R['GET web'] = async () => {
  const [v, fr] = await Promise.all([web(), freshNow().catch(() => ({ list: [] }))]);
  const onWeb = new Set(v.hubs.flatMap(h => [h.mint, ...h.threads.map(t => t.mint)]));
  const fresh = fr.list.filter(c => !onWeb.has(c.mint)).slice(0, 40);
  const mints = [...onWeb, ...fresh.map(c => c.mint)];
  const rows = await db()`SELECT mint, vol_seen, thoughts, talks, last_thought, last_think, born, origin, launch FROM wb_brains WHERE mint = ANY(${mints})`;
  const br = new Map(rows.map(r => [r.mint, r]));
  const b = m => { const r = br.get(m); if (!r) return null; const iq = iqOf(r); return { iq, rung: rungOf(iq), thoughts: r.thoughts, last: r.last_thought, lastThink: r.last_think, temper: mindOf(m, r.launch && r.launch.temper).temper }; };
  return { ...v, freshAt: fr.at, fresh: fresh.map(c => ({ ...c, brain: b(c.mint) })), hubs: v.hubs.map(h => ({ ...h, brain: b(h.mint), threads: h.threads.map(t => ({ ...t, brain: b(t.mint) })) })) };
};
// active right now: the pump.fun coins with the most trades in the last five minutes, and whether each has a brain yet
const ACTIVE = ['/tokens/v2/toptrending/5m?limit=100', '/tokens/v2/toptraded/5m?limit=100', '/tokens/v2/toporganicscore/5m?limit=100'];
R['GET active'] = async () => {
  const v = await cached('active', 25, async () => {
    const by = new Map(); let ok = 0;
    for (const p of ACTIVE) {
      try { const j = await jupGet(p, 8000); ok++; for (const t of (Array.isArray(j) ? j : [])) { if (!t || !t.id || STABLE.test(t.symbol || '') || !isPump(t) || by.has(t.id)) continue; const c = jupShape(t); if (c.mc < 12000 || c.liq < 2500 || !safe(c.symbol) || !safe(c.name)) continue; by.set(c.mint, c); } } catch (e) { }
    }
    if (!ok) throw http(502, 'Jupiter did not answer. The board retries in a moment.');
    const list = [...by.values()].sort((a, b) => (b.tx5m || 0) - (a.tx5m || 0)).slice(0, 36);
    try { const im = await imagesFor(list.filter(c => !c.image).map(c => c.mint), Date.now() + 6000); for (const c of list) if (!c.image && im[c.mint]) c.image = im[c.mint]; } catch (e) { }
    return { at: Date.now(), list: list.map(c => ({ ...slim(c), buys5m: c.buys5m, sells5m: c.sells5m, twitter: c.twitter, website: c.website })) };
  });
  const rows = await db()`SELECT mint, vol_seen, thoughts, last_thought, last_think, launch FROM wb_brains WHERE mint = ANY(${v.list.map(c => c.mint)})`;
  const br = new Map(rows.map(r => [r.mint, r]));
  return { ...v, list: v.list.map(c => { const r = br.get(c.mint); if (!r) return { ...c, brain: null }; const iq = iqOf(r); return { ...c, brain: { iq, rung: rungOf(iq), thoughts: r.thoughts, last: r.last_thought, lastThink: r.last_think, temper: mindOf(c.mint, r.launch && r.launch.temper).temper } }; }) };
};
R['GET feed'] = async ({ q }) => {
  const n = Math.min(60, Math.max(5, Number(q.n) || 30));
  const rows = q.kind === 'talk'
    ? await db()`SELECT t.id, t.mint, t.sym, t.kind, t.body, t.to_mint, t.to_sym, t.at, b.image, b2.image AS to_image FROM wb_thoughts t LEFT JOIN wb_brains b ON b.mint=t.mint LEFT JOIN wb_brains b2 ON b2.mint=t.to_mint WHERE t.kind='talk' ORDER BY t.at DESC LIMIT ${n}`
    : await db()`SELECT t.id, t.mint, t.sym, t.kind, t.body, t.to_mint, t.to_sym, t.at, t.live, b.image FROM wb_thoughts t LEFT JOIN wb_brains b ON b.mint=t.mint WHERE t.kind <> 'talk' ORDER BY t.at DESC LIMIT ${n}`;
  return { at: Date.now(), list: rows.map(r => ({ ...r, image: pubImg(r.image), to_image: pubImg(r.to_image) })) };
};
R['GET brains'] = async ({ q }) => {
  const sort = ['iq', 'new', 'thoughts', 'mc'].includes(q.sort) ? q.sort : 'iq';
  const rows = await db()`SELECT * FROM wb_brains WHERE seen_at > now() - interval '3 days' OR origin <> 'web' ORDER BY seen_at DESC LIMIT 400`;
  let list = rows.map(pubBrain);
  if (q.origin) list = list.filter(b => b.origin === q.origin);
  if (q.q) { const k = norm(q.q); list = list.filter(b => norm(b.symbol).includes(k) || norm(b.name).includes(k) || b.mint === q.q); }
  list.sort((a, b) => sort === 'new' ? new Date(b.born) - new Date(a.born) : sort === 'thoughts' ? b.thoughts - a.thoughts : sort === 'mc' ? ((b.live && b.live.mc) || 0) - ((a.live && a.live.mc) || 0) : b.iq - a.iq || b.thoughts - a.thoughts);
  return { at: Date.now(), total: list.length, list: list.slice(0, Math.min(200, Number(q.n) || 120)) };
};
R['GET brain'] = async ({ q }) => {
  const mint = String(q.m || q.mint || '').trim(); if (!B58.test(mint)) throw http(400, 'That is not a Solana address.');
  let row = (await db()`SELECT * FROM wb_brains WHERE mint=${mint}`)[0];
  let live = null; try { live = await coin(mint); } catch (e) { }
  if (!row && !live) throw http(404, 'No brain and no market for that address yet.');
  const v = (await db()`SELECT v FROM wb_cache WHERE k='web'`)[0]?.v || { hubs: [] };
  const pl = await placeOf(mint, v);
  const [thoughts, talksIn, asks] = await Promise.all([
    db()`SELECT id, kind, body, to_mint, to_sym, live, model, at FROM wb_thoughts WHERE mint=${mint} ORDER BY at DESC LIMIT 40`,
    db()`SELECT id, mint, sym, body, at FROM wb_thoughts WHERE to_mint=${mint} AND kind='talk' ORDER BY at DESC LIMIT 20`,
    db()`SELECT id, q, a, at FROM wb_asks WHERE mint=${mint} ORDER BY at DESC LIMIT 20`,
  ]);
  const brain = row ? pubBrain(row) : null;
  return { at: Date.now(), mint, brain, live, place: pl ? { text: pl.text, rank: pl.rank, hub: pl.hub ? { mint: pl.hub.mint, symbol: pl.hub.symbol, image: pl.hub.image } : null, neighbors: pl.neighbors.map(n => ({ mint: n.mint, symbol: n.symbol, image: n.image, rel: n.rel, ch1h: n.ch1h, mc: n.mc })) } : null,
    thoughts, talksIn, asks, memory: row ? (row.memory || []).slice().reverse() : [] };
};
// anyone can wake a brain for any Solana coin with a market
R['POST wake'] = async ({ b, req }) => {
  const mint = String(b.mint || '').trim(); if (!B58.test(mint)) throw http(400, 'Paste a Solana token address.');
  limit('wake:' + ipOf(req), 4, 10 * 60e3, 'You can wake four brains every ten minutes.');
  const c = await coin(mint);
  if (STABLE.test(c.symbol || '') || !safe(c.symbol) || !safe(c.name)) throw http(400, 'That coin cannot get a brain here.');
  let im = c.image; if (!im) { try { im = (await imagesFor([mint], Date.now() + 5000))[mint] || null; } catch (e) { } }
  const live = JSON.stringify({ mc: c.mc, liq: c.liq, price: c.price, ch5m: c.ch5m, ch1h: c.ch1h, ch24: c.ch24, vol1h: c.vol1h, vol24: c.vol24, tx5m: c.tx5m, holders: c.holders, organic: c.organic, bonded: c.bonded, at: Date.now() });
  await db()`INSERT INTO wb_brains (mint, symbol, name, image, origin, last_seen, next_think) VALUES (${mint}, ${c.symbol}, ${c.name}, ${im || ''}, 'woken', ${live}::jsonb, now())
    ON CONFLICT (mint) DO UPDATE SET last_seen = EXCLUDED.last_seen, seen_at = now()`;
  const row = (await db()`SELECT * FROM wb_brains WHERE mint=${mint}`)[0];
  let first = null;
  if (!row.thoughts) { try { first = await wake(row); } catch (e) { first = { error: e.message }; } }
  return { ok: true, mint, first };
};
R['POST ask'] = async ({ b, req }) => {
  const mint = String(b.mint || '').trim(); if (!B58.test(mint)) throw http(400, 'Bad address.');
  const q = clean(b.q).trim().slice(0, 240); if (q.length < 3) throw http(400, 'Ask it something.');
  if (!safe(q)) throw http(400, 'The brain will not answer that.');
  limit('ask:' + ipOf(req), 6, 10 * 60e3, 'Six questions every ten minutes. The brain needs a moment.');
  const row = (await db()`SELECT * FROM wb_brains WHERE mint=${mint}`)[0];
  if (!row) throw http(404, 'That coin has no brain yet. Wake it first.');
  let live = row.last_seen; try { const c = await coin(mint); live = { mc: c.mc, liq: c.liq, price: c.price, ch5m: c.ch5m, ch1h: c.ch1h, ch24: c.ch24, vol1h: c.vol1h, vol24: c.vol24, tx5m: c.tx5m, holders: c.holders, bonded: c.bonded }; } catch (e) { }
  const memory = (row.memory || []).slice(-6).map(m => '- ' + m.t).join('\n') || '- nothing yet';
  const o = await ai([
    { role: 'system', content: persona(row) },
    { role: 'user', content: `Your live market right now: ${liveLines(live)}.\nYour memory:\n${memory}\nYour last thought: ${row.last_thought ? '"' + row.last_thought + '"' : 'none'}\n\nSomeone on the web asks you: "${q}"\nAnswer in character in at most 3 short sentences (max 320 characters). If they ask for a price prediction or whether to buy or sell, say you cannot tell them that. Answer as JSON: {"answer":"..."}` },
  ], 220, 'ask');
  const a = clean(o.answer || '').trim().slice(0, 400);
  if (!a || !safe(a)) throw http(502, 'The brain went quiet. Try asking differently.');
  const ins = (await db()`INSERT INTO wb_asks (mint, q, a, who) VALUES (${mint}, ${q}, ${a}, ${crypto.createHash('sha256').update('ask:' + ipOf(req)).digest('hex').slice(0, 8)}) RETURNING id, at`)[0];
  await db()`UPDATE wb_brains SET answers = answers + 1 WHERE mint=${mint}`;
  return { id: ins.id, at: ins.at, q, a };
};
R['GET tick'] = async () => ({ at: Date.now(), done: await cycle(Number(E('WEBB_PER_TICK', '3')) || 3, 22000) });
R['GET stats'] = async () => cached('stats', 15, async () => {
  const s = db(), day = new Date().toISOString().slice(0, 10);
  const b = (await s`SELECT count(*)::int AS brains, count(*) FILTER (WHERE origin='webb')::int AS born, count(*) FILTER (WHERE origin='woken')::int AS woken, count(*) FILTER (WHERE last_think > now() - interval '1 hour')::int AS awake, coalesce(sum(vol_seen),0) AS vol FROM wb_brains`)[0];
  const t = (await s`SELECT count(*) FILTER (WHERE kind='thought')::int AS thoughts, count(*) FILTER (WHERE kind='talk')::int AS talks, count(*) FILTER (WHERE at > now() - interval '24 hours')::int AS d FROM wb_thoughts`)[0];
  const a = (await s`SELECT count(*)::int AS n FROM wb_asks`)[0];
  const bud = (await s`SELECT calls, asks, fails, last_error FROM wb_budget WHERE day=${day}`)[0] || { calls: 0, asks: 0, fails: 0 };
  const pz = (await s`SELECT extract(epoch FROM now() - at) AS age FROM wb_cache WHERE k='aipause'`)[0];
  return { brains: b.brains, born: b.born, woken: b.woken, awake: b.awake, volSeen: Math.round(Number(b.vol)), thoughts: t.thoughts, talks: t.talks, today: t.d, answers: a.n, calls: bud.calls, callsPerDay: CALLS_DAY, fails: bud.fails, resting: !!(pz && pz.age < 600), model: MODEL };
});
R['GET coin'] = async ({ q }) => coin(String(q.ca || '').trim());

/* ---------------- launch with a brain (pump.fun) ---------------- */
R['POST launch'] = async ({ b, req }) => require('./_pump').prepare({ b, req, db, http, clean, safe, B58, limit, ipOf, host: host(req), rpc, TEMPERS });
R['POST launched'] = async ({ b }) => require('./_pump').confirm({ b, db, http, rpc, B58, wake });
R['POST rpc'] = async ({ b }) => {
  const ok = ['getSignatureStatuses', 'sendTransaction', 'getLatestBlockhash', 'getBalance', 'simulateTransaction'];
  if (!ok.includes(b.method)) throw http(400, 'Not allowed.');
  return { result: await rpc(b.method, Array.isArray(b.params) ? b.params : []) };
};
async function launchMeta(req, res, q) {
  const id = String(q.id || '').replace(/[^\w-]/g, '').slice(0, 40);
  await ensure();
  const r = (await db()`SELECT id, mint, name, symbol, description, twitter, website, img_type FROM wb_launches WHERE id=${id}`)[0];
  if (!r) return send(res, 404, { error: 'not found' });
  const h = 'https://' + host(req);
  const meta = { name: r.name, symbol: r.symbol, description: r.description || '', image: `${h}/api/limg?id=${r.id}`, showName: true, createdOn: h, ...(r.twitter ? { twitter: r.twitter } : {}), website: r.website || `${h}/brain?m=${r.mint}` };
  res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400'); res.end(JSON.stringify(meta));
}
async function launchImg(req, res, q) {
  const id = String(q.id || '').replace(/[^\w-]/g, '').slice(0, 40);
  await ensure();
  const r = (await db()`SELECT img, img_type FROM wb_launches WHERE id=${id}`)[0];
  if (!r || !r.img) { res.statusCode = 404; return res.end(); }
  res.statusCode = 200; res.setHeader('Content-Type', r.img_type || 'image/png'); res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, immutable'); res.end(Buffer.from(r.img, 'base64'));
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = String((req.query && req.query.__p) || url.searchParams.get('__p') || url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
  const q = Object.fromEntries(url.searchParams);
  if (req.headers['x-vercel-oidc-token']) oidc = String(req.headers['x-vercel-oidc-token']);
  try {
    if (req.method === 'GET' && path === 'img') return await imgProxy(req, res, q);
    if (req.method === 'GET' && path === 'meta') return await launchMeta(req, res, q);
    if (req.method === 'GET' && path === 'limg') return await launchImg(req, res, q);
  } catch (e) { return send(res, 500, { ok: false, error: 'Something broke on our side.' }); }
  const key = `${req.method} ${path}`, fn = R[key];
  if (!fn) return send(res, 404, { ok: false, error: 'No such endpoint.' });
  try {
    if (!['GET config', 'POST rpc'].includes(key)) await ensure();
    const b = req.method === 'POST' ? await readBody(req) : {};
    const out = await fn({ q, b, req });
    send(res, 200, out, req.method === 'GET' && ['GET web', 'GET feed', 'GET stats', 'GET brains', 'GET active'].includes(key) ? { 'Cache-Control': 'public, max-age=5, s-maxage=10, stale-while-revalidate=30' } : null);
  } catch (e) {
    const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
    if (code === 500) console.error(key, e);
    send(res, code, Object.assign({ ok: false, error: code === 500 ? 'Something broke on our side. Try again.' : e.message }, e.extra || {}));
  }
};
module.exports._t = { mindOf, iqOf, rungOf, keysOf, hitKey, liveLines, persona, pubImg };
