/* Architect's Desk · editor engine (shared by every visual option). */
(function () {
  "use strict";
  const { CATALOG, GLYPHS, CATS, TEMPLATES } = AD;
  const NS = "http://www.w3.org/2000/svg";
  const NW = 112, NH = 84, GRID = 20, LS_KEY = "nl.architect.v1", OB_KEY = "nl.architect.onboarded";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v, d) => { if (v === 0) return "$0"; if (v < 0.01) return "<$0.01"; const f = v >= 1000 ? 0 : 2; return "$" + v.toLocaleString("en-US", { minimumFractionDigits: d != null ? d : f, maximumFractionDigits: d != null ? d : f }); };

  let P = null;              // prices for S.region (null while loading)
  const priceCache = {}; let REGIONS = []; const DEF_REGION = "us-east-1";
  const regionName = (c) => (REGIONS.find((r) => r.code === c) || { name: c }).name;
  function fetchPrices(code) {
    if (!priceCache[code]) priceCache[code] = fetch("data/regions/" + code + ".json").then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then((j) => (priceCache[code] = j)).catch((e) => { delete priceCache[code]; throw e; });
    return Promise.resolve(priceCache[code]);
  }
  const loadedPrices = (code) => { const c = priceCache[code]; return c && !(c instanceof Promise) && c.meta ? c : null; };
  function relabelAz(st) {
    st.nodes.forEach((g) => { if (g.type === "az" && /^Availability Zone [a-z0-9-]+$/.test(g.label)) g.label = "Availability Zone " + st.region + g.props.zone; });
  }
  let S = null;              // diagram state
  const view = { x: 40, y: 40, k: 1 };
  let sel = new Set(); let selEdge = null;
  let snap = true; let tab = "overview"; let lastTab = "overview";
  const undoStack = [], redoStack = [];
  let review = { findings: [], scores: null, overall: null };
  const viewOnly = () => matchMedia("(max-width: 760px)").matches;

  const svg = $("#canvas"), world = $("#world");
  const L = { groups: $("#l-groups"), ghosts: $("#l-ghosts"), edges: $("#l-edges"), nodes: $("#l-nodes"), overlay: $("#l-overlay") };

  // ---------- state helpers ----------
  const nextId = (p) => { let i = 1; const used = new Set(S.nodes.map((n) => n.id).concat(S.edges.map((e) => e.id))); while (used.has(p + i)) i++; return p + i; };
  const nodeById = (id, st) => (st || S).nodes.find((n) => n.id === id);
  const isGroup = (n) => !!CATALOG[n.type].container;
  const size = (n) => isGroup(n) ? { w: n.w, h: n.h } : { w: NW, h: NH };
  function defaults(type) { const p = {}; CATALOG[type].props.forEach((d) => { p[d.k] = d.def; }); return p; }
  function makeNode(type, x, y, st) {
    const def = CATALOG[type]; st = st || S;
    let i = 1; const used = new Set(st.nodes.map((n) => n.id)); while (used.has("n" + i)) i++;
    const n = { id: "n" + i, type, x, y, label: def.name, props: defaults(type) };
    if (def.container) { n.w = def.w; n.h = def.h; }
    return n;
  }
  function snapv(v) { return snap ? Math.round(v / GRID) * GRID : Math.round(v); }

  // containment: innermost group containing a point
  function groupsAt(px, py, st, exclude) {
    return (st || S).nodes.filter((g) => isGroup(g) && g.id !== exclude && px >= g.x && px <= g.x + g.w && py >= g.y && py <= g.y + g.h)
      .sort((a, b) => CATALOG[b.type].container - CATALOG[a.type].container || a.w * a.h - b.w * b.h);
  }
  function placement(n, st) {
    const c = { x: n.x + NW / 2, y: n.y + NH / 2 };
    const gs = groupsAt(c.x, c.y, st);
    const az = gs.find((g) => g.type === "az"), sn = gs.find((g) => g.type === "subnet"), vpc = gs.find((g) => g.type === "vpc");
    return { az, sn, vpc };
  }
  function applyPlacement(st) {
    st = st || S;
    st.nodes.forEach((n) => {
      if (isGroup(n)) return;
      const { az, sn } = placement(n, st);
      if (az && "az" in n.props) n.props.az = az.props.zone;
      n.subnet = sn ? sn.props.tier : null;
    });
  }

  // fix helpers (used by analysis one-click fixes)
  const helpers = {
    get P() { return P; },
    node: (st, id) => nodeById(id, st),
    cloneToOtherAz(st, id) {
      const src = nodeById(id, st); const cur = src.props.az || "a"; const other = ["a", "b", "c"].find((z) => z !== cur);
      const n = makeNode(src.type, src.x, src.y, st); n.props = JSON.parse(JSON.stringify(src.props)); n.props.az = other;
      n.label = src.label.replace(/\b(a|b|c)$/i, "") .trim() + " " + other;
      const azA = st.nodes.find((g) => g.type === "az" && g.props.zone === cur), azB = st.nodes.find((g) => g.type === "az" && g.props.zone === other);
      if (azA && azB) { n.x = src.x + (azB.x - azA.x); n.y = src.y + (azB.y - azA.y); } else { n.x = src.x + 140; n.y = src.y; }
      st.nodes.push(n);
      st.edges.filter((e) => e.from === id || e.to === id).forEach((e) => {
        let i = 1; const used = new Set(st.edges.map((x) => x.id)); while (used.has("e" + i)) i++;
        st.edges.push({ id: "e" + i, from: e.from === id ? n.id : e.from, to: e.to === id ? n.id : e.to });
      });
    },
    addLinked(st, type, anchorId, where) {
      const a = nodeById(anchorId, st);
      let x = a.x + (where === "before" ? -160 : 160), y = a.y + (type === "waf" || type === "secrets" ? 120 : 0);
      if (type === "waf") { x = a.x; y = a.y + 130; }
      const n = makeNode(type, snapv(x), snapv(y), st); st.nodes.push(n);
      if (type === "alb") {
        // re-route the anchor's inbound edges through the new load balancer
        st.edges.forEach((e) => { if (e.to === anchorId) e.to = n.id; });
        n.props.public = true;
      }
      if (type === "apigw") {}
      let i = 1; const used = new Set(st.edges.map((x) => x.id)); while (used.has("e" + i)) i++;
      st.edges.push(where === "before" ? { id: "e" + i, from: n.id, to: anchorId } : { id: "e" + i, from: anchorId, to: n.id });
      if (type === "waf" && a.type === "apigw" && a.props.kind === "HTTP") a.props.kind = "REST";
    },
    addFree(st, type) {
      const xs = st.nodes.map((n) => n.x + size(n).w), ys = st.nodes.map((n) => n.y);
      const n = makeNode(type, snapv((xs.length ? Math.max(...xs) : 0) + 60), snapv(ys.length ? Math.min(...ys) : 0), st); st.nodes.push(n);
    },
    moveToPrivate(st, id) {
      const n = nodeById(id, st); const { az } = placement(n, st); if (!az) { n.subnet = null; return; }
      const priv = st.nodes.filter((g) => g.type === "subnet" && g.props.tier === "private" && g.x >= az.x && g.x <= az.x + az.w && g.y >= az.y && g.y <= az.y + az.h).sort((a, b) => b.y - a.y)[0];
      if (priv) { n.x = snapv(priv.x + 40); n.y = snapv(priv.y + 40); }
    }
  };

  // ---------- history ----------
  function snapshot() { return JSON.stringify(S); }
  function commit(label) {
    undoStack.push(lastSaved); if (undoStack.length > 200) undoStack.shift(); redoStack.length = 0;
    applyPlacement(); lastSaved = snapshot(); changed();
  }
  let lastSaved = null;
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); S = JSON.parse(undoStack.pop()); lastSaved = snapshot(); pruneSel(); changed(); toast("Undone"); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); S = JSON.parse(redoStack.pop()); lastSaved = snapshot(); pruneSel(); changed(); toast("Redone"); }
  function pruneSel() { sel = new Set([...sel].filter((id) => nodeById(id))); if (selEdge && !S.edges.find((e) => e.id === selEdge)) selEdge = null; }

  let saveTimer = null;
  function changed() {
    P = loadedPrices(S.region);
    if (!P) {
      review = { findings: [], scores: null, overall: null }; render(); renderPanels();
      const want = S.region;
      fetchPrices(want).then(() => { if (S.region === want) changed(); }).catch(() => { toast("Couldn't load prices for " + want + ". Check your connection."); });
      return;
    }
    review = AD.analyze(S, helpers);
    render(); renderPanels();
    $("#btn-undo").disabled = !undoStack.length; $("#btn-redo").disabled = !redoStack.length;
    $("#save-state").textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(LS_KEY, snapshot()); $("#save-state").textContent = "Saved in this browser"; } catch (e) { $("#save-state").textContent = "Not saved (storage full)"; } }, 350);
  }

  // ---------- rendering ----------
  function setView() {
    world.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
    $("#zoom-pct").textContent = Math.round(view.k * 100) + "%";
    renderMinimap();
  }
  function findingsFor(id) { return review.findings.filter((f) => !f.positive && f.sev !== "info" && f.nodes.includes(id)); }
  const SEVRANK = { crit: 0, high: 1, med: 2, low: 3 };
  function subText(n) {
    const p = n.props;
    switch (n.type) {
      case "ec2": return `${p.itype} × ${p.count}`;
      case "asg": return `${p.itype} × ${p.count}`;
      case "eks": return `${p.count} × ${p.itype}`;
      case "ecs": return `${p.tasks} tasks · ${p.vcpu} vCPU`;
      case "lambda": return `${p.mem} MB · ${p.reqM}M/mo`;
      case "rds": return `${p.cls} · ${p.multiAz ? "Multi-AZ" : "Single-AZ"}`;
      case "aurora": return `${p.cls} × ${p.instances}`;
      case "elasticache": return `${p.ntype.replace("cache.", "")} × ${p.nodes}`;
      case "s3": return `${p.gb.toLocaleString()} GB`;
      case "apigw": return `${p.kind} · ${p.reqM}M req`;
      case "cloudfront": return `${p.gbOut} GB out`;
      case "nat": return `AZ ${p.az} · ${p.gb} GB`;
      case "alb": return p.public ? "internet-facing" : "internal";
      case "dynamodb": return "on-demand";
      default: return CATALOG[n.type].full.replace(/^(Amazon|AWS) /, "");
    }
  }
  function nodeCost(n) { return AD.costTotal(AD.cost(n, P)); }

  function render() {
    for (const k in L) L[k].textContent = "";
    // groups (outer first)
    S.nodes.filter(isGroup).sort((a, b) => CATALOG[a.type].container - CATALOG[b.type].container).forEach((g) => {
      const gg = el("g", { class: `grp grp-${g.type}${g.type === "subnet" ? " tier-" + g.props.tier : ""}${sel.has(g.id) ? " sel" : ""}`, "data-id": g.id, transform: `translate(${g.x} ${g.y})` }, L.groups);
      el("rect", { class: "grp-box", width: g.w, height: g.h, rx: g.type === "subnet" ? 6 : 12 }, gg);
      const hd = el("g", { class: "grp-head" }, gg);
      el("rect", { class: "grp-tag", x: 10, y: -11, width: Math.min(g.w - 20, 14 + g.label.length * 7.2 + 26), height: 22, rx: 11 }, hd);
      const gl = el("g", { class: "grp-glyph", transform: "translate(16 -7) scale(.58)" }, hd); gl.innerHTML = GLYPHS[CATALOG[g.type].glyph];
      const t = el("text", { class: "grp-label", x: 34, y: 4 }, hd); t.textContent = g.label;
      if (g.type === "vpc" && g.props.gwEndpoints) { const b = el("text", { class: "grp-note", x: g.w - 14, y: 22, "text-anchor": "end" }, gg); b.textContent = "S3 + DynamoDB gateway endpoints"; }
      el("rect", { class: "grp-resize", x: g.w - 14, y: g.h - 14, width: 14, height: 14, rx: 3, "data-resize": g.id }, gg);
    });
    // ghosts: multi-AZ replicas drawn in the paired AZ
    S.nodes.forEach((n) => {
      if (isGroup(n)) return;
      const p = n.props; const multi = (["asg", "ecs", "eks"].includes(n.type) && +p.azs >= 2) || ((n.type === "rds" || n.type === "elasticache") && p.multiAz) || (n.type === "aurora" && +p.instances >= 2);
      if (!multi) return;
      const { az, vpc } = placement(n); if (!az) return;
      const other = S.nodes.find((g) => g.type === "az" && g.id !== az.id && (!vpc || (g.x >= vpc.x && g.x < vpc.x + vpc.w)));
      if (!other) return;
      const gx = n.x + (other.x - az.x), gy = n.y + (other.y - az.y);
      const g = el("g", { class: "ghost", transform: `translate(${gx} ${gy})` }, L.ghosts);
      el("rect", { class: "node-card", width: NW, height: NH, rx: 12 }, g);
      const gi = el("g", { class: `glyph cat-${CATALOG[n.type].cat}`, transform: `translate(${NW / 2 - 15} 12) scale(1.25)` }, g); gi.innerHTML = GLYPHS[CATALOG[n.type].glyph];
      const t = el("text", { class: "node-label", x: NW / 2, y: 62, "text-anchor": "middle" }, g);
      t.textContent = n.type === "rds" ? "Standby" : n.type === "aurora" ? "Reader" : n.type === "elasticache" ? "Replica" : "Same tier";
      const s = el("text", { class: "node-sub", x: NW / 2, y: 76, "text-anchor": "middle" }, g); s.textContent = "AZ " + other.props.zone;
    });
    // edges
    S.edges.forEach((e) => {
      const a = nodeById(e.from), b = nodeById(e.to); if (!a || !b) return;
      const d = edgePath(a, b);
      const g = el("g", { class: "edge" + (selEdge === e.id ? " sel" : ""), "data-edge": e.id }, L.edges);
      el("path", { class: "edge-hit", d }, g);
      el("path", { class: "edge-line", d, "marker-end": selEdge === e.id ? "url(#arrow-sel)" : "url(#arrow)" }, g);
    });
    // nodes
    S.nodes.forEach((n) => {
      if (isGroup(n)) return;
      const def = CATALOG[n.type];
      const fs = findingsFor(n.id).sort((a, b) => SEVRANK[a.sev] - SEVRANK[b.sev]);
      const g = el("g", { class: `node cat-${def.cat}${sel.has(n.id) ? " sel" : ""}`, "data-id": n.id, transform: `translate(${n.x} ${n.y})`, tabindex: "-1", role: "img", "aria-label": `${n.label}, ${def.full}` }, L.nodes);
      el("rect", { class: "node-card", width: NW, height: NH, rx: 12 }, g);
      el("rect", { class: "node-chip", x: NW / 2 - 21, y: 8, width: 42, height: 42, rx: 11 }, g);
      const gi = el("g", { class: "glyph", transform: `translate(${NW / 2 - 15} 14) scale(1.25)` }, g); gi.innerHTML = GLYPHS[def.glyph];
      const t = el("text", { class: "node-label", x: NW / 2, y: 64, "text-anchor": "middle" }, g); t.textContent = clip(n.label, 16);
      const s = el("text", { class: "node-sub", x: NW / 2, y: 77, "text-anchor": "middle" }, g); s.textContent = clip(subText(n), 20);
      if (fs.length) { const b = el("g", { class: "badge sev-" + fs[0].sev, transform: `translate(${NW - 6} 6)` }, g); el("circle", { r: 9 }, b); const bt = el("text", { y: 3.6, "text-anchor": "middle" }, b); bt.textContent = fs.length; }
      const multi = (["asg", "ecs", "eks"].includes(n.type) && +n.props.azs >= 2);
      if (multi) { const b = el("g", { class: "azbadge", transform: "translate(6 6)" }, g); el("rect", { width: 34, height: 15, rx: 7.5 }, b); const bt = el("text", { x: 17, y: 11, "text-anchor": "middle" }, b); bt.textContent = n.props.azs + " AZ"; }
      if (!viewOnly()) el("circle", { class: "port", cx: NW, cy: NH / 2, r: 6, "data-port": n.id }, g);
    });
    $("#empty").hidden = S.nodes.length > 0;
    $("#doc-title").value = S.title || "Untitled architecture";
    $("#tb-title").textContent = S.title || "Untitled";
    setView();
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  function anchor(n, toward) {
    const s = size(n), cx = n.x + s.w / 2, cy = n.y + s.h / 2;
    const dx = toward.x - cx, dy = toward.y - cy;
    if (Math.abs(dx) * s.h > Math.abs(dy) * s.w) return { x: cx + Math.sign(dx) * s.w / 2, y: cy, dir: [Math.sign(dx), 0] };
    return { x: cx, y: cy + Math.sign(dy || 1) * s.h / 2, dir: [0, Math.sign(dy || 1)] };
  }
  function center(n) { const s = size(n); return { x: n.x + s.w / 2, y: n.y + s.h / 2 }; }
  function edgePath(a, b) {
    const p = anchor(a, center(b)), q = anchor(b, center(a));
    const dist = Math.hypot(q.x - p.x, q.y - p.y), k = Math.min(80, dist / 2.4);
    return `M${p.x} ${p.y} C${p.x + p.dir[0] * k} ${p.y + p.dir[1] * k} ${q.x + q.dir[0] * k} ${q.y + q.dir[1] * k} ${q.x} ${q.y}`;
  }

  // ---------- minimap ----------
  function bounds(st) {
    st = st || S; if (!st.nodes.length) return { x: 0, y: 0, w: 800, h: 500 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    st.nodes.forEach((n) => { const s = size(n); x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y - 14); x1 = Math.max(x1, n.x + s.w); y1 = Math.max(y1, n.y + s.h); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  let mmScale = 1, mmB = null;
  function renderMinimap() {
    const mm = $("#mm-svg"); if (!mm || !S) return; mm.textContent = "";
    const box = $("#minimap").getBoundingClientRect(); if (!box.width) return;
    const st = $("#stage").getBoundingClientRect();
    const vb = { x: -view.x / view.k, y: -view.y / view.k, w: st.width / view.k, h: st.height / view.k };
    const b = bounds(); const x0 = Math.min(b.x, vb.x) - 40, y0 = Math.min(b.y, vb.y) - 40, x1 = Math.max(b.x + b.w, vb.x + vb.w) + 40, y1 = Math.max(b.y + b.h, vb.y + vb.h) + 40;
    mmScale = Math.min(box.width / (x1 - x0), box.height / (y1 - y0)); mmB = { x0, y0 };
    const T = (x, y) => [(x - x0) * mmScale, (y - y0) * mmScale];
    S.nodes.forEach((n) => { const s = size(n); const [x, y] = T(n.x, n.y); el("rect", { x, y, width: Math.max(2, s.w * mmScale), height: Math.max(2, s.h * mmScale), class: isGroup(n) ? "mm-g" : "mm-n cat-" + CATALOG[n.type].cat, rx: isGroup(n) ? 2 : 1 }, mm); });
    const [vx, vy] = T(vb.x, vb.y); el("rect", { x: vx, y: vy, width: vb.w * mmScale, height: vb.h * mmScale, class: "mm-view" }, mm);
  }
  function minimapNav(ev) {
    const r = $("#minimap").getBoundingClientRect(), st = $("#stage").getBoundingClientRect();
    const wx = (ev.clientX - r.left) / mmScale + mmB.x0, wy = (ev.clientY - r.top) / mmScale + mmB.y0;
    view.x = st.width / 2 - wx * view.k; view.y = st.height / 2 - wy * view.k; setView();
  }
  $("#minimap").addEventListener("pointerdown", (ev) => { ev.preventDefault(); minimapNav(ev); const mv = (e) => minimapNav(e); const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); }; addEventListener("pointermove", mv); addEventListener("pointerup", up); });

  // ---------- view helpers ----------
  function toWorld(cx, cy) { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; }
  function zoomAt(k, cx, cy) {
    const r = svg.getBoundingClientRect(); k = Math.max(0.2, Math.min(2.5, k));
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const wx = (cx - r.left - view.x) / view.k, wy = (cy - r.top - view.y) / view.k;
    view.k = k; view.x = cx - r.left - wx * k; view.y = cy - r.top - wy * k; setView();
  }
  function fit() {
    const r = svg.getBoundingClientRect(); if (!r.width) return; const b = bounds();
    const pad = viewOnly() ? 24 : 70;
    const k = Math.max(0.2, Math.min(1.25, Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2 - (viewOnly() ? 0 : 40)) / b.h)));
    view.k = k; view.x = (r.width - b.w * k) / 2 - b.x * k; view.y = (r.height - b.h * k) / 2 - b.y * k + (viewOnly() ? 0 : -10); setView();
  }

  // ---------- pointer interactions ----------
  let drag = null; const pointers = new Map();
  svg.addEventListener("pointerdown", (ev) => {
    if (ev.button === 2) return;
    svg.focus({ preventScroll: true });
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), k0: view.k, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; return; }
    const t = ev.target;
    const port = t.closest("[data-port]"), rs = t.closest("[data-resize]"), nodeG = t.closest(".node"), grpG = t.closest(".grp"), edgeG = t.closest(".edge");
    const w = toWorld(ev.clientX, ev.clientY);
    svg.setPointerCapture(ev.pointerId);
    if (viewOnly()) {
      const id = nodeG ? nodeG.dataset.id : null;
      drag = { kind: "pan", sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, tapId: id, moved: false }; return;
    }
    if (port) { drag = { kind: "connect", from: port.dataset.port, line: el("path", { class: "edge-temp", d: "" }, L.overlay) }; return; }
    if (rs) { const g = nodeById(rs.dataset.resize); drag = { kind: "resize", id: g.id, w0: g.w, h0: g.h, sx: w.x, sy: w.y, moved: false }; return; }
    if (nodeG || (grpG && (t.classList.contains("grp-tag") || t.closest(".grp-head") || t.classList.contains("grp-box")))) {
      const id = (nodeG || grpG).dataset.id;
      if (ev.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); } else if (!sel.has(id)) { sel = new Set([id]); }
      selEdge = null;
      // dragging a group carries everything inside it
      const moving = new Set(sel);
      [...sel].forEach((sid) => { const g = nodeById(sid); if (g && isGroup(g)) S.nodes.forEach((n) => { const c = center(n); if (n.id !== g.id && n.x >= g.x && n.y >= g.y && n.x + size(n).w <= g.x + g.w + 1 && n.y + size(n).h <= g.y + g.h + 1) moving.add(n.id); else if (!isGroup(n) && c.x >= g.x && c.x <= g.x + g.w && c.y >= g.y && c.y <= g.y + g.h) moving.add(n.id); }); });
      drag = { kind: "move", sx: w.x, sy: w.y, start: [...moving].map((mid) => { const n = nodeById(mid); return { id: mid, x: n.x, y: n.y }; }), moved: false };
      showProps(); render(); return;
    }
    if (edgeG) { selEdge = edgeG.dataset.edge; sel.clear(); render(); renderPanels(); return; }
    if (ev.shiftKey) { drag = { kind: "marquee", sx: w.x, sy: w.y, rect: el("rect", { class: "marquee" }, L.overlay) }; return; }
    drag = { kind: "pan", sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, moved: false, clear: true };
  });
  svg.addEventListener("pointermove", (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!drag) return;
    const w = toWorld(ev.clientX, ev.clientY);
    if (drag.kind === "pinch" && pointers.size === 2) { const [a, b] = [...pointers.values()]; zoomAt(drag.k0 * Math.hypot(a.x - b.x, a.y - b.y) / drag.d0, drag.mid.x, drag.mid.y); return; }
    if (drag.kind === "pan") { const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; view.x = drag.vx + dx; view.y = drag.vy + dy; setView(); svg.classList.add("panning"); return; }
    if (drag.kind === "move") {
      const dx = w.x - drag.sx, dy = w.y - drag.sy; if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      drag.start.forEach((s) => { const n = nodeById(s.id); n.x = snapv(s.x + dx); n.y = snapv(s.y + dy); });
      render(); return;
    }
    if (drag.kind === "resize") { const g = nodeById(drag.id); g.w = Math.max(160, snapv(drag.w0 + w.x - drag.sx)); g.h = Math.max(100, snapv(drag.h0 + w.y - drag.sy)); drag.moved = true; render(); return; }
    if (drag.kind === "connect") {
      const a = nodeById(drag.from); const p = anchor(a, w);
      drag.line.setAttribute("d", `M${p.x} ${p.y} L${w.x} ${w.y}`);
      $$(".node.drop", L.nodes).forEach((n) => n.classList.remove("drop"));
      const over = document.elementFromPoint(ev.clientX, ev.clientY); const ng = over && over.closest && over.closest(".node");
      if (ng && ng.dataset.id !== drag.from) ng.classList.add("drop");
      return;
    }
    if (drag.kind === "marquee") {
      const x = Math.min(w.x, drag.sx), y = Math.min(w.y, drag.sy), ww = Math.abs(w.x - drag.sx), hh = Math.abs(w.y - drag.sy);
      Object.entries({ x, y, width: ww, height: hh }).forEach(([k, v]) => drag.rect.setAttribute(k, v)); drag.box = { x, y, w: ww, h: hh };
    }
  });
  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    if (!drag) return; const d = drag; drag = null; svg.classList.remove("panning");
    if (d.kind === "pan") {
      if (!d.moved) {
        if (d.tapId) { sel = new Set([d.tapId]); showProps(); render(); }
        else if (d.clear) { sel.clear(); selEdge = null; render(); renderPanels(); if (tab === "props") switchTab(lastTab); }
      }
      return;
    }
    if (d.kind === "move" && d.moved) commit("move");
    if (d.kind === "resize" && d.moved) commit("resize");
    if (d.kind === "connect") {
      d.line.remove();
      const over = document.elementFromPoint(ev.clientX, ev.clientY); const ng = over && over.closest && over.closest(".node");
      if (ng && ng.dataset.id !== d.from) connect(d.from, ng.dataset.id);
      $$(".node.drop").forEach((n) => n.classList.remove("drop"));
    }
    if (d.kind === "marquee") {
      d.rect.remove(); if (d.box) { sel = new Set(S.nodes.filter((n) => !isGroup(n) && n.x >= d.box.x && n.y >= d.box.y && n.x + NW <= d.box.x + d.box.w && n.y + NH <= d.box.y + d.box.h).map((n) => n.id)); render(); showProps(); }
    }
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("wheel", (ev) => { ev.preventDefault(); const f = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0018)); zoomAt(view.k * f, ev.clientX, ev.clientY); }, { passive: false });
  svg.addEventListener("dblclick", (ev) => { const g = ev.target.closest(".node, .grp"); if (g && !viewOnly()) { sel = new Set([g.dataset.id]); showProps(); render(); setTimeout(() => { const i = $("#prop-label"); if (i) { i.focus(); i.select(); } }, 30); } });

  function connect(a, b) {
    if (a === b || S.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))) { toast("Already connected"); return; }
    S.edges.push({ id: nextId("e"), from: a, to: b }); commit("connect"); toast("Connected " + nodeById(a).label + " → " + nodeById(b).label);
  }
  function addNode(type, x, y) {
    const n = makeNode(type, 0, 0); const s = size(n);
    if (x == null) { const r = svg.getBoundingClientRect(); const c = toWorld(r.left + r.width / 2, r.top + r.height / 2); x = c.x - s.w / 2 + (Math.random() * 60 - 30); y = c.y - s.h / 2 + (Math.random() * 60 - 30); }
    n.x = snapv(x); n.y = snapv(y);
    const same = S.nodes.filter((m) => m.type === type).length; if (same) n.label = CATALOG[type].name + " " + (same + 1);
    if (type === "subnet" || type === "az" || type === "vpc") n.label = type === "vpc" ? "VPC 10.0.0.0/16" : type === "az" ? "Availability Zone " + S.region + "a" : "Private subnet";
    S.nodes.push(n); sel = new Set([n.id]); selEdge = null; commit("add"); showProps(); return n;
  }

  // ---------- palette ----------
  function buildPalette() {
    const list = $("#pal-list"); list.textContent = "";
    CATS.forEach(([cat, label]) => {
      const sec = h("div", "pal-sec"); sec.dataset.cat = cat;
      sec.appendChild(h("h3", "pal-h", esc(label)));
      const grid = h("div", "pal-grid");
      Object.entries(CATALOG).filter(([, d]) => d.cat === cat).forEach(([type, d]) => {
        const b = h("button", `pal-item cat-${cat}`); b.type = "button"; b.dataset.type = type; b.title = d.full; b.setAttribute("aria-label", `Add ${d.full}`);
        b.innerHTML = `<span class="pal-chip"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[d.glyph]}</svg></span><span class="pal-name">${esc(d.name)}</span>`;
        grid.appendChild(b);
      });
      sec.appendChild(grid); list.appendChild(sec);
    });
    list.addEventListener("pointerdown", (ev) => {
      const b = ev.target.closest(".pal-item"); if (!b || ev.button !== 0) return;
      ev.preventDefault(); const type = b.dataset.type; const sx = ev.clientX, sy = ev.clientY; let ghost = null;
      const mv = (e) => {
        if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 5) { ghost = h("div", `drag-ghost cat-${CATALOG[type].cat}`, b.innerHTML); document.body.appendChild(ghost); }
        if (ghost) { ghost.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 30}px)`; const r = svg.getBoundingClientRect(); ghost.classList.toggle("ok", e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom); }
      };
      const up = (e) => {
        removeEventListener("pointermove", mv); removeEventListener("pointerup", up);
        if (!ghost) { addNode(type); return; }
        ghost.remove(); const r = svg.getBoundingClientRect();
        if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) { const w = toWorld(e.clientX, e.clientY); const s = CATALOG[type].container ? { w: CATALOG[type].w, h: CATALOG[type].h } : { w: NW, h: NH }; addNode(type, w.x - (CATALOG[type].container ? 20 : s.w / 2), w.y - (CATALOG[type].container ? 20 : s.h / 2)); }
      };
      addEventListener("pointermove", mv); addEventListener("pointerup", up);
    });
    list.addEventListener("keydown", (ev) => { const b = ev.target.closest(".pal-item"); if (b && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); addNode(b.dataset.type); } });
    $("#pal-search").addEventListener("input", (ev) => {
      const q = ev.target.value.trim().toLowerCase();
      $$(".pal-item").forEach((b) => { const d = CATALOG[b.dataset.type]; b.hidden = q && !(d.name + " " + d.full + " " + b.dataset.type).toLowerCase().includes(q); });
      $$(".pal-sec").forEach((s) => { s.hidden = !$$(".pal-item", s).some((b) => !b.hidden); });
    });
  }

  // ---------- panels ----------
  function switchTab(t) {
    if (t !== "props") lastTab = t; tab = t;
    ["overview", "cost", "review", "props"].forEach((k) => { $("#tab-" + k).setAttribute("aria-selected", String(k === t)); $("#pane-" + k).hidden = k !== t; });
  }
  $$(".tabs [role=tab]").forEach((b) => b.addEventListener("click", () => switchTab(b.id.replace("tab-", ""))));
  $(".tabs").addEventListener("keydown", (ev) => { const ts = $$(".tabs [role=tab]"); const i = ts.indexOf(document.activeElement); if (i < 0) return; if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { const j = (i + (ev.key === "ArrowRight" ? 1 : ts.length - 1)) % ts.length; ts[j].focus(); ts[j].click(); } });
  function showProps() { if (sel.size) switchTab("props"); renderPanels(); }

  function costRows() {
    return S.nodes.filter((n) => !isGroup(n)).map((n) => ({ n, lines: AD.cost(n, P), total: nodeCost(n) })).sort((a, b) => b.total - a.total);
  }
  function scoreRing(v, big) {
    const r = big ? 34 : 15, c = 2 * Math.PI * r, s = big ? 84 : 38;
    const cls = v == null ? "" : v >= 85 ? "good" : v >= 65 ? "ok" : "bad";
    return `<svg class="ring ${cls}" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" aria-hidden="true"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" class="ring-bg"/><circle cx="${s / 2}" cy="${s / 2}" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${v == null ? c : c * (1 - v / 100)}" transform="rotate(-90 ${s / 2} ${s / 2})"/></svg>`;
  }
  const SEVL = { crit: "Critical", high: "High", med: "Medium", low: "Low", info: "Note" };
  function findingCard(f, i) {
    const pil = AD.PILLARS.find((p) => p[0] === f.pillar)[1];
    return `<article class="finding sev-${f.sev}${f.positive ? " positive" : ""}" data-f="${i}">
      <div class="f-top"><span class="sev">${f.positive ? "Good" : SEVL[f.sev]}</span><span class="pil">${esc(pil)}</span></div>
      <h4>${esc(f.title)}</h4><p>${esc(f.detail)}</p>
      <div class="f-act">${f.fix ? `<button class="btn fix" type="button" data-fix="${i}">${esc(f.fix.label)}</button>` : ""}${f.nodes.length ? `<button class="btn ghost" type="button" data-show="${i}">Show</button>` : ""}</div></article>`;
  }
  function pubRange(Pr) { const d = Object.values(Pr.meta.offerPublicationDates).map((x) => x.slice(0, 10)).sort(); return d.length ? (d[0] === d[d.length - 1] ? d[0] : d[0] + " to " + d[d.length - 1]) : "n/a"; }
  function regionSelect(id) {
    const grp = (gov) => REGIONS.filter((r) => r.gov === gov).map((r) => `<option value="${r.code}"${r.code === S.region ? " selected" : ""}>${esc(r.code)} · ${esc(r.name)}</option>`).join("");
    return `<label class="region-row" for="${id}"><span class="tc-k">Region</span><select id="${id}" class="region-sel" aria-label="AWS region for pricing"><optgroup label="Commercial">${grp(false)}</optgroup><optgroup label="AWS GovCloud (US)">${grp(true)}</optgroup></select></label>`;
  }
  function renderPanels() {
    $("#tb-region").textContent = S.region;
    if (!P) { ["#pane-overview", "#pane-cost", "#pane-review"].forEach((id) => { $(id).innerHTML = `<section class="card"><p class="muted">Loading ${esc(regionName(S.region))} prices…</p></section>`; }); $("#hud-total").textContent = "…"; return; }
    $("#help-prices").textContent = `Prices are AWS public on-demand rates for ${P.meta.region} (${P.meta.name}), taken from the AWS Price List API on ${new Date(P.meta.fetched + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Monthly figures assume 730 hours. Anything without a published price in the selected region is marked "Not available" and left out of the total, never priced with another region's rate. They're estimates for comparing designs, not quotes.`;
    const rows = costRows(); const total = rows.reduce((s, r) => s + r.total, 0);
    const F = review.findings; const neg = F.filter((f) => !f.positive && f.sev !== "info");
    $("#hud-total").textContent = money(total, 0); $("#tb-cost").textContent = money(total, 0);
    $("#hud-score").textContent = review.overall == null ? "—" : review.overall; $("#hud-find").textContent = neg.length;
    $("#hud").dataset.grade = review.overall == null ? "" : review.overall >= 85 ? "good" : review.overall >= 65 ? "ok" : "bad";
    $("#tabcount").textContent = neg.length ? neg.length : "";
    const naRows = rows.filter((r) => r.lines.some((l) => l.na));
    const naNote = naRows.length ? `<div class="na-note" role="note"><b>${naRows.length} service${naRows.length === 1 ? "" : "s"} not available in ${esc(S.region)}</b> and left out of the total: ${naRows.map((r) => esc(r.n.label)).join(", ")}.</div>` : "";
    const date = new Date(P.meta.fetched + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    // overview
    const max = rows.length ? rows[0].total || 1 : 1;
    const top = rows.filter((r) => r.total > 0).slice(0, 6);
    const pill = (k, l) => { const v = review.scores ? review.scores[k] : null; return `<li class="pillar"><span class="pl">${esc(l)}</span><span class="pbar"><i style="width:${v == null ? 0 : v}%" class="${v == null ? "" : v >= 85 ? "good" : v >= 65 ? "ok" : "bad"}"></i></span><b>${v == null ? "—" : v}</b></li>`; };
    $("#pane-overview").innerHTML = `
      <section class="card total-card">${regionSelect("region-ov")}<div class="tc-k">Estimated monthly cost</div><div class="tc-v">${money(total, 2)}</div>
        <div class="tc-sub">On-demand · ${esc(P.meta.region)} · ${esc(date)} prices · ${money(total * 12, 0)}/yr</div>${naNote}
        <ul class="bars">${top.map((r) => `<li><span class="bl">${esc(r.n.label)}</span><span class="bb"><i class="cat-${CATALOG[r.n.type].cat}" style="width:${Math.max(2, (r.total / max) * 100)}%"></i></span><span class="bv">${money(r.total, 0)}</span></li>`).join("") || '<li class="muted">Add services to see costs.</li>'}</ul>
        <div class="link-row"><button class="linkbtn" type="button" data-go="cost">Full breakdown →</button><button class="linkbtn" type="button" data-compare>Compare regions →</button></div></section>
      <section class="card score-card"><div class="sc-head">${scoreRing(review.overall, true)}<div><div class="tc-k">Well-Architected score</div><div class="sc-v">${review.overall == null ? "—" : review.overall + "<small>/100</small>"}</div><div class="tc-sub">${neg.length} finding${neg.length === 1 ? "" : "s"} · ${F.filter((f) => f.fix).length} one-click fix${F.filter((f) => f.fix).length === 1 ? "" : "es"}</div></div></div>
        <ul class="pillars">${AD.PILLARS.map(([k, l]) => pill(k, l)).join("")}</ul></section>
      <section class="card"><div class="tc-k">Top findings</div>${neg.slice(0, 3).map((f) => findingCard(f, F.indexOf(f))).join("") || '<p class="muted">No issues found. Nice work.</p>'}
        ${neg.length > 3 ? `<button class="linkbtn" type="button" data-go="review">See all ${neg.length} findings →</button>` : ""}</section>`;

    // cost tab
    $("#pane-cost").innerHTML = `<section class="card total-card">${regionSelect("region-cost")}<div class="tc-k">Estimated monthly cost</div><div class="tc-v">${money(total, 2)}</div><div class="tc-sub">${rows.filter((r) => r.total > 0).length} billable components · ${esc(P.meta.name)}</div>${naNote}<div class="link-row"><button class="linkbtn" type="button" data-compare>Compare this design across regions →</button></div></section>
      ${rows.map((r) => `<details class="cline"${sel.has(r.n.id) ? " open" : ""}><summary><span class="chip cat-${CATALOG[r.n.type].cat}"><svg viewBox="0 0 24 24">${GLYPHS[CATALOG[r.n.type].glyph]}</svg></span><span class="cl-n">${esc(r.n.label)}<small>${esc(CATALOG[r.n.type].full)}</small></span><b>${r.lines.some((l) => l.na) ? '<span class="na-tag">Not available</span> ' : ""}${money(r.total, 2)}</b></summary>
        <ul>${r.lines.length ? r.lines.map((l) => `<li${l.na ? ' class="na"' : ""}><span>${esc(l.label)}<small>${esc(l.basis)}</small></span><b>${l.na ? "n/a" : money(l.amount, 2)}</b></li>`).join("") : "<li><span>No direct charge</span><b>$0</b></li>"}</ul></details>`).join("")}
      <section class="card assume"><div class="tc-k">Assumptions</div><ul>
        <li>Public on-demand list prices for ${esc(P.meta.region)} (${esc(P.meta.name)}) from the AWS Price List API regional offer files, captured ${esc(date)}. Estimates, not quotes.</li>
        <li>Anything without a published on-demand price in this region is shown as “Not available” and left out of the total. Prices are never borrowed from another region.</li>
        ${Object.values(P.meta.notes || {}).map((t) => `<li>${esc(t)}</li>`).join("")}
        <li>730 hours per month for anything billed hourly. Linux, shared tenancy, no Savings Plans or Reserved Instances.</li>
        <li>Free tiers are not deducted, except DynamoDB's 25 GB of storage. Taxes and support plans are excluded.</li>
        <li>Data transfer is counted only where you enter it (CloudFront, ALB, NAT). Inter-AZ traffic and VPC endpoints are not modeled.</li>
        <li>CloudFront uses the US/Canada/Europe first-10 TB rate. Lambda uses x86 pricing.</li>
        <li>RDS backup storage is free up to the database size; extra backup storage is not estimated.</li></ul>
        <p class="fine">Source: pricing.us-east-1.amazonaws.com/offers/v1.0/aws/&lt;service&gt;/current/${esc(P.meta.region)}/index.csv. Offer files published ${esc(pubRange(P))}. Check the AWS Pricing Calculator before you commit to a budget.</p></section>`;

    // review tab
    $("#pane-review").innerHTML = `<section class="card score-card"><div class="sc-head">${scoreRing(review.overall, true)}<div><div class="tc-k">Well-Architected score</div><div class="sc-v">${review.overall == null ? "—" : review.overall + "<small>/100</small>"}</div><div class="tc-sub">Six pillars, weighted by severity</div></div></div>
      <ul class="pillars">${AD.PILLARS.map(([k, l]) => pill(k, l)).join("")}</ul>
      ${F.some((f) => f.fix) ? `<button class="btn fix wide" type="button" data-fixall>Apply all ${F.filter((f) => f.fix).length} fixes</button>` : ""}</section>
      ${F.map((f, i) => findingCard(f, i)).join("") || '<p class="muted pad">No findings. This design follows every rule the reviewer checks.</p>'}
      <p class="fine pad">The reviewer checks common, well-documented risks. It's a fast first pass, not a substitute for a full Well-Architected review.</p>`;

    renderProps();
  }
  function renderProps() {
    const pane = $("#pane-props");
    if (selEdge) { const e = S.edges.find((x) => x.id === selEdge); pane.innerHTML = `<section class="card"><div class="tc-k">Connection</div><h3 class="ph">${esc(nodeById(e.from).label)} → ${esc(nodeById(e.to).label)}</h3><div class="f-act"><button class="btn" type="button" data-reverse>Reverse direction</button><button class="btn danger" type="button" data-del>Delete</button></div></section>`; return; }
    if (sel.size !== 1) { pane.innerHTML = `<section class="card"><p class="muted">${sel.size ? sel.size + " items selected. Press Delete to remove them or drag to move them together." : "Select a service on the canvas to edit its settings."}</p></section>`; return; }
    const n = nodeById([...sel][0]); const def = CATALOG[n.type]; const ro = viewOnly();
    const lines = AD.cost(n, P); const tot = AD.costTotal(lines); const fs = review.findings.filter((f) => f.nodes.includes(n.id));
    const pl = isGroup(n) ? null : placement(n);
    const field = (d) => {
      const v = n.props[d.k]; const id = "pf-" + d.k; const dis = ro ? " disabled" : "";
      if (d.k === "az" && pl && pl.az) return `<div class="field"><label>${esc(d.label)}</label><div class="ro">${esc(S.region)}${esc(v)} <small>from its AZ group</small></div></div>`;
      if (d.type === "bool") return `<div class="field sw"><label for="${id}">${esc(d.label)}</label><button id="${id}" class="switch" type="button" role="switch" aria-checked="${!!v}" data-k="${d.k}"${dis}><i></i></button></div>`;
      if (d.type === "select") return `<div class="field"><label for="${id}">${esc(d.label)}</label><select id="${id}" data-k="${d.k}"${dis}>${d.options.map((o) => `<option value="${o}"${String(o) === String(v) ? " selected" : ""}>${o}${d.unit ? " " + d.unit : ""}</option>`).join("")}</select></div>`;
      if (d.type === "text") return `<div class="field"><label for="${id}">${esc(d.label)}</label><input id="${id}" type="text" value="${esc(v)}" data-k="${d.k}"${dis}></div>`;
      return `<div class="field"><label for="${id}">${esc(d.label)}</label><div class="num"><input id="${id}" type="number" inputmode="decimal" value="${v}" min="${d.min != null ? d.min : 0}"${d.max != null ? ` max="${d.max}"` : ""} step="${d.step || "any"}" data-k="${d.k}"${dis}>${d.unit ? `<span>${esc(d.unit)}</span>` : ""}</div></div>`;
    };
    pane.innerHTML = `<section class="card">
      <div class="ph-row"><span class="chip big cat-${def.cat}"><svg viewBox="0 0 24 24">${GLYPHS[def.glyph]}</svg></span><div><div class="tc-k">${esc(def.full)}</div><input id="prop-label" class="ph-in" value="${esc(n.label)}" aria-label="Name"${ro ? " disabled" : ""}></div></div>
      ${def.about ? `<p class="muted small">${esc(def.about)}</p>` : ""}
      ${pl && (pl.vpc || pl.az || pl.sn) ? `<p class="place">${[pl.vpc && pl.vpc.label, pl.az && "AZ " + pl.az.props.zone, pl.sn && pl.sn.label].filter(Boolean).map(esc).join(" › ")}</p>` : (def.vpc && !isGroup(n) ? `<p class="place warn">Not inside a VPC. Drop it into a subnet to place it.</p>` : "")}
      <form class="fields" onsubmit="return false">${def.props.map(field).join("")}</form>
      ${!ro ? `<div class="f-act"><button class="btn" type="button" data-dup>Duplicate</button><button class="btn danger" type="button" data-del>Delete</button></div>` : ""}</section>
      ${isGroup(n) ? "" : `<section class="card"><div class="tc-k">Monthly cost</div><div class="tc-v sm">${money(tot, 2)}</div><ul class="mini">${lines.map((l) => `<li><span>${esc(l.label)}<small>${esc(l.basis)}</small></span><b>${money(l.amount, 2)}</b></li>`).join("") || "<li><span>No direct charge</span><b>$0</b></li>"}</ul></section>`}
      ${fs.length ? `<section class="card"><div class="tc-k">Findings for this service</div>${fs.map((f) => findingCard(f, review.findings.indexOf(f))).join("")}</section>` : ""}`;
  }
  // panel events (delegated)
  $("#inspector").addEventListener("click", (ev) => {
    const t = ev.target.closest("button"); if (!t) return;
    if (t.dataset.go) switchTab(t.dataset.go);
    if (t.hasAttribute("data-compare")) openCompare();
    if (t.dataset.fix != null) { const f = review.findings[+t.dataset.fix]; if (f && f.fix) { f.fix.apply(S); commit("fix"); toast("Fixed: " + f.title.replace(/\.$/, "")); } }
    if (t.hasAttribute("data-fixall")) { let k = 0; for (let pass = 0; pass < 25; pass++) { const r = AD.analyze(S, helpers); const f = r.findings.find((x) => x.fix); if (!f) break; f.fix.apply(S); applyPlacement(); k++; } commit("fixall"); toast(`Applied ${k} fix${k === 1 ? "" : "es"}`); }
    if (t.dataset.show != null) { const f = review.findings[+t.dataset.show]; sel = new Set(f.nodes); render(); focusOn(f.nodes); }
    if (t.classList.contains("switch")) { const n = nodeById([...sel][0]); n.props[t.dataset.k] = !n.props[t.dataset.k]; commit("prop"); }
    if (t.hasAttribute("data-del")) del();
    if (t.hasAttribute("data-dup")) dup();
    if (t.hasAttribute("data-reverse")) { const e = S.edges.find((x) => x.id === selEdge); [e.from, e.to] = [e.to, e.from]; commit("reverse"); }
  });
  function setRegion(code) {
    if (!REGIONS.some((r) => r.code === code) || code === S.region) return;
    S.region = code; relabelAz(S); commit("region"); buildTemplatesSoon(); toast("Pricing for " + code + " · " + regionName(code));
  }
  let tplTimer = null; function buildTemplatesSoon() { clearTimeout(tplTimer); tplTimer = setTimeout(() => { if (P) buildTemplates(); }, 400); }
  $("#inspector").addEventListener("change", (ev) => {
    const t = ev.target;
    if (t.classList.contains("region-sel")) { setRegion(t.value); return; } if (!t.dataset.k || !sel.size) return; const n = nodeById([...sel][0]); const d = CATALOG[n.type].props.find((x) => x.k === t.dataset.k);
    let v = t.value; if (d.type === "num") { v = Math.max(d.min != null ? d.min : 0, Math.min(d.max != null ? d.max : 1e9, parseFloat(v) || 0)); } else if (d.type === "select" && typeof d.options[0] === "number") v = +v;
    n.props[d.k] = v;
    if (n.type === "az" && d.k === "zone") n.label = "Availability Zone " + S.region + v;
    if (n.type === "subnet" && d.k === "tier") n.label = v === "public" ? "Public subnet" : "Private subnet";
    commit("prop");
  });
  $("#inspector").addEventListener("input", (ev) => {
    if (ev.target.id === "prop-label") { const n = nodeById([...sel][0]); n.label = ev.target.value || CATALOG[n.type].name; render(); clearTimeout(ev.target._t); ev.target._t = setTimeout(() => commit("label"), 500); }
  });
  function focusOn(ids) {
    const ns = ids.map((i) => nodeById(i)).filter(Boolean); if (!ns.length) return;
    const b = bounds({ nodes: ns }); const r = svg.getBoundingClientRect();
    const k = Math.min(view.k, 1.1); view.k = k; view.x = r.width / 2 - (b.x + b.w / 2) * k; view.y = r.height / 2 - (b.y + b.h / 2) * k; setView();
    svg.classList.add("flash"); setTimeout(() => svg.classList.remove("flash"), 900);
  }

  // ---------- edit ops ----------
  function del() {
    if (selEdge) { S.edges = S.edges.filter((e) => e.id !== selEdge); selEdge = null; commit("del"); return; }
    if (!sel.size) return;
    S.nodes = S.nodes.filter((n) => !sel.has(n.id)); S.edges = S.edges.filter((e) => !sel.has(e.from) && !sel.has(e.to));
    const k = sel.size; sel.clear(); commit("del"); switchTab(lastTab); toast(`Deleted ${k} item${k === 1 ? "" : "s"} · Ctrl+Z to undo`);
  }
  function dup() {
    if (!sel.size) return; const map = {}; const add = [];
    [...sel].forEach((id) => { const n = nodeById(id); const c = JSON.parse(JSON.stringify(n)); c.id = nextIdAvoid(add); c.x += 40; c.y += 40; c.label = n.label + " copy"; map[id] = c.id; add.push(c); });
    S.nodes.push(...add);
    S.edges.filter((e) => map[e.from] && map[e.to]).forEach((e) => S.edges.push({ id: nextId("e"), from: map[e.from], to: map[e.to] }));
    sel = new Set(Object.values(map)); commit("dup"); renderPanels();
  }
  function nextIdAvoid(extra) { let i = 1; const used = new Set(S.nodes.map((n) => n.id).concat(extra.map((n) => n.id))); while (used.has("n" + i)) i++; return "n" + i; }
  function nudge(dx, dy) { if (!sel.size) return; sel.forEach((id) => { const n = nodeById(id); n.x += dx; n.y += dy; }); commit("nudge"); }

  // ---------- load/save/share ----------
  function validate(o) {
    if (!o || !Array.isArray(o.nodes) || !Array.isArray(o.edges)) throw new Error("Not an Architect's Desk file");
    o.nodes = o.nodes.filter((n) => n && CATALOG[n.type] && isFinite(n.x) && isFinite(n.y)).map((n) => {
      const def = CATALOG[n.type]; const p = defaults(n.type); def.props.forEach((d) => { if (n.props && n.props[d.k] != null) p[d.k] = n.props[d.k]; });
      const r = { id: String(n.id), type: n.type, x: +n.x, y: +n.y, label: String(n.label || def.name).slice(0, 60), props: p };
      if (def.container) { r.w = Math.max(160, +n.w || def.w); r.h = Math.max(100, +n.h || def.h); }
      return r; });
    const ids = new Set(o.nodes.map((n) => n.id));
    o.edges = o.edges.filter((e) => e && ids.has(e.from) && ids.has(e.to)).map((e) => ({ id: String(e.id), from: e.from, to: e.to }));
    const region = REGIONS.some((r) => r.code === o.region) ? o.region : (S && S.region) || DEF_REGION;
    return { v: 1, region, title: String(o.title || "Untitled architecture").slice(0, 80), template: o.template || null, nodes: o.nodes, edges: o.edges };
  }
  function load(o, opts) {
    if (S && !(opts && opts.fresh)) undoStack.push(snapshot());
    S = validate(o); relabelAz(S); redoStack.length = 0; sel.clear(); selEdge = null; applyPlacement(); lastSaved = snapshot(); changed(); requestAnimationFrame(fit);
  }
  function download(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  const slug = () => (S.title || "architecture").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "architecture";
  async function encodeState() {
    const json = JSON.stringify(S);
    if ("CompressionStream" in window) {
      const cs = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const buf = new Uint8Array(await new Response(cs).arrayBuffer()); let s = ""; buf.forEach((b) => { s += String.fromCharCode(b); });
      return "z" + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    return "j" + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function decodeState(s) {
    const kind = s[0]; const b64 = s.slice(1).replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    if (kind === "z") { const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0)); const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")); return JSON.parse(await new Response(ds).text()); }
    return JSON.parse(decodeURIComponent(escape(bin)));
  }
  async function share() {
    const code = await encodeState(); const url = (location.protocol === "app:" ? "https://norselabs.net/architect/" : location.origin + location.pathname) + "#d=" + code;
    history.replaceState(null, "", "#d=" + code);
    try { await navigator.clipboard.writeText(url); toast("Share link copied. Anyone with it sees this exact diagram."); } catch (e) { toast("Share link is in the address bar"); }
    return url;
  }

  // ---------- export ----------
  const STYLE_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity", "font-family", "font-size", "font-weight", "letter-spacing", "text-transform", "display", "visibility"];
  function exportSVG() {
    const b = bounds(); const pad = 40; const x = b.x - pad, y = b.y - pad - 10, w = b.w + pad * 2, hh = b.h + pad * 2 + 46;
    const saveSel = sel, saveEdge = selEdge; sel = new Set(); selEdge = null; render();
    const clone = world.cloneNode(true);
    const src = [world, ...world.querySelectorAll("*")], dst = [clone, ...clone.querySelectorAll("*")];
    src.forEach((s, i) => { const cs = getComputedStyle(s); dst[i].setAttribute("style", STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";")); dst[i].removeAttribute("class"); });
    clone.querySelector("#grid") && clone.querySelector("#grid").remove();
    clone.querySelectorAll("[data-port],[data-resize]").forEach((e) => e.remove());
    clone.removeAttribute("transform"); clone.removeAttribute("id");
    const bg = getComputedStyle($("#stage")).getPropertyValue("--canvas-bg").trim() || "#141210";
    const ink = getComputedStyle($("#stage")).getPropertyValue("--grp-ink").trim() || "#cfc6b8";
    const total = $("#hud-total").textContent;
    const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${hh}" width="${w}" height="${hh}"><defs>${$("#canvas defs").innerHTML.replace(/class="arrowhead( sel)?"/g, `fill="${getComputedStyle($(".arrowhead")).fill}"`)}</defs><rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${bg}"/>${clone.innerHTML}<text x="${x + 24}" y="${y + hh - 18}" font-family="Inter, Arial, sans-serif" font-size="13" fill="${ink}" opacity=".75">${esc(S.title)} · est. ${esc(total)}/mo (${esc(S.region)}, on-demand) · Architect's Desk · norselabs.net</text></svg>`;
    sel = saveSel; selEdge = saveEdge; render();
    return { svg: out, w, h: hh };
  }
  function exportPNG() {
    const { svg: s, w, h: hh } = exportSVG(); const scale = Math.min(2, 8000 / Math.max(w, hh));
    const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(hh * scale); const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => { download(slug() + ".png", b); toast("PNG exported"); }, "image/png"); };
    img.onerror = () => toast("PNG export failed in this browser; try SVG");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }
  function doExport(act) {
    $("#menu-export").hidden = true; $("#btn-export").setAttribute("aria-expanded", "false");
    if (act === "png") exportPNG();
    if (act === "svg") { download(slug() + ".svg", new Blob([exportSVG().svg], { type: "image/svg+xml" })); toast("SVG exported"); }
    if (act === "json") { download(slug() + ".architect.json", new Blob([JSON.stringify(S, null, 2)], { type: "application/json" })); toast("Saved " + slug() + ".architect.json"); }
    if (act === "open") $("#file-open").click();
    if (act === "tf") { const tf = AD.terraform(S, placement); download(slug() + ".tf", new Blob([tf], { type: "text/plain" })); toast("Starter Terraform downloaded"); }
    if (act === "share") share();
  }
  $("#file-open").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { load(JSON.parse(await f.text())); toast("Opened " + f.name); } catch (e) { toast("Couldn't open that file: " + e.message); }
    ev.target.value = "";
  });

  // ---------- toolbar, modals, keys ----------
  $("#btn-undo").onclick = undo; $("#btn-redo").onclick = redo;
  $("#btn-zoom-in").onclick = () => zoomAt(view.k * 1.2); $("#btn-zoom-out").onclick = () => zoomAt(view.k / 1.2); $("#btn-fit").onclick = fit;
  $("#btn-snap").onclick = () => { snap = !snap; $("#btn-snap").setAttribute("aria-pressed", String(snap)); toast("Snap to grid " + (snap ? "on" : "off")); };
  $("#btn-share").onclick = share;
  $("#btn-export").onclick = (ev) => { ev.stopPropagation(); const m = $("#menu-export"); m.hidden = !m.hidden; $("#btn-export").setAttribute("aria-expanded", String(!m.hidden)); if (!m.hidden) $("button", m).focus(); };
  $("#menu-export").addEventListener("click", (ev) => { const b = ev.target.closest("[data-act]"); if (b) doExport(b.dataset.act); });
  document.addEventListener("click", (ev) => { if (!ev.target.closest(".menuwrap")) { $("#menu-export").hidden = true; $("#btn-export").setAttribute("aria-expanded", "false"); } });
  $("#doc-title").addEventListener("change", (ev) => { S.title = ev.target.value.trim() || "Untitled architecture"; commit("title"); });
  let modalReturn = null;
  function openModal(id) { modalReturn = document.activeElement; const m = $(id); m.hidden = false; setTimeout(() => ($("[data-close]", m) || m).focus(), 10); }
  function closeModal(m) { m.hidden = true; if (modalReturn && modalReturn.focus) modalReturn.focus(); }
  $$(".modal").forEach((m) => { m.addEventListener("click", (ev) => { if (ev.target === m || ev.target.closest("[data-close]")) closeModal(m); }); });
  $("#btn-templates").onclick = () => openModal("#m-templates");
  $("#btn-help").onclick = () => openModal("#m-help");
  document.addEventListener("click", (ev) => { if (ev.target.closest("[data-open-templates]")) openModal("#m-templates"); });
  function buildTemplates() {
    const g = $("#tgrid"); g.textContent = "";
    Object.entries(TEMPLATES).forEach(([key, t]) => {
      const st = t.make(); applyPlacement(st);
      const cost = st.nodes.reduce((s, n) => s + AD.costTotal(AD.cost(n, P)), 0);
      const b = h("button", "tcard"); b.type = "button"; b.dataset.template = key;
      b.innerHTML = `<span class="tthumb">${thumb(st)}</span><span class="tname">${esc(t.name)}</span><span class="tblurb">${esc(t.blurb)}</span><span class="tmeta">${st.nodes.filter((n) => !isGroup(n)).length} services · ~${money(cost, 0)}/mo</span>`;
      b.onclick = () => { load(t.make()); closeModal($("#m-templates")); toast("Loaded " + t.name + " · Ctrl+Z to go back"); };
      g.appendChild(b);
    });
  }
  function thumb(st) {
    if (!st.nodes.length) return `<svg viewBox="0 0 160 90"><rect x="50" y="25" width="60" height="40" rx="6" class="th-g"/><path d="M80 37v16M72 45h16" class="th-plus"/></svg>`;
    const b = bounds(st); const k = Math.min(150 / b.w, 80 / b.h); const ox = (160 - b.w * k) / 2 - b.x * k, oy = (90 - b.h * k) / 2 - b.y * k;
    const c = (n) => ({ x: ox + (n.x + size(n).w / 2) * k, y: oy + (n.y + size(n).h / 2) * k });
    return `<svg viewBox="0 0 160 90">${st.nodes.filter(isGroup).map((g) => `<rect x="${ox + g.x * k}" y="${oy + g.y * k}" width="${g.w * k}" height="${g.h * k}" rx="2" class="th-g"/>`).join("")}${st.edges.map((e) => { const a = c(st.nodes.find((n) => n.id === e.from)), z = c(st.nodes.find((n) => n.id === e.to)); return `<line x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}" class="th-e"/>`; }).join("")}${st.nodes.filter((n) => !isGroup(n)).map((n) => `<rect x="${ox + n.x * k}" y="${oy + n.y * k}" width="${NW * k}" height="${NH * k}" rx="2" class="th-n cat-${CATALOG[n.type].cat}"/>`).join("")}</svg>`;
  }
  document.addEventListener("keydown", (ev) => {
    const tag = (ev.target.tagName || "").toLowerCase(); const typing = ["input", "select", "textarea"].includes(tag);
    const openM = $$(".modal").find((m) => !m.hidden);
    if (ev.key === "Escape") { if (openM) { closeModal(openM); return; } if (!$("#onboard").hidden) { endOnboard(); return; } $("#menu-export").hidden = true; sel.clear(); selEdge = null; render(); switchTab(lastTab); renderPanels(); return; }
    if (openM || typing) return;
    const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (mod && k === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
    if (mod && (k === "y" || (k === "z" && ev.shiftKey))) { ev.preventDefault(); redo(); return; }
    if (mod && k === "s") { ev.preventDefault(); doExport("json"); return; }
    if (mod && k === "o") { ev.preventDefault(); doExport("open"); return; }
    if (mod && k === "e") { ev.preventDefault(); doExport("png"); return; }
    if (viewOnly()) return;
    if (mod && k === "d") { ev.preventDefault(); dup(); return; }
    if (mod && k === "a") { ev.preventDefault(); sel = new Set(S.nodes.filter((n) => !isGroup(n)).map((n) => n.id)); render(); renderPanels(); return; }
    if (mod) return;
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); del(); return; }
    if (ev.key.startsWith("Arrow") && sel.size) { ev.preventDefault(); const s = ev.shiftKey ? GRID * 2 : snap ? GRID : 1; nudge(ev.key === "ArrowLeft" ? -s : ev.key === "ArrowRight" ? s : 0, ev.key === "ArrowUp" ? -s : ev.key === "ArrowDown" ? s : 0); return; }
    if (k === "g") { $("#btn-snap").click(); return; }
    if (k === "f") { fit(); return; }
    if (k === "0") { zoomAt(1); return; }
    if (ev.key === "+" || ev.key === "=") { zoomAt(view.k * 1.2); return; }
    if (ev.key === "-") { zoomAt(view.k / 1.2); return; }
    if (k === "t") { openModal("#m-templates"); return; }
    if (ev.key === "?") { openModal("#m-help"); return; }
  });

  // ---------- onboarding ----------
  const OB = [
    ["Welcome to Architect's Desk", "Design an AWS architecture, see what it costs each month, and get a Well-Architected review as you go. We've loaded a 3-tier web app to start.", null],
    ["Add services", "Drag anything from this list onto the canvas. Drop it inside a VPC, AZ or subnet and it picks up that placement.", "#palette"],
    ["Live cost and review", "The estimate uses published AWS prices for the region you pick (36 regions, including GovCloud). The review scores six pillars and many findings have a one-click fix. Try “Enable Multi-AZ”.", "#inspector"],
    ["Save, share, export", "Your work autosaves here. Share copies a link with the whole diagram in it; Export makes PNG, SVG, JSON or starter Terraform.", "#btn-export"]
  ];
  let obI = 0;
  function showOnboard() {
    const o = $("#onboard"); const [t, d, target] = OB[obI];
    $("#ob-body").innerHTML = `<div class="ob-k">${obI + 1} of ${OB.length}</div><h2 id="ob-h">${esc(t)}</h2><p>${esc(d)}</p><div class="ob-act"><button class="btn ghost" type="button" data-ob="skip">Skip</button><button class="btn primary" type="button" data-ob="next">${obI === OB.length - 1 ? "Start designing" : "Next"}</button></div>`;
    o.hidden = false; $$(".ob-target").forEach((e) => e.classList.remove("ob-target"));
    o.className = "onboard" + (target ? " at-" + target.replace(/[#]/g, "") : " center");
    if (target) $(target).classList.add("ob-target");
    $("[data-ob=next]", o).focus();
  }
  function endOnboard() { $("#onboard").hidden = true; $$(".ob-target").forEach((e) => e.classList.remove("ob-target")); try { localStorage.setItem(OB_KEY, "1"); } catch (e) {} }
  $("#onboard").addEventListener("click", (ev) => { const b = ev.target.closest("[data-ob]"); if (!b) return; if (b.dataset.ob === "skip" || obI === OB.length - 1) endOnboard(); else { obI++; showOnboard(); } });

  // ---------- compare regions ----------
  async function regionTotals() {
    const res = await Promise.all(REGIONS.map((r) => fetchPrices(r.code).then((Pr) => {
      let total = 0; const na = new Set();
      S.nodes.forEach((n) => { if (isGroup(n)) return; const ls = AD.cost(n, Pr); total += AD.costTotal(ls); if (ls.some((l) => l.na)) na.add(n.label); });
      return { code: r.code, name: r.name, gov: r.gov, total, na: [...na] };
    }).catch(() => ({ code: r.code, name: r.name, gov: r.gov, total: null, na: [], err: true }))));
    return res.sort((a, b) => (a.na.length > 0) - (b.na.length > 0) || (a.total == null) - (b.total == null) || a.total - b.total);
  }
  async function openCompare() {
    openModal("#m-compare"); const box = $("#cmp-list"); box.innerHTML = '<p class="muted">Pricing this design in every region…</p>';
    const rows = await regionTotals(); const full = rows.filter((r) => !r.na.length && r.total != null);
    const max = Math.max(...rows.map((r) => r.total || 0), 1); const base = rows.find((r) => r.code === S.region);
    $("#cmp-sub").textContent = `${S.title} · ${rows.length} regions · cheapest fully-available: ${full[0] ? full[0].code + " " + money(full[0].total, 0) + "/mo" : "none"}. Regions where something isn't offered are listed last; their totals exclude those services.`;
    box.innerHTML = `<ol class="cmp">${rows.map((r, i) => `<li class="${r.code === S.region ? "cur" : ""}${r.na.length ? " partial" : ""}"><button type="button" data-region="${r.code}" title="Price this design in ${esc(r.name)}">
      <span class="cmp-rank">${i + 1}</span><span class="cmp-n"><b>${esc(r.code)}</b><small>${esc(r.name)}</small></span>
      <span class="cmp-bar"><i style="width:${r.total ? Math.max(1.5, (r.total / max) * 100) : 0}%"></i></span>
      <span class="cmp-v">${r.total == null ? "—" : money(r.total, 0)}${base && base.total && r.total != null && r.code !== S.region ? `<small>${r.total >= base.total ? "+" : "−"}${Math.abs(Math.round((r.total / base.total - 1) * 100))}%</small>` : r.code === S.region ? "<small>current</small>" : ""}</span>
      ${r.na.length ? `<span class="cmp-na">Not available: ${esc(r.na.join(", "))}</span>` : ""}</button></li>`).join("")}</ol>`;
  }
  $("#m-compare").addEventListener("click", (ev) => { const b = ev.target.closest("[data-region]"); if (b) { setRegion(b.dataset.region); closeModal($("#m-compare")); } });

  // ---------- toast ----------
  let tt = null;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; t.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => { t.classList.remove("on"); setTimeout(() => { t.hidden = true; }, 250); }, 2400); }

  // ---------- boot ----------
  function applyMode() { document.body.classList.toggle("view-only", viewOnly()); }
  addEventListener("resize", () => { applyMode(); if (S) { render(); renderPanels(); } });
  async function boot() {
    applyMode();
    try { const idx = await (await fetch("data/regions/index.json")).json(); REGIONS = idx.regions; await fetchPrices(idx.default); P = loadedPrices(idx.default); }
    catch (e) { document.body.insertAdjacentHTML("beforeend", '<div class="fatal">Couldn\'t load the price list. Please reload the page.</div>'); return; }
    buildPalette(); buildTemplates();
    let st = null;
    const m = location.hash.match(/^#d=(.+)$/);
    if (m) { try { st = await decodeState(m[1]); } catch (e) { toast("That share link looks damaged; opened your last design instead"); } }
    if (!st) { try { const raw = localStorage.getItem(LS_KEY); if (raw) st = JSON.parse(raw); } catch (e) {} }
    let first = false; if (!st) { st = TEMPLATES.threeTier.make(); first = true; }
    try { load(st, { fresh: true }); } catch (e) { load(TEMPLATES.threeTier.make(), { fresh: true }); }
    if (S.region !== DEF_REGION) { try { await fetchPrices(S.region); } catch (e) {} changed(); }
    undoStack.length = 0; $("#btn-undo").disabled = true; $("#btn-redo").disabled = true;
    let ob = false; try { ob = localStorage.getItem(OB_KEY) === "1"; } catch (e) {}
    if (first && !ob && !viewOnly() && !/[?&]noonboard/.test(location.search)) setTimeout(showOnboard, 400);
    document.body.classList.add("ready");
  }
  window.__AD = { get state() { return S; }, get review() { return review; }, get view() { return view; }, load, share, exportSVG, fit, addNode, connect, undo, redo, select: (ids) => { sel = new Set(ids); render(); showProps(); }, decodeState, templates: TEMPLATES, terraform: () => AD.terraform(S, placement), get prices() { return P; }, setRegion, regionTotals, openCompare };
  boot();
})();
