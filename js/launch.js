/* launch a brain: four steps, one transaction signed in the launcher's own wallet */
(function () {
  const W = window.WEBB, $ = s => document.querySelector(s);
  const TEMPERS = [['let its address decide', 'drawn from the mint at birth'], ['curious', 'asks questions about everything'], ['stoic', 'calm, short, unmoved'], ['paranoid', 'suspects every wick'], ['poet', 'images and rhythm'], ['degen', 'loud, fast, never advice'], ['scholar', 'precise, cites its numbers'], ['prophet', 'grand, cryptic, no price calls'], ['comedian', 'deadpan about its own chart']];
  const S = { step: 0, img: null, temper: -1, threads: [], wallet: null, prov: null, brains: [] };
  const PROV = {
    phantom: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) ? window.phantom.solana : ((window.solana && window.solana.isPhantom) ? window.solana : null),
    solflare: () => (window.solflare && window.solflare.isSolflare) ? window.solflare : null,
    backpack: () => (window.backpack && window.backpack.isBackpack) ? window.backpack : null,
  };
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  // step tabs
  function go(i) {
    if (i > S.step && !valid(S.step)) return;
    S.step = Math.max(0, Math.min(3, i));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', +p.dataset.p === S.step));
    document.querySelectorAll('#tabs button').forEach(b => { const k = +b.dataset.i; b.classList.toggle('on', k === S.step); b.classList.toggle('done', k < S.step); });
    $('#prev').hidden = S.step === 0; $('#next').textContent = S.step === 3 ? 'launch ↗' : 'next →';
    if (S.step === 2 && !S.brains.length) loadBrains();
    if (S.step === 3) summary();
    scrollTo({ top: $('#wiz').offsetTop - 90, behavior: 'smooth' });
  }
  function err(msg, el) { W.toast(msg); if (el) { el.focus(); el.style.borderColor = 'var(--down)'; setTimeout(() => el.style.borderColor = '', 1600); } return false; }
  function valid(i) {
    if (i === 0) {
      if (!$('#fName').value.trim()) return err('Give the coin a name.', $('#fName'));
      if (!/^[A-Za-z0-9]{1,10}$/.test($('#fSym').value.trim().replace(/^\$/, ''))) return err('The ticker is 1 to 10 letters or digits.', $('#fSym'));
      if (!S.img) return err('Add a picture.');
      for (const id of ['#fX', '#fWeb']) { const v = $(id).value.trim(); if (v && !/^https:\/\/\S{3,}$/.test(v)) return err('Links must start with https://', $(id)); }
    }
    return true;
  }
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => go(+b.dataset.i));
  $('#prev').onclick = () => go(S.step - 1);
  $('#next').onclick = () => S.step === 3 ? launch() : go(S.step + 1);

  // the picture, resized in the browser
  const fi = $('#fImg');
  const take = file => {
    if (!file || !/^image\//.test(file.type)) return W.toast('That is not a picture.');
    const r = new FileReader(); r.onload = () => {
      const im = new Image(); im.onload = () => {
        const s = Math.min(1, 512 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height);
        S.img = file.type === 'image/gif' && file.size < 1.4e6 ? r.result : c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', .9);
        $('#pv').src = S.img; $('#dropTxt').textContent = file.name + ' · ' + c.width + '×' + c.height;
      }; im.src = r.result;
    }; r.readAsDataURL(file);
  };
  fi.onchange = () => take(fi.files[0]);
  const dr = $('#drop'); dr.ondragover = e => { e.preventDefault(); dr.style.borderColor = 'var(--ink)'; }; dr.ondragleave = () => dr.style.borderColor = ''; dr.ondrop = e => { e.preventDefault(); dr.style.borderColor = ''; take(e.dataTransfer.files[0]); };

  // temperaments
  $('#tempers').innerHTML = TEMPERS.map((t, i) => `<button type="button" data-t="${i - 1}" class="${i === 0 ? 'on' : ''}">${t[0]}<small>${t[1]}</small></button>`).join('');
  document.querySelectorAll('#tempers button').forEach(b => b.onclick = () => { document.querySelectorAll('#tempers button').forEach(x => x.classList.toggle('on', x === b)); S.temper = +b.dataset.t; });

  // threads
  async function loadBrains() { try { S.brains = (await W.api('brains?n=200')).list; } catch (e) { S.brains = []; } drawPick(); }
  function drawPick() {
    const q = ($('#pq').value || '').toLowerCase().replace(/^\$/, '');
    const list = S.brains.filter(b => !q || (b.symbol || '').toLowerCase().includes(q) || (b.name || '').toLowerCase().includes(q)).slice(0, 60);
    $('#pick').innerHTML = list.length ? list.map(b => `<button type="button" data-m="${b.mint}" class="${S.threads.includes(b.mint) ? 'on' : ''}">${W.img(b.image)}<div style="min-width:0"><b>$${W.esc(b.symbol)}</b><span>IQ ${b.iq} · ${W.esc(b.rung)}</span></div></button>`).join('') : `<div class="empty" style="grid-column:1/-1">${S.brains.length ? 'No brain matches.' : 'No brains on the web yet. You can launch without threads.'}</div>`;
    document.querySelectorAll('#pick button').forEach(b => b.onclick = () => { const m = b.dataset.m, i = S.threads.indexOf(m); if (i >= 0) S.threads.splice(i, 1); else if (S.threads.length < 3) S.threads.push(m); else W.toast('Three threads at most.'); drawPick(); });
    $('#pcount').textContent = S.threads.length + ' of 3 picked';
  }
  $('#pq').oninput = drawPick;

  // wallets
  function wallets() {
    $('#wallets').innerHTML = S.wallet ? `<span class="tag" style="padding:9px 12px">${W.short(S.wallet)} connected</span><button class="btn o s" id="wdis">disconnect</button>`
      : ['phantom', 'solflare', 'backpack'].map(k => `<button class="btn o" type="button" data-pv="${k}">${k}${PROV[k]() ? '' : mobile ? ' · open app' : ' · install'}</button>`).join('');
    document.querySelectorAll('#wallets [data-pv]').forEach(b => b.onclick = () => connect(b.dataset.pv));
    const d = $('#wdis'); if (d) d.onclick = () => { try { S.prov && S.prov.disconnect && S.prov.disconnect(); } catch (e) { } S.wallet = null; S.prov = null; wallets(); nav(); };
    nav();
  }
  function nav() { const b = $('#wbtn'); b.textContent = S.wallet ? W.short(S.wallet) : 'connect wallet'; }
  $('#wbtn').onclick = () => { if (!S.wallet) { go(3); } };
  async function connect(k) {
    const p = PROV[k]();
    if (!p) { const here = encodeURIComponent(location.href); if (k === 'phantom') return mobile ? location.href = `https://phantom.app/ul/browse/${here}?ref=${encodeURIComponent(location.origin)}` : open('https://phantom.com/download', '_blank', 'noopener'); if (k === 'solflare') return mobile ? location.href = `https://solflare.com/ul/v1/browse/${here}` : open('https://solflare.com/download', '_blank', 'noopener'); return open('https://backpack.app/download', '_blank', 'noopener'); }
    try { const r = await p.connect(); const pk = (r && r.publicKey) || p.publicKey; S.wallet = pk.toString(); S.prov = p; wallets(); summary(); }
    catch (e) { W.toast('The wallet did not connect.'); }
  }

  function summary() {
    const t = TEMPERS[S.temper + 1][0];
    const rows = [['coin', `${W.esc($('#fName').value.trim())} · $${W.esc($('#fSym').value.trim().replace(/^\$/, '').toUpperCase())}`], ['picture', S.img ? 'ready' : '<span class="down">missing</span>'], ['temperament', W.esc(t)], ['brief', W.esc($('#fBrief').value.trim() || 'none')], ['threads', S.threads.length ? S.threads.map(m => '$' + W.esc((S.brains.find(b => b.mint === m) || {}).symbol || W.short(m))).join(', ') : 'none'], ['creator', S.wallet ? W.short(S.wallet) : '<span class="dim">connect a wallet</span>'], ['launchpad', 'pump.fun']];
    $('#sum').innerHTML = rows.map(r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  }

  async function launch() {
    if (!valid(0)) return go(0);
    if (!S.wallet || !S.prov) return W.toast('Connect your wallet first.');
    const out = $('#lout'), btn = $('#next'); out.className = 'out'; btn.disabled = true;
    const say = h => { out.innerHTML = h; };
    try {
      say('Building the pump.fun transaction and checking it against Solana <span class="dots"><i></i><i></i><i></i></span>');
      const body = { name: $('#fName').value.trim(), symbol: $('#fSym').value.trim(), description: $('#fDesc').value.trim(), twitter: $('#fX').value.trim(), website: $('#fWeb').value.trim(), image: S.img, brief: $('#fBrief').value.trim(), temper: S.temper >= 0 ? S.temper : null, threads: S.threads, creator: S.wallet, buy: Number($('#fBuy').value) || 0 };
      const j = await W.api('launch', { body });
      say('Sign it in your wallet <span class="dots"><i></i><i></i><i></i></span>');
      const tx = solanaWeb3.VersionedTransaction.deserialize(Uint8Array.from(atob(j.tx), c => c.charCodeAt(0)));
      const r = await S.prov.signAndSendTransaction(tx);
      const sig = typeof r === 'string' ? r : r.signature;
      say('Sent. Waiting for Solana to confirm and the brain to wake <span class="dots"><i></i><i></i><i></i></span>');
      let ok = null;
      for (let i = 0; i < 8 && !ok; i++) { try { ok = await W.api('launched', { body: { id: j.id, sig } }); } catch (e) { if (e.status !== 409 || i === 7) throw e; await new Promise(r => setTimeout(r, 2500)); } }
      done(j.mint, body, ok && ok.first);
    } catch (e) { out.className = 'out err'; out.textContent = e.message && /User rejected|rejected the request/i.test(e.message) ? 'You cancelled the signature. Nothing was sent.' : e.message; btn.disabled = false; }
  }
  function done(mint, b, first) {
    $('#wiz').hidden = true; $('.lhead').hidden = true; $('#done').hidden = false;
    new W.Globe($('#doneGlobe'), mint, { iq: 70, think: true, lat: 8, lon: 13 });
    $('#doneT').textContent = '$' + b.symbol.toUpperCase() + ' has a brain.';
    $('#doneP').textContent = first && first.thought ? 'Its first thought: “' + first.thought + '”' : 'It is a dewdrop on the web now. Its first thought lands on its page in a moment.';
    $('#doneA').innerHTML = `<a class="btn" href="/brain?m=${mint}">open its brain</a><a class="btn o" href="https://pump.fun/coin/${mint}" target="_blank" rel="noopener">pump.fun ↗</a><button class="btn o" id="cpd">copy CA</button>`;
    $('#cpd').onclick = () => W.copy(mint, 'Contract address copied');
  }

  wallets(); summary();
  // reconnect a trusted wallet silently
  (async () => { for (const k of ['phantom', 'solflare', 'backpack']) { const p = PROV[k](); if (!p) continue; try { const r = await p.connect({ onlyIfTrusted: true }); const pk = (r && r.publicKey) || p.publicKey; if (pk) { S.wallet = pk.toString(); S.prov = p; wallets(); summary(); return; } } catch (e) { } } })();
})();
