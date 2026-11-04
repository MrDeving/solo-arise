// ============================================================
// ARCADE — MINESWEEPER  (self-contained: www/minesweeper.js)
// Guess-free fields, safe first tap, pinch-zoom + pan, default action
// (reveal / flag) with long-press for the other one, chording, timer,
// per-difficulty best times, auto-saved game.
// Hooks used by app.js:  msOpen()  and  msStop()
// ============================================================
(function () {
    'use strict';

    const DIFFS = {
        easy:   { name: 'BEGINNER',     w: 9,  h: 9,  m: 10, reward: 2,  budget: 600 },
        medium: { name: 'INTERMEDIATE', w: 16, h: 16, m: 40, reward: 5,  budget: 1500 },
        hard:   { name: 'EXPERT',       w: 16, h: 30, m: 99, reward: 10, budget: 3000 },
    };
    const C = 40;                  // logical cell size
    const NUM_COLORS = ['', '#60a5fa', '#4ade80', '#f87171', '#c084fc', '#fb923c', '#22d3ee', '#e2e8f0', '#94a3b8'];

    // ---------- storage helpers ----------
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

    // ---------- neighbour tables ----------
    const _nbCache = {};
    function neighbours(w, h) {
        const key = w + 'x' + h;
        if (_nbCache[key]) return _nbCache[key];
        const nb = new Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const a = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < w && ny < h) a.push(ny * w + nx);
            }
            nb[y * w + x] = a;
        }
        return (_nbCache[key] = nb);
    }

    // ---------- guess-free generation ----------
    function computeAdj(w, h, mine, NB) {
        const adj = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
            if (mine[i]) continue;
            let c = 0;
            const a = NB[i];
            for (let k = 0; k < a.length; k++) c += mine[a[k]];
            adj[i] = c;
        }
        return adj;
    }

    // Deductive solver: single-cell rules + subset rule. Returns number of safe cells it can open.
    function solve(w, h, adj, NB, start) {
        const n = w * h;
        const st = new Uint8Array(n);        // 0 unknown, 1 open, 2 deduced mine
        let opened = 0;
        const stack = [start];
        const flood = () => {
            while (stack.length) {
                const i = stack.pop();
                if (st[i] !== 0) continue;
                st[i] = 1; opened++;
                if (adj[i] === 0) { const a = NB[i]; for (let k = 0; k < a.length; k++) if (st[a[k]] === 0) stack.push(a[k]); }
            }
        };
        flood();
        let progress = true;
        while (progress) {
            progress = false;
            const cons = [];
            const conAt = new Array(n).fill(null);
            for (let i = 0; i < n; i++) {
                if (st[i] !== 1 || adj[i] === 0) continue;
                const unk = []; let mines = adj[i];
                const a = NB[i];
                for (let k = 0; k < a.length; k++) { const j = a[k]; if (st[j] === 0) unk.push(j); else if (st[j] === 2) mines--; }
                if (!unk.length) continue;
                if (mines === 0) { for (const j of unk) stack.push(j); progress = true; }
                else if (mines === unk.length) { for (const j of unk) st[j] = 2; progress = true; }
                else { const c = { i, u: unk, m: mines }; cons.push(c); conAt[i] = c; }
            }
            if (stack.length) { flood(); continue; }
            if (progress) continue;
            for (const a of cons) {
                const ax = a.i % w, ay = (a.i / w) | 0;
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    const bx = ax + dx, by = ay + dy;
                    if ((!dx && !dy) || bx < 0 || by < 0 || bx >= w || by >= h) continue;
                    const b = conAt[by * w + bx];
                    if (!b || a.u.length >= b.u.length) continue;
                    let sub = true;
                    for (const j of a.u) if (b.u.indexOf(j) < 0) { sub = false; break; }
                    if (!sub) continue;
                    const diff = b.u.filter(j => a.u.indexOf(j) < 0);
                    const dm = b.m - a.m;
                    if (dm === 0) { for (const j of diff) if (st[j] === 0) { stack.push(j); progress = true; } }
                    else if (dm === diff.length) { for (const j of diff) if (st[j] === 0) { st[j] = 2; progress = true; } }
                }
            }
            if (stack.length) flood();
        }
        return opened;
    }

    // Build a field whose 3x3 around `startIdx` is mine-free and that the solver can clear without guessing.
    // Time-sliced so the UI never freezes; if the budget runs out the best attempt is used.
    function generateAsync(key, startIdx, cb) {
        const D = DIFFS[key], w = D.w, h = D.h, m = D.m, n = w * h, NB = neighbours(w, h);
        const safe = new Uint8Array(n);
        safe[startIdx] = 1;
        for (const j of NB[startIdx]) safe[j] = 1;
        const cand = [];
        for (let i = 0; i < n; i++) if (!safe[i]) cand.push(i);
        let best = null, bestOpen = -1, tries = 0;
        const t0 = performance.now();
        const attempt = () => {
            const mine = new Uint8Array(n);
            const c = cand.slice();
            for (let k = 0; k < m; k++) {
                const j = k + ((Math.random() * (c.length - k)) | 0);
                const t = c[k]; c[k] = c[j]; c[j] = t;
                mine[c[k]] = 1;
            }
            const adj = computeAdj(w, h, mine, NB);
            return { mine, adj, opened: solve(w, h, adj, NB, startIdx) };
        };
        const slice = () => {
            const end = performance.now() + 12;
            do {
                const f = attempt(); tries++;
                if (f.opened === n - m) { cb(f.mine, f.adj, true, tries); return; }
                if (f.opened > bestOpen) { bestOpen = f.opened; best = f; }
            } while (performance.now() < end);
            if (performance.now() - t0 > D.budget) { cb(best.mine, best.adj, false, tries); return; }
            setTimeout(slice, 0);
        };
        slice();
    }

    // ---------- cell drawing (shared by board + card preview) ----------
    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function drawFlag(ctx, x, y, s) {
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = Math.max(1, s * 0.07);
        ctx.beginPath(); ctx.moveTo(x + s * 0.42, y + s * 0.2); ctx.lineTo(x + s * 0.42, y + s * 0.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + s * 0.3, y + s * 0.8); ctx.lineTo(x + s * 0.62, y + s * 0.8); ctx.stroke();
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.moveTo(x + s * 0.42, y + s * 0.2); ctx.lineTo(x + s * 0.74, y + s * 0.36); ctx.lineTo(x + s * 0.42, y + s * 0.52); ctx.closePath(); ctx.fill();
    }
    function drawMine(ctx, x, y, s) {
        const cx = x + s / 2, cy = y + s / 2;
        ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = Math.max(1, s * 0.06);
        for (let a = 0; a < 4; a++) {
            const an = a * Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(cx - Math.cos(an) * s * 0.3, cy - Math.sin(an) * s * 0.3);
            ctx.lineTo(cx + Math.cos(an) * s * 0.3, cy + Math.sin(an) * s * 0.3);
            ctx.stroke();
        }
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath(); ctx.arc(cx, cy, s * 0.19, 0, Math.PI * 2); ctx.fill();
    }
    // kind: h hidden, r revealed, f flag, m mine, x exploded mine, w wrong flag
    function drawCell(ctx, x, y, s, kind, num) {
        const g = Math.max(0.6, s * 0.035), r = s * 0.14;
        if (kind === 'h' || kind === 'f') {
            rr(ctx, x + g, y + g, s - g * 2, s - g * 2, r);
            ctx.fillStyle = '#21486b'; ctx.fill();
            rr(ctx, x + g, y + g, s - g * 2, (s - g * 2) * 0.55, r);
            ctx.fillStyle = 'rgba(125,211,252,0.13)'; ctx.fill();
            if (kind === 'f') drawFlag(ctx, x, y, s);
            return;
        }
        rr(ctx, x + g, y + g, s - g * 2, s - g * 2, r);
        ctx.fillStyle = kind === 'x' ? '#991b1b' : '#071423'; ctx.fill();
        if (kind === 'm' || kind === 'x') drawMine(ctx, x, y, s);
        else if (kind === 'w') {
            drawMine(ctx, x, y, s);
            ctx.strokeStyle = '#f87171'; ctx.lineWidth = Math.max(1.5, s * 0.09);
            ctx.beginPath(); ctx.moveTo(x + s * 0.2, y + s * 0.2); ctx.lineTo(x + s * 0.8, y + s * 0.8);
            ctx.moveTo(x + s * 0.8, y + s * 0.2); ctx.lineTo(x + s * 0.2, y + s * 0.8); ctx.stroke();
        } else if (num > 0) {
            ctx.fillStyle = NUM_COLORS[num];
            ctx.font = '800 ' + Math.round(s * 0.58) + 'px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(num, x + s / 2, y + s / 2 + s * 0.04);
        }
    }

    // ---------- game state ----------
    let S = null;                       // current game
    let diffKey = lsGet('ms_diff', 'easy'); if (!DIFFS[diffKey]) diffKey = 'easy';
    let mode = lsGet('ms_mode', 'reveal');   // default action: reveal | flag
    let ui = null;                      // DOM refs
    let view = { k: 1, ox: 0, oy: 0, fit: 1 };
    let timerId = null, rafPending = false, generating = false, isOpen = false;

    function newGame(key) {
        diffKey = key; lsSet('ms_diff', key);
        const D = DIFFS[key], n = D.w * D.h;
        S = { key, w: D.w, h: D.h, m: D.m, n, mine: null, adj: null,
              rev: new Uint8Array(n), flag: new Uint8Array(n),
              started: false, over: false, won: false, boom: -1,
              opened: 0, flags: 0, elapsed: 0, t0: 0, guessFree: true };
        generating = false;
        hideOverlay();
        fitView();
        updateHud(); setHint('TAP ANY CELL TO START · FIRST TAP IS ALWAYS SAFE');
        refreshDiffButtons(); requestDraw();
    }

    function save() {
        if (!S || S.over || !S.started) { if (!S || S.over) lsSet('ms_save', ''); return; }
        const str = a => Array.prototype.join.call(a, '');
        lsSet('ms_save', JSON.stringify({ key: S.key, mine: str(S.mine), rev: str(S.rev), flag: str(S.flag),
            elapsed: currentElapsed(), gf: S.guessFree }));
    }
    function loadSaved() {
        try {
            const j = JSON.parse(lsGet('ms_save', '') || 'null');
            if (!j || !DIFFS[j.key]) return false;
            const D = DIFFS[j.key], n = D.w * D.h;
            if (j.mine.length !== n || j.rev.length !== n || j.flag.length !== n) return false;
            const arr = s => Uint8Array.from(s.split(''), Number);
            const NB = neighbours(D.w, D.h);
            const mine = arr(j.mine), rev = arr(j.rev), flag = arr(j.flag);
            let opened = 0, flags = 0;
            for (let i = 0; i < n; i++) { opened += rev[i]; flags += flag[i]; }
            diffKey = j.key;
            S = { key: j.key, w: D.w, h: D.h, m: D.m, n, mine, adj: computeAdj(D.w, D.h, mine, NB), rev, flag,
                  started: true, over: false, won: false, boom: -1, opened, flags,
                  elapsed: j.elapsed || 0, t0: performance.now() - (j.elapsed || 0), guessFree: j.gf !== false };
            hideOverlay(); fitView(); updateHud(); setHint(''); refreshDiffButtons(); requestDraw();
            return true;
        } catch (e) { return false; }
    }

    const currentElapsed = () => !S ? 0 : (S.started && !S.over ? performance.now() - S.t0 : S.elapsed);

    // ---------- actions ----------
    function reveal(i) {
        if (!S || S.over || generating) return;
        if (S.flag[i]) return;
        if (!S.started) {
            generating = true;
            setHint('BUILDING A GUESS-FREE FIELD…');
            generateAsync(S.key, i, (mine, adj, ok) => {
                if (!S || S.started || !isOpen) { generating = false; return; }
                generating = false;
                S.mine = mine; S.adj = adj; S.guessFree = ok;
                S.started = true; S.t0 = performance.now();
                setHint('');
                openCell(i);
                startTimer();
            });
            return;
        }
        if (S.rev[i]) { chord(i); return; }
        openCell(i);
    }

    function openCell(i) {
        if (S.mine[i]) { return lose(i); }
        const NB = neighbours(S.w, S.h), stack = [i];
        while (stack.length) {
            const c = stack.pop();
            if (S.rev[c] || S.flag[c]) continue;
            S.rev[c] = 1; S.opened++;
            if (S.adj[c] === 0) for (const j of NB[c]) if (!S.rev[j] && !S.flag[j]) stack.push(j);
        }
        afterMove();
        if (S.opened === S.n - S.m) win();
    }

    function chord(i) {
        const a = S.adj[i];
        if (!a) return;
        const NB = neighbours(S.w, S.h)[i];
        let f = 0; for (const j of NB) f += S.flag[j];
        if (f !== a) return;
        let hitMine = -1;
        for (const j of NB) if (!S.flag[j] && !S.rev[j]) { if (S.mine[j]) { hitMine = j; } }
        if (hitMine >= 0) return lose(hitMine);
        for (const j of NB) if (!S.flag[j] && !S.rev[j]) { openCell(j); if (S.over) return; }
    }

    function toggleFlag(i) {
        if (!S || S.over || generating || S.rev[i]) return;
        if (!S.started) return;                  // nothing to flag before the field exists
        S.flag[i] ^= 1; S.flags += S.flag[i] ? 1 : -1;
        afterMove();
    }

    function afterMove() { updateHud(); requestDraw(); save(); }

    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
    function startTimer() {
        stopTimer();
        timerId = setInterval(() => { if (S && S.started && !S.over) updateHud(); }, 250);
    }

    function lose(i) {
        S.elapsed = currentElapsed(); S.over = true; S.won = false; S.boom = i;
        stopTimer(); lsSet('ms_save', '');
        if (navigator.vibrate) { try { navigator.vibrate([60, 40, 90]); } catch (e) {} }
        updateHud(); requestDraw();
        setTimeout(() => showOverlay(false), 650);
    }

    function win() {
        S.elapsed = currentElapsed(); S.over = true; S.won = true;
        for (let i = 0; i < S.n; i++) if (S.mine[i] && !S.flag[i]) { S.flag[i] = 1; }
        S.flags = S.m;
        stopTimer(); lsSet('ms_save', '');
        const D = DIFFS[S.key];
        const bk = 'ms_best_' + S.key, prev = parseInt(lsGet(bk, '0'), 10);
        S.newBest = !prev || S.elapsed < prev;
        if (S.newBest) lsSet(bk, String(Math.round(S.elapsed)));
        lsSet('ms_wins', String(parseInt(lsGet('ms_wins', '0'), 10) + 1));
        S.reward = D.reward;
        try {
            if (!systemState.energyCores) systemState.energyCores = 0;
            systemState.energyCores += D.reward;
            saveGameState(); arcadeUpdateCoresDisplay();
        } catch (e) {}
        refreshCardInfo();
        updateHud(); requestDraw();
        setTimeout(() => showOverlay(true), 500);
    }

    // ---------- view (zoom / pan) ----------
    function boardW() { return S.w * C; }
    function boardH() { return S.h * C; }
    function fitView() {
        if (!ui || !S) return;
        const cw = ui.canvas.clientWidth || 360, ch = ui.canvas.clientHeight || 500;
        const pad = 10;
        view.fit = Math.min((cw - pad * 2) / boardW(), (ch - pad * 2) / boardH());
        view.k = view.fit;
        view.ox = (cw - boardW() * view.k) / 2;
        view.oy = (ch - boardH() * view.k) / 2;
    }
    function clampView() {
        const cw = ui.canvas.clientWidth, ch = ui.canvas.clientHeight;
        const bw = boardW() * view.k, bh = boardH() * view.k, m = 60;
        view.ox = bw + m * 2 <= cw ? (cw - bw) / 2 : Math.min(m, Math.max(cw - bw - m, view.ox));
        view.oy = bh + m * 2 <= ch ? (ch - bh) / 2 : Math.min(m, Math.max(ch - bh - m, view.oy));
    }
    function zoomAt(px, py, newK) {
        const minK = view.fit * 0.8, maxK = 2.4;
        newK = Math.max(minK, Math.min(maxK, newK));
        const f = newK / view.k;
        view.ox = px - (px - view.ox) * f;
        view.oy = py - (py - view.oy) * f;
        view.k = newK;
        clampView();
    }
    function cellAt(px, py) {
        const x = Math.floor((px - view.ox) / (C * view.k)), y = Math.floor((py - view.oy) / (C * view.k));
        if (x < 0 || y < 0 || x >= S.w || y >= S.h) return -1;
        return y * S.w + x;
    }

    // ---------- drawing ----------
    function requestDraw() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; draw(); });
    }
    function draw() {
        if (!ui || !S || !isOpen) return;
        const cv = ui.canvas, ctx = ui.ctx, dpr = window.devicePixelRatio || 1;
        const cw = cv.clientWidth, ch = cv.clientHeight;
        if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
            cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.ox, dpr * view.oy);
        const x0 = Math.max(0, Math.floor(-view.ox / (C * view.k))), x1 = Math.min(S.w - 1, Math.ceil((cw - view.ox) / (C * view.k)));
        const y0 = Math.max(0, Math.floor(-view.oy / (C * view.k))), y1 = Math.min(S.h - 1, Math.ceil((ch - view.oy) / (C * view.k)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const i = y * S.w + x;
            let kind = 'h', num = 0;
            if (S.rev[i]) { kind = 'r'; num = S.adj[i]; }
            else if (S.over && !S.won && S.mine && S.mine[i]) kind = S.flag[i] ? 'f' : (i === S.boom ? 'x' : 'm');
            else if (S.over && !S.won && S.flag[i] && S.mine && !S.mine[i]) kind = 'w';
            else if (S.flag[i]) kind = 'f';
            if (kind === 'x') { drawCell(ctx, x * C, y * C, C, 'x', 0); continue; }
            drawCell(ctx, x * C, y * C, C, kind, num);
        }
    }

    // ---------- UI ----------
    const fmt = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    function updateHud() {
        if (!ui || !S) return;
        ui.mines.textContent = S.m - S.flags;
        ui.time.textContent = fmt(currentElapsed());
    }
    function setHint(t) { if (ui) { ui.hint.textContent = t; ui.hint.style.opacity = t ? '1' : '0'; } }
    function refreshDiffButtons() {
        if (!ui) return;
        ui.diffs.forEach(b => b.classList.toggle('on', b.dataset.d === diffKey));
        ui.modes.forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    }
    function refreshCardInfo() {
        const el = document.getElementById('card-best-minesweeper');
        if (el) el.textContent = lsGet('ms_wins', '0');
    }
    function hideOverlay() { if (ui) ui.overlay.style.display = 'none'; }
    function showOverlay(won) {
        if (!ui || !S || !isOpen) return;
        const D = DIFFS[S.key];
        ui.ovTitle.textContent = won ? 'FIELD CLEARED' : 'MINE HIT';
        ui.ovTitle.className = 'ms-ov-title ' + (won ? 'win' : 'lose');
        const best = parseInt(lsGet('ms_best_' + S.key, '0'), 10);
        let sub = D.name + ' · ' + fmt(S.elapsed);
        if (won && S.newBest) sub += ' · ★ NEW BEST';
        else if (best) sub += ' · BEST ' + fmt(best);
        ui.ovSub.textContent = sub;
        ui.ovReward.textContent = won ? '+' + S.reward + ' ⚡ CORES EARNED' : '';
        ui.ovReward.style.display = won ? 'block' : 'none';
        ui.ovNote.textContent = (won && !S.guessFree) ? 'This field needed a guess (couldn\'t build a guess-free one in time).' : '';
        ui.overlay.style.display = 'flex';
    }

    function injectCss() {
        if (document.getElementById('ms-style')) return;
        const st = document.createElement('style');
        st.id = 'ms-style';
        st.textContent = `
.arcade-game-panel[data-game="minesweeper"] #game-canvas,
.arcade-game-panel[data-game="minesweeper"] #game-overlay,
.arcade-game-panel[data-game="minesweeper"] #gear-canvas,
.arcade-game-panel[data-game="minesweeper"] #gear-overlay,
.arcade-game-panel[data-game="minesweeper"] #gear-pause-btn { display: none !important; }
#ms-wrap { display: none; position: relative; flex: 1 1 0; min-height: 0; flex-direction: column; background: #020617; -webkit-user-select: none; user-select: none; }
.arcade-game-panel[data-game="minesweeper"] #ms-wrap { display: flex; }
.ms-hud { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 6px; gap: 10px; }
.ms-stat { display: flex; align-items: center; gap: 8px; min-width: 84px; padding: 7px 12px; border-radius: 12px; background: rgba(15,23,42,0.7); border: 1px solid rgba(56,189,248,0.22); color: #e2e8f0; font-size: 18px; font-weight: 800; letter-spacing: 1px; }
.ms-stat b { font-variant-numeric: tabular-nums; }
.ms-stat.r { justify-content: flex-end; }
.ms-new { flex: 0 0 auto; padding: 9px 18px; border-radius: 999px; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.5); color: #e0f2fe; font-weight: 900; letter-spacing: 2px; font-size: 12px; }
.ms-new:active { background: rgba(56,189,248,0.3); }
.ms-diffs { display: flex; gap: 8px; padding: 2px 16px 6px; }
.ms-diffs button { flex: 1; padding: 8px 4px; border-radius: 10px; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.2); color: #94a3b8; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; }
.ms-diffs button.on { color: #fff; border-color: rgba(56,189,248,0.7); background: rgba(56,189,248,0.16); }
.ms-hint { text-align: center; font-size: 10px; letter-spacing: 1.5px; color: #7dd3fc; height: 14px; line-height: 14px; transition: opacity .2s; }
#ms-canvas { flex: 1 1 0; min-height: 0; width: 100%; height: 0; display: block; touch-action: none; -webkit-tap-highlight-color: transparent; }
.ms-tools { display: flex; gap: 10px; padding: 8px 16px; padding-bottom: max(14px, env(safe-area-inset-bottom)); }
.ms-tools button { flex: 1; padding: 13px 6px; border-radius: 14px; background: rgba(15,23,42,0.7); border: 1px solid rgba(148,163,184,0.22); color: #94a3b8; font-size: 12px; font-weight: 900; letter-spacing: 2px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.ms-tools button.on { color: #fff; border-color: rgba(56,189,248,0.75); background: rgba(56,189,248,0.18); }
.ms-overlay { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(2,6,23,0.82); z-index: 30; }
.ms-ov-box { width: min(300px, 86%); padding: 22px 18px; border-radius: 18px; text-align: center; background: linear-gradient(135deg, rgba(30,52,76,0.97), rgba(10,22,38,0.97)); border: 1px solid rgba(56,189,248,0.35); box-shadow: 0 14px 36px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 10px; }
.ms-ov-title { font-size: 20px; font-weight: 900; letter-spacing: 3px; }
.ms-ov-title.win { color: #4ade80; } .ms-ov-title.lose { color: #f87171; }
.ms-ov-sub { font-size: 11px; letter-spacing: 1.5px; color: #cbd5e1; }
.ms-ov-reward { font-size: 13px; font-weight: 800; letter-spacing: 1.5px; color: #38bdf8; }
.ms-ov-note { font-size: 10px; color: #94a3b8; }
.ms-ov-box button { padding: 12px; border-radius: 12px; font-weight: 900; letter-spacing: 3px; font-size: 12px; background: rgba(56,189,248,0.14); border: 1px solid rgba(56,189,248,0.55); color: #e0f2fe; }
.ms-ov-box button.ghost { background: transparent; border-color: rgba(148,163,184,0.3); color: #94a3b8; }
`;
        document.head.appendChild(st);
    }

    function buildDom() {
        if (ui) return true;
        const panel = document.getElementById('arcade-game-panel');
        if (!panel) return false;
        injectCss();
        const wrap = document.createElement('div');
        wrap.id = 'ms-wrap';
        wrap.innerHTML = `
<div class="ms-hud">
  <div class="ms-stat"><span>🚩</span><b id="ms-mines">0</b></div>
  <button class="ms-new" id="ms-new">NEW</button>
  <div class="ms-stat r"><span>⏱</span><b id="ms-time">0:00</b></div>
</div>
<div class="ms-diffs">
  <button data-d="easy">BEGINNER</button><button data-d="medium">INTERMEDIATE</button><button data-d="hard">EXPERT</button>
</div>
<div class="ms-hint" id="ms-hint"></div>
<canvas id="ms-canvas"></canvas>
<div class="ms-tools">
  <button data-m="reveal">⛏ REVEAL</button><button data-m="flag">🚩 FLAG</button>
</div>
<div class="ms-overlay" id="ms-overlay">
  <div class="ms-ov-box">
    <div class="ms-ov-title" id="ms-ov-title"></div>
    <div class="ms-ov-sub" id="ms-ov-sub"></div>
    <div class="ms-ov-reward" id="ms-ov-reward"></div>
    <div class="ms-ov-note" id="ms-ov-note"></div>
    <button id="ms-ov-again">PLAY AGAIN</button>
    <button class="ghost" id="ms-ov-view">VIEW BOARD</button>
    <button class="ghost" id="ms-ov-exit">EXIT</button>
  </div>
</div>`;
        panel.appendChild(wrap);
        const $ = id => document.getElementById(id);
        ui = {
            wrap, canvas: $('ms-canvas'), ctx: $('ms-canvas').getContext('2d'),
            mines: $('ms-mines'), time: $('ms-time'), hint: $('ms-hint'), overlay: $('ms-overlay'),
            ovTitle: $('ms-ov-title'), ovSub: $('ms-ov-sub'), ovReward: $('ms-ov-reward'), ovNote: $('ms-ov-note'),
            diffs: Array.from(wrap.querySelectorAll('.ms-diffs button')),
            modes: Array.from(wrap.querySelectorAll('.ms-tools button')),
        };
        ui.diffs.forEach(b => b.addEventListener('click', () => { stopTimer(); newGame(b.dataset.d); }));
        ui.modes.forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; lsSet('ms_mode', mode); refreshDiffButtons(); }));
        $('ms-new').addEventListener('click', () => { stopTimer(); newGame(diffKey); });
        $('ms-ov-again').addEventListener('click', () => { stopTimer(); newGame(diffKey); });
        $('ms-ov-view').addEventListener('click', hideOverlay);
        $('ms-ov-exit').addEventListener('click', () => { if (typeof arcadeCloseGame === 'function') arcadeCloseGame(); });
        bindGestures(ui.canvas);
        if (window.ResizeObserver) new ResizeObserver(() => { if (isOpen && S) { const wasFit = Math.abs(view.k - view.fit) < 1e-6; if (wasFit) fitView(); else clampView(); requestDraw(); } }).observe(ui.canvas);
        return true;
    }

    // ---------- gestures: tap, long-press, drag-pan, pinch-zoom ----------
    function bindGestures(cv) {
        const ptrs = new Map();
        let pinch = null, tap = null;
        const LONG = 380, SLOP = 9;
        const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

        cv.addEventListener('pointerdown', e => {
            e.preventDefault();
            try { cv.setPointerCapture(e.pointerId); } catch (err) {}
            const p = pos(e); ptrs.set(e.pointerId, p);
            if (ptrs.size === 1) {
                tap = { x: p.x, y: p.y, moved: false, long: false, last: p, timer: setTimeout(() => {
                    if (tap && !tap.moved && ptrs.size === 1) {
                        tap.long = true;
                        const i = S ? cellAt(tap.x, tap.y) : -1;
                        if (i >= 0) { if (navigator.vibrate) { try { navigator.vibrate(18); } catch (er) {} } act(i, true); }
                    }
                }, LONG) };
            } else if (ptrs.size === 2) {
                if (tap) { clearTimeout(tap.timer); tap.moved = true; }
                const [a, b] = Array.from(ptrs.values());
                pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
            }
        });
        cv.addEventListener('pointermove', e => {
            if (!ptrs.has(e.pointerId) || !S) return;
            const p = pos(e), prev = ptrs.get(e.pointerId);
            ptrs.set(e.pointerId, p);
            if (ptrs.size >= 2 && pinch) {
                const [a, b] = Array.from(ptrs.values());
                const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                view.ox += (p.x - prev.x) / 2; view.oy += (p.y - prev.y) / 2;   // two fingers move the midpoint
                zoomAt(mx, my, pinch.k * (d / pinch.d));
                requestDraw();
            } else if (tap) {
                if (!tap.moved && Math.hypot(p.x - tap.x, p.y - tap.y) > SLOP) { tap.moved = true; clearTimeout(tap.timer); }
                if (tap.moved) { view.ox += p.x - prev.x; view.oy += p.y - prev.y; clampView(); requestDraw(); }
            }
        });
        const end = e => {
            if (!ptrs.has(e.pointerId)) return;
            const wasSingle = ptrs.size === 1;
            ptrs.delete(e.pointerId);
            if (ptrs.size < 2) pinch = null;
            if (wasSingle && tap) {
                clearTimeout(tap.timer);
                if (e.type === 'pointerup' && !tap.moved && !tap.long && S) {
                    const i = cellAt(tap.x, tap.y);
                    if (i >= 0) act(i, false);
                }
                tap = null;
            }
        };
        cv.addEventListener('pointerup', end);
        cv.addEventListener('pointercancel', end);
        cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); requestDraw(); }, { passive: false });
    }

    // tap = default action, long-press = the other one; a tap on an opened number always chords
    function act(i, alt) {
        if (!S || S.over) return;
        if (S.started && S.rev[i]) { if (!alt) chord(i); return; }
        const doFlag = (mode === 'flag') !== alt;
        if (doFlag) toggleFlag(i); else reveal(i);
    }

    // ---------- public hooks ----------
    window.msOpen = function () {
        if (!buildDom()) return;
        isOpen = true;
        refreshDiffButtons();
        if (!loadSaved()) newGame(diffKey);
        if (S && S.started && !S.over) startTimer();
        setTimeout(() => { fitView(); requestDraw(); }, 60);
        setTimeout(() => { if (isOpen) { fitView(); requestDraw(); } }, 420);   // after the panel finishes sliding in
    };
    window.msStop = function () {
        if (S && S.started && !S.over) { S.elapsed = currentElapsed(); save(); }
        stopTimer();
        isOpen = false;
        refreshCardInfo();
    };

    // ---------- lobby card preview (static mini board) ----------
    function drawCardPreview() {
        const c = document.getElementById('preview-minesweeper');
        if (!c) return;
        const ctx = c.getContext('2d'), W = c.width, H = c.height;
        ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, W, H);
        const rows = ['...1#1....', '..12F2.111', '..1##2.1#1', '...113.1F1', '.....1.111', '..........'];
        const s = 15;
        for (let y = 0; y < rows.length; y++) for (let x = 0; x < 10; x++) {
            const ch = rows[y][x];
            if (ch === '#') drawCell(ctx, x * s, y * s, s, 'h', 0);
            else if (ch === 'F') drawCell(ctx, x * s, y * s, s, 'f', 0);
            else drawCell(ctx, x * s, y * s, s, 'r', ch === '.' ? 0 : +ch);
        }
    }

    function init() { drawCardPreview(); refreshCardInfo(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

    // tiny debug/test surface
    window.MS = { generateAsync, solve, DIFFS, neighbours, computeAdj };
})();
