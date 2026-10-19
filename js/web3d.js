/* The live web: a 3D orb web whose threads ripple with real trades. Every node is a real pump.fun coin and its brain.
 * Hubs (runners) sit on spokes, closer to the center the stronger they run; the coins riding a hub's name sit further
 * out on the same spoke. Pulses travel along a spoke at a rate set by that coin's real trades in the last 5 minutes. */
import * as THREE from '/js/three.module.min.js';

const BG = 0xf6f6f4, INK = new THREE.Color(0x0d0d0d);
const cv = document.getElementById('web3d'); if (!cv) throw 0;
const host = cv.parentElement, labels = host.querySelector('.labels'), tip = host.querySelector('.tipcard');
const W = window.WEBB, mob = innerWidth < 760;
const R = 42, SPOKES = mob ? 32 : 44, STEP = mob ? 1.35 : 1.08;

const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(BG, 1);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(30, 1, .1, 300);
const G = new THREE.Group(); scene.add(G);

// ripple sources: x, z, amplitude, phase (8 of them, fed by the busiest coins)
const SRC = Array.from({ length: 8 }, () => new THREE.Vector4(999, 999, 0, 0));
const U = { uT: { value: 0 }, uSrc: { value: SRC }, uR: { value: R }, uF0: { value: 22 }, uF1: { value: 64 }, uInk: { value: INK }, uOp: { value: .5 } };
const surfY = (x, z, t) => {
  const r = Math.hypot(x, z); let y = -3.2 * (1 - Math.pow(Math.min(1, r / R), 1.7));
  for (const s of SRC) { if (!s.z) continue; const d = Math.hypot(x - s.x, z - s.y); y += s.z * Math.exp(-d * d / 40) * Math.cos(d * 1.3 - t * 2.2 + s.w); }
  return y;
};
const VS = `uniform float uT; uniform vec4 uSrc[8]; uniform float uR; uniform float uF0; uniform float uF1; varying float vFog;
void main(){ vec3 p = position; float r = length(p.xz); float y = -3.2*(1.0-pow(min(1.0,r/uR),1.7));
 for(int i=0;i<8;i++){ vec4 s=uSrc[i]; float d=distance(p.xz,s.xy); y += s.z*exp(-d*d/40.0)*cos(d*1.3-uT*2.2+s.w); }
 p.y = y + p.y; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; vFog = smoothstep(uF0,uF1,-mv.z); }`;
