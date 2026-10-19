/* discover: the live web, the brains, the feed */
(function () {
  const W = window.WEBB, $ = s => document.querySelector(s);
  let WEB = null, BRAINS = [], sort = 'iq', fil = '', q = '';
  const seenFeed = new Set(), queue = [];

  // the headline rises word by word
  const h1 = null; if (h1) { const words = h1.textContent.split(' '); h1.innerHTML = words.map((w, i) => `<i style="animation-delay:${.15 + i * .09}s">${W.esc(w)}</i>`).map((x, i) => i === 2 ? '<br>' + x : x).join(' ').replace(' <br>', '<br>'); }

  // five steps light up in turn
  const st = [...document.querySelectorAll('#steps>div')]; let si = 0;
  const stepOn = () => { st.forEach((d, i) => d.classList.toggle('on', i === si)); si = (si + 1) % st.length; };
  if (st.length) { stepOn(); setInterval(stepOn, 4000); }

  /* ---------- the web ---------- */
  const set3d = () => { if (WEB && window.WEBB3D) window.WEBB3D.set(WEB); };
  addEventListener('webb3d', set3d);
  async function loadWeb(first) {
    try { WEB = first ? (await window.__webP) || await W.api('web') : await W.api('web'); }
    catch (e) { WEB = null; }
    set3d();
  }

  /* ---------- the brains ---------- */
  const tagOf = b => b.lastThink && Date.now() - new Date(b.lastThink).getTime() < 180e3 ? '<span class="tag think">thinking</span>' : `<span class="tag">${W.esc(b.rung)}</span>`;
  const card = b => {
    const live = b.live || {};
    return `<a class="card" href="/brain?m=${b.mint}" data-m="${b.mint}">
      <div class="top">${W.img(b.image)}<div class="nm"><b>$${W.esc(b.symbol)}</b><span>${W.esc(b.name || '')}</span></div>${tagOf(b)}</div>
      <div class="iqbar"><i style="width:${Math.min(100, Math.max(4, (b.iq - 50) / 1.1))}%"></i></div>
      <div class="mid"><canvas data-seed="${b.mint}" data-iq="${b.iq}" data-think="${b.lastThink && Date.now() - new Date(b.lastThink).getTime() < 180e3 ? 1 : 0}"></canvas>
        <div><small>THE BRAIN · ${W.esc(b.temper)} · ${b.lastThink ? W.ago(b.lastThink) : 'waiting'}</small>${b.lastThought ? `<q>${W.esc(b.lastThought)}</q>` : '<q class="none">No thought yet. It wakes on its turn.</q>'}</div></div>
      <div class="ft"><div><small>IQ</small>${b.iq}</div><div><small>MCAP</small>${W.$(live.mc)}</div><div><small>1H</small>${W.pct(live.ch1h)}</div><div><small>THOUGHTS</small>${b.thoughts}</div></div>
    </a>`;
  };
  const globes = new Map();
  function renderCards() {
    const box = $('#cards'); if (!box) return;
    let list = BRAINS.slice();
    if (fil) list = list.filter(b => b.origin === fil);
    if (q) { const k = q.toLowerCase().replace(/^\$/, ''); list = list.filter(b => (b.symbol || '').toLowerCase().includes(k) || (b.name || '').toLowerCase().includes(k) || b.mint === q); }
    const by = { iq: (a, b) => b.iq - a.iq || b.thoughts - a.thoughts, thoughts: (a, b) => b.thoughts - a.thoughts, new: (a, b) => new Date(b.born) - new Date(a.born), mc: (a, b) => ((b.live || {}).mc || 0) - ((a.live || {}).mc || 0) };
    list.sort(by[sort]);
    $('#bcount').textContent = list.length + ' brain' + (list.length === 1 ? '' : 's');
    if (!BRAINS.length) { box.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>The web is waking up.</b>The first read of pump.fun's live boards is on its way. Brains appear here a minute after it lands.</div>`; return; }
    if (!list.length) { box.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>No brain matches that.</b>Paste the coin's address in "wake any coin" below to give it one.</div>`; return; }
    globes.forEach(g => g.stop()); globes.clear();
    box.innerHTML = list.slice(0, 12).map(card).join('');
    box.querySelectorAll('canvas[data-seed]').forEach(c => globes.set(c.dataset.seed, new W.Globe(c, c.dataset.seed, { iq: +c.dataset.iq, think: c.dataset.think === '1' })));
    W.cardsIn(box);
  }
  async function loadBrains() {
    try { const j = await W.api('brains?sort=iq&n=200'); BRAINS = j.list || []; } catch (e) { }
    renderCards(); ladder();
  }
  document.querySelectorAll('#bsort .chip').forEach(b => b.onclick = () => { document.querySelectorAll('#bsort .chip').forEach(x => x.classList.toggle('on', x === b)); sort = b.dataset.s; renderCards(); });
  document.querySelectorAll('#bfil .chip').forEach(b => b.onclick = () => { document.querySelectorAll('#bfil .chip').forEach(x => x.classList.toggle('on', x === b)); fil = b.dataset.f; renderCards(); });
  const bq = $('#bq'); if (bq) { let h; bq.oninput = () => { clearTimeout(h); h = setTimeout(() => { q = bq.value.trim(); renderCards(); }, 160); }; }

  /* ---------- the ladder ---------- */
  function ladder() {
    const n = [0, 0, 0, 0]; const idx = { dewdrop: 0, spiderling: 1, weaver: 2, 'center of the web': 3 };
    BRAINS.forEach(b => n[idx[b.rung] || 0]++);
    n.forEach((v, i) => W.count($('#r' + i), v));
  }
  document.querySelectorAll('.rung canvas').forEach(c => { const r = +c.dataset.r; new W.Globe(c, 'rung' + r, { lat: 3 + r * 3, lon: 5 + r * 4, iq: 55 + r * 28, tilt: .4, pad: .1, think: r === 3 }); });

  /* ---------- thoughts and talk ---------- */
  const row = t => `<div class="fr" data-id="${t.id}"><a href="/brain?m=${t.mint}">${W.img(t.image)}</a><div><a class="who" href="/brain?m=${t.mint}">$${W.esc(t.sym)} <em>${t.kind === 'birth' ? 'was born' : 'thought'}</em></a><p>${W.esc(t.body)}</p></div><time>${W.ago(t.at)}</time></div>`;
  const trow = t => `<div class="talk"><a class="a" href="/brain?m=${t.mint}">${W.img(t.image)}<b>$${W.esc(t.sym)}</b></a><div class="wire"></div><a class="b" href="/brain?m=${t.to_mint}"><b>$${W.esc(t.to_sym)}</b>${W.img(t.to_image)}</a><p>${W.esc(t.body)}</p></div>`;
  async function loadFeed(first) {
    try {
      const [f, t] = await Promise.all([W.api('feed?n=24'), W.api('feed?kind=talk&n=14')]);
      const feed = $('#feed'), talks = $('#talks');
      const fresh = f.list.filter(x => !seenFeed.has(x.id));
      f.list.forEach(x => seenFeed.add(x.id));
      if (feed) {
        if (!f.list.length) feed.innerHTML = `<div class="empty" style="margin:14px 0"><b>No thoughts yet.</b>Brains wake on their turn, a few every few minutes. The first ones appear here as they think.</div>`;
        else if (first || !feed.children.length || feed.querySelector('.empty')) feed.innerHTML = f.list.slice(0, 12).map(row).join('');
        else { fresh.reverse().forEach(x => { feed.insertAdjacentHTML('afterbegin', row(x)); }); while (feed.children.length > 12) feed.lastChild.remove(); }
        $('#fcount').textContent = f.list.length ? 'latest ' + W.ago(f.list[0].at) : '';
      }
      if (talks) {
        talks.innerHTML = t.list.length ? t.list.slice(0, 7).map(trow).join('') : `<div class="empty" style="margin:14px 0"><b>Nobody has spoken yet.</b>When a brain says something to a brain it is threaded to, the line shows up here.</div>`;
        $('#tcount').textContent = t.list.length ? t.list.length + ' recent' : '';
      }
      tape(f.list);
      (first ? f.list.slice(0, 8).reverse() : fresh).forEach(x => { if (x.kind !== 'talk') queue.push(x); });
      if (!first) { fresh.forEach(x => window.WEBB3D && window.WEBB3D.flash(x.mint)); if (fresh.length && W.ripple) W.ripple(); }
    } catch (e) { }
  }
  // the hero line types the newest thoughts, one after another
  let showing = false;
  async function showNext() {
    if (showing) return; const x = queue.shift(); if (!x) return;
    showing = true;
    const im = $('#thImg'), p = $('#thTxt'), ago = $('#thAgo');
    if (im) im.src = x.image || '/img/node.svg';
    if (ago) ago.textContent = W.ago(x.at);
    window.WEBB3D && window.WEBB3D.flash(x.mint);
    if (p) { p.innerHTML = ''; const b = document.createElement('b'); b.textContent = '$' + x.sym + ' '; p.appendChild(b); const s = document.createElement('span'); p.appendChild(s); await W.type(s, x.body, 18); }
    showing = false; queue.push(x);   // keep cycling the recent ones
  }
  setInterval(showNext, 7000);

  /* ---------- how it works: small live drawings ---------- */
  function mini(c) {
    const x = c.getContext('2d'), kind = c.dataset.a; let w, h;
    const fit = () => { const d = Math.min(2, devicePixelRatio || 1); w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; x.setTransform(d, 0, 0, d, 0, 0); };
    fit(); addEventListener('resize', fit);
    if (kind === 'think') { new W.Globe(c, 'think-demo', { iq: 110, think: true, lat: 7, lon: 12, pad: .06 }); return; }
    let vis = true; new IntersectionObserver(e => { vis = e[0].isIntersecting; }).observe(c);
    const ink = a => `rgba(13,13,13,${a})`;
    const draw = t => {
      requestAnimationFrame(draw); if (!vis || document.hidden) return; const k = t / 1000; x.clearRect(0, 0, w, h); x.lineWidth = 1;
      const cy = h / 2;
      if (kind === 'born') {
        x.strokeStyle = ink(.25); x.beginPath(); x.moveTo(0, cy + 22); x.lineTo(w, cy + 22); x.stroke();
        const ph = (k % 3) / 3, y = Math.min(cy + 22 - 10, -10 + ph * 3 * (cy + 22)), r = ph > .45 ? Math.min(16, (ph - .45) * 60) : 3;
        x.fillStyle = ink(.9); if (ph <= .45) x.fillRect(w / 2 - 3, y - 3, 6, 6);
        else { x.strokeStyle = ink(.85); for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(w / 2, cy + 22 - r, r, r * Math.abs(Math.cos(k + i * .8)), 0, 0, 6.283); x.stroke(); } x.beginPath(); x.arc(w / 2, cy + 22 - r, r, 0, 6.283); x.stroke(); }
      } else if (kind === 'fed') {
        x.strokeStyle = ink(.5); x.beginPath(); x.moveTo(10, cy); x.lineTo(w - 10, cy); x.stroke();
        for (let i = 0; i < 7; i++) { const p = ((k * .35 + i / 7) % 1), px = w - 10 - p * (w - 40); x.fillStyle = ink(.85); x.fillRect(px - 2.5, cy - 2.5, 5, 5); }
        x.strokeStyle = ink(.9); x.beginPath(); x.arc(22, cy, 10, 0, 6.283); x.stroke();
      } else if (kind === 'memory') {
        for (let i = 0; i < 5; i++) { const age = ((k * .5 + i) % 5) / 5; x.fillStyle = ink(.15 + .7 * (1 - age)); x.fillRect(20, 10 + i * 15, (w - 40) * (.4 + .5 * Math.abs(Math.sin(i * 2.1 + Math.floor(k * .5)))), 4); }
      } else if (kind === 'talk') {
        const a = 34, b = w - 34; x.strokeStyle = ink(.8);
        [a, b].forEach((cx, j) => { x.beginPath(); x.arc(cx, cy, 15, 0, 6.283); x.stroke(); x.beginPath(); x.ellipse(cx, cy, 15, 15 * Math.abs(Math.cos(k + j)), 0, 0, 6.283); x.stroke(); });
        x.strokeStyle = ink(.35); x.beginPath(); x.moveTo(a + 15, cy); x.lineTo(b - 15, cy); x.stroke();
        const p = (k * .6) % 2, px = p < 1 ? a + 15 + p * (b - a - 30) : b - 15 - (p - 1) * (b - a - 30); x.fillStyle = ink(.9); x.fillRect(px - 3, cy - 3, 6, 6);
      } else if (kind === 'grow') {
        for (let i = 0; i < 4; i++) { const hh = (h - 16) * (.25 + i * .25) * (.92 + .08 * Math.sin(k * 2 + i)); const bw = (w - 60) / 4; x.fillStyle = ink(.12 + i * .22); x.fillRect(20 + i * (bw + 7), h - 6 - hh, bw, hh); }
      }
    };
    requestAnimationFrame(draw);
  }
  document.querySelectorAll('.flow canvas').forEach(mini);
  document.querySelectorAll('.cols3 canvas').forEach(c => {
    const g = c.dataset.g;
    if (g === 'brain') { new W.Globe(c, 'idea-brain', { iq: 120, think: true, lat: 8, lon: 13, pad: .04 }); return; }
    const x = c.getContext('2d'); let w, h, vis = true;
    const fit = () => { const d = Math.min(2, devicePixelRatio || 1); w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; x.setTransform(d, 0, 0, d, 0, 0); };
    fit(); addEventListener('resize', fit); new IntersectionObserver(e => { vis = e[0].isIntersecting; }).observe(c);
    const pts = Array.from({ length: 7 }, (_, i) => ({ a: i / 7 * 6.283 + .3, r: .55 + (i % 3) * .14 }));
    const draw = t => {
      requestAnimationFrame(draw); if (!vis || document.hidden) return; const k = t / 1000; x.clearRect(0, 0, w, h); x.lineWidth = 1.2;
      if (g === 'pulse') {
        x.strokeStyle = 'rgba(13,13,13,.85)'; x.beginPath();
        for (let px = 0; px <= w; px += 2) { const u = (px / w * 3 - k * .6) % 1, ph = u < 0 ? u + 1 : u; let y = h * .6; if (ph > .42 && ph < .46) y -= (ph - .42) / .04 * h * .45; else if (ph >= .46 && ph < .5) y -= (1 - (ph - .46) / .04) * h * .45 - (ph - .46) / .04 * h * .12; else if (ph >= .5 && ph < .54) y += h * .12 * (1 - (ph - .5) / .04); y += Math.sin(px * .05 + k * 2) * 1.5; px ? x.lineTo(px, y) : x.moveTo(px, y); }
        x.stroke();
        const hx = (k * 60) % w; x.fillStyle = '#0d0d0d'; x.fillRect(hx - 3, h * .6 - 3, 6, 6);
      } else {
        const cx = w / 2, cy = h / 2, R = Math.min(w / 2, h / 2) * .95;
        x.strokeStyle = 'rgba(13,13,13,.25)'; x.beginPath();
        pts.forEach(p => { x.moveTo(cx, cy); x.lineTo(cx + Math.cos(p.a + k * .1) * R * 1.8, cy + Math.sin(p.a + k * .1) * R * .9); }); x.stroke();
        for (let q = .3; q < 1.01; q += .23) { x.beginPath(); x.ellipse(cx, cy, R * 1.8 * q, R * .9 * q, 0, 0, 6.283); x.stroke(); }
        pts.forEach((p, i) => { const a = p.a + k * .1, px = cx + Math.cos(a) * R * 1.8 * p.r, py = cy + Math.sin(a) * R * .9 * p.r; x.strokeStyle = 'rgba(13,13,13,.9)'; x.beginPath(); x.arc(px, py, 5, 0, 6.283); x.stroke();
          const f = (k * .5 + i / 7) % 1; x.fillStyle = '#0d0d0d'; x.fillRect(px + (cx - px) * f - 2, py + (cy - py) * f - 2, 4, 4); });
        x.strokeStyle = '#0d0d0d'; x.beginPath(); x.arc(cx, cy, 8 + Math.sin(k * 3), 0, 6.283); x.stroke();
      }
    };
    requestAnimationFrame(draw);
  });


  /* ---------- active right now: pair any live coin with a brain ---------- */
  let ACT = [], asort = 'tx', afil = '';
  const ageOf = c => { if (!c.created) return '—'; const m = (Date.now() - new Date(c.created).getTime()) / 60000; return m < 60 ? Math.round(m) + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };
  const aglobes = new Map();
  function arow(c, i, max) {
    const b = c.brain, tx = c.tx5m || 0, bw = max ? (c.buys5m || 0) / max * 100 : 0, sw = max ? (c.sells5m || 0) / max * 100 : 0;
    const sp = Math.max(.8, 6 - Math.log10(1 + tx) * 2).toFixed(2);
    return `<div class="brow" data-m="${c.mint}">
      <span class="rk">${i + 1}</span>
      <a class="co" href="/brain?m=${c.mint}">${W.img(c.image)}<div style="min-width:0"><b>$${W.esc(c.symbol)}</b><span>${W.esc(c.name || '')}</span></div></a>
      <span class="ag">${ageOf(c)}</span>
      <span>${W.$(c.mc)}</span>
      <span>${W.pct(c.ch5m)}</span>
      <span>${W.pct(c.ch1h)}</span>
      <div class="act" title="${c.buys5m || 0} buys · ${c.sells5m || 0} sells in the last 5 minutes"><div class="bars" style="--sp:${sp}s"><i class="b" style="width:${bw}%"></i><i class="s" style="width:${sw}%"></i></div><em>${tx}</em></div>
      <div class="bc">${b ? `<canvas data-seed="${c.mint}" data-iq="${b.iq}"></canvas><div class="iq">IQ ${b.iq}<small>${W.esc(b.rung)}</small></div><a class="open" href="/brain?m=${c.mint}">open →</a>` : `<button class="pair" data-m="${c.mint}" type="button">pair a brain</button>`}</div>
    </div>`;
  }
  function drawActive(animate) {
    const box = $('#arows'); if (!box) return;
    let list = ACT.slice();
    if (afil === 'no') list = list.filter(c => !c.brain); else if (afil === 'yes') list = list.filter(c => c.brain);
    const by = { tx: (a, b) => (b.tx5m || 0) - (a.tx5m || 0), ch5m: (a, b) => (b.ch5m || -1e9) - (a.ch5m || -1e9), mc: (a, b) => (b.mc || 0) - (a.mc || 0), new: (a, b) => new Date(b.created || 0) - new Date(a.created || 0) };
    list.sort(by[asort]); list = list.slice(0, 20);
    $('#acount').textContent = ACT.length ? `${ACT.filter(c => c.brain).length} of ${ACT.length} have a brain · read ${W.ago(window.__actAt)}` : '';
    if (!ACT.length) { box.innerHTML = `<div class="empty" style="margin:16px"><b>Reading Jupiter's live boards…</b>The most active pump.fun coins land here in a few seconds.</div>`; return; }
    if (!list.length) { box.innerHTML = `<div class="empty" style="margin:16px"><b>Nothing here right now.</b>Try another filter.</div>`; return; }
    const max = Math.max(...list.map(c => Math.max(c.buys5m || 0, c.sells5m || 0) * 2), 1);
    // FLIP: rows glide to their new places
    const before = new Map([...box.querySelectorAll('.brow')].map(r => [r.dataset.m, r.getBoundingClientRect().top]));
    const prevTx = new Map(ACT._prev || []);
    aglobes.forEach(g => g.stop()); aglobes.clear();
    box.innerHTML = list.map((c, i) => arow(c, i, max)).join('');
    if (!animate) box.querySelectorAll('.brow').forEach((r, i) => { r.style.setProperty('--i', i); r.classList.add('in'); });
    box.querySelectorAll('canvas[data-seed]').forEach(cv => aglobes.set(cv.dataset.seed, new W.Globe(cv, cv.dataset.seed, { iq: +cv.dataset.iq, lat: 4, lon: 7, pad: .04 })));
    box.querySelectorAll('.brow').forEach(r => {
      const old = before.get(r.dataset.m), now = r.getBoundingClientRect().top;
      if (animate && old != null && Math.abs(old - now) > 2 && !W.RM) { r.style.transform = `translateY(${old - now}px)`; r.style.transition = 'none'; requestAnimationFrame(() => { r.style.transition = 'transform .7s cubic-bezier(.2,.7,.1,1)'; r.style.transform = ''; }); }
      else if (animate && old == null) r.classList.add('flash');
      const c = ACT.find(x => x.mint === r.dataset.m); if (animate && c && prevTx.has(c.mint) && prevTx.get(c.mint) !== c.tx5m) r.classList.add('flash');
    });
    box.querySelectorAll('.pair').forEach(b => b.onclick = () => pair(b));
  }
  async function pair(btn) {
    const m = btn.dataset.m, row = btn.closest('.brow'), c = ACT.find(x => x.mint === m);
    btn.classList.add('busy'); btn.textContent = 'pairing…';
    try {
      const j = await W.api('wake', { body: { mint: m } });
      const iq = 60;
      c.brain = { iq, rung: 'dewdrop', thoughts: j.first && j.first.thought ? 1 : 0, last: j.first && j.first.thought };
      const cell = row.querySelector('.bc');
      cell.innerHTML = `<canvas></canvas><div class="iq">IQ ${iq}<small>dewdrop</small></div><a class="open" href="/brain?m=${m}">open →</a>`;
      const g = new W.Globe(cell.querySelector('canvas'), m, { iq: 70, lat: 4, lon: 7, pad: .04, think: true }); g.pulse(); aglobes.set(m, g);
      row.classList.add('born');
      if (j.first && j.first.thought) { const say = document.createElement('div'); say.className = 'say'; say.innerHTML = `<b>$${W.esc(c.symbol)}</b> `; const s = document.createElement('span'); say.appendChild(s); row.appendChild(say); W.type(s, j.first.thought, 16); }
      else W.toast('Paired. Its first thought lands on its page on its next turn.');
      window.WEBB3D && window.WEBB3D.flash(m);
      $('#acount').textContent = `${ACT.filter(x => x.brain).length} of ${ACT.length} have a brain`;
    } catch (e) { btn.classList.remove('busy'); btn.textContent = 'pair a brain'; W.toast(e.message); }
  }
  async function loadActive(first) {
    try { const j = await W.api('active'); ACT._prev = ACT.map(c => [c.mint, c.tx5m]); const prev = ACT._prev; ACT = j.list || []; ACT._prev = prev; window.__actAt = j.at; drawActive(!first); }
    catch (e) { if (!ACT.length) { const box = $('#arows'); if (box) box.innerHTML = `<div class="empty" style="margin:16px"><b>The board could not be read.</b>${W.esc(e.message)}</div>`; } }
  }
  document.querySelectorAll('#asort .chip').forEach(b => b.onclick = () => { document.querySelectorAll('#asort .chip').forEach(x => x.classList.toggle('on', x === b)); asort = b.dataset.s; drawActive(true); });
  document.querySelectorAll('#afil .chip').forEach(b => b.onclick = () => { document.querySelectorAll('#afil .chip').forEach(x => x.classList.toggle('on', x === b)); afil = b.dataset.f; drawActive(true); });

  /* ---------- the tape ---------- */
  function tape(list) {
    const el = $('#tapein'); if (!el || !list.length) return;
    const items = list.slice(0, 18).map(t => `<a href="/brain?m=${t.mint}">${W.img(t.image)}<b>$${W.esc(t.sym)}</b>${W.esc(t.body)}</a>`).join('');
    el.innerHTML = items + items;
  }

  /* ---------- cards lean toward the pointer ---------- */
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.card'); document.querySelectorAll('.card.tilt').forEach(x => { if (x !== c) { x.classList.remove('tilt'); x.style.transform = ''; } });
    if (!c || W.RM) return; const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    c.classList.add('tilt'); c.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-3px)`;
  });

  /* ---------- wake ---------- */
  const wf = $('#wake');
  if (wf) wf.onsubmit = async e => {
    e.preventDefault(); const out = $('#wakeOut'), v = $('#wakeIn').value.trim(); out.className = 'out';
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) { out.className = 'out err'; out.textContent = 'That is not a Solana token address.'; return; }
    const btn = wf.querySelector('button'); btn.disabled = true; out.innerHTML = 'Reading the market and pairing a brain <span class="dots"><i></i><i></i><i></i></span>';
    try { const j = await W.api('wake', { body: { mint: v } }); out.textContent = j.first && j.first.thought ? 'Paired. Its first thought: “' + j.first.thought + '”' : 'Paired. Opening its page…'; setTimeout(() => location.href = '/brain?m=' + v, 1400); }
    catch (err) { out.className = 'out err'; out.textContent = err.message; btn.disabled = false; }
  };

  loadWeb(true); loadBrains(); loadActive(true); loadFeed(true).then(() => setTimeout(showNext, 900));
  setInterval(() => loadActive(false), 30e3);
  setInterval(() => loadWeb(false), 20e3); setInterval(loadBrains, 60e3); setInterval(() => loadFeed(false), 15e3);
})();
