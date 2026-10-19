/* WEBB shared: data, formatting, the brain-globes, the drifting ground, reveals */
(function () {
  const W = window.WEBB = {};
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  W.RM = RM;
  W.api = async (path, opt) => {
    const r = await fetch('/api/' + path, opt && opt.body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(opt.body) } : { cache: 'no-store' });
    const j = await r.json().catch(() => ({ error: 'No answer from the server.' }));
    if (!r.ok || j.ok === false) { const e = new Error(j.error || 'Request failed (' + r.status + ')'); e.status = r.status; throw e; }
    return j;
  };
  W.$ = n => n == null || isNaN(n) ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K' : '$' + Math.round(n);
  W.num = n => n == null || isNaN(n) ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString('en-US');
  W.pct = n => n == null || isNaN(n) ? '<span class="dim">—</span>' : `<span class="${n > 0 ? 'up' : n < 0 ? 'down' : ''}">${n > 0 ? '+' : ''}${Math.abs(n) >= 100 ? Math.round(n) : (+n).toFixed(1)}%</span>`;
  W.ago = t => { if (!t) return '—'; const s = Math.max(1, (Date.now() - new Date(t).getTime()) / 1000); return s < 60 ? Math.round(s) + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
  W.short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  W.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  W.img = (u, cls) => `<img ${cls ? `class="${cls}" ` : ''}src="${W.esc(u || '/img/node.svg')}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/img/node.svg'">`;
  W.toast = (msg) => { let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2400); };
  W.copy = (txt, msg) => { navigator.clipboard && navigator.clipboard.writeText(txt).then(() => W.toast(msg || 'Copied'), () => W.toast('Copy failed')); };
  W.hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  W.rand = seed => { let s = seed || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; }; };
  W.count = (el, to, fmt, ms = 1200) => {
    if (!el) return; const from = Number(el.dataset.v || 0); el.dataset.v = to;
    if (RM || from === to) { el.textContent = fmt ? fmt(to) : Math.round(to).toLocaleString('en-US'); return; }
    const t0 = performance.now(); const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e; el.textContent = fmt ? fmt(v) : Math.round(v).toLocaleString('en-US'); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
  };
  W.type = (el, text, speed = 16) => new Promise(res => {
    if (!el) return res(); clearTimeout(el._tt); if (RM) { el.textContent = text; return res(); }
    let i = 0; el.textContent = ''; const caret = document.createElement('span'); caret.className = 'caret';
    const go = () => { el.textContent = text.slice(0, i); el.appendChild(caret); i += 1 + (Math.random() < .3 ? 1 : 0); if (i <= text.length) el._tt = setTimeout(go, speed + Math.random() * speed); else { el._tt = setTimeout(() => { caret.remove(); res(); }, 900); } };
    go();
  });

  /* ---------- the brain-globe: every brain draws its own wireframe globe from its mint ---------- */
  const globes = new Set();
  class Globe {
    constructor(canvas, seed, o = {}) {
      this.c = canvas; this.x = canvas.getContext('2d'); const r = W.rand(W.hash(String(seed || 'webb')));
      this.lat = o.lat || 5 + Math.floor(r() * 6); this.lon = o.lon || 8 + Math.floor(r() * 9);
      this.tilt = o.tilt != null ? o.tilt : .25 + r() * .5; this.spin = (o.spin || 1) * (.12 + r() * .18) * (r() < .5 ? -1 : 1); this.rot = r() * 6.28;
      this.cyf = o.cyf || .5; this.iq = o.iq || 60; this.think = !!o.think; this.ink = o.ink || '13,13,13'; this.pad = o.pad != null ? o.pad : .08; this.lw = o.lw || 1;
      const n = Math.max(3, Math.min(40, Math.round((this.iq - 50) / 2)));
      this.neu = Array.from({ length: n }, () => ({ a: r() * 6.28, b: Math.acos(2 * r() - 1), p: r() * 6.28, s: .6 + r() * 1.6 }));
      this.links = this.neu.map((nn, i) => [i, Math.floor(r() * n)]).filter(([a, b]) => a !== b).slice(0, Math.floor(n * .6));
      this.fire = 0; this.vis = true; this.size(); globes.add(this);
      if ('IntersectionObserver' in window) { this.io = new IntersectionObserver(es => { this.vis = es[0].isIntersecting; }); this.io.observe(canvas); }
      this.draw(0);
    }
    size() { const d = Math.min(2, window.devicePixelRatio || 1), b = this.c.getBoundingClientRect(); this.w = Math.max(10, b.width); this.h = Math.max(10, b.height); this.c.width = Math.round(this.w * d); this.c.height = Math.round(this.h * d); this.x.setTransform(d, 0, 0, d, 0, 0); }
    pulse() { this.fire = 1; }
    p3(a, b) { // point on the unit sphere (azimuth a, polar b), rotated
      let x = Math.sin(b) * Math.cos(a + this.rot), y = Math.cos(b), z = Math.sin(b) * Math.sin(a + this.rot);
      const ct = Math.cos(this.tilt), st = Math.sin(this.tilt); const y2 = y * ct - z * st, z2 = y * st + z * ct; return [x, y2, z2];
    }
    draw(t) {
      const { x, w, h } = this; x.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * (.5 - this.pad), cx = w / 2, cy = h * this.cyf;
      const seg = (pts) => { for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const front = a[2] + b[2] > 0; x.strokeStyle = `rgba(${this.ink},${front ? .82 : .1})`; x.beginPath(); x.moveTo(cx + a[0] * R, cy - a[1] * R); x.lineTo(cx + b[0] * R, cy - b[1] * R); x.stroke(); } };
      x.lineWidth = this.lw;
      for (let i = 1; i < this.lat; i++) { const b = Math.PI * i / this.lat, pts = []; for (let k = 0; k <= 48; k++) pts.push(this.p3(k / 48 * 6.283, b)); seg(pts); }
      for (let j = 0; j < this.lon; j++) { const a = 6.283 * j / this.lon, pts = []; for (let k = 0; k <= 32; k++) pts.push(this.p3(a, Math.PI * k / 32)); seg(pts); }
      x.strokeStyle = `rgba(${this.ink},.9)`; x.beginPath(); x.arc(cx, cy, R, 0, 6.283); x.stroke();
      // neurons: lit squares on the sphere, synapses between them
      const f = this.fire, P = this.neu.map(n => this.p3(n.a, n.b));
      x.lineWidth = .9;
      for (const [i, j] of this.links) { const a = P[i], b = P[j]; if (a[2] < 0 || b[2] < 0) continue; const k = .5 + .5 * Math.sin(t / 600 + this.neu[i].p); x.strokeStyle = `rgba(${this.ink},${(.08 + .35 * f) * k})`; x.beginPath(); x.moveTo(cx + a[0] * R, cy - a[1] * R); x.lineTo(cx + b[0] * R, cy - b[1] * R); x.stroke(); }
      this.neu.forEach((n, i) => { const p = P[i]; if (p[2] < -.05) return; const k = .5 + .5 * Math.sin(t / 1000 * n.s + n.p); const s = (1.6 + 2.2 * k * (this.think ? 1.3 : 1) + f * 2.5) * (.6 + .4 * p[2]); x.fillStyle = `rgba(${this.ink},${.35 + .6 * Math.max(k, f)})`; x.fillRect(cx + p[0] * R - s / 2, cy - p[1] * R - s / 2, s, s); });
      this.fire = Math.max(0, f - .015);
    }
    tick(t, dt) { if (!this.vis) return; this.rot += this.spin * dt * (this.think ? 1.8 : 1); this.draw(t); }
    stop() { globes.delete(this); this.io && this.io.disconnect(); }
  }
  W.Globe = Globe;
  let last = performance.now();
  const loop = t => { const dt = Math.min(.05, (t - last) / 1000); last = t; if (!document.hidden) globes.forEach(g => g.tick(t, dt)); requestAnimationFrame(loop); };
  if (!RM) requestAnimationFrame(loop);
  addEventListener('resize', () => globes.forEach(g => { g.size(); g.draw(performance.now()); }));

  /* ---------- the ground: a drifting dot field with crosshairs and specks ---------- */
  function ground() {
    const c = document.getElementById('ground'); if (!c) return;
    const x = c.getContext('2d'); let w, h, d;
    const fit = () => { d = Math.min(2, devicePixelRatio || 1); w = innerWidth; h = innerHeight; c.width = w * d; c.height = h * d; x.setTransform(d, 0, 0, d, 0, 0); };
    fit(); addEventListener('resize', fit);
    const r = W.rand(7);
    // two orb webs hang in the background: one big on the right, one small on the left. they turn slowly, sway with the
    // pointer, ripple when something happens, and pulses run down their spokes toward their hubs.
    const mkWeb = (fx, fy, R, spokes, seed) => {
      const rr = W.rand(seed), ang = [...Array(spokes).keys()].map(i => (i + (rr() - .5) * .35) / spokes * 6.283), rim = ang.map(() => .82 + rr() * .2);
      const rings = []; for (let q = .07; q < .96; q += .045 + rr() * .012) rings.push(q);
      return { fx, fy, R, ang, rim, rings, rot: rr() * 6, spin: (rr() < .5 ? 1 : -1) * (.008 + rr() * .01), pulses: [], acc: 0 };
    };
    const webs = [mkWeb(.86, .34, 1.0, 26, 3), mkWeb(.08, .86, .55, 18, 9)];
    const specks = Array.from({ length: 22 }, () => ({ x: r(), y: r(), s: r() < .3 ? 3 : 2, v: .2 + r() * .6, plus: r() < .35 }));
    let mx = .5, my = .5, sy = 0, ripple = 0;
    addEventListener('pointermove', e => { mx = e.clientX / w; my = e.clientY / h; }, { passive: true });
    addEventListener('scroll', () => { const n = scrollY; ripple = Math.min(1, ripple + Math.abs(n - sy) / 900); sy = n; }, { passive: true });
    W.ripple = () => { ripple = 1; webs.forEach(wb => { for (let i = 0; i < 6; i++) wb.pulses.push({ s: Math.floor(Math.random() * wb.ang.length), p: 1, v: .25 + Math.random() * .2 }); }); };
    let t0 = performance.now(), lastF = 0, lastT = t0;
    const draw = t => {
      requestAnimationFrame(draw); if (document.hidden || t - lastF < 33) return; lastF = t;
      const k = (t - t0) / 1000, dt = Math.min(.1, (t - lastT) / 1000); lastT = t; x.clearRect(0, 0, w, h);
      ripple = Math.max(0, ripple - dt * .6);
      // drifting dot field
      const g = 28, ox = (k * 4) % g, oy = ((k * 2.4) - sy * .15) % g;
      for (let yy = -g + oy; yy < h + g; yy += g) for (let xx = -g + ox; xx < w + g; xx += g) {
        const wave = .5 + .5 * Math.sin(xx * .006 + yy * .004 + k * .7);
        x.fillStyle = `rgba(13,13,13,${.035 + .055 * wave})`; x.fillRect(xx, yy, 1.3, 1.3);
      }
      // the webs
      for (const wb of webs) {
        wb.rot += wb.spin * dt * (1 + ripple * 6);
        const S = Math.max(w, h) * wb.R * .62, cx = w * wb.fx + (mx - .5) * 26, cy = h * wb.fy + (my - .5) * 18 - (sy * .08) % (h * .2);
        const P = (a, q) => { const sway = 1 + .012 * Math.sin(k * 1.3 + a * 3) + ripple * .02 * Math.sin(q * 30 - k * 8); return [cx + Math.cos(a + wb.rot) * q * S * sway, cy + Math.sin(a + wb.rot) * q * S * sway * .92]; };
        x.lineWidth = 1;
        x.strokeStyle = 'rgba(13,13,13,.075)';
        x.beginPath();
        wb.ang.forEach((a, i) => { const [x1, y1] = P(a, 0), [x2, y2] = P(a, wb.rim[i]); x.moveTo(x1, y1); x.lineTo(x2, y2); });
        x.stroke();
        x.strokeStyle = 'rgba(13,13,13,.06)';
        x.beginPath();
        for (const q of wb.rings) {
          for (let i = 0; i < wb.ang.length; i++) {
            const j = (i + 1) % wb.ang.length; if (q > Math.min(wb.rim[i], wb.rim[j])) continue;
            const a1 = wb.ang[i], a2 = j ? wb.ang[j] : wb.ang[0] + 6.283;
            const [x1, y1] = P(a1, q), [x2, y2] = P(a2, q), [xm, ym] = P((a1 + a2) / 2, q * .94);
            x.moveTo(x1, y1); x.quadraticCurveTo(xm * 2 - (x1 + x2) / 2, ym * 2 - (y1 + y2) / 2, x2, y2);
          }
        }
        x.stroke();
        // pulses toward the hub
        wb.acc += dt * .9; while (wb.acc > 1) { wb.acc -= 1; wb.pulses.push({ s: Math.floor(Math.random() * wb.ang.length), p: wb.rim[0], v: .12 + Math.random() * .12 }); }
        x.fillStyle = 'rgba(13,13,13,.32)';
        for (let i = wb.pulses.length - 1; i >= 0; i--) { const q = wb.pulses[i]; q.p -= q.v * dt; if (q.p < .04) { wb.pulses.splice(i, 1); continue; } const [px, py] = P(wb.ang[q.s], q.p); x.fillRect(px - 2, py - 2, 4, 4); }
        const [hx, hy] = P(0, 0); x.strokeStyle = 'rgba(13,13,13,.18)'; x.beginPath(); x.arc(hx, hy, 5 + Math.sin(k * 2) * 1.5, 0, 6.283); x.stroke();
      }
      for (const s of specks) {
        const px = ((s.x * w + k * 6 * s.v) % (w + 40)) - 20, py = ((s.y * h + Math.sin(k * .3 + s.x * 9) * 12 - sy * .05 * s.v) % h + h) % h;
        x.fillStyle = 'rgba(13,13,13,.25)'; x.strokeStyle = 'rgba(13,13,13,.25)';
        if (s.plus) { x.lineWidth = 1; x.beginPath(); x.moveTo(px - 5, py); x.lineTo(px + 5, py); x.moveTo(px, py - 5); x.lineTo(px, py + 5); x.stroke(); }
        else x.fillRect(px, py, s.s, s.s);
      }
    };
    if (!RM) requestAnimationFrame(draw); else draw(performance.now());
  }

  /* ---------- the scroll thread: a strand down the left edge, a spider of progress on it ---------- */
  function thread() {
    if (innerWidth < 900) return;
    const el = document.createElement('div'); el.className = 'strand'; el.innerHTML = '<i></i><b></b>'; document.body.appendChild(el);
    const dot = el.querySelector('b'), fill = el.querySelector('i');
    const up = () => { const m = document.documentElement.scrollHeight - innerHeight, p = m > 0 ? scrollY / m : 0; fill.style.transform = `scaleY(${p})`; dot.style.top = (p * 100) + '%'; };
    addEventListener('scroll', up, { passive: true }); up();
  }

  /* ---------- reveals ---------- */
  function splitWords(el) {
    if (el.dataset.split) return; el.dataset.split = 1; let i = 0;
    const walk = node => [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) { const f = document.createDocumentFragment(); ch.textContent.split(/(\s+)/).forEach(p => { if (!p) return; if (/^\s+$/.test(p)) f.appendChild(document.createTextNode(p)); else { const s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--i', i++); s.textContent = p; f.appendChild(s); } }); ch.replaceWith(f); }
      else if (ch.nodeType === 1 && ch.tagName !== 'BR') walk(ch);
    });
    walk(el);
  }
  function reveals() {
    document.querySelectorAll('.split').forEach(splitWords);
    const els = document.querySelectorAll('.rv:not(.vis)');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('vis')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
    const sweep = () => document.querySelectorAll('.rv:not(.vis)').forEach(e => { if (e.getBoundingClientRect().top < innerHeight) e.classList.add('vis'); });
    addEventListener('hashchange', sweep); setTimeout(sweep, 1200);
    const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('seen'); so.unobserve(e.target); W.ripple && W.ripple(); } }), { rootMargin: '0px 0px -20% 0px' });
    document.querySelectorAll('.sec').forEach(s => so.observe(s));
  }
  W.reveals = reveals;
  W.cardsIn = root => { const cs = (root || document).querySelectorAll('.card:not(.in-view)'); cs.forEach((c, i) => setTimeout(() => c.classList.add('in-view'), 40 + i * 45)); };

  document.addEventListener('DOMContentLoaded', () => {
    ground(); reveals(); thread();
    const mk = document.querySelector('.nav .l canvas'); if (mk) new Globe(mk, 'webb-mark', { lat: 6, lon: 10, tilt: .35, pad: .04, iq: 64, spin: 1.2 });
    const p = location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav .c a').forEach(a => { const h = a.getAttribute('href'); if (h === p || (h !== '/' && p.startsWith(h))) a.classList.add('on'); });
  });
})();
