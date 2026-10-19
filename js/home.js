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
      (first ? f.list.slice(0, 8).reverse() : fresh).forEach(x => { if (x.kind !== 'talk') queue.push(x); });
      if (!first) fresh.forEach(x => window.WEBB3D && window.WEBB3D.flash(x.mint));
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

  /* ---------- wake ---------- */
  const wf = $('#wake');
  if (wf) wf.onsubmit = async e => {
    e.preventDefault(); const out = $('#wakeOut'), v = $('#wakeIn').value.trim(); out.className = 'out';
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) { out.className = 'out err'; out.textContent = 'That is not a Solana token address.'; return; }
    const btn = wf.querySelector('button'); btn.disabled = true; out.innerHTML = 'Reading the market and waking the brain <span class="dots"><i></i><i></i><i></i></span>';
    try { const j = await W.api('wake', { body: { mint: v } }); out.textContent = j.first && j.first.thought ? 'Awake. Its first thought: “' + j.first.thought + '”' : 'Awake. Opening its page…'; setTimeout(() => location.href = '/brain?m=' + v, 1400); }
    catch (err) { out.className = 'out err'; out.textContent = err.message; btn.disabled = false; }
  };

  loadWeb(true); loadBrains(); loadFeed(true).then(() => setTimeout(showNext, 900));
  setInterval(() => loadWeb(false), 60e3); setInterval(loadBrains, 60e3); setInterval(() => loadFeed(false), 15e3);
})();