const FS = `uniform vec3 uInk; uniform float uOp; varying float vFog; void main(){ gl_FragColor = vec4(uInk, uOp*(1.0-vFog)); }`;
const MATS = [];
const webMat = op => { const m = new THREE.ShaderMaterial({ uniforms: { ...U, uOp: { value: 0 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false }); m.userData.op = op; MATS.push(m); return m; };
const T_IN = performance.now();

// the orb web: spokes plus a spiral that sags between them
let s0 = 11; const rnd = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
const ang = [...Array(SPOKES).keys()].map(i => (i + (rnd() - .5) * .3) / SPOKES * Math.PI * 2);
const rim = ang.map(() => R * (.88 + rnd() * .16));
const P2 = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
{
  const pts = [];
  ang.forEach((a, i) => { for (let r = 0; r < rim[i]; r += .5) { const [x1, z1] = P2(a, r), [x2, z2] = P2(a, Math.min(rim[i], r + .5)); pts.push(x1, 0, z1, x2, 0, z2); } });
  for (let r = 2.4; r < R * .97; r += STEP * (.92 + rnd() * .16)) {
    for (let i = 0; i < SPOKES; i++) {
      const a1 = ang[i], a2 = i + 1 < SPOKES ? ang[i + 1] : ang[0] + Math.PI * 2;
      if (r > Math.min(rim[i], rim[(i + 1) % SPOKES]) * .98) continue;
      const n = 7; for (let k = 0; k < n; k++) { const t1 = k / n, t2 = (k + 1) / n, sg = t => 1 - .05 * Math.sin(Math.PI * t); const [x1, z1] = P2(a1 + (a2 - a1) * t1, r * sg(t1)), [x2, z2] = P2(a1 + (a2 - a1) * t2, r * sg(t2)); pts.push(x1, 0, z1, x2, 0, z2); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  G.add(new THREE.LineSegments(g, webMat(.42)));
}
// live threads (a hub's spoke from its farthest rider to the center) are drawn darker
const liveMat = webMat(.95);
let liveLines = null;

// the center: a wireframe globe, the brain of the web
const globe = new THREE.Group(); G.add(globe);
function wireSphere(r, lat, lon, op) {
  const pts = [];
  for (let i = 1; i < lat; i++) { const b = Math.PI * i / lat; for (let k = 0; k < 48; k++) { const a1 = k / 48 * 6.283, a2 = (k + 1) / 48 * 6.283; pts.push(r * Math.sin(b) * Math.cos(a1), r * Math.cos(b), r * Math.sin(b) * Math.sin(a1), r * Math.sin(b) * Math.cos(a2), r * Math.cos(b), r * Math.sin(b) * Math.sin(a2)); } }
  for (let j = 0; j < lon; j++) { const a = 6.283 * j / lon; for (let k = 0; k < 24; k++) { const b1 = Math.PI * k / 24, b2 = Math.PI * (k + 1) / 24; pts.push(r * Math.sin(b1) * Math.cos(a), r * Math.cos(b1), r * Math.sin(b1) * Math.sin(a), r * Math.sin(b2) * Math.cos(a), r * Math.cos(b2), r * Math.sin(b2) * Math.sin(a)); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(new THREE.SphereGeometry(r * .985, 24, 16), new THREE.MeshBasicMaterial({ color: BG, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
  grp.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: op, fog: true })));
  return grp;
}
scene.fog = new THREE.Fog(BG, 22, 64);
const core = wireSphere(2.1, 12, 20, .9); globe.add(core);

// nodes
const hubGeo = { r: .46, lat: 7, lon: 10 }, riderGeo = { r: .26, lat: 5, lon: 8 };
const hitGeo = new THREE.SphereGeometry(1, 8, 6), hitMat = new THREE.MeshBasicMaterial({ visible: false });
let nodes = [], byMint = new Map();
const spokeOf = new Map();
let front = 0; ang.forEach((a, i) => { if (Math.abs(Math.sin(a) - 1) < Math.abs(Math.sin(ang[front]) - 1)) front = i; });
const hstr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pctTxt = c => c.ch1h == null ? '' : (c.ch1h > 0 ? '+' : '') + Math.round(c.ch1h) + '%';
function mkNode(c, kind, a, r, delay) {
  const g = kind === 'hub' ? hubGeo : riderGeo, obj = wireSphere(g.r, g.lat, g.lon, kind === 'hub' ? .95 : kind === 'fresh' ? .9 : .8);
  const [x, z] = P2(a, r); obj.position.set(x, 0, z); obj.userData.spin = (kind === 'hub' ? .4 : .7) * (Math.random() < .5 ? -1 : 1); obj.scale.setScalar(.001);
  const hit = new THREE.Mesh(hitGeo, hitMat); hit.scale.setScalar(kind === 'hub' ? 1.05 : .75); hit.position.copy(obj.position);
  G.add(obj); G.add(hit);
  const now = performance.now();
  const n = { c, kind, hub: kind === 'hub', a, r, ta: a, tr: r, obj, hit, flash: 0, born: now + delay, dying: 0, landed: kind !== 'fresh', rate: Math.min(1.4, Math.log10(1 + (c.tx5m || 0)) / 2.2), acc: Math.random() };
  hit.userData.n = n;
  if (kind === 'hub' || kind === 'fresh') {
    const el = document.createElement('a'); el.className = 'nl' + (kind === 'fresh' ? ' fresh' : ''); el.href = '/brain?m=' + c.mint;
    el.innerHTML = kind === 'fresh' ? `${W.img(c.image)}<span>$${W.esc(c.symbol)}</span><em>just launched</em>` : `${W.img(c.image)}<span>$${W.esc(c.symbol)}</span><em>${pctTxt(c)}</em>`;
    el.style.opacity = 0; labels.appendChild(el); n.el = el; n.labelUntil = kind === 'fresh' ? now + delay + 12000 : Infinity;
  }
  nodes.push(n); byMint.set(c.mint, n); return n;
}
function drop(n) { G.remove(n.obj); G.remove(n.hit); if (n.el) n.el.remove(); const i = nodes.indexOf(n); if (i >= 0) nodes.splice(i, 1); if (byMint.get(n.c.mint) === n) byMint.delete(n.c.mint); }
// the web changes in place: new coins pop in, fresh drops fall onto the outer rings, coins that leave shrink away
function sync(data) {
  const hubs = (data && data.hubs) || [], fresh = (data && data.fresh) || [];
  if (!hubs.length && !fresh.length) return;
  const hubSet = new Set(hubs.map(h => h.mint));
  for (const m of [...spokeOf.keys()]) if (!hubSet.has(m)) spokeOf.delete(m);
  const used = new Set(spokeOf.values()), want = new Map();
  const step = Math.max(1, Math.floor(SPOKES / Math.max(1, hubs.length)));
  hubs.forEach((h, i) => {
    let si = spokeOf.get(h.mint);
    if (si == null) { const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1); si = ((front + k * step) % SPOKES + SPOKES) % SPOKES; while (used.has(si)) si = (si + 1) % SPOKES; used.add(si); spokeOf.set(h.mint, si); }
    const a = ang[si], rh = 5.2 + i * .82;
    want.set(h.mint, { c: h, kind: 'hub', a, r: rh, si });
    (h.threads || []).forEach((t, j) => { const r = rh + 2.4 + j * 1.9; if (r > R * .86 || want.has(t.mint)) return; want.set(t.mint, { c: t, kind: 'rider', a, r, si }); });
  });
  const free = ang.map((_, i) => i).filter(i => !used.has(i));
  fresh.forEach(c => { if (want.has(c.mint)) return; const h = hstr(c.mint), si = free.length ? free[h % free.length] : h % SPOKES; want.set(c.mint, { c, kind: 'fresh', a: ang[si], r: R * (.36 + ((h >>> 8) % 1000) / 1000 * .24) }); });
  const now = performance.now();
  for (const n of nodes) if (!n.dying && !want.has(n.c.mint)) n.dying = now;
  const first = !nodes.length; let d = 0;
  for (const [m, w] of want) {
    const n = byMint.get(m);
    if (n && !n.dying && n.kind === w.kind) {
      n.c = w.c; n.ta = w.a; n.tr = w.r; n.rate = Math.min(1.4, Math.log10(1 + (w.c.tx5m || 0)) / 2.2);
      if (n.el && n.kind === 'hub') n.el.querySelector('em').textContent = pctTxt(w.c);
    } else {
      if (n) drop(n);
      mkNode(w.c, w.kind, w.a, w.r, first ? 500 + d * 26 : 200 + d * 160); d++;
    }
  }
  // live threads: each hub's spoke out to its farthest rider
  if (liveLines) { G.remove(liveLines); liveLines.geometry.dispose(); liveLines = null; }
  const live = [];
  hubs.forEach(h => { const w = want.get(h.mint); if (!w) return; let far = w.r; (h.threads || []).forEach(t => { const x = want.get(t.mint); if (x && x.kind === 'rider' && x.si === w.si) far = Math.max(far, x.r); });
    for (let r = 2.3; r < far; r += .5) { const [x1, z1] = P2(w.a, r), [x2, z2] = P2(w.a, Math.min(far, r + .5)); live.push(x1, .02, z1, x2, .02, z2); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(live, 3));
  liveLines = new THREE.LineSegments(g, liveMat); G.add(liveLines);
}

// pulses: dots running toward the center along a coin's spoke
const MAXP = 500, pPos = new Float32Array(MAXP * 3), pulses = [];
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: INK, size: mob ? .62 : .48, sizeAttenuation: true, fog: true });
const pts = new THREE.Points(pGeo, pMat); pts.frustumCulled = false; G.add(pts);

// size and camera
const LOOK = new THREE.Vector3();
function fit() {
  const w = host.clientWidth, h = host.clientHeight; renderer.setPixelRatio(Math.min(mob ? 1.5 : 2, devicePixelRatio || 1)); renderer.setSize(w, h, false);
  cam.aspect = w / h; const Q = new URLSearchParams(location.search), nar = w / h < 1; const z = +Q.get('cz') || (nar ? 46 : w < 1100 ? 34 : 30); cam.position.set(0, +Q.get('cy') || (nar ? 19 : 11), z); LOOK.set(0, +Q.get('ly') || (nar ? -4.5 : -3.6), +Q.get('lz') || 2); cam.lookAt(LOOK); cam.updateProjectionMatrix();
  U.uF0.value = z - 4; U.uF1.value = z + 46; scene.fog.near = z - 4; scene.fog.far = z + 46;
}
fit(); addEventListener('resize', fit);

// interaction: drag to turn the web, hover a node for its brain
let rotV = .018, drag = null, mx = 0, my = 0, hover = null;
const ray = new THREE.Raycaster(), m2 = new THREE.Vector2();
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, r: G.rotation.y, t: performance.now() }; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointerup', e => { if (drag && Math.abs(e.clientX - drag.x) < 4 && hover) location.href = '/brain?m=' + hover.c.mint; drag = null; cv.classList.remove('drag'); });
cv.addEventListener('pointermove', e => {
  const b = cv.getBoundingClientRect(); mx = (e.clientX - b.left) / b.width * 2 - 1; my = -((e.clientY - b.top) / b.height * 2 - 1);
  if (drag) { const dx = e.clientX - drag.x; G.rotation.y = drag.r + dx * .006; rotV = 0; return; }
  m2.set(mx, my); ray.setFromCamera(m2, cam); const hit = ray.intersectObjects(nodes.map(n => n.hit))[0];
  const n = hit && hit.object.userData.n;
  if (n !== hover) { hover = n; showTip(n, e.clientX - b.left, e.clientY - b.top); cv.style.cursor = n ? 'pointer' : ''; }
  else if (n) placeTip(e.clientX - b.left, e.clientY - b.top);
});
cv.addEventListener('pointerleave', () => { hover = null; showTip(null); });
function showTip(n, x, y) {
  if (!tip) return; if (!n) { tip.classList.remove('on'); return; }
  const c = n.c, br = c.brain || {};
  tip.innerHTML = `<div class="h">${W.img(c.image)}<div><b>$${W.esc(c.symbol)}</b><span>${W.esc(c.name || '')}</span></div></div>
    <p>${n.kind === 'fresh' ? '<b>Fresh drop</b> · launched ' + (c.created ? W.ago(c.created) : 'just now') + '. ' : ''}${br.last ? '“' + W.esc(br.last) + '”' : '<span class="dim">This brain has not had its first thought yet.</span>'}</p>
    <div class="k"><div><small>IQ</small>${br.iq || '—'}</div><div><small>MCAP</small>${W.$(c.mc)}</div><div><small>1H</small>${W.pct(c.ch1h)}</div></div>`;
  tip.classList.add('on'); placeTip(x, y);
}
function placeTip(x, y) { const w = host.clientWidth; tip.style.left = Math.min(w - 300, Math.max(10, x + 16)) + 'px'; tip.style.top = Math.max(10, y - 40) + 'px'; }

const v3 = new THREE.Vector3();
let t0 = performance.now(), last = t0, visible = true;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(cv);
function frame(now) {
  requestAnimationFrame(frame);
  if (!visible || document.hidden) { last = now; return; }
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
  U.uT.value = t;
  const kin = Math.min(1, (now - T_IN) / 2200), ein = 1 - Math.pow(1 - kin, 3); MATS.forEach(m => { m.uniforms.uOp.value = m.userData.op * ein; });
  if (!drag) { rotV += (.018 - rotV) * .01; G.rotation.y += rotV * dt * (W.RM ? 0 : 1); }
  G.rotation.x = my * .03; cam.position.x += (mx * 1.4 - cam.position.x) * .03; cam.lookAt(LOOK);
  // ripple sources: the busiest coins on the web
  const busy = nodes.filter(n => n.c.tx5m).sort((a, b) => b.c.tx5m - a.c.tx5m).slice(0, 8);
  SRC.forEach((s, i) => { const n = busy[i]; if (!n) { s.set(999, 999, 0, 0); return; } s.set(n.obj.position.x, n.obj.position.z, Math.min(.65, .12 + Math.log10(1 + n.c.tx5m) * .16) + n.flash * .6, i * 1.7); });
  // nodes ride the surface
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    // glide to its place on the web
    n.r += (n.tr - n.r) * Math.min(1, dt * 1.4); n.a += (n.ta - n.a) * Math.min(1, dt * 1.4);
    const [px, pz] = P2(n.a, n.r), p = n.obj.position; p.x = px; p.z = pz;
    const pk = Math.max(0, Math.min(1, (now - n.born) / 650)), pop = pk <= 0 ? .001 : 1 + 2.2 * Math.pow(pk - 1, 3) + 1.2 * Math.pow(pk - 1, 2);
    // fresh drops fall onto the web from above and land with a ripple
    let fall = 0; if (n.kind === 'fresh') { const fk = Math.max(0, Math.min(1, (now - n.born) / 1100)); fall = (1 - (1 - Math.pow(1 - fk, 3))) * 9; if (!n.landed && fk >= 1) { n.landed = true; n.flash = 1; } }
    const dk = n.dying ? Math.min(1, (now - n.dying) / 600) : 0;
    if (dk >= 1) { drop(n); continue; }
    const y = surfY(p.x, p.z, t) + (n.hub ? .46 : .26) * (1 + n.flash * .6) + fall;
    p.y = y; n.hit.position.set(p.x, y, p.z); n.obj.rotation.y += n.obj.userData.spin * dt;
    const s = (1 + n.flash * .7 + (n === hover ? .35 : 0)) * Math.max(.001, pop) * (1 - dk); n.obj.scale.setScalar(Math.max(.001, s));
    n.flash = Math.max(0, n.flash - dt * .7);
    if (!W.RM && !n.dying && n.landed) { n.acc += n.rate * dt * .55; while (n.acc >= 1 && pulses.length < MAXP) { n.acc -= 1; pulses.push({ a: n.a, r: n.r, v: 3.2 + Math.random() * 1.6 }); } }
  }
  globe.position.y = surfY(0, 0, t) + 1.7; core.rotation.y += dt * .25; core.rotation.z = .2; core.scale.setScalar(Math.max(.001, 1 - Math.pow(1 - Math.min(1, (now - T_IN) / 1400), 4)));
  // move the pulses
  for (let i = pulses.length - 1; i >= 0; i--) { const q = pulses[i]; q.r -= q.v * dt; if (q.r < 2.4) { pulses.splice(i, 1); continue; } }
  for (let i = 0; i < MAXP; i++) {
    const q = pulses[i];
    if (!q) { pPos[i * 3 + 1] = -999; continue; }
    const x = Math.cos(q.a) * q.r, z = Math.sin(q.a) * q.r; pPos[i * 3] = x; pPos[i * 3 + 1] = surfY(x, z, t) + .08; pPos[i * 3 + 2] = z;
  }
  pGeo.attributes.position.needsUpdate = true;
  renderer.render(scene, cam);
  // labels follow their hubs; the far side of the web fades out
  const hw = host.clientWidth / 2, hh = host.clientHeight / 2;
  for (const n of nodes) {
    if (!n.el) continue;
    n.obj.getWorldPosition(v3); const d = v3.distanceTo(cam.position); v3.project(cam);
    const x = v3.x * hw + hw, y = -v3.y * hh + hh, edge = Math.min(1, Math.max(0, Math.min(x - 8, hw * 2 - 150 - x) / 60)), life = n.dying ? 0 : now < n.born ? 0 : n === hover ? 1 : Math.max(0, Math.min(1, (n.labelUntil - now) / 1500)), op = v3.z > 1 ? 0 : Math.max(0, Math.min(1, (62 - d) / 22)) * edge * life;
    n.el.style.transform = `translate(${x + 14}px,${y - 12}px) scale(${Math.max(.72, Math.min(1.08, 30 / d))})`; n.el.style.opacity = op; n.el.style.pointerEvents = op > .3 ? 'auto' : 'none'; n.el.style.zIndex = Math.round(100 - d);
  }
}
requestAnimationFrame(frame);

window.WEBB3D = {
  set: data => sync(data),
  flash: mint => { const n = byMint.get(mint); if (n) { n.flash = 1; for (let k = 0; k < 6; k++) pulses.push({ a: n.a, r: n.r - k * .35, v: 4.5 }); } },
  has: mint => byMint.has(mint),
  debug: () => ({ pulses: pulses.length, nodes: nodes.length, fresh: nodes.filter(n => n.kind === 'fresh').length, hubs: nodes.filter(n => n.hub).length }),
};
window.dispatchEvent(new Event('webb3d'));
