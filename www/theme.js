/* ============================================================
   ARISE THEME STUDIO  (www/theme.js)
   App-wide themes: brightness, signature themes, rank auras,
   custom hue, atmosphere effects. Delete this file + its <script>
   tag to remove the feature.
   ============================================================ */
(function () {
    'use strict';

    /* ---------- storage ---------- */
    const KEY = 'ariseTheme';
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    };

    /* ---------- data ---------- */
    function hexToHsl(hex) {
        const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
        if (mx !== mn) {
            const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
        }
        return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
    }
    const SIG = [
        { id: 'system', name: 'System',         sub: 'CYAN HUD',  h: 199, s: 92, l: 60, bgH: 212, fx: 'stars' },
        { id: 'shadow', name: 'Shadow Monarch', sub: 'VIOLET',    h: 268, s: 85, l: 68, bgH: 262, fx: 'motes' },
        { id: 'blood',  name: 'Blood Rage',     sub: 'CRIMSON',   h: 2,   s: 84, l: 62, bgH: 350, fx: 'embers' },
        { id: 'jade',   name: 'Jade Gate',      sub: 'EMERALD',   h: 152, s: 75, l: 52, bgH: 165, fx: 'rain' },
        { id: 'gold',   name: 'Monarch Gold',   sub: 'S-CLASS',   h: 42,  s: 96, l: 58, bgH: 36,  fx: 'aurora' },
        { id: 'frost',  name: 'Frostbite',      sub: 'ICE',       h: 195, s: 72, l: 78, bgH: 206, fx: 'snow' },
        { id: 'sakura', name: 'Sakura',         sub: 'BLOSSOM',   h: 336, s: 80, l: 72, bgH: 338, fx: 'petals' },
        { id: 'neon',   name: 'Neon Drive',     sub: 'SYNTHWAVE', h: 318, s: 96, l: 62, bgH: 258, fx: 'grid' }
    ];
    const RANKS = [['E', '#b57a50', 0], ['D', '#8faec6', 7], ['C', '#00ffaa', 15], ['B', '#00f0ff', 24], ['A', '#cc44ff', 34], ['S', '#ffb700', 45]]
        .map(([k, hex, lv]) => { const c = hexToHsl(hex); return Object.assign({ id: 'rank' + k, name: k + '-Rank', sub: lv ? 'LEVEL ' + lv : 'START', lv, fx: 'motes', bgH: c.h }, c); });
    const FX = [['auto', 'Theme default'], ['embers', 'Embers'], ['motes', 'Shadow motes'], ['snow', 'Snow'], ['petals', 'Petals'], ['rain', 'Matrix rain'], ['stars', 'Stars'], ['aurora', 'Aurora'], ['grid', 'Synth grid'], ['none', 'Off']];
    const DEFAULTS = { mode: 'dark', pack: 'system', custom: false, hue: 199, fx: 'none', density: 45, speed: 50, glass: 55, radius: 16, burst: true, saver: false };

    let S = Object.assign({}, DEFAULTS);
    let loaded = false;
    try { const raw = store.get(KEY); if (raw) { Object.assign(S, JSON.parse(raw)); loaded = true; } } catch (e) {}
    // migrate the old "profile card theme" (E/D/C/B/A/S) if present
    if (!loaded) { const old = store.get('cardTheme'); if (old && old !== 'default' && /^[EDCBAS]$/.test(old)) S.pack = 'rank' + old; }

    const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sysLight = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : { matches: false };
    const level = () => (typeof systemState !== 'undefined' && systemState && systemState.level) || 0;
    const packById = id => SIG.concat(RANKS).find(p => p.id === id) || SIG[0];
    const hsl = (h, s, l, a = 1) => `hsl(${h} ${s}% ${l}% / ${a})`;

    /* ---------- derive colours ---------- */
    let D = null;
    function derive() {
        const p = S.custom ? { id: 'custom', name: 'Custom', h: S.hue, s: 82, l: 62, bgH: S.hue, fx: 'motes' } : packById(S.pack);
        const mode = S.mode === 'auto' ? (sysLight.matches ? 'light' : 'dark') : S.mode;
        const ga = .25 + (S.glass / 100) * .65;
        let t;
        if (mode === 'light') {
            const al = Math.min(p.l, 44), as = Math.max(p.s, 62);
            t = {
                bg1: hsl(p.bgH, 45, 97), bg2: hsl(p.bgH, 40, 90), panelA: `hsl(0 0% 100% / ${Math.min(.97, ga + .2)})`, panelB: `hsl(${p.bgH} 40% 97% / ${Math.min(.97, ga + .2)})`,
                edge: 'rgb(15 23 42 / .14)', text: hsl(p.bgH, 45, 11), muted: hsl(p.bgH, 14, 36), accent: hsl(p.h, as, al), accent2: hsl((p.h + 40) % 360, as, al), L: al, S: as,
                nav: 'hsl(0 0% 100% / .94)', sheet: 'hsl(0 0% 100% / .98)', scrim: 'rgb(15 23 42 / .45)'
            };
        } else {
            const am = mode === 'amoled';
            t = {
                bg1: am ? hsl(p.bgH, 30, 4) : hsl(p.bgH, 38, 13), bg2: am ? '#000' : hsl(p.bgH, 50, 4),
                panelA: am ? hsl(p.bgH, 25, 12, ga) : hsl(p.bgH, 34, 24, ga), panelB: am ? hsl(p.bgH, 25, 8, ga) : hsl(p.bgH, 40, 13, ga),
                edge: 'rgb(255 255 255 / .12)', text: hsl(p.bgH, 40, 96), muted: hsl(p.bgH, 18, 70), accent: hsl(p.h, p.s, p.l), accent2: hsl((p.h + 40) % 360, p.s, p.l), L: p.l, S: p.s,
                nav: am ? hsl(p.bgH, 25, 6, .96) : hsl(p.bgH, 45, 10, .95), sheet: am ? hsl(p.bgH, 25, 6, .99) : hsl(p.bgH, 45, 10, .99), scrim: 'rgb(0 0 0 / .72)'
            };
        }
        return { p, mode, t, h: p.h };
    }

    /* ---------- injected CSS ---------- */
    const css = `
html { background: var(--t-bg2) !important; }
body::before {
    background:
        radial-gradient(42vmax 42vmax at 10% 5%,  color-mix(in srgb, var(--accent) 24%, transparent), transparent 70%),
        radial-gradient(48vmax 48vmax at 95% 28%, color-mix(in srgb, var(--accent2) 16%, transparent), transparent 70%),
        radial-gradient(50vmax 50vmax at 25% 100%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%),
        linear-gradient(180deg, var(--t-bg1), var(--t-bg2)) !important;
}
.bottom-nav { background: var(--t-nav) !important; }
.sl-modal-overlay { background: var(--t-scrim) !important; }
.sl-system-box, .notification-toast, #achievements-sheet, .quest-dropdown, .cal-tooltip { background: var(--t-sheet) !important; color: var(--t-text); }
.quest-header { background: var(--t-nav) !important; }
.fullscreen-modal {
    background:
        radial-gradient(60vmax 60vmax at 10% 0%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 70%),
        linear-gradient(180deg, var(--t-bg1), var(--t-bg2)) !important;
}
.system-panel.hud-card { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--t-panelA)), var(--t-panelB)) !important; }
#theme-fx { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; }

/* light mode: flip the hard-coded white text */
html[data-tmode="light"] .scanlines { display: none !important; }
html[data-tmode="light"] .system-panel, html[data-tmode="light"] .system-panel *:not(svg):not(path):not([style*="color"]),
html[data-tmode="light"] .bottom-nav, html[data-tmode="light"] .quest-header, html[data-tmode="light"] .quest-header *,
html[data-tmode="light"] #achievements-sheet, html[data-tmode="light"] #achievements-sheet *,
html[data-tmode="light"] .sl-system-box, html[data-tmode="light"] .quest-dropdown { text-shadow: none !important; }
html[data-tmode="light"] .system-panel, html[data-tmode="light"] .rank-progress-card, html[data-tmode="light"] .arcade-game-card { color: var(--t-text); box-shadow: 0 4px 14px rgba(15,23,42,.10) !important; }
html[data-tmode="light"] .bottom-nav { box-shadow: 0 6px 18px rgba(15,23,42,.15) !important; }


/* light mode: readable text and controls */
html[data-tmode="light"] .nav-item { color: var(--t-muted) !important; }
html[data-tmode="light"] .nav-item.active { color: var(--t-text) !important; }
html[data-tmode="light"] .save-btn, html[data-tmode="light"] .sys-dialog-btn-confirm-gold { color: #fff !important; }
html[data-tmode="light"] .sci-fi-btn, html[data-tmode="light"] .action-btn, html[data-tmode="light"] .filter-btn { color: var(--t-text); }
html[data-tmode="light"] h1, html[data-tmode="light"] h2, html[data-tmode="light"] h3, html[data-tmode="light"] .hud-name { color: var(--t-text); }
html[data-tmode="light"] .quest-title, html[data-tmode="light"] .quest-item .quest-title * { color: var(--t-text) !important; }
html[data-tmode="light"] input, html[data-tmode="light"] textarea, html[data-tmode="light"] select { color: var(--t-text); }
html[data-tmode="light"] .avatar { background-color: color-mix(in srgb, var(--t-text) 10%, transparent) !important; }

/* ---------- Theme Studio sheet ---------- */
#theme-studio { position: fixed; inset: 0; z-index: 10050; display: none; flex-direction: column; background: linear-gradient(180deg, var(--t-bg1), var(--t-bg2)); color: var(--t-text); }
#theme-studio * { font-family: system-ui, -apple-system, 'Roboto', 'Inter', sans-serif; box-sizing: border-box; }
.ts-top { display: flex; align-items: center; gap: 12px; padding: calc(env(safe-area-inset-top, 0px) + 14px) 16px 12px; border-bottom: 1px solid var(--t-edge); }
.ts-top .ts-title { flex: 1; font-size: 13px; letter-spacing: 3px; font-weight: 800; color: var(--accent); }
.ts-btn { padding: 8px 14px; border-radius: 10px; border: 1px solid var(--t-edge); background: color-mix(in srgb, var(--t-text) 6%, transparent); color: var(--t-text); font-size: 12px; letter-spacing: 1.5px; font-weight: 700; }
.ts-tabs { display: flex; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid var(--t-edge); }
.ts-tabs button { padding: 10px 14px; font-size: 11px; letter-spacing: 2px; font-weight: 800; color: var(--t-muted); border-bottom: 2px solid transparent; background: none; border-top: 0; border-left: 0; border-right: 0; }
.ts-tabs button[aria-selected="true"] { color: var(--t-text); border-bottom-color: var(--accent); }
.ts-body { flex: 1; overflow-y: auto; padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 40px); display: flex; flex-direction: column; gap: 22px; }
.ts-pane[hidden] { display: none; }
.ts-pane { display: flex; flex-direction: column; gap: 22px; }
.ts-lbl { font-size: 10px; letter-spacing: 2px; font-weight: 800; color: var(--t-muted); margin-bottom: 10px; }
.ts-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: color-mix(in srgb, var(--t-text) 6%, transparent); border: 1px solid var(--t-edge); }
.ts-seg button { padding: 10px 4px; border-radius: 9px; border: 0; background: none; color: var(--t-muted); font-size: 12px; font-weight: 800; letter-spacing: 1px; }
.ts-seg button[aria-pressed="true"] { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--t-text); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent); }
.ts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ts-card { text-align: left; border: 1px solid var(--t-edge); background: color-mix(in srgb, var(--t-text) 5%, transparent); border-radius: 14px; padding: 8px; display: flex; flex-direction: column; gap: 8px; color: var(--t-text); min-width: 0; }
.ts-card[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), 0 0 18px color-mix(in srgb, var(--accent) 30%, transparent); }
.ts-card.locked { opacity: .55; }
.ts-sw { position: relative; height: 58px; border-radius: 9px; overflow: hidden; border: 1px solid rgba(128,128,128,.25); }
.ts-sw i { position: absolute; display: block; }
.ts-sw .d { right: 8px; top: 8px; width: 16px; height: 16px; border-radius: 50%; }
.ts-sw .p { left: 8px; bottom: 8px; width: 46%; height: 9px; border-radius: 5px; }
.ts-sw .p2 { left: 8px; bottom: 22px; width: 28%; height: 5px; border-radius: 4px; opacity: .45; }
.ts-sw.custom { background: conic-gradient(from 0deg, #f87171, #fbbf24, #4ade80, #38bdf8, #a78bfa, #f472b6, #f87171); }
.ts-card .n { font-size: 13px; font-weight: 800; letter-spacing: .5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ts-card .s { font-size: 10px; letter-spacing: 1.5px; color: var(--t-muted); display: flex; justify-content: space-between; gap: 6px; }
.ts-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ts-chip { padding: 9px 13px; border-radius: 99px; border: 1px solid var(--t-edge); background: color-mix(in srgb, var(--t-text) 5%, transparent); color: var(--t-muted); font-size: 12px; font-weight: 800; }
.ts-chip[aria-pressed="true"] { color: var(--t-text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
.ts-sl { display: grid; grid-template-columns: 84px minmax(0, 1fr) 40px; gap: 10px; align-items: center; margin-bottom: 8px; }
.ts-sl label { font-size: 12px; font-weight: 800; letter-spacing: 1px; }
.ts-sl output { font-size: 12px; color: var(--t-muted); text-align: right; }
#theme-studio input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 26px; background: transparent; }
#theme-studio input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 99px; background: var(--trk, color-mix(in srgb, var(--t-text) 18%, transparent)); }
#theme-studio input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 50%; background: var(--t-text); border: 3px solid var(--accent); }
.ts-tg { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; width: 100%; text-align: left; margin-bottom: 8px; background: color-mix(in srgb, var(--t-text) 5%, transparent); border: 1px solid var(--t-edge); color: var(--t-text); }
.ts-tg b { display: block; font-size: 13px; } .ts-tg small { font-size: 11px; color: var(--t-muted); }
.ts-sw-t { flex: none; width: 44px; height: 26px; border-radius: 99px; background: color-mix(in srgb, var(--t-text) 20%, transparent); position: relative; }
.ts-sw-t::after { content: ""; position: absolute; left: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .2s; }
.ts-tg[aria-pressed="true"] .ts-sw-t { background: var(--accent); }
.ts-tg[aria-pressed="true"] .ts-sw-t::after { transform: translateX(18px); }
.ts-note { font-size: 11px; color: var(--t-muted); line-height: 1.5; }
`;
    const st = document.createElement('style'); st.id = 'theme-css'; st.textContent = css; document.head.appendChild(st);

    /* ---------- apply to the whole app ---------- */
    function applyVars() {
        D = derive(); const t = D.t, r = document.documentElement.style, set = (k, v) => r.setProperty(k, v);
        const acc = t.accent;
        // our own tokens
        set('--t-bg1', t.bg1); set('--t-bg2', t.bg2); set('--t-panelA', t.panelA); set('--t-panelB', t.panelB); set('--t-edge', t.edge);
        set('--t-text', t.text); set('--t-muted', t.muted); set('--t-nav', t.nav); set('--t-sheet', t.sheet); set('--t-scrim', t.scrim);
        // the app's existing tokens, so existing UI recolours automatically
        set('--accent', acc); set('--accent2', t.accent2);
        set('--rank-color', acc); set('--rank-color-glow', `hsl(${D.h} ${t.S}% ${t.L}% / .4)`); set('--rank-color-dim', `hsl(${D.h} ${t.S}% ${t.L}% / .13)`);
        set('--neon-blue', acc); set('--neon-blue-glow', `hsl(${D.h} ${t.S}% ${t.L}% / .5)`);
        set('--bg-dark', t.bg2); set('--text-main', t.text); set('--text-muted', t.muted);
        set('--panel-border', t.edge); set('--glass-edge', t.edge);
        set('--glass-card', `linear-gradient(135deg, ${t.panelA}, ${t.panelB})`);
        set('--r-lg', (S.radius + 6) + 'px'); set('--r-md', S.radius + 'px'); set('--r-sm', Math.max(4, S.radius - 5) + 'px');
        document.documentElement.setAttribute('data-tmode', D.mode);
        document.documentElement.style.colorScheme = D.mode === 'light' ? 'light' : 'dark';
        const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', D.mode === 'light' ? '#f4f6fb' : '#030b16');
    }
    function persist() { store.set(KEY, JSON.stringify(S)); }

    /* ---------- atmosphere canvas ---------- */
    let cv = null, ctx = null, W = 0, H = 0, P = [], B = [], cols = [], running = false, last = 0, tAcc = 0, kind = 'none';
    const rnd = (a, b) => a + Math.random() * (b - a);
    const rch = () => '01ｱｲｳｴｵｶｷｸｹｺｻｼｽ'.charAt(Math.floor(Math.random() * 15));
    function ensureCanvas() {
        if (cv) return;
        cv = document.createElement('canvas'); cv.id = 'theme-fx'; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv); ctx = cv.getContext('2d');
    }
    function resizeFx() {
        if (!cv) return; const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        W = window.innerWidth; H = window.innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); initFx();
    }
    function activeKind() { if (S.saver || reducedMotion) return 'none'; return S.fx === 'auto' ? D.p.fx : S.fx; }
    function spawn(p, first) {
        if (kind === 'embers') Object.assign(p, { x: rnd(0, W), y: first ? rnd(0, H) : H + 8, vy: -rnd(25, 80), vx: rnd(-10, 10), r: rnd(1, 2.6), ph: rnd(0, 6.28), a: rnd(.4, 1) });
        else if (kind === 'motes') Object.assign(p, { x: rnd(0, W), y: first ? rnd(0, H) : H + 12, vy: -rnd(8, 26), vx: rnd(-6, 6), r: rnd(2, 6), ph: rnd(0, 6.28), a: rnd(.2, .5) });
        else if (kind === 'snow') Object.assign(p, { x: rnd(0, W), y: first ? rnd(0, H) : -6, vy: rnd(16, 46), vx: 0, r: rnd(1, 3), ph: rnd(0, 6.28), a: rnd(.5, .95) });
        else if (kind === 'petals') Object.assign(p, { x: rnd(0, W), y: first ? rnd(0, H) : -12, vy: rnd(20, 42), vx: rnd(8, 26), r: rnd(4, 8), ph: rnd(0, 6.28), rot: rnd(0, 6.28), a: rnd(.55, .9) });
        else if (kind === 'stars') Object.assign(p, { x: rnd(0, W), y: rnd(0, H), r: rnd(.5, 1.7), ph: rnd(0, 6.28), sp: rnd(.6, 2) });
    }
    function initFx() {
        if (!D) return; kind = activeKind(); P = []; cols = [];
        if (kind === 'none' && !B.length) { if (cv) { cv.style.display = 'none'; } return; }
        ensureCanvas(); cv.style.display = 'block';
        const dn = S.density / 100, n = { embers: 70, motes: 50, snow: 100, petals: 30, stars: 80 }[kind];
        if (n) for (let i = 0; i < Math.round(n * dn); i++) { const p = {}; spawn(p, true); P.push(p); }
        if (kind === 'rain') { const cw = 14, nc = Math.floor(W / cw); for (let i = 0; i < nc; i++) if (Math.random() < .2 + dn * .55) cols.push({ x: i * cw + 2, y: rnd(-H, H), v: rnd(60, 160), ch: Array.from({ length: 12 }, rch) }); }
        kick();
    }
    function kick() { if (!running && cv && ctx) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

    function loop(now) {
        if (document.hidden) { running = false; return; }
        if (now - last < 32) { requestAnimationFrame(loop); return; }
        const dt = Math.min((now - last) / 1000, .1) * (.3 + S.speed / 50 * .9); last = now; tAcc += dt;
        ctx.clearRect(0, 0, W, H);
        const light = D.mode === 'light', h = D.h, s = D.t.S, l = D.t.L;
        ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
        const A = a => hsl(h, s, light ? l : Math.min(88, l + 8), a);

        if (kind === 'embers') for (const p of P) {
            p.y += p.vy * dt; p.x += (p.vx + Math.sin(tAcc * 2 + p.ph) * 14) * dt; if (p.y < -10) spawn(p);
            const f = p.a * (.6 + .4 * Math.sin(tAcc * 7 + p.ph));
            ctx.fillStyle = hsl((h + 12) % 360, s, light ? l : 66, f * .22); ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, 6.28); ctx.fill();
            ctx.fillStyle = hsl((h + 12) % 360, s, light ? l : 72, f); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
        } else if (kind === 'motes') for (const p of P) {
            p.y += p.vy * dt; p.x += (p.vx + Math.sin(tAcc * .8 + p.ph) * 10) * dt; if (p.y < -20) spawn(p);
            const f = p.a * (.7 + .3 * Math.sin(tAcc * 1.6 + p.ph));
            ctx.fillStyle = A(f * .14); ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.4, 0, 6.28); ctx.fill();
            ctx.fillStyle = A(f); ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .7, 0, 6.28); ctx.fill();
        } else if (kind === 'snow') for (const p of P) {
            p.y += p.vy * dt; p.x += Math.sin(tAcc * 1.2 + p.ph) * 14 * dt; if (p.y > H + 6) spawn(p);
            ctx.fillStyle = light ? hsl(h, s, l, p.a * .7) : hsl(h, 60, 94, p.a); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
        } else if (kind === 'petals') for (const p of P) {
            p.y += p.vy * dt; p.x += (p.vx + Math.sin(tAcc * 1.4 + p.ph) * 16) * dt; p.rot += dt * 1.6; if (p.y > H + 14 || p.x > W + 14) spawn(p);
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, .55 + .45 * Math.sin(p.rot * 1.3));
            ctx.fillStyle = hsl(h, s, light ? l : Math.min(80, l + 4), p.a); ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .6, 0, 0, 6.28); ctx.fill(); ctx.restore();
        } else if (kind === 'stars') {
            for (const p of P) { const f = .35 + .65 * Math.abs(Math.sin(tAcc * p.sp + p.ph)); ctx.fillStyle = light ? hsl(h, s, l, f * .6) : hsl(h, 50, 92, f); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
            const k = (tAcc % 6) / 6;
            if (k < .12) { const q = k / .12, sx = W * .9 - q * W * .5, sy = H * .1 + q * H * .16, g = ctx.createLinearGradient(sx, sy, sx + 90, sy - 36); g.addColorStop(0, A(.9 * (1 - q))); g.addColorStop(1, A(0)); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 90, sy - 36); ctx.stroke(); }
        } else if (kind === 'rain') {
            ctx.font = '12px monospace';
            for (const c of cols) {
                c.y += c.v * dt; if (c.y - 12 * 14 > H) { c.y = rnd(-80, 0); c.v = rnd(60, 160); }
                if (Math.random() < .08) c.ch[Math.floor(Math.random() * 12)] = rch();
                for (let i = 0; i < 12; i++) { const y = c.y - i * 14; if (y < 0 || y > H) continue; ctx.fillStyle = i === 0 ? (light ? hsl(h, s, l, .9) : hsl(h, 40, 92, .95)) : hsl(h, s, l, (1 - i / 12) * .45); ctx.fillText(c.ch[i], c.x, y); }
            }
        } else if (kind === 'aurora') {
            for (let k = 0; k < 3; k++) {
                const base = H * (.16 + k * .09), amp = 30 + k * 12, g = ctx.createLinearGradient(0, base - amp, 0, base + 230);
                g.addColorStop(0, hsl((h + k * 26) % 360, s, l, light ? .16 : .3)); g.addColorStop(1, hsl((h + k * 26) % 360, s, l, 0));
                ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, base + 230);
                for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base + Math.sin(x * .012 + tAcc * (.5 + k * .18) + k * 2) * amp + Math.sin(x * .03 - tAcc * .4) * amp * .35);
                ctx.lineTo(W, base + 230); ctx.closePath(); ctx.fill();
            }
        } else if (kind === 'grid') {
            const hz = H * .62, sun = ctx.createLinearGradient(0, hz - 130, 0, hz);
            sun.addColorStop(0, hsl((h + 40) % 360, s, l, light ? .28 : .5)); sun.addColorStop(1, hsl(h, s, l, light ? .18 : .35));
            ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(W / 2, hz, Math.min(W * .32, 130), Math.PI, 0); ctx.fill();
            ctx.lineWidth = 1; ctx.strokeStyle = hsl(h, s, l, light ? .3 : .42);
            for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 14, hz); ctx.lineTo(W / 2 + i * 80, H); ctx.stroke(); }
            for (let i = 0; i < 12; i++) { const q = ((i + tAcc * .9) % 12) / 12, y = hz + q * q * (H - hz); ctx.globalAlpha = .2 + q * .7; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
            ctx.globalAlpha = 1;
        }

        ctx.globalCompositeOperation = 'source-over';
        for (let i = B.length - 1; i >= 0; i--) {
            const b = B[i]; b.life -= dt * 1.7; if (b.life <= 0) { B.splice(i, 1); continue; }
            b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 220 * dt; ctx.fillStyle = b.c; ctx.globalAlpha = b.life; ctx.beginPath(); ctx.arc(b.x, b.y, 2.4 * b.life + .5, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
        }
        if (kind !== 'none' || B.length) requestAnimationFrame(loop); else { running = false; ctx.clearRect(0, 0, W, H); if (cv) cv.style.display = 'none'; }
    }

    /* sparks when a task is checked (called from toggleQuest) */
    let lastTap = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    document.addEventListener('pointerdown', e => { lastTap = { x: e.clientX, y: e.clientY }; }, true);
    const DIFF = { trivial: '#38bdf8', easy: '#4ade80', medium: '#fbbf24', hard: '#f87171' };
    window.themeBurst = function (difficulty) {
        if (!S.burst || S.saver || reducedMotion) return;
        ensureCanvas(); if (!W) { W = window.innerWidth; H = window.innerHeight; resizeFx(); }
        cv.style.display = 'block'; const c = DIFF[difficulty] || D.t.accent;
        for (let i = 0; i < 18; i++) { const a = rnd(0, 6.28), v = rnd(60, 190); B.push({ x: lastTap.x, y: lastTap.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 1, c }); }
        kick();
    };

    /* ---------- studio UI ---------- */
    let studio = null, pane = 'look';
    function modeCols(p) {
        const light = S.mode === 'light' || (S.mode === 'auto' && sysLight.matches), am = S.mode === 'amoled';
        return { a: light ? hsl(p.h, Math.max(p.s, 62), Math.min(p.l, 44)) : hsl(p.h, p.s, p.l), b1: light ? hsl(p.bgH, 45, 97) : am ? hsl(p.bgH, 30, 5) : hsl(p.bgH, 38, 14), b2: light ? hsl(p.bgH, 40, 89) : am ? '#000' : hsl(p.bgH, 50, 4) };
    }
    function card(p) {
        const c = modeCols(p), locked = p.lv && level() < p.lv, on = !S.custom && S.pack === p.id;
        const tag = p.id.startsWith('rank') ? (locked ? '<span>🔒 LV ' + p.lv + '</span>' : '<span>OPEN</span>') : '';
        return `<button class="ts-card${locked ? ' locked' : ''}" data-id="${p.id}" aria-pressed="${on}"><div class="ts-sw" style="background:linear-gradient(160deg,${c.b1},${c.b2})"><i class="d" style="background:${c.a};box-shadow:0 0 14px ${c.a}"></i><i class="p2" style="background:${c.a}"></i><i class="p" style="background:${c.a}"></i></div><div><div class="n">${p.name}</div><div class="s"><span>${p.sub}</span>${tag}</div></div></button>`;
    }
    function slider(id, label, min, max, val, suf) { return `<div class="ts-sl"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" value="${val}"><output id="${id}-o">${val}${suf}</output></div>`; }
    const seg = (cls, items, cur) => `<div class="ts-seg" data-seg="${cls}">${items.map(([v, n]) => `<button data-v="${v}" aria-pressed="${cur === v}">${n}</button>`).join('')}</div>`;

    function renderStudio() {
        if (!studio) return;
        const body = studio.querySelector('.ts-body'), keep = body ? body.scrollTop : 0;
        studio.innerHTML = `
        <div class="ts-top"><div class="ts-title">THEME · ${D.p.name.toUpperCase()}</div><button class="ts-btn" data-act="reset">RESET</button><button class="ts-btn" data-act="close">DONE</button></div>
        <div class="ts-tabs">${[['look', 'LOOK'], ['fx', 'EFFECTS'], ['tune', 'TUNE']].map(([k, n]) => `<button data-tab="${k}" aria-selected="${pane === k}">${n}</button>`).join('')}</div>
        <div class="ts-body">
          <div class="ts-pane" data-pane="look" ${pane === 'look' ? '' : 'hidden'}>
            <div><div class="ts-lbl">BRIGHTNESS</div>${seg('mode', [['dark', 'DARK'], ['light', 'LIGHT'], ['amoled', 'AMOLED'], ['auto', 'AUTO']], S.mode)}</div>
            <div><div class="ts-lbl">SIGNATURE THEMES</div><div class="ts-grid">${SIG.map(card).join('')}<button class="ts-card" data-id="custom" aria-pressed="${S.custom}"><div class="ts-sw custom"></div><div><div class="n">Custom</div><div class="s"><span>YOUR OWN HUE</span></div></div></button></div></div>
            <div><div class="ts-lbl">RANK AURAS</div><div class="ts-grid">${RANKS.map(card).join('')}</div></div>
          </div>
          <div class="ts-pane" data-pane="fx" ${pane === 'fx' ? '' : 'hidden'}>
            <div><div class="ts-lbl">BACKGROUND ATMOSPHERE</div><div class="ts-chips">${FX.map(([v, n]) => `<button class="ts-chip" data-fx="${v}" aria-pressed="${S.fx === v}">${n}</button>`).join('')}</div></div>
            <div>${slider('ts-den', 'Density', 0, 100, S.density, '%')}${slider('ts-spd', 'Speed', 10, 100, S.speed, '%')}</div>
            <div>
              <button class="ts-tg" data-tg="burst" aria-pressed="${S.burst}"><span><b>Completion sparks</b><small>A burst of particles when you check a task</small></span><span class="ts-sw-t"></span></button>
              <button class="ts-tg" data-tg="saver" aria-pressed="${S.saver || reducedMotion}"><span><b>Battery saver</b><small>Turns all motion off. Colours still change.</small></span><span class="ts-sw-t"></span></button>
            </div>
            <p class="ts-note">Effects are off by default to keep the app smooth. When on, they run at 30 fps and pause while the app is in the background.</p>
          </div>
          <div class="ts-pane" data-pane="tune" ${pane === 'tune' ? '' : 'hidden'}>
            <div><div class="ts-lbl">ACCENT HUE · DRAG TO MAKE YOUR OWN THEME</div><input type="range" id="ts-hue" min="0" max="360" value="${S.custom ? S.hue : D.p.h}" style="--trk:linear-gradient(90deg,hsl(0 85% 62%),hsl(60 85% 62%),hsl(120 85% 62%),hsl(180 85% 62%),hsl(240 85% 62%),hsl(300 85% 62%),hsl(360 85% 62%))"></div>
            <div>${slider('ts-glass', 'Panels', 10, 100, S.glass, '%')}${slider('ts-rad', 'Corners', 6, 28, S.radius, 'px')}</div>
          </div>
        </div>`;
        const nb = studio.querySelector('.ts-body'); if (nb) nb.scrollTop = keep;
    }

    function changed(opts) {
        opts = opts || {}; applyVars(); persist();
        if (opts.fx !== false) initFx();
        const t = studio && studio.querySelector('.ts-title'); if (t) t.textContent = 'THEME · ' + D.p.name.toUpperCase();
        if (opts.render) renderStudio();
    }

    function buildStudio() {
        studio = document.createElement('div'); studio.id = 'theme-studio'; document.body.appendChild(studio);
        studio.addEventListener('click', e => {
            const t = e.target;
            const act = t.closest('[data-act]'); if (act) { if (act.dataset.act === 'close') closeThemeStudio(); else { S = Object.assign({}, DEFAULTS); changed({ render: true }); } return; }
            const tab = t.closest('[data-tab]'); if (tab) { pane = tab.dataset.tab; renderStudio(); return; }
            const c = t.closest('.ts-card');
            if (c) {
                const id = c.dataset.id;
                if (id === 'custom') { S.custom = true; S.hue = S.hue || 200; pane = 'tune'; }
                else {
                    const p = packById(id);
                    if (p.lv && level() < p.lv) { if (typeof showFloatingMsg === 'function') showFloatingMsg('Locked. Reach Level ' + p.lv + ' to unlock.', hsl(p.h, p.s, p.l)); return; }
                    S.custom = false; S.pack = id; S.hue = p.h;
                }
                changed({ render: true }); return;
            }
            const sg = t.closest('.ts-seg button'); if (sg) { S.mode = sg.dataset.v; changed({ render: true }); return; }
            const fx = t.closest('[data-fx]'); if (fx) { S.fx = fx.dataset.fx; changed({ render: true }); return; }
            const tg = t.closest('[data-tg]'); if (tg) { const k = tg.dataset.tg; S[k] = !S[k]; changed({ render: true }); return; }
        });
        studio.addEventListener('input', e => {
            const id = e.target.id, v = +e.target.value, o = document.getElementById(id + '-o');
            if (id === 'ts-hue') { S.custom = true; S.hue = v; changed({ fx: false }); return; }
            if (id === 'ts-den') { S.density = v; o.textContent = v + '%'; changed(); }
            else if (id === 'ts-spd') { S.speed = v; o.textContent = v + '%'; changed({ fx: false }); }
            else if (id === 'ts-glass') { S.glass = v; o.textContent = v + '%'; changed({ fx: false }); }
            else if (id === 'ts-rad') { S.radius = v; o.textContent = v + 'px'; changed({ fx: false }); }
        });
    }

    window.openThemeStudio = function () { if (!studio) buildStudio(); renderStudio(); studio.style.display = 'flex'; };
    window.closeThemeStudio = function () { if (studio) studio.style.display = 'none'; };

    sysLight.addEventListener && sysLight.addEventListener('change', () => { if (S.mode === 'auto') changed({ render: true }); });
    window.addEventListener('resize', resizeFx);
    // the app re-applies the old card theme inside updateStats(); re-assert ours right after
    window.applyAriseTheme = function () { applyVars(); };

    applyVars();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { resizeFx(); }); else resizeFx();
})();