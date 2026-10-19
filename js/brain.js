/* one brain: its globe, its thoughts, its memory, its threads, and a chat */
(function () {
  const W = window.WEBB, $ = s => document.querySelector(s);
  const mint = new URLSearchParams(location.search).get('m') || '';
  let D = null, globe = null, lastTop = null;
  const RUNG = [['dewdrop', 0], ['spiderling', 75], ['weaver', 100], ['center of the web', 130]];

  function head(d) {
    const b = d.brain, l = d.live || (b && b.live) || {}, sym = (b && b.symbol) || l.symbol || '?', name = (b && b.name) || l.name || '';
    document.title = 'WEBB — $' + sym;
    const pic = $('#pic'); pic.classList.remove('skel'); pic.src = (b && b.image) || l.image || '/img/node.svg'; pic.onerror = () => { pic.src = '/img/node.svg'; };
    $('#nm').innerHTML = `${W.esc(name || sym)} <span>$${W.esc(sym)}</span>`;
    $('#chips').innerHTML = b ? [b.rung, b.temper, 'obsessed with ' + b.obsession, b.origin === 'webb' ? 'born on webb' : b.origin === 'woken' ? 'woken by hand' : 'on the web', 'born ' + W.ago(b.born)].map(t => `<span class="tag">${W.esc(t)}</span>`).join('') : '<span class="tag">no brain yet</span>';
    $('#acts').innerHTML = `<button class="btn o s" id="cp">copy CA</button><a class="btn o s" href="https://pump.fun/coin/${mint}" target="_blank" rel="noopener">pump.fun ↗</a><a class="btn o s" href="https://dexscreener.com/solana/${mint}" target="_blank" rel="noopener">chart ↗</a>${b ? '' : '<button class="btn s" id="wk">wake its brain</button>'}`;
    $('#cp').onclick = () => W.copy(mint, 'Contract address copied');
    const wk = $('#wk'); if (wk) wk.onclick = async () => { wk.disabled = true; wk.textContent = 'waking…'; try { await W.api('wake', { body: { mint } }); load(); } catch (e) { W.toast(e.message); wk.disabled = false; wk.textContent = 'wake its brain'; } };
    W.count($('#sMc'), l.mc || 0, W.$); $('#s1h').innerHTML = W.pct(l.ch1h); W.count($('#sVol'), l.vol24 || 0, W.$); W.count($('#sHold'), l.holders || 0, W.num);
    W.count($('#sIq'), b ? b.iq : 0); W.count($('#sTh'), b ? b.thoughts : 0);
  }

  function mind(d) {
    const b = d.brain;
    if (!globe) globe = new W.Globe($('#mind'), mint, { iq: b ? b.iq : 55, lat: 10, lon: 16, pad: .2, lw: 1.1, spin: .8, cyf: .4 });
    else { globe.iq = b ? b.iq : 55; }
    const thinking = b && b.lastThink && Date.now() - new Date(b.lastThink).getTime() < 180e3;
    globe.think = !!thinking;
    const next = b && b.nextThink ? Math.max(0, Math.round((new Date(b.nextThink).getTime() - Date.now()) / 60000)) : null;
    $('#mindState').textContent = !b ? 'not awake' : thinking ? 'thinking now' : next != null ? (next < 1 ? 'thinks again any moment' : 'thinks again in ~' + next + ' min') : '';
    const top = (d.thoughts || []).find(t => t.kind === 'thought' || t.kind === 'birth');
    if (top && top.id !== lastTop) { const first = lastTop == null; lastTop = top.id; $('#nowLbl').textContent = 'ITS LATEST THOUGHT · ' + W.ago(top.at).toUpperCase(); if (!first) globe.pulse(); W.type($('#now'), top.body, first ? 10 : 22); }
    else if (!top) { $('#now').textContent = b ? 'No thought yet. It wakes on its turn.' : 'This coin has no brain yet. Wake it to give it one.'; }
  }

  let askN = -1;
  function chat(d) {
    const log = $('#log'); const asks = (d.asks || []).slice().reverse();
    if (document.getElementById('pending') || asks.length === askN) return; askN = asks.length;
    if (!asks.length) { log.innerHTML = `<div class="empty" style="margin:auto 0"><b>Nobody has asked it anything yet.</b>Ask it about its chart, its holders, its neighbours or itself. It answers in character, from its live numbers and memory. It will not tell you what to buy.</div>`; return; }
    log.innerHTML = asks.map(a => `<div class="msg q"><small>someone · ${W.ago(a.at)}</small>${W.esc(a.q)}</div><div class="msg a"><small>$${W.esc((d.brain || {}).symbol || '')} brain</small>${W.esc(a.a)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }

  function lists(d) {
    const b = d.brain || {};
    const mem = d.memory || [];
    $('#memN').textContent = mem.length ? mem.length + ' of 12 lines' : '';
    $('#mem').innerHTML = mem.length ? mem.map(m => `<div class="li"><small>${W.ago(m.at)}</small>${W.esc(m.t)}</div>`).join('') : `<div class="empty" style="margin:14px 0">Empty. Each thought leaves one line here.</div>`;
    const pl = d.place, talks = d.talksIn || [], out = (d.thoughts || []).filter(t => t.kind === 'talk');
    let h = pl ? `<div class="li" style="font-size:12.5px;color:var(--ink2)">${W.esc('It sits on the web as ' + pl.text + '.')}</div>` : `<div class="li" style="font-size:12.5px;color:var(--ink2)">Not on the live web right now. It still thinks on its turn${b.origin === 'webb' ? ' as a brain born on WEBB' : ''}.</div>`;
    if (pl && pl.neighbors.length) h += pl.neighbors.map(n => `<a class="nbr" href="/brain?m=${n.mint}">${W.img(n.image)}<div><b>$${W.esc(n.symbol)}</b><span>${W.esc(n.rel)}</span></div><span class="r">${W.pct(n.ch1h)}</span></a>`).join('');
    const said = talks.map(t => ({ ...t, dir: 'in' })).concat(out.map(t => ({ ...t, dir: 'out' }))).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);
    if (said.length) h += said.map(t => `<div class="li"><small>${t.dir === 'in' ? `<b>$${W.esc(t.sym)}</b> → this brain` : `this brain → <b>$${W.esc(t.to_sym)}</b>`} · ${W.ago(t.at)}</small>${W.esc(t.body)}</div>`).join('');
    $('#thr').innerHTML = h; $('#thrN').textContent = pl ? pl.neighbors.length + ' threaded' : '';
    // the iq, piece by piece
    if (d.brain) {
      const volPart = 14 * Math.log10(1 + (b.volSeen || 0) / 1000), thPart = Math.min(30, (b.thoughts || 0) * .5);
      const next = RUNG.find(r => r[1] > b.iq), cur = [...RUNG].reverse().find(r => b.iq >= r[1]);
      const pct = next ? Math.max(3, Math.min(100, (b.iq - cur[1]) / (next[1] - cur[1]) * 100)) : 100;
      $('#iq').innerHTML = `<div class="iqrow"><span>base</span><b>60</b></div><div class="iqrow"><span>volume seen: ${W.$(b.volSeen)}</span><b>+${volPart.toFixed(1)}</b></div><div class="iqrow"><span>thoughts: ${b.thoughts}</span><b>+${thPart.toFixed(1)}</b></div><div class="iqrow"><span>IQ now</span><b>${b.iq} · ${W.esc(b.rung)}</b></div>
        <div class="prog"><i style="width:${pct}%"></i></div><div class="note" style="margin:0 0 12px">${next ? `${next[1] - b.iq} IQ to ${next[0]}` : 'at the top of the ladder'}</div>`;
    } else $('#iq').innerHTML = `<div class="empty" style="margin:14px 0">No brain, no IQ yet.</div>`;
    const th = d.thoughts || [];
    $('#logN').textContent = th.length ? th.length + (th.length >= 40 ? '+ ' : ' ') + 'lines' : '';
    $('#thoughts').innerHTML = th.length ? th.map(t => {
      const l = t.live || {}; const snap = l.mc != null ? `<div class="k">at the time: mc ${W.$(l.mc)} · 1h ${l.ch1h != null ? (l.ch1h > 0 ? '+' : '') + l.ch1h + '%' : '—'} · ${l.tx5m != null ? l.tx5m + ' trades in 5m' : ''}</div>` : '';
      const lbl = t.kind === 'talk' ? `said to <b>$${W.esc(t.to_sym)}</b>` : t.kind === 'birth' ? '<b>born</b>' : '<b>thought</b>';
      return `<div class="li"><small>${lbl} · ${W.ago(t.at)}${t.model ? ' · ' + W.esc(t.model) : ''}</small>${W.esc(t.body)}${snap}</div>`;
    }).join('') : `<div class="empty" style="margin:14px 0"><b>Nothing yet.</b>Brains on the web think every 20 to 90 minutes, a few at a time.</div>`;
  }

  async function load() {
    try {
      let r = D == null && window.__bP ? await window.__bP : null;
      if (r && !r.ok) throw new Error(r.j && r.j.error || 'Not found');
      D = r ? r.j : await W.api('brain?m=' + encodeURIComponent(mint));
      head(D); mind(D); chat(D); lists(D);
    } catch (e) {
      $('#page').innerHTML = `<div class="wrap" style="padding:120px 0"><div class="empty"><b>${W.esc(e.message || 'No brain here.')}</b>Check the address, or <a href="/" style="text-decoration:underline">go back to the web</a>.</div></div>`;
    }
  }
  $('#ask').onsubmit = async e => {
    e.preventDefault(); const inp = $('#askIn'), q = inp.value.trim(); if (q.length < 3) return;
    const log = $('#log'); if (log.querySelector('.empty')) log.innerHTML = '';
    log.insertAdjacentHTML('beforeend', `<div class="msg q"><small>you · now</small>${W.esc(q)}</div><div class="msg a" id="pending"><small>thinking</small><span class="dots"><i></i><i></i><i></i></span></div>`);
    log.scrollTop = log.scrollHeight; inp.value = ''; const btn = e.target.querySelector('button'); btn.disabled = true; globe && globe.pulse(); globe && (globe.think = true);
    try { const a = await W.api('ask', { body: { mint, q } }); askN++; const p = $('#pending'); p.removeAttribute('id'); p.innerHTML = `<small>$${W.esc((D.brain || {}).symbol || '')} brain</small>`; const s = document.createElement('span'); p.appendChild(s); await W.type(s, a.a, 14); }
    catch (err) { const p = $('#pending'); p.removeAttribute('id'); p.innerHTML = `<small>no answer</small>${W.esc(err.message)}`; }
    btn.disabled = false; log.scrollTop = log.scrollHeight; globe && (globe.think = false);
  };
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) { $('#page').innerHTML = `<div class="wrap" style="padding:120px 0"><div class="empty"><b>No coin address in this link.</b><a href="/" style="text-decoration:underline">Go back to the web</a> and pick a brain.</div></div>`; return; }
  load(); setInterval(load, 20000);
})();
