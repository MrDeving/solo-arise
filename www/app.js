// ====== GLOBAL POPUP QUEUE ENGINE (PRIORITY-SORTED) ======
// Priority order (lower number = higher priority, fires first):
// 9=sysDialog, 1=streakUp, 6=dailyBonus, 4=levelUp, 5=rankUp, 2=streakLost, 3=penalty, 7=achievement, 8=toast
const POPUP_PRIORITY = {
    sysDialog:   1,
    streakUp:    2,
    dailyBonus:  3,
    levelUp:     4,
    rankUp:      5,
    streakLost:  6,
    penalty:     7,
    achievement: 8,
    toast:       9,
};

const _popupQueue = [];
let _popupBusy = false;

function queuePopup(type, fn) {
    const priority = POPUP_PRIORITY[type] ?? 99;
    _popupQueue.push({ priority, fn });
    // Sort ascending so lowest priority number (highest importance) is first
    _popupQueue.sort((a, b) => a.priority - b.priority);
    _drainPopupQueue();
}

function _drainPopupQueue() {
    if (_popupBusy || _popupQueue.length === 0) return;
    _popupBusy = true;
    const next = _popupQueue.shift();
    
    // Failsafe: If a popup has an internal error, catch it so the queue doesn't freeze permanently!
    try {
        next.fn(_popupDone);
    } catch (error) {
        console.error("Popup Sequence Error:", error);
        _popupDone(); 
    }
}

function _popupDone() {
    _popupBusy = false;
    // Small gap between popups so the next one feels like a fresh entrance
    setTimeout(_drainPopupQueue, 120);
}
// ==========================================================

// --- State Management ---
// ====== CUSTOM SYSTEM DIALOG ENGINE ======
function sysAlert(msg, { title = 'SYSTEM MESSAGE', icon = 'ℹ️', color = 'blue' } = {}) {
    return new Promise(resolve => {
        _openSysDialog({ title, msg, icon, color, buttons: [
            { label: 'OK', cls: `sys-dialog-btn-confirm-${color}`, resolve: true }
        ], resolve });
    });
}
function sysConfirm(msg, { title = 'SYSTEM WARNING', icon = '⚠', color = 'red' } = {}) {
    return new Promise(resolve => {
        _openSysDialog({ title, msg, icon, color, buttons: [
            { label: 'Cancel', cls: 'sys-dialog-btn-cancel', resolve: false },
            { label: 'Confirm', cls: `sys-dialog-btn-confirm-${color}`, resolve: true }
        ], resolve });
    });
}
function _openSysDialog({ title, msg, icon, color, buttons, resolve }) {
    const overlay = document.getElementById('sys-dialog-overlay');
    const isRed = color === 'red';
    
    let svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 7v5" stroke-linecap="round"></path><circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none"></circle></svg>`;
    if (icon === '✖' || icon === '⚠') svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    if (icon === '✔') svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    if (icon === '🗑') svgIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

    let btnsHtml = buttons.map(b => {
        const isCancel = b.label.toLowerCase() === 'cancel';
        return `<button class="sl-btn-new" style="${isCancel ? 'border-color: rgba(255,255,255,0.15); color: #94a3b8;' : ''}">${b.label.toUpperCase()}</button>`;
    }).join('');

    overlay.innerHTML = `
        <div class="sl-system-box ${isRed ? 'border-red' : ''}">
            <div class="holo-corner tl"></div><div class="holo-corner tr"></div><div class="holo-corner bl"></div><div class="holo-corner br"></div>
            <div class="sl-header-container">
                <div class="sl-icon">${svgIcon}</div>
                <div class="sl-box-header">${title}</div>
            </div>
            <div class="sl-body-text">${msg.replace(/\n/g, '<br>')}</div>
            <div class="sl-btn-row">${btnsHtml}</div>
        </div>
    `;

    const btnElements = overlay.querySelectorAll('button');
    buttons.forEach((b, i) => {
        btnElements[i].onclick = () => {
            _sfx(b.resolve ? (isRed ? 'delete' : 'tap') : 'close');
            levelUpSound.currentTime = 0;
            levelUpSound.play().catch(e => console.log("Button sound blocked"));
            
            const box = overlay.querySelector('.sl-system-box');
            overlay.classList.add('hiding');
            if (box) box.classList.add('hiding');
            
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.classList.remove('hiding');
                resolve(b.resolve);
            }, 300);
        };
    });

    overlay.style.display = 'flex';
    
    if (icon === '✖' || icon === '⚠') _sfx('warn');
    else if (icon === '✔') _sfx('success');
    else if (icon === '🗑') _sfx('delete');
    else _sfx('open');
    popupSound.currentTime = 0;
    popupSound.play().catch(e => console.log("Popup sound blocked"));
}
// ==========================================

// ==========================================
// We define how much XP it takes to gain 1 Level. (You can change this later!)
const DONE_QUEST_LIMIT = 30; // Max completed normal quests stored at once
const XP_PER_LEVEL = 500; // Legacy fallback, do not remove
const RANK_XP = [300, 500, 800, 1200, 1800, 2500]; // XP per level inside each rank (E,D,C,B,A,S)

function getXpForLevel(level) {
    const rankIdx = Math.min(Math.floor(level / 10), 5);
    return RANK_XP[rankIdx];
}

function getTotalXpForLevel(level) {
    let total = 0;
    for (let i = 0; i < level; i++) total += getXpForLevel(i);
    return total;
}

let triggeredReminders = new Set(); // Remembers which notifications have popped up so they don't spam

let systemState = {
    level: 0,
    totalXp: 0,
    todayXp: 0,
    streak: 0,
    quests: [], 
    streakIncrementedToday: false,
    lastCompletedDate: null, 
    weeklyHistory: [], 
    events: [],
    dailyBonus: null,           // { stat, multiplier, date }
    dailyBonusClaimed: false    // true after reward given
};

// Track filters separately for home (Dailies) and quests
let filters = {
    home: localStorage.getItem('filter_home') || 'all',
    quests: localStorage.getItem('filter_quests') || 'all'
};
let currentActiveTab = 'home'; // Tracks which tab we are currently looking at

// Initialize Audio (Ensure saved.mp3 is in the www folder)
const levelUpSound = new Audio('saved.mp3');
levelUpSound.volume = 1.0;
const popupSound = new Audio('solo_leveling_system.mp3');
popupSound.volume = 1.0;

// ====== UI SOUND ENGINE (no extra files needed) ======
const _sfxCtx = (() => {
    try { return new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; }
})();

function _sfx(type) {
    if (!_sfxCtx) return;
    // Resume context if suspended (browser autoplay policy)
    if (_sfxCtx.state === 'suspended') _sfxCtx.resume();

    const g = _sfxCtx.createGain();
    g.connect(_sfxCtx.destination);

    const now = _sfxCtx.currentTime;

    if (type === 'tap') {
        // Soft click — generic button press
        const o = _sfxCtx.createOscillator();
        o.connect(g);
        o.type = 'sine';
        o.frequency.setValueAtTime(880, now);
        o.frequency.exponentialRampToValueAtTime(660, now + 0.06);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        o.start(now); o.stop(now + 0.08);

    } else if (type === 'open') {
        // Modal/popup opening — two-tone rise
        [0, 0.07].forEach((t, i) => {
            const o = _sfxCtx.createOscillator();
            o.connect(g);
            o.type = 'sine';
            o.frequency.setValueAtTime(i === 0 ? 440 : 660, now + t);
            g.gain.setValueAtTime(0.07, now + t);
            g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
            o.start(now + t); o.stop(now + t + 0.12);
        });

    } else if (type === 'close') {
        // Modal closing — descending tone
        const o = _sfxCtx.createOscillator();
        o.connect(g);
        o.type = 'sine';
        o.frequency.setValueAtTime(660, now);
        o.frequency.exponentialRampToValueAtTime(330, now + 0.1);
        g.gain.setValueAtTime(0.06, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        o.start(now); o.stop(now + 0.1);

    } else if (type === 'error') {
        // Error — harsh low buzz
        const o = _sfxCtx.createOscillator();
        o.connect(g);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, now);
        o.frequency.exponentialRampToValueAtTime(120, now + 0.18);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        o.start(now); o.stop(now + 0.18);

    } else if (type === 'success') {
        // Success — quick upward chime
        [0, 0.08, 0.16].forEach((t, i) => {
            const o = _sfxCtx.createOscillator();
            o.connect(g);
            o.type = 'sine';
            o.frequency.setValueAtTime([523, 659, 784][i], now + t);
            g.gain.setValueAtTime(0.07, now + t);
            g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.15);
            o.start(now + t); o.stop(now + t + 0.15);
        });

    } else if (type === 'warn') {
        // Warning — two low pulses
        [0, 0.15].forEach(t => {
            const o = _sfxCtx.createOscillator();
            o.connect(g);
            o.type = 'triangle';
            o.frequency.setValueAtTime(260, now + t);
            g.gain.setValueAtTime(0.1, now + t);
            g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.12);
            o.start(now + t); o.stop(now + t + 0.12);
        });

    } else if (type === 'notify') {
        // Notification pop — bright ping
        const o = _sfxCtx.createOscillator();
        o.connect(g);
        o.type = 'sine';
        o.frequency.setValueAtTime(1047, now);
        o.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o.start(now); o.stop(now + 0.2);

    } else if (type === 'delete') {
        // Delete — short descending thud
        const o = _sfxCtx.createOscillator();
        o.connect(g);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        o.start(now); o.stop(now + 0.15);
    }
}
// ======================================================


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initDates();
    loadGameState();    // 1. Load the Backpack
    checkDailyReset();  // 2. Check if a new day started (Resets quests/streak if needed)
    renderQuests();     // 3. Draw the quests (Filters are applied automatically now)
    updateStats();      // 4. Update the math (Level, Rank, Streak, XP)
    loadSavedProfile(); // 5. Load the Profile image & name
    initSortable();     // 6. Initialize drag-and-drop reordering
    
    // 7. Render Calendar (No Lucide required anymore!)
    renderEthCalendar();
    renderEventList();

    // 8. CRITICAL: Re-register native listeners on boot!
    requestNotificationPermission();

    // 9. UNIVERSAL PHONE HARDWARE BACK BUTTON INTERCEPTOR
    // This helper checks if anything is open and closes it. Returns true if something was closed.
    const handlePhoneBackButton = () => {
        const modals = [
            { id: 'achievements-sheet-overlay', close: () => { const s=document.getElementById('achievements-sheet'); if(s) s.style.transform='translateY(100%)'; setTimeout(()=>{ document.getElementById('achievements-sheet-overlay').style.display='none'; },350); } },
            { id: 'add-quest-modal',           close: () => closeQuestModal() },
            { id: 'filter-modal',              close: () => closeFilterModal() },
            { id: 'confirm-delete-modal',      close: () => cancelDeleteQuest() },
            { id: 'registration-warning-modal',close: () => closeWarningModal() },
            { id: 'sys-dialog-overlay',        close: () => { document.getElementById('sys-dialog-overlay').style.display = 'none'; } },
            { id: 'sl-streak-up-modal',        close: () => closeSLModal('sl-streak-up-modal') },
            { id: 'sl-streak-lost-modal',      close: () => closeSLModal('sl-streak-lost-modal') },
            { id: 'sl-penalty-modal',          close: () => closeSLModal('sl-penalty-modal') }
        ];

        // A) Check Profile Edit Mode
        const setupView = document.getElementById('profile-setup-view');
        if (setupView && window.getComputedStyle(setupView).display !== 'none' && localStorage.getItem('hunterName')) {
            toggleProfileMode('dashboard');
            return true; 
        }

        // B) Check all Modals & Popups (like the Edit Quest menu & Achievements)
        for (const m of modals) {
            const el = document.getElementById(m.id);
            if (el && window.getComputedStyle(el).display !== 'none') {
                m.close();
                return true; 
            }
        }

        // C) Tab Logic: If we are not on the Home tab, go back to Home first
        const homeView = document.getElementById('view-home');
        if (homeView && !homeView.classList.contains('active')) {
            switchTab('home');
            return true; 
        }

        return false; // Nothing was open. Let the app exit.
    };

    // --- SETUP FOR MOBILE BROWSER & PWA INTERCEPTION ---
    // Push a fake "history" state so the phone has something to go back to
    history.pushState({ appState: 'running' }, "");
    
    window.addEventListener('popstate', (e) => {
        // User swiped edge or pressed the phone's physical back button!
        const didCloseSomething = handlePhoneBackButton();
        
        if (didCloseSomething) {
            // We successfully closed a menu. 
            // Re-push the fake history state so the NEXT time they press back, it doesn't instantly exit.
            history.pushState({ appState: 'running' }, "");
        } else {
            // Nothing was open. The user actually wants to leave.
            // Let the browser naturally exit the app.
        }
    });

    // --- SETUP FOR NATIVE APPS (Capacitor/Cordova) ---
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        Capacitor.Plugins.App.addListener('backButton', () => {
            if (!handlePhoneBackButton()) {
                Capacitor.Plugins.App.exitApp();
            }
        });
    }
});

// --- Drag and Drop Feature ---
function initSortable() {
    const containers = [
        document.getElementById('quest-container'),
        document.getElementById('main-quest-container')
    ];

    const sortableOptions = {
        animation: 250, 
        easing: "cubic-bezier(0.25, 1, 0.5, 1)", 
        
        // --- MOBILE TOUCH FIXES ---
        delay: 200, 
        delayOnTouchOnly: true, 
        fallbackTolerance: 3, 
        forceFallback: true, 
        fallbackClass: 'sortable-drag', 
        fallbackOnBody: true, // CRITICAL: Appends the dragged card to the body so it doesn't get clipped by the scrolling container
        
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        onEnd: function (evt) {
            const itemEl = evt.item;
            const movedId = parseInt(itemEl.getAttribute('data-id'));
            
            // Find the elements it was dropped next to
            const nextEl = itemEl.nextElementSibling;
            const prevEl = itemEl.previousElementSibling;

            // 1. Find and remove the moved quest from the main array
            const movedQuestIndex = systemState.quests.findIndex(q => q.id === movedId);
            if (movedQuestIndex === -1) return;
            const movedQuest = systemState.quests.splice(movedQuestIndex, 1)[0];

            // 2. Figure out where to put it back based on its new siblings
            // This safely bypasses hidden/filtered quests without losing data!
            if (nextEl) {
                const nextId = parseInt(nextEl.getAttribute('data-id'));
                const nextQuestIndex = systemState.quests.findIndex(q => q.id === nextId);
                systemState.quests.splice(nextQuestIndex, 0, movedQuest);
            } else if (prevEl) {
                const prevId = parseInt(prevEl.getAttribute('data-id'));
                const prevQuestIndex = systemState.quests.findIndex(q => q.id === prevId);
                systemState.quests.splice(prevQuestIndex + 1, 0, movedQuest);
            } else {
                // Failsafe: Put it at the end
                systemState.quests.push(movedQuest);
            }

            // 3. Save the newly arranged backpack instantly!
            saveGameState();
        }
    };

    containers.forEach(container => {
        if (container) {
            new Sortable(container, sortableOptions);
        }
    });
}

// --- UI Functions ---
function initDates() {
    const now = new Date();
    const optionsDate = { month: 'long', day: 'numeric', year: 'numeric' };
    const optionsDay = { weekday: 'long' };
    
const dateStr = now.toLocaleDateString('en-US', optionsDate).toUpperCase();
    const dayStr = now.toLocaleDateString('en-US', optionsDay).toUpperCase();
    
    const hDate = document.getElementById('current-date');
    const hDay = document.getElementById('current-day');
    if (hDate) hDate.textContent = dateStr;
    if (hDay) hDay.textContent = dayStr;
    
    const qDate = document.getElementById('quests-current-date');
    const qDay = document.getElementById('quests-current-day');
    if (qDate) qDate.textContent = dateStr;
    if (qDay) qDay.textContent = dayStr;
    const pDate = document.getElementById('profile-current-date');
    const pDay = document.getElementById('profile-current-day');
    if (pDate) pDate.textContent = dateStr;
    if (pDay) pDay.textContent = dayStr;
    
    // Simple Timer Mock (Counts down to midnight)
    setInterval(() => {
        const d = new Date();
        const h = 23 - d.getHours();
        const m = 59 - d.getMinutes();
        const s = 59 - d.getSeconds();
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        const hTimer = document.getElementById('reset-timer');
        if (hTimer) hTimer.textContent = timeStr;
        
        const qTimer = document.getElementById('quests-reset-timer');
        if (qTimer) qTimer.textContent = timeStr;
        const pTimer = document.getElementById('profile-reset-timer');
        if (pTimer) pTimer.textContent = timeStr;
        // --- SYSTEM STREAK WARNING ---
        // Triggers at exactly 18:00 (6 PM) if you have an active streak but haven't done anything today.
        const todayStr = d.toDateString();
        const warningKey = `streak-warning-${todayStr}`;
        
        if (d.getHours() === 18 && systemState.streak > 0 && systemState.todayXp === 0) {
            if (!triggeredReminders.has(warningKey)) {
                triggeredReminders.add(warningKey);
                // --- FEATURE 2: Trigger Native or Toast ---
                triggerSystemAlert({
                    id: 'system-warning',
                    title: 'SYSTEM PENALTY IMMINENT',
                    notes: 'You have not completed any daily tasks. Streak reset in 6 hours.'
                });
            }
        }

        // --- REMINDER CHECKER ---
        const now = new Date();
        const localISOTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const nowStr = localISOTime; // For Normal Quests: "YYYY-MM-DDTHH:mm"
        const timeStrOnly = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }); // For Dailies: "HH:mm"
        
        systemState.quests.forEach(quest => {
            if (!quest.completed && quest.reminders) {
                const isDaily = quest.type === 'daily' || !quest.type;
                
                // If it's a daily, ensure it's actually scheduled for today before ringing!
                if (isDaily && !isQuestActiveOnDate(quest, now)) return;

                quest.reminders.forEach(rem => {
                    let shouldRing = false;
                    let notifKey = "";

                    if (isDaily && rem === timeStrOnly) {
                        shouldRing = true;
                        notifKey = `${quest.id}-${now.toDateString()}-${rem}`; // Unique per day
                    } else if (!isDaily && rem === nowStr) {
                        shouldRing = true;
                        notifKey = `${quest.id}-${rem}`; // Unique once
                    }

                    if (shouldRing && !triggeredReminders.has(notifKey)) {
                        triggeredReminders.add(notifKey);
                        triggerSystemAlert(quest);
                    }
                });
            }
        });
    }, 1000);
}

// --- NEW HELPER: Checks if a Daily Quest is supposed to happen on a specific date ---
function isQuestActiveOnDate(quest, dateObj) {
    if (!quest.schedule) return true;
    const dayOfWeek = dateObj.getDay();
    
    if (quest.schedule.type === 'weekly' && quest.schedule.days && quest.schedule.days.length > 0) {
        if (!quest.schedule.days.includes(dayOfWeek)) return false;
    }
    
    if (quest.schedule.interval > 1 && quest.schedule.startDate) {
        const start = new Date(quest.schedule.startDate);
        start.setHours(0,0,0,0);
        const check = new Date(dateObj);
        check.setHours(0,0,0,0);
        const diffTime = Math.abs(check - start);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        let cycle = 1;
        if (quest.schedule.type === 'daily') cycle = quest.schedule.interval;
        if (quest.schedule.type === 'weekly') cycle = quest.schedule.interval * 7;
        if (quest.schedule.type === 'monthly') cycle = quest.schedule.interval * 30; 
        
        if (diffDays % cycle !== 0) return false;
    }
    return true;
}
function getDailyStreakColor(streak) {
    // 0 streak = yellow, builds to cyan at 14+
    const t = Math.min((streak || 0) / 14, 1);
    // Interpolate: yellow (#fbbf24) → green (#34d399) → cyan (#0ea5e9)
    if (t < 0.5) {
        const p = t / 0.5;
        const r = Math.round(251 + (52  - 251) * p);
        const g = Math.round(191 + (211 - 191) * p);
        const b = Math.round(36  + (153 - 36)  * p);
        return `rgb(${r},${g},${b})`;
    } else {
        const p = (t - 0.5) / 0.5;
        const r = Math.round(52  + (14  - 52)  * p);
        const g = Math.round(211 + (165 - 211) * p);
        const b = Math.round(153 + (233 - 153) * p);
        return `rgb(${r},${g},${b})`;
    }
}
    function getQuestAgeColor(quest) {
    if (!quest.createdAt) return null;
    const days = Math.floor((Date.now() - quest.createdAt) / 86400000);
    const colors = [
        '#0ea5e9',  // Day 0 — electric sky blue
        '#6366f1',  // Day 1 — vivid indigo
        '#a855f7',  // Day 2 — neon purple
        '#ec4899',  // Day 3 — hot pink
        '#f97316',  // Day 4 — blazing orange
        '#eab308',  // Day 5 — golden yellow
        '#ef4444',  // Day 6+ — danger red
    ];
    return colors[Math.min(days, 6)];
}
function renderQuests() {
    const homeContainer = document.getElementById('quest-container');
    const mainContainer = document.getElementById('main-quest-container');
    
    if (homeContainer) homeContainer.innerHTML = '';
    if (mainContainer) mainContainer.innerHTML = '';

    systemState.quests.forEach(quest => {
        const isDaily = quest.type === 'daily' || !quest.type;
        const activeFilter = isDaily ? filters.home : filters.quests;

        // --- SCHEDULING FILTER (DAILIES ONLY) ---
        if (isDaily && activeFilter !== 'all') {
            if (!isQuestActiveOnDate(quest, new Date())) return;
        }
        
        // --- VISIBILITY RULES ---
        
        // 1. "Done" Filter: Applies to both. Hides anything that IS NOT completed.
        if (activeFilter === 'done' && !quest.completed) return;
        
        // 2. "Due" Filter (Dailies): Hides anything that IS completed.
        if (activeFilter === 'due' && quest.completed) return;
        
        // 3. "Scheduled" Filter (Main Quests): Hides completed, and hides ones missing both a due date AND reminders.
        if (activeFilter === 'scheduled') {
            if (quest.completed) return;
            if (!quest.dueDate && (!quest.reminders || quest.reminders.length === 0)) return;
        }

        // 4. "All" Filter (Main Quests): Hides completed quests. 
        // (Dailies bypass this rule entirely so they always show everything).
        if (!isDaily && activeFilter === 'all' && quest.completed) return;

        // --- FEATURE 3: SWIPE TO DELETE WRAPPER ---
        const wrapperEl = document.createElement('div');
        wrapperEl.className = 'quest-swipe-wrapper';
        wrapperEl.setAttribute('data-id', quest.id); // Sortable needs this on the wrapper now

        // Delete Background
        const deleteBg = document.createElement('div');
        deleteBg.className = 'quest-delete-action';
        deleteBg.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        deleteBg.onclick = () => deleteQuest(quest.id);

        const questEl = document.createElement('div');
        questEl.className = `system-panel quest-item ${quest.completed ? 'completed' : ''}`;
        
        // Swipe Touch Logic
        let startX = 0; let currentX = 0; let startY = 0; let isSwiping = false;
        
        questEl.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isSwiping = false;
        }, {passive: true});
        
        questEl.addEventListener('touchmove', e => {
            currentX = e.touches[0].clientX;
            const diffX = currentX - startX;
            const diffY = e.touches[0].clientY - startY;
            
            // Trigger swipe only if moving left horizontally (avoid SortableJS/Scroll conflict)
            if (Math.abs(diffX) > Math.abs(diffY) && diffX < 0) {
                isSwiping = true;
                wrapperEl.classList.add('is-swiping'); // Reveal the delete button only during a real swipe
                questEl.style.transform = `translateX(${Math.max(diffX, -80)}px)`;
            }
        }, {passive: true});
        
        questEl.addEventListener('touchend', () => {
            if (!isSwiping) return;
            const diffX = currentX - startX;
            if (diffX < -40) {
                questEl.style.transform = `translateX(-80px)`; // Lock open
                setTimeout(() => {
                    questEl.style.transform = `translateX(0px)`;
                    wrapperEl.classList.remove('is-swiping'); // Hide the button again once it snaps back
                }, 1500); // Auto-close after 3s
            } else {
                questEl.style.transform = `translateX(0px)`; // Snap back
                wrapperEl.classList.remove('is-swiping');
            }
        });

        // Map Colors (Trivial=Blue, Easy=Green, Medium=Yellow, Hard=Red)
        let diffColor = 'var(--neon-blue)';
        if(quest.difficulty === 'easy') diffColor = 'var(--neon-green)';
        if(quest.difficulty === 'medium') diffColor = 'var(--neon-gold)';
        if(quest.difficulty === 'hard') diffColor = 'var(--neon-red)';
        
        // Text Label
        let diffLabel = quest.difficulty ? quest.difficulty.charAt(0).toUpperCase() + quest.difficulty.slice(1) : 'Easy';

        const slabColor = isDaily
            ? getDailyStreakColor(quest.dailyStreak ?? 0)
            : (!quest.completed ? getQuestAgeColor(quest) : null);
        const ageSlab = slabColor ? `<div class="quest-age-slab" style="background:${slabColor};"></div>` : '';

        const streak = (isDaily && (quest.dailyStreak ?? 0) > 0)
            ? `<div class="quest-streak-badge"><span class="streak-chevrons">&#9658;&#9658;</span> ${quest.dailyStreak}</div>`
            : '';

        questEl.innerHTML = `
            <!-- Age Color Slab -->
            ${ageSlab}
            <!-- Checkbox -->
            <div class="quest-checkbox" onclick="toggleQuest(${quest.id})"></div>
            
            <!-- Details (Clicking this opens the Edit Menu) -->
            <div class="quest-details" onclick="openEditQuestModal(${quest.id})">
                <div class="quest-title">${quest.title}</div>
                ${quest.notes ? `<div class="quest-notes">${quest.notes}</div>` : ''}
            </div>
            ${streak}
            
            <!-- Rewards removed to save space -->
        `;
        
        wrapperEl.appendChild(deleteBg);
        wrapperEl.appendChild(questEl);

        // Append to the correct tab based on type
        if (isDaily && homeContainer) {
            homeContainer.appendChild(wrapperEl);
        } else if (!isDaily && mainContainer) {
            mainContainer.appendChild(wrapperEl);
        }
    });
}

function deleteQuest(id) {
    sysConfirm("Delete this quest? This cannot be undone.", { title: 'DELETE QUEST', icon: '🗑', color: 'red' }).then(ok => {
        if (!ok) return;
        cancelWorkManagerTasks(id);
        systemState.quests = systemState.quests.filter(q => q.id !== id);
        saveGameState();
        renderQuests();
    });
}

function toggleQuest(id) {
    const quest = systemState.quests.find(q => q.id === id);
    if (!quest) return; // Safeguard against system warnings
    
    if (!quest.completed) {
        // Checking the quest
        quest.completed = true;
        systemState.todayXp += quest.xp;
        systemState.totalXp += quest.xp;

        // --- STREAK LOGIC: The Trigger ---
        const isDaily = quest.type === 'daily' || !quest.type;

        // --- DAILY STREAK LOGIC ---
        if (isDaily) {
            const todayStr = new Date().toDateString();
            const last = quest.lastStreakDate;
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toDateString();
            if (last === yesterdayStr || last === null || last === undefined) {
                quest.dailyStreak = (quest.dailyStreak ?? 0) + 1;
            } else if (last !== todayStr) {
                quest.dailyStreak = 1; // missed a day, reset
            }
            quest.lastStreakDate = todayStr;
        }
        
        if (isDaily) {
            systemState.lastCompletedDate = new Date().toDateString(); // Register that work was done today
            
            if (!systemState.streakIncrementedToday) {
                systemState.streak += 1;
                systemState.streakIncrementedToday = true;
                
                // Show the Classic SL Popup! (With Safeguards)
                const streakDisplay = document.getElementById('sl-streak-display');
                const streakModal = document.getElementById('sl-streak-up-modal');
                
                if (streakDisplay && streakModal) {
                    streakDisplay.textContent = systemState.streak;
                    queuePopup('streakUp', (done) => {
                        window._currentPopupDone = done;
                        streakModal.style.display = 'flex';
                        popupSound.currentTime = 0;
                        popupSound.play().catch(e => console.log("Popup sound blocked"));
                    });
                }
            } else {
                // Only play normal sound if we aren't showing the popup
                levelUpSound.currentTime = 0;
                levelUpSound.play().catch(e => console.log("Audio blocked"));
            }
        } else {
            // Play normal sound for non-dailies
            levelUpSound.currentTime = 0;
            levelUpSound.play().catch(e => console.log("Audio blocked"));

            // --- DONE QUEST CAP: Enforce 30-task limit for completed normal quests ---
            const doneNormalQuests = systemState.quests.filter(q => q.type === 'normal' && q.completed);
            if (doneNormalQuests.length > DONE_QUEST_LIMIT) {
                // Find the oldest completed normal quest (lowest id = oldest)
                const oldest = doneNormalQuests.reduce((a, b) => a.id < b.id ? a : b);
                systemState.quests = systemState.quests.filter(q => q.id !== oldest.id);
            }
        }
    } else {
        // Unchecking the quest
        quest.completed = false;
        systemState.todayXp -= quest.xp;
        systemState.totalXp -= quest.xp;
        
        // Safeguard to ensure XP never drops below 0
        if (systemState.todayXp < 0) systemState.todayXp = 0;
        if (systemState.totalXp < 0) systemState.totalXp = 0;
    }
    
    updateStats();
    renderQuests();
    saveGameState();
    checkAchievements();

    // --- DAILY BONUS CHECK: Did completing this quest finish ALL daily quests? ---
    if (!systemState.dailyBonusClaimed && systemState.dailyBonus) {
        const dailyQuests = systemState.quests.filter(q => q.type === 'daily' || !q.type);
        const today = new Date();
        const dueDailies = dailyQuests.filter(q => isQuestActiveOnDate(q, today));
        const allDone = dueDailies.length > 0 && dueDailies.every(q => q.completed);
        if (allDone) {
            systemState.dailyBonusClaimed = true;
            const bonusXp = 150;
            systemState.totalXp += bonusXp;
            systemState.todayXp += bonusXp;
            saveGameState();
            updateStats();
            checkAchievements();
            queuePopup('dailyBonus', (done) => { showDailyBonusModal(bonusXp, done); });
        }
    }
}

function showDailyBonusModal(xp, done) {
    const overlay = document.createElement('div');
    overlay.className = 'sl-modal-overlay';
    overlay.style.cssText = 'display:flex;';
    
    // Fixed: Safely checks if the stat actually exists before trying to capitalize it
    const bonusStat = (systemState.dailyBonus && systemState.dailyBonus.stat) ? systemState.dailyBonus.stat.toUpperCase() : null;
    
    overlay.innerHTML = `
        <div class="sl-system-box border-gold">
            <div class="holo-corner tl"></div><div class="holo-corner tr"></div><div class="holo-corner bl"></div><div class="holo-corner br"></div>
            <div class="sl-header-container">
                <div class="sl-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2l2.5 6.5H21l-5.5 4 2 6.5L12 15l-5.5 4 2-6.5L3 8.5h6.5z"/>
                    </svg>
                </div>
                <div class="sl-box-header">ALL QUESTS COMPLETE</div>
            </div>
            <div class="reward-xp-display">
                <div class="reward-xp-label">BONUS XP GRANTED</div>
                <div class="reward-xp-amount">+${xp}</div>
                ${bonusStat ? `<div class="reward-stat-chip">⚡ ${bonusStat} BONUS ACTIVE</div>` : ''}
            </div>
            <div class="sl-body-text" style="font-size:12px;opacity:0.6;letter-spacing:1px;">Daily quest chain completed.<br>Reward has been added to your total XP.</div>
            <div class="sl-btn-row">
                <button class="sl-btn-new" onclick="const b=this.closest('.sl-system-box'); const o=this.closest('.sl-modal-overlay'); b.classList.add('hiding'); o.classList.add('hiding'); setTimeout(()=>{o.remove(); if(window._currentPopupDone){window._currentPopupDone();window._currentPopupDone=null;}}, 300); _sfx('close');">⭐ CLAIM REWARD</button>
            </div>
        </div>`;
    window._currentPopupDone = done || null;
    document.body.appendChild(overlay);
    _sfx('success');
    popupSound.currentTime = 0;
    popupSound.play().catch(() => {});
}

function showRankUpCinematic(fromRank, toRank, color, letter, done) {
    const existing = document.getElementById('rank-up-cinematic');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'rank-up-cinematic';
    overlay.style.cssText = `position:fixed;inset:0;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;`;
    overlay.innerHTML = `
        <style>
            @keyframes ruFadeIn{from{opacity:0}to{opacity:1}}
            @keyframes ruSlash{from{transform:scaleX(0);opacity:0}to{transform:scaleX(1);opacity:1}}
            @keyframes ruHexPop{from{opacity:0;transform:scale(0.2) rotate(-20deg)}to{opacity:1;transform:scale(1) rotate(0deg)}}
            @keyframes ruTextReveal{from{opacity:0;letter-spacing:20px}to{opacity:1;letter-spacing:4px}}
            @keyframes ruPulseGlow{0%,100%{box-shadow:0 0 40px ${color}88}50%{box-shadow:0 0 80px ${color},0 0 120px ${color}66}}
            @keyframes ruParticle{from{transform:translateY(0) scale(1);opacity:1}to{transform:translateY(-120px) scale(0);opacity:0}}
            @keyframes ruScanline{from{top:-4px}to{top:100%}}
        </style>
        <div style="position:absolute;left:0;right:0;height:4px;background:linear-gradient(90deg,transparent,${color},transparent);animation:ruScanline 1.2s ease-in-out;z-index:1;pointer-events:none;"></div>
        <div style="position:absolute;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,${color}22,transparent 70%);animation:ruFadeIn 0.8s ease;"></div>
        <div style="position:absolute;width:100%;display:flex;flex-direction:column;gap:8px;top:35%;animation:ruSlash 0.5s 0.3s ease both;transform-origin:left;">
            <div style="height:1px;background:linear-gradient(90deg,transparent,${color},transparent);opacity:0.6;"></div>
            <div style="height:1px;background:linear-gradient(90deg,transparent,${color},transparent);opacity:0.3;margin-left:30px;"></div>
        </div>
        <div style="position:absolute;width:100%;display:flex;flex-direction:column;gap:8px;bottom:35%;animation:ruSlash 0.5s 0.4s ease both;transform-origin:right;">
            <div style="height:1px;background:linear-gradient(90deg,transparent,${color},transparent);opacity:0.6;"></div>
            <div style="height:1px;background:linear-gradient(90deg,transparent,${color},transparent);opacity:0.3;margin-right:30px;"></div>
        </div>
        <div style="position:relative;z-index:2;text-align:center;display:flex;flex-direction:column;align-items:center;gap:20px;">
            <div style="font-size:11px;letter-spacing:6px;color:${color};font-weight:700;animation:ruFadeIn 0.5s 0.2s ease both;opacity:0;">RANK UP</div>
            <div style="width:100px;height:114px;position:relative;display:flex;align-items:center;justify-content:center;animation:ruHexPop 0.6s 0.5s cubic-bezier(0.34,1.56,0.64,1) both;opacity:0;animation-fill-mode:both;">
                <svg width="100" height="114" viewBox="0 0 100 114" style="position:absolute;animation:ruPulseGlow 2s 1s ease infinite;">
                    <polygon points="50,4 96,28 96,86 50,110 4,86 4,28" fill="rgba(0,0,0,0.8)" stroke="${color}" stroke-width="2.5"/>
                </svg>
                <span style="font-size:42px;font-weight:900;color:${color};position:relative;z-index:1;text-shadow:0 0 20px ${color};">${letter}</span>
            </div>
            <div style="font-size:28px;font-weight:900;color:#f8fafc;animation:ruTextReveal 0.7s 0.9s ease both;opacity:0;letter-spacing:4px;">${toRank.toUpperCase()}</div>
            <div style="font-size:12px;color:#64748b;letter-spacing:2px;animation:ruFadeIn 0.5s 1.2s ease both;opacity:0;">${fromRank} → ${toRank}</div>
            <div style="position:absolute;width:200px;height:200px;pointer-events:none;">
                ${Array.from({length:12}, (_,i) => {
                    const angle = (i/12)*360;
                    const dist = 60 + Math.random()*40;
                    const x = Math.cos(angle*Math.PI/180)*dist;
                    const y = Math.sin(angle*Math.PI/180)*dist;
                    const delay = 0.8 + Math.random()*0.4;
                    return `<div style="position:absolute;left:calc(50% + ${x}px);top:calc(50% + ${y}px);width:4px;height:4px;border-radius:50%;background:${color};animation:ruParticle 0.8s ${delay}s ease both;opacity:0;"></div>`;
                }).join('')}
            </div>
            <button onclick="document.getElementById('rank-up-cinematic').style.animation='ruFadeIn 0.3s reverse';setTimeout(()=>{document.getElementById('rank-up-cinematic').remove();if(window._currentPopupDone){window._currentPopupDone();window._currentPopupDone=null;}},300);_sfx('close');"
                style="margin-top:20px;background:${color};border:none;border-radius:8px;color:#020617;font-size:13px;font-weight:800;letter-spacing:3px;padding:13px 40px;cursor:pointer;animation:ruFadeIn 0.5s 1.5s ease both;opacity:0;">
                PROCEED
            </button>
        </div>`;
    window._currentPopupDone = done || null;
    document.body.appendChild(overlay);
    _sfx('success');
    popupSound.currentTime = 0;
    popupSound.play().catch(() => {});
}

function updateStats() {
    const statToday = document.getElementById('stat-today-xp');
    if (statToday) statToday.textContent = systemState.todayXp;

    const statTotal = document.getElementById('stat-total-xp');
    if (statTotal) statTotal.textContent = systemState.totalXp;
    
    // 1. Calculate Level based on Total XP
    const previousLevel = systemState.level;
    let lvl = 0;
    while (getTotalXpForLevel(lvl + 1) <= systemState.totalXp) lvl++;
    systemState.level = lvl;
    
    if (systemState.level > previousLevel) {
        const prevRankIdx = Math.min(Math.floor(previousLevel / 10), 5);
        const newRankIdx  = Math.min(Math.floor(systemState.level / 10), 5);
        const rankNames   = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'];
        const rankColors  = ['#94a3b8', '#34d399', '#38bdf8', '#a78bfa', '#fbbf24', '#f87171'];
        const rankIcons   = ['E', 'D', 'C', 'B', 'A', 'S'];

        if (newRankIdx > prevRankIdx) {
            // RANK UP — full cinematic
            queuePopup('rankUp', (done) => {
                showRankUpCinematic(rankNames[prevRankIdx], rankNames[newRankIdx], rankColors[newRankIdx], rankIcons[newRankIdx], done);
            });
        } else {
            // Just a level up within same rank — simple popup
            queuePopup('levelUp', (done) => {
                sysAlert(`You have leveled up to Level ${systemState.level}!`, { title: 'LEVEL UP', icon: '⬆', color: 'blue' }).then(done);
            });
        }
    }

    // 2. Define Rank Logic (Every 10 levels is a new Rank)
    const ranks = [
        { threshold: 0, letter: 'E', name: 'E-Rank' },
        { threshold: 10, letter: 'D', name: 'D-Rank' },
        { threshold: 20, letter: 'C', name: 'C-Rank' },
        { threshold: 30, letter: 'B', name: 'B-Rank' },
        { threshold: 40, letter: 'A', name: 'A-Rank' },
        { threshold: 50, letter: 'S', name: 'S-Rank' }
    ];

    // Find current and next rank
    let currentRankIndex = Math.floor(systemState.level / 10);
    if (currentRankIndex > 5) currentRankIndex = 5; // Cap at S-Rank
    
    const currentRank = ranks[currentRankIndex];
    const nextRank = currentRankIndex < 5 ? ranks[currentRankIndex + 1] : ranks[5];

    // 3. Calculate Progress Metrics for BOTH Bars
    const xpAtCurrentLevel = getTotalXpForLevel(systemState.level);
    const xpAtNextLevel = getTotalXpForLevel(systemState.level + 1);
    const expNeeded = xpAtNextLevel - xpAtCurrentLevel;
    const xpIntoCurrentLevel = systemState.totalXp - xpAtCurrentLevel;
    const expLeft = expNeeded - xpIntoCurrentLevel;
    const levelProgressPercent = currentRankIndex >= 5 ? 100 : Math.floor((xpIntoCurrentLevel / expNeeded) * 100);

    let levelsIntoRank = systemState.level % 10;
    if (currentRankIndex >= 5) levelsIntoRank = 10;
    const xpAtRankStart = getTotalXpForLevel(currentRankIndex * 10);
    const xpAtRankEnd = getTotalXpForLevel(Math.min((currentRankIndex + 1) * 10, 60));
    const rankProgressPercent = currentRankIndex >= 5 ? 100 : Math.floor(((systemState.totalXp - xpAtRankStart) / (xpAtRankEnd - xpAtRankStart)) * 100);
    const levelsToNext = currentRankIndex >= 5 ? 0 : 10 - levelsIntoRank;

// --- APPLY TO UI ---
    
    // Home Screen Updates
    const playerLevelEl = document.getElementById('player-level');
    if (playerLevelEl) playerLevelEl.textContent = systemState.level;
    
    const statLevelEl = document.getElementById('stat-level');
    if (statLevelEl) statLevelEl.textContent = systemState.level;
    
    const homeRankEl = document.getElementById('home-rank-text');
    if (homeRankEl) homeRankEl.textContent = currentRank.letter;

    // Quests Screen Updates
    const qLevel = document.getElementById('quests-player-level');
    if (qLevel) qLevel.textContent = systemState.level;
    
    const qRank = document.getElementById('quests-rank-text');
    if (qRank) qRank.textContent = currentRank.letter;

    // Dashboard General Info
    const dashLevelElement = document.getElementById('dash-level');
    if(dashLevelElement) dashLevelElement.textContent = systemState.level;
    
    const dashMiniHex = document.getElementById('dash-mini-hex');
    if(dashMiniHex) dashMiniHex.textContent = currentRank.letter;

    const rpcLevel = document.getElementById('dash-rpc-level');
    if(rpcLevel) rpcLevel.textContent = `Level ${systemState.level}`;
    
    const rpcRank = document.getElementById('dash-rpc-rank');
    if(rpcRank) rpcRank.textContent = currentRank.name;

    // --- APPLY TO RANK MODULE ---
    const rpcPillCurr = document.getElementById('dash-pill-current');
    if(rpcPillCurr) rpcPillCurr.textContent = currentRank.name;
    
    const rpcPillNext = document.getElementById('dash-pill-next');
    if(rpcPillNext) rpcPillNext.textContent = currentRankIndex >= 5 ? 'MAX' : nextRank.name;

    const rankText = document.getElementById('dash-rank-text');
    if(rankText) rankText.textContent = `${rankProgressPercent}% Completed`;
    
    const levelsLeft = document.getElementById('dash-levels-left');
    if(levelsLeft) levelsLeft.textContent = currentRankIndex >= 5 ? 'Max Rank Reached' : `${levelsToNext} Levels to Promotion`;

    const rankFill = document.getElementById('dash-rank-fill');
    if(rankFill) rankFill.style.width = `${rankProgressPercent}%`;

    // --- APPLY TO LEVEL MODULE ---
    const levelTarget = document.getElementById('dash-level-target');
    if(levelTarget) levelTarget.innerHTML = currentRankIndex >= 5 ? `MAX LEVEL` : `LEVEL ${systemState.level} &rarr; ${systemState.level + 1}`;

    const levelText = document.getElementById('dash-level-text');
    if(levelText) levelText.textContent = currentRankIndex >= 5 ? `MAX EXP` : `${xpIntoCurrentLevel} / ${expNeeded} EXP`;

    const expLeftEl = document.getElementById('dash-exp-left');
    if(expLeftEl) expLeftEl.textContent = currentRankIndex >= 5 ? `-` : `${expLeft} EXP Needed`;

    const levelFill = document.getElementById('dash-level-fill');
    if(levelFill) levelFill.style.width = `${levelProgressPercent}%`;

    // Shared header level meter
    const headerFill = document.getElementById('header-level-fill');
    if(headerFill) headerFill.style.width = `${levelProgressPercent}%`;

    const headerTarget = document.getElementById('header-level-target');
    if(headerTarget) headerTarget.innerHTML = currentRankIndex >= 5 ? `MAX LEVEL` : `LEVEL ${systemState.level} &rarr; ${systemState.level + 1}`;

    const headerExpLabel = document.getElementById('header-exp-label');
    if(headerExpLabel) headerExpLabel.textContent = currentRankIndex >= 5 ? `MAX EXP` : `${xpIntoCurrentLevel} / ${expNeeded} EXP`;

    // --- STREAK UPDATES ---
    const claimedToday = systemState.streakIncrementedToday === true;
    const hasStreak = systemState.streak > 0;
    // Home header streak badge
    const streakBadgeHome = document.querySelector('#shared-header .streak-badge');
    if (streakBadgeHome) {
        streakBadgeHome.style.background = claimedToday
            ? 'linear-gradient(90deg, rgba(251,191,36,0.2), rgba(251,191,36,0.05))'
            : 'linear-gradient(90deg, rgba(100,100,100,0.15), rgba(100,100,100,0.05))';
        streakBadgeHome.style.borderColor = claimedToday ? 'rgba(251,191,36,0.5)' : 'rgba(63,68,79,0.6)';
        streakBadgeHome.style.color = claimedToday ? 'var(--neon-gold)' : '#3f444f';
        streakBadgeHome.style.boxShadow = claimedToday ? '0 0 10px rgba(251,191,36,0.2)' : 'none';
        const svgStroke = streakBadgeHome.querySelector('svg');
        if (svgStroke) {
            svgStroke.style.stroke = claimedToday ? 'var(--neon-gold)' : '#3f444f';
            svgStroke.classList.toggle('burning', claimedToday);
        }
    }
    const bonusBanner = document.getElementById('daily-bonus-banner');
    const bonusStatLabel = document.getElementById('bonus-stat-label');
    const bonusEmojiEl = document.getElementById('bonus-emoji');
    if (bonusBanner) {
        if (systemState.dailyBonusClaimed) {
            if (bonusStatLabel) { bonusStatLabel.textContent = '+150 XP Claimed'; bonusStatLabel.style.color = '#34d399'; }
            if (bonusEmojiEl) bonusEmojiEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
            bonusBanner.style.borderColor = 'rgba(52,211,153,0.4)';
            bonusBanner.style.background = 'rgba(52,211,153,0.06)';
            const hint = document.getElementById('bonus-claim-hint');
            if (hint) { hint.innerHTML = '<span style="color:#34d399;font-weight:800;font-size:13px;letter-spacing:1px;">CLAIMED</span>'; }
        } else {
            if (bonusStatLabel) { bonusStatLabel.textContent = '???'; bonusStatLabel.style.color = 'var(--text-muted)'; }
            if (bonusEmojiEl) bonusEmojiEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
            bonusBanner.style.borderColor = 'rgba(56,189,248,0.2)';
            bonusBanner.style.background = 'rgba(15,23,42,0.6)';
            const hint = document.getElementById('bonus-claim-hint');
            if (hint) { hint.innerHTML = '<span style="font-size:11px;color:var(--text-muted);">Complete all<br>dailies to claim</span>'; }
        }
    }

    // --- STREAK UPDATES ---
    const streakCountHome = document.getElementById('streak-count');
    if (streakCountHome) streakCountHome.textContent = `${systemState.streak} Days`;

    // Profile dashboard streak badge
    const streakBadgeDash = document.querySelector('.rank-progress-card .streak-badge');
    if (streakBadgeDash) {
        streakBadgeDash.style.background = claimedToday
            ? 'linear-gradient(90deg, rgba(251,191,36,0.2), rgba(251,191,36,0.05))'
            : 'linear-gradient(90deg, rgba(63,68,79,0.15), rgba(63,68,79,0.05))';
        streakBadgeDash.style.borderColor = claimedToday ? 'rgba(251,191,36,0.5)' : 'rgba(63,68,79,0.6)';
        streakBadgeDash.style.color = claimedToday ? 'var(--neon-gold)' : '#3f444f';
        streakBadgeDash.style.boxShadow = claimedToday ? '0 0 10px rgba(251,191,36,0.2)' : 'none';
        const svgFill = streakBadgeDash.querySelector('svg');
        if (svgFill) {
            svgFill.style.fill = claimedToday ? 'var(--neon-gold)' : '#3f444f';
            svgFill.classList.toggle('burning', claimedToday);
        }
    }
    const dashStreak = document.getElementById('dash-streak');
    if (dashStreak) dashStreak.textContent = `${systemState.streak} Days`;

    const qStreak = document.getElementById('quests-streak-count');
    if (qStreak) qStreak.textContent = `${systemState.streak} Days`;
}

// --- Navigation ---
// We define the exact order of tabs to calculate which way to swipe
const tabsOrder = ['home', 'quests', 'analytics', 'profile'];

function switchTab(tabId) {
    if (tabId === 'profile') { renderAchievements(); }
    // Check if the user is registered. If not, block navigation and show warning.
    if (tabId !== 'profile' && !localStorage.getItem('hunterName')) {
        document.getElementById('registration-warning-modal').style.display = 'flex';
        popupSound.currentTime = 0;
        popupSound.play().catch(e => console.log("Popup sound blocked"));
        return; // Stop the function here so the tab doesn't change
    }

    // Update the active tab tracker so the filter system knows what to highlight
    if (tabId === 'home' || tabId === 'quests') {
        currentActiveTab = tabId; 
    }

    // SAFELY toggle the Static Shared Header (prevents freezing/crashing)
    const sharedHeader = document.getElementById('shared-header');
    if (sharedHeader) {
        if (tabId === 'home' || tabId === 'quests') {
            sharedHeader.classList.remove('hidden');
        } else {
            sharedHeader.classList.add('hidden');
        }
    }
    

    const targetIndex = tabsOrder.indexOf(tabId);

    // Hide all views and apply directional swipe classes
    tabsOrder.forEach((tab, index) => {
        const viewEl = document.getElementById(`view-${tab}`);
        if (!viewEl) return;

        // Reset previous animation states
        viewEl.classList.remove('active', 'off-left', 'off-right');

        if (index < targetIndex) {
            // Tabs to the left of our target slide out/stay off to the left
            viewEl.classList.add('off-left');
        } else if (index > targetIndex) {
            // Tabs to the right of our target slide out/stay off to the right
            viewEl.classList.add('off-right');
        } else {
            // The Target tab slides into the center
            viewEl.classList.add('active');
        }
    });
    
    // Update Nav UI safely
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // Find the button that matches this tab and highlight it
    const activeNavBtn = document.querySelector(`.nav-item[onclick="switchTab('${tabId}')"]`);
    if (activeNavBtn) activeNavBtn.classList.add('active');
}

// ==========================================
// --- ETHIOPIAN CALENDAR SYSTEM ---
// ==========================================
function getLiveEthDate() {
    const anchorGC = new Date("2026-02-09T00:00:00"); 
    const anchorEth = { y: 2018, m: 6, d: 2 }; 

    const today = new Date();
    const diffTime = today.setHours(0,0,0,0) - anchorGC.setHours(0,0,0,0);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let d = anchorEth.d + diffDays;
    let m = anchorEth.m;
    let y = anchorEth.y;

    while (true) {
        let dim = 30; 
        if (m === 13) dim = (y % 4 === 3) ? 6 : 5;

        if (d > dim) {
            d -= dim; m++;
            if (m > 13) { m = 1; y++; }
        } else if (d < 1) {
            m--;
            if (m < 1) { m = 13; y--; }
            let pdim = 30;
            if (m === 13) pdim = (y % 4 === 3) ? 6 : 5;
            d += pdim;
        } else { break; }
    }
    return { year: y, month: m, day: d };
}

const TODAY_ETH = getLiveEthDate();
let ethCurrentYear = TODAY_ETH.year; 
let ethCurrentMonth = TODAY_ETH.month;
const ETH_MONTHS = ["", "መስከረም", "ጥቅምት", "ህዳር", "ታህሳስ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"];

let selectedEventColor = '#8b5cf6';
let currentEditEventId = null;

function switchCalPanel(panel) {
    document.getElementById('cal-panel-add').style.display = panel === 'add' ? 'block' : 'none';
    document.getElementById('cal-panel-list').style.display = panel === 'list' ? 'block' : 'none';
    document.getElementById('tab-btn-add').classList.toggle('active', panel === 'add');
    document.getElementById('tab-btn-list').classList.toggle('active', panel === 'list');
    if(panel === 'list') renderEventList();
}

function getEthMonthStartDay(year, month) {
    let totalDays = 0;
    for(let y = 2016; y < year; y++) totalDays += (y % 4 === 3) ? 366 : 365; 
    totalDays += (month - 1) * 30;
    return (totalDays + 2) % 7;
}

function isEventActive(ev, day, month, year) {
    if (ev.recurrence === 'monthly') return ev.day === day;
    if (ev.recurrence === 'yearly' || !ev.recurrence) return ev.day === day && ev.month === month;
    if (ev.recurrence === 'once') return ev.day === day && ev.month === month && ev.year === year;
    return false;
}

function renderEthCalendar() {
    if(!systemState.events) systemState.events = [];
    const container = document.getElementById('cal-days-container');
    if(!container) return;
    container.innerHTML = '';
    
    document.getElementById('cal-month-name').innerText = ETH_MONTHS[ethCurrentMonth];
    document.getElementById('cal-year-num').innerText = ethCurrentYear;

    let daysInMonth = (ethCurrentMonth === 13) ? (ethCurrentYear % 4 === 3 ? 6 : 5) : 30;
    const startDay = getEthMonthStartDay(ethCurrentYear, ethCurrentMonth);
    const gridOffset = (startDay + 6) % 7; 

    for (let i = 0; i < gridOffset; i++) {
        const d = document.createElement('div');
        d.className = 'cal-cell empty';
        container.appendChild(d);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const div = document.createElement('div');
        div.className = 'cal-cell';
        
        if (ethCurrentYear === TODAY_ETH.year && ethCurrentMonth === TODAY_ETH.month && d === TODAY_ETH.day) {
            div.classList.add('is-today');
        }

        const numSpan = document.createElement('span');
        numSpan.innerText = d;
        div.appendChild(numSpan);

        const daysEvents = systemState.events.filter(ev => isEventActive(ev, d, ethCurrentMonth, ethCurrentYear));
        
        if (daysEvents.length > 0) {
            div.classList.add('has-event');
            
            // FINDASH MECHANISM: Background manipulation
            if (daysEvents.length === 1) {
                const c = daysEvents[0].color;
                // Add '40' to hex for 25% opacity, fallback if old var(--color) is saved
                div.style.backgroundColor = c.startsWith('#') ? c + '40' : 'rgba(56, 189, 248, 0.25)';
                div.style.borderColor = c;
            } else {
                div.classList.add('multi-event');
                const slice = 100 / daysEvents.length;
                let gradient = "conic-gradient(";
                daysEvents.forEach((ev, i) => {
                    gradient += `${ev.color} ${i * slice}% ${(i + 1) * slice}%${i < daysEvents.length - 1 ? ',' : ''}`;
                });
                gradient += ")";
                div.style.background = gradient;
            }

            // Keep the Tooltip logic so they can hover/press to read what the events are
            const tip = document.createElement('div');
            tip.className = 'cal-tooltip';
            tip.innerHTML = daysEvents.map(ev => `
                <div class="tooltip-item"><div class="tooltip-dot" style="background:${ev.color}"></div><span>${ev.title}</span></div>
            `).join('');
            div.appendChild(tip);
            
            // --- FINDASH FEATURE: Click to Edit & Cycle ---
            // If the day has events, clicking it loads the event into the editor.
            // If it has MULTIPLE events, each click cycles to the next one automatically!
            let clickIndex = 0;
            div.onclick = () => {
                loadEventToEdit(daysEvents[clickIndex].id);
                // Advance the index so the next click loads the next event on this day
                clickIndex = (clickIndex + 1) % daysEvents.length;
            };
        } else {
            div.onclick = () => {
                resetCalForm();
                document.getElementById('evt-day').value = d;
                document.getElementById('evt-month').value = ethCurrentMonth;
                switchCalPanel('add');
            };
        }
        container.appendChild(div);
    }
}

function changeEthMonth(delta) {
    ethCurrentMonth += delta;
    if (ethCurrentMonth > 13) { ethCurrentMonth = 1; ethCurrentYear++; }
    else if (ethCurrentMonth < 1) { ethCurrentMonth = 13; ethCurrentYear--; }
    renderEthCalendar();
}

function selectColor(el, color) {
    document.querySelectorAll('.color-opt').forEach(d => d.classList.remove('selected'));
    el.classList.add('selected');
    selectedEventColor = color;
}

function jumpToToday() {
    ethCurrentYear = TODAY_ETH.year;
    ethCurrentMonth = TODAY_ETH.month;
    renderEthCalendar();
}

function addCalendarEvent() {
    const day = parseInt(document.getElementById('evt-day').value);
    const month = parseInt(document.getElementById('evt-month').value);
    const title = document.getElementById('evt-title').value;
    const recurrence = document.getElementById('evt-recurrence').value;

    if(!day || !month || !title) {
        showNotification({ 
            id: 'error', 
            title: 'SYSTEM ERROR', 
            notes: 'Please fill day, month, and title to create an event.' 
        });
        return;
    }

    const eventData = { 
        id: currentEditEventId || Date.now(), 
        day, month, title, recurrence, 
        color: selectedEventColor, 
        year: ethCurrentYear 
    };

    if (currentEditEventId) {
        const idx = systemState.events.findIndex(e => e.id === currentEditEventId);
        systemState.events[idx] = eventData;
    } else {
        systemState.events.push(eventData);
    }

    resetCalForm();
    saveGameState();
    renderEthCalendar();
    renderEventList();
}

function renderEventList() {
    const container = document.getElementById('event-list-container');
    if(!container) return;
    const searchTerm = document.getElementById('search-event').value.toLowerCase();
    
    const filtered = (systemState.events || []).filter(e => e.title.toLowerCase().includes(searchTerm));

    container.innerHTML = filtered.map(e => `
        <div class="event-item-row">
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:12px; height:12px; border-radius:50%; background:${e.color}; box-shadow: 0 0 8px ${e.color};"></div>
                <div>
                    <div style="font-weight:bold; font-size:14px; color:white;">${e.title}</div>
                    <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase;">${(e.recurrence || 'yearly')}: Day ${e.day}${e.recurrence !== 'monthly' ? ', Month ' + e.month : ''}</div>
                </div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="icon-btn" onclick="loadEventToEdit(${e.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neon-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button class="icon-btn" onclick="deleteEvent(${e.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--neon-red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
    `).join('');
}

function loadEventToEdit(id) {
    const ev = systemState.events.find(e => e.id === id);
    if(!ev) return;
    switchCalPanel('add');
    currentEditEventId = id;
    document.getElementById('evt-day').value = ev.day;
    document.getElementById('evt-month').value = ev.month;
    document.getElementById('evt-title').value = ev.title;
    document.getElementById('evt-recurrence').value = ev.recurrence || 'yearly';
    selectedEventColor = ev.color;
    document.querySelectorAll('.color-opt').forEach(el => el.classList.toggle('selected', el.getAttribute('data-col') === ev.color));
    document.getElementById('cal-form-title').innerText = "UPDATE EVENT";
    document.getElementById('btn-save-evt').innerText = "SAVE CHANGES";
    document.getElementById('btn-cancel-evt').style.display = 'flex';
    document.getElementById('btn-delete-evt').style.display = 'flex';
}

function deleteEvent(id) {
    sysConfirm("Delete this event? This cannot be undone.", { title: 'DELETE EVENT', icon: '🗑', color: 'red' }).then(ok => {
        if (!ok) return;
        systemState.events = systemState.events.filter(e => e.id !== id);
        saveGameState();
        renderEthCalendar();
        renderEventList();
    });
}

function resetCalForm() {
    currentEditEventId = null;
    document.getElementById('evt-title').value = '';
    document.getElementById('cal-form-title').innerText = "CREATE EVENT";
    document.getElementById('btn-save-evt').innerText = "SAVE EVENT";
    document.getElementById('btn-cancel-evt').style.display = 'none';
    document.getElementById('btn-delete-evt').style.display = 'none';
    
    // Reset color picker to default (Neon Blue)
    selectedEventColor = '#8b5cf6';
    document.querySelectorAll('.color-opt').forEach(el => {
        el.classList.toggle('selected', el.getAttribute('data-col') === '#8b5cf6');
    });
}

// --- Profile & Data Management ---
let tempName = '';
let tempAvatar = '';

// 1. Switch between Dashboard and Edit Mode
function toggleProfileMode(mode) {
    const setupView = document.getElementById('profile-setup-view');
    const dashView = document.getElementById('profile-dashboard-view');
    const closeBtn = document.getElementById('close-edit-btn');

    if (mode === 'edit') {
        setupView.style.display = 'flex';
        dashView.style.display = 'none';
        
        const saveBtn = document.getElementById('profile-save-btn');
        if (localStorage.getItem('hunterName')) {
            closeBtn.style.display = 'block';
            if (saveBtn) saveBtn.textContent = 'SAVE CHANGES';
        } else {
            closeBtn.style.display = 'none';
            if (saveBtn) saveBtn.textContent = 'SAVE & INITIALIZE';
        }
    } else {
        setupView.style.display = 'none';
        dashView.style.display = 'flex';
    }
}

// 2. Temporarily store name while typing
function tempChangeName(event) {
    tempName = event.target.value;
}

// 3. Temporarily store image and show in setup preview
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            tempAvatar = e.target.result;
            // Only update the PREVIEW in the setup menu, not the actual app yet
            document.getElementById('profile-avatar-preview').style.backgroundImage = `url(${tempAvatar})`;
        };
        reader.readAsDataURL(file);
    }
}

// 4. Save Button Clicked -> Apply to Home & Dashboard
function saveProfileData() {
    // If they typed something, save it. Otherwise, fallback to previous or "Jinwoo".
    let finalName = tempName || localStorage.getItem('hunterName') || 'Jinwoo';
    localStorage.setItem('hunterName', finalName);

    // If they uploaded an image, save it.
    if(tempAvatar) {
        localStorage.setItem('hunterAvatar', tempAvatar);
    }

    // Officially register the user's start dates if they don't exist yet
    if (!localStorage.getItem('dateJoined')) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        localStorage.setItem('dateJoined', new Date().toLocaleDateString('en-US', options));
        localStorage.setItem('lastLoginDate', new Date().toDateString());
    }

    // Apply the saved changes to all screens!
    applySavedDataToUI();

    // --- FEATURE 2: Ask for Native Notification Permission ---
    requestNotificationPermission();

    // Switch to dashboard view
    toggleProfileMode('dashboard');
}

async function requestNotificationPermission() {
    try {
        // 1. Check current status before requesting (Android 13+ Requirement)
        let permStatus = await Capacitor.Plugins.LocalNotifications.checkPermissions();
        
        if (permStatus.display !== 'granted') {
            permStatus = await Capacitor.Plugins.LocalNotifications.requestPermissions();
        }

        // 2. If granted, set up the Native Channels & Listeners
        if (permStatus.display === 'granted') {
            // Delete first so Android is forced to re-read the sound on every install
            await Capacitor.Plugins.LocalNotifications.deleteChannel({ id: 'system_alerts' }).catch(() => {});
            await Capacitor.Plugins.LocalNotifications.createChannel({
                id: 'system_alerts',
                name: 'System Alerts',
                description: 'Time-sensitive Quest Notifications',
                importance: 5,
                visibility: 1,
                vibration: true,
                sound: 'mysound' // No .mp3 extension — Android requires this
            });

            await Capacitor.Plugins.LocalNotifications.registerActionTypes({
                types:[{
                    id: 'QUEST_ACTIONS',
                    actions:[{
                        id: 'COMPLETE_QUEST',
                        title: 'COMPLETE', 
                        foreground: false 
                    }]
                }]
            });

            // Clear old listeners so we don't get duplicates when reloading
            await Capacitor.Plugins.LocalNotifications.removeAllListeners();

            Capacitor.Plugins.LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
                if (notificationAction.actionId === 'COMPLETE_QUEST') {
                    const questId = notificationAction.notification.extra.questId;
                    if (questId) toggleQuest(questId);
                }
            });
        }
    } catch (e) {
        console.log("Not on mobile, skipping native permission");
    }
}

async function triggerSystemAlert(quest) {
    try {
        // Web Browser Failsafe
        if (!window.Capacitor || !Capacitor.Plugins.LocalNotifications) {
            showNotification(quest); 
            return;
        }

        if (quest.id === 'system-warning') {
            await Capacitor.Plugins.LocalNotifications.schedule({
                notifications:[{
                    title: quest.title,
                    body: quest.notes || "System penalty imminent.",
                    id: 99999, 
                    schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true }, // Wakes up sleeping phones
                    channelId: 'system_alerts'
                }]
            });
        }
    } catch (e) {
        showNotification(quest); 
    }
}

// ==========================================
// --- WORKMANAGER BACKGROUND SCHEDULER ---
// ==========================================
async function scheduleNativeWorkManager(quest) {
    try {
        if (!window.Capacitor || !Capacitor.Plugins.LocalNotifications) return;

        let permStatus = await Capacitor.Plugins.LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') return;

        const pending = await Capacitor.Plugins.LocalNotifications.getPending();
        const toCancel = pending.notifications.filter(n => n.id >= quest.id * 100 && n.id < (quest.id + 1) * 100);
        if (toCancel.length > 0) {
            await Capacitor.Plugins.LocalNotifications.cancel({ notifications: toCancel });
        }
        
        let futureTasks =[];
        if (quest.reminders) {
            const isDaily = quest.type === 'daily' || !quest.type;

            if (isDaily) {
                quest.reminders.forEach((rem, remIdx) => {
                    const[hours, minutes] = rem.split(':').map(Number);
                    if (isNaN(hours) || isNaN(minutes)) return;

                    let daysScheduled = 0;
                    for (let i = 0; i < 30; i++) {
                        if (daysScheduled >= 14) break; 

                        let checkDate = new Date();
                        checkDate.setDate(checkDate.getDate() + i);
                        checkDate.setHours(hours, minutes, 0, 0);

                        if (i === 0 && checkDate.getTime() <= Date.now()) continue;

                        if (isQuestActiveOnDate(quest, checkDate)) {
                            futureTasks.push({
                                title: quest.title,
                                body: quest.notes || "A daily task requires your attention.",
                                id: parseInt(`${quest.id}${remIdx}${daysScheduled}`), 
                                schedule: { at: checkDate, allowWhileIdle: true }, // <--- FORCES ANDROID TO WAKE UP
                                channelId: 'system_alerts',
                                actionTypeId: 'QUEST_ACTIONS',
                                extra: { questId: quest.id }
                            });
                            daysScheduled++;
                        }
                    }
                });
            } else {
                quest.reminders.forEach((rem, idx) => {
                    const remDate = new Date(rem);
                    if (remDate.getTime() > Date.now()) {
                        futureTasks.push({
                            title: quest.title,
                            body: quest.notes || "A task requires your attention.",
                            id: (quest.id * 100) + idx, 
                            schedule: { at: remDate, allowWhileIdle: true }, // <--- FORCES ANDROID TO WAKE UP
                            channelId: 'system_alerts',
                            actionTypeId: 'QUEST_ACTIONS',
                            extra: { questId: quest.id }
                        });
                    }
                });
            }
        }

        if (futureTasks.length > 0) {
            await Capacitor.Plugins.LocalNotifications.schedule({
                notifications: futureTasks
            });
        }
    } catch (e) {
        console.log("App running in browser or plugin missing. Background WorkManager skipped.");
    }
}

// Helper to delete background tasks when you delete a quest
async function cancelWorkManagerTasks(questId) {
    try {
        const pending = await Capacitor.Plugins.LocalNotifications.getPending();
        const toCancel = pending.notifications.filter(n => n.id >= questId * 100 && n.id < (questId + 1) * 100);
        if (toCancel.length > 0) {
            await Capacitor.Plugins.LocalNotifications.cancel({ notifications: toCancel });
        }
    } catch (e) { }
}

// 5. Applies data to HTML elements on load AND after save
function applySavedDataToUI() {
    const savedName = localStorage.getItem('hunterName');
    const savedAvatar = localStorage.getItem('hunterAvatar');
    const dateJoined = localStorage.getItem('dateJoined');

    if (savedName) {
        document.getElementById('home-username').textContent = savedName;
        const dashUser = document.getElementById('dash-username');
        if(dashUser) dashUser.textContent = savedName;
        const nameInput = document.getElementById('profile-name-input');
        if(nameInput) nameInput.value = savedName;
        
        const qUsername = document.getElementById('quests-username');
        if (qUsername) qUsername.textContent = savedName;
    }

    if (savedAvatar) {
        const bgUrl = `url(${savedAvatar})`;
        document.getElementById('home-avatar').style.backgroundImage = bgUrl;
        const dashAv = document.getElementById('dash-avatar');
        if(dashAv) dashAv.style.backgroundImage = bgUrl;
        const profAv = document.getElementById('profile-avatar-preview');
        if(profAv) profAv.style.backgroundImage = bgUrl;
        
        const qAvatar = document.getElementById('quests-avatar');
        if (qAvatar) qAvatar.style.backgroundImage = bgUrl;
    }

    if (dateJoined) {
        const dashDate = document.getElementById('dash-date-joined');
        if(dashDate) dashDate.textContent = dateJoined;
    }
}

// 6. Check if user is New or Returning when app opens
function loadSavedProfile() {
    const savedName = localStorage.getItem('hunterName');
    
    if (savedName) {
        applySavedDataToUI();
        toggleProfileMode('dashboard');
    } else {
        toggleProfileMode('edit');
        switchTab('profile'); // Automatically route new users to the Profile tab
    }
}

// ==========================================
// --- FILTER SYSTEM ---
// ==========================================

function openFilterModal() {
    // 1. Toggle DUE vs SCHEDULED visibility based on tab
    if (currentActiveTab === 'home') {
        document.getElementById('filter-due').style.display = 'block';
        document.getElementById('filter-scheduled').style.display = 'none';
        // Failsafe: if home filter was accidentally set to scheduled, reset it to due
        if (filters.home === 'scheduled') filters.home = 'due'; 
    } else {
        document.getElementById('filter-due').style.display = 'none';
        document.getElementById('filter-scheduled').style.display = 'block';
        // Failsafe: if quests filter was accidentally set to due, reset it to scheduled
        if (filters.quests === 'due') filters.quests = 'scheduled';
    }

    // 2. Highlight the correct button for whichever tab we are currently on
    document.querySelectorAll('.filter-opt').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('filter-' + filters[currentActiveTab]);
    if (activeBtn) activeBtn.classList.add('active');

    document.getElementById('filter-modal').style.display = 'flex';
}

function closeFilterModal(event) {
    // Only close if clicking the dark background outside the panel
    if (event && event.target !== document.getElementById('filter-modal')) return;
    document.getElementById('filter-modal').style.display = 'none';
}

function setFilter(type) {
    // Save the choice specifically to the tab we are currently viewing
    filters[currentActiveTab] = type;
    localStorage.setItem('filter_' + currentActiveTab, type); 
    
    // Update button colors in the filter menu
    document.querySelectorAll('.filter-opt').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('filter-' + type);
    if (activeBtn) activeBtn.classList.add('active');
    
    renderQuests(); // Redraw the UI
    
    // Close modal if it's open
    setTimeout(() => {
        document.getElementById('filter-modal').style.display = 'none';
    }, 150); // Small delay feels smoother
}

// ==========================================
// --- ADD / EDIT QUEST SYSTEM ---
// ==========================================
let currentDifficulty = 'easy'; 
let editingQuestId = null; // null means "Create", a number means "Edit"
let currentQuestType = 'daily'; // Keep track of daily vs quest
let selectedScheduleDays = [];
let tempReminders = []; // Holds reminders while editing

function toggleDay(el) {
    const day = parseInt(el.getAttribute('data-day'));
    if (selectedScheduleDays.includes(day)) {
        selectedScheduleDays = selectedScheduleDays.filter(d => d !== day);
        el.classList.remove('active');
    } else {
        selectedScheduleDays.push(day);
        el.classList.add('active');
    }
    updateScheduleSummary();

}

function toggleDayPicker() {
    const type = document.getElementById('schedule-type').value;
    const container = document.getElementById('day-picker-container');
    const label = document.getElementById('interval-label');
    
    // Only show the circles if Weekly is selected!
    if (type === 'weekly') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
    
    if(type === 'daily') label.textContent = 'Days';
    if(type === 'weekly') label.textContent = 'Weeks';
    if(type === 'monthly') label.textContent = 'Months';
    
    updateScheduleSummary();
}
function updateScheduleSummary() {
    const type = document.getElementById('schedule-type').value;
    let interval = document.getElementById('schedule-interval').value;
    const summaryEl = document.getElementById('schedule-summary');
    
    // Safety check: if you delete the number completely, default to 1 so the text doesn't look broken
    if (!interval || interval < 1) {
        interval = 1;
    }
    
    let unit = 'day';
    if (type === 'weekly') unit = 'week';
    if (type === 'monthly') unit = 'month';

    let text = `Repeats ${type.toUpperCase()} every ${interval} ${unit}${interval > 1 ? 's' : ''}`;
    
    if (type === 'weekly' && selectedScheduleDays.length > 0) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const selectedNames = selectedScheduleDays.sort().map(d => dayNames[d]);
        text += ` on ${selectedNames.join(', ')}`;
    }
    
    summaryEl.textContent = text;
}

// ==========================================
// --- ADD / EDIT QUEST SYSTEM ---
// ==========================================

function openAddQuestModal(type = 'daily') {
    editingQuestId = null; 
    currentQuestType = type;
    document.getElementById('modal-title').textContent = type === 'daily' ? 'CREATE DAILY' : 'CREATE QUEST';
    document.getElementById('new-quest-title').value = '';
    document.getElementById('new-quest-notes').value = '';
    document.getElementById('modal-delete-btn').style.display = 'none';
    
    // Reset Scheduling
    document.getElementById('scheduling-section').style.display = type === 'daily' ? 'block' : 'none';
    document.getElementById('quest-scheduling-section').style.display = type === 'quest' ? 'block' : 'none';
    document.getElementById('quest-due-date').value = '';
    tempReminders = [];
    renderReminders();
    document.getElementById('schedule-type').value = 'daily';
    document.getElementById('schedule-interval').value = 1;
    document.getElementById('schedule-start-date').value = new Date().toISOString().split('T')[0];
    selectedScheduleDays = [];
    document.querySelectorAll('.day-circle').forEach(c => c.classList.remove('active'));
    toggleDayPicker();

    selectDifficulty('easy');
    // This clears the blue circles when you make a NEW quest
    selectedScheduleDays = [];
    document.querySelectorAll('.day-circle').forEach(c => c.classList.remove('active'));
    document.getElementById('schedule-type').value = 'daily';
    toggleDayPicker();
    document.getElementById('add-quest-modal').style.display = 'flex';
}

function openEditQuestModal(id) {
    editingQuestId = id; 
    const quest = systemState.quests.find(q => q.id === id);
    
    currentQuestType = quest.type || 'daily';
    document.getElementById('modal-title').textContent = currentQuestType === 'daily' ? 'EDIT DAILY' : 'EDIT QUEST';
    document.getElementById('new-quest-title').value = quest.title;
    document.getElementById('new-quest-notes').value = quest.notes || '';
    document.getElementById('modal-delete-btn').style.display = 'block'; // Show delete button for EXISTING quests
    selectDifficulty(quest.difficulty || 'easy');
    // Load Scheduling Data
    document.getElementById('scheduling-section').style.display = currentQuestType === 'daily' ? 'block' : 'none';
    document.getElementById('quest-scheduling-section').style.display = currentQuestType === 'quest' ? 'block' : 'none';
    document.getElementById('quest-due-date').value = quest.dueDate || '';
    tempReminders = quest.reminders ? [...quest.reminders] : [];
    renderReminders();
    if (quest.schedule) {
        document.getElementById('schedule-type').value = quest.schedule.type || 'daily';
        document.getElementById('schedule-interval').value = quest.schedule.interval || 1;
        document.getElementById('schedule-start-date').value = quest.schedule.startDate || "";
        selectedScheduleDays = quest.schedule.days || [];
        document.querySelectorAll('.day-circle').forEach(c => {
            const d = parseInt(c.getAttribute('data-day'));
            if(selectedScheduleDays.includes(d)) c.classList.add('active');
            else c.classList.remove('active');
        });
        toggleDayPicker();
    }
    
    document.getElementById('add-quest-modal').style.display = 'flex';
}

function closeQuestModal() {
    document.getElementById('add-quest-modal').style.display = 'none';
}

function selectDifficulty(level) {
    currentDifficulty = level;
    
    // Reset all boxes and text
    document.querySelectorAll('.diff-box').forEach(box => box.classList.remove('active'));
    document.querySelectorAll('.diff-option span').forEach(txt => txt.classList.remove('active'));
    
    // Activate selected box and text
    document.getElementById('box-' + level).classList.add('active');
    document.getElementById('text-' + level).classList.add('active');
}

function saveQuest() {
    const title = document.getElementById('new-quest-title').value;
    const notes = document.getElementById('new-quest-notes').value;
    
    if (!title) {
        sysAlert("Please provide a Task Title before saving.", { title: 'MISSING FIELD', icon: '✖', color: 'red' });
        return;
    }
    
    const xpMap = { trivial: 5, easy: 15, medium: 25, hard: 40 };
    const xpReward = xpMap[currentDifficulty] || 15;
    
    if (editingQuestId !== null) {
        const quest = systemState.quests.find(q => q.id === editingQuestId);
        quest.title = title;
        quest.notes = notes;
        quest.xp = xpReward;
        quest.difficulty = currentDifficulty;
        quest.dueDate = document.getElementById('quest-due-date').value;
        quest.reminders = tempReminders.filter(r => r !== '');
    } else {
        const newId = systemState.quests.length > 0 ? Math.max(...systemState.quests.map(q => q.id)) + 1 : 1;
        
        const scheduleObj = currentQuestType === 'daily' ? {
            type: document.getElementById('schedule-type').value,
            interval: parseInt(document.getElementById('schedule-interval').value),
            startDate: document.getElementById('schedule-start-date').value,
            days: [...selectedScheduleDays]
        } : null;

        systemState.quests.unshift({
            id: newId,
            title: title,
            notes: notes,
            xp: xpReward,
            difficulty: currentDifficulty,
            completed: false,
            type: currentQuestType,
            schedule: scheduleObj,
            dueDate: document.getElementById('quest-due-date').value,
            reminders: tempReminders.filter(r => r !== ''),
            createdAt: Date.now(),
            dailyStreak: 0,
            lastStreakDate: null
        });
    }
    
    saveGameState(); 
    renderQuests();  
    
    // --- WORKMANAGER: Schedule the background tasks natively ---
    const savedQuest = systemState.quests.find(q => q.title === title);
    if (savedQuest) scheduleNativeWorkManager(savedQuest);

    closeQuestModal(); 
}

// ==========================================
// --- CUSTOM DELETE SYSTEM ---
// ==========================================

function requestDeleteQuest() {
    // Shows the "Are you sure?" popup over top of the edit popup
    document.getElementById('confirm-delete-modal').style.display = 'flex';
}

function cancelDeleteQuest() {
    const overlay = document.getElementById('confirm-delete-modal');
    const box = overlay.querySelector('.modal-content');
    overlay.classList.add('hiding');
    if (box) box.classList.add('hiding');
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('hiding');
        if (box) box.classList.remove('hiding');
    }, 300);
}

function confirmDeleteQuest() {
    cancelWorkManagerTasks(editingQuestId); // Delete background tasks from OS!
    
    // Actually delete it
    systemState.quests = systemState.quests.filter(q => q.id !== editingQuestId);
    
    saveGameState();
    renderQuests();
    
    // Close both popups
    cancelDeleteQuest();
    closeQuestModal();
}

function closeWarningModal() {
    const overlay = document.getElementById('registration-warning-modal');
    const box = overlay.querySelector('.modal-content');
    overlay.classList.add('hiding');
    if (box) box.classList.add('hiding');
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('hiding');
        if (box) box.classList.remove('hiding');
    }, 300);
}

// ==========================================
// --- SAVE & LOAD SYSTEM (The Backpack) ---
// ==========================================

// ==========================================
// --- ACHIEVEMENTS ENGINE ---
// ==========================================

const ACH_ICONS = {
    first_blood:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2.5c0 1.5-1.5 5-1.5 5h-2S9.5 4 9.5 2.5a2.5 2.5 0 0 1 5 0z"/><path d="M12 7.5V21"/><path d="M9 21h6"/><path d="M9 17h6"/></svg>`,
    iron_will:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>`,
    disciplined:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    unbroken:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>`,
    veteran:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    system_master: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>`,
    unstoppable:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
    ascendant:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
    rising_star:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9 9H2l6 4.5-2.5 7.5L12 17l6.5 4-2.5-7.5L22 9h-7z"/></svg>`,
    overachiever:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    shadow_monarch:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/></svg>`,
    national_level:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    monarch:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.5l-4.9 2.7.9-5.5L4 8.8l5.5-.8z"/><path d="M12 3v12.5"/></svg>`,
    grinder:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    centurion:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg>`,
    adept:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/><circle cx="12" cy="12" r="4"/></svg>`,
    legendary:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    mythic:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M10 14l-7 7"/><path d="M21 14v6h-6M3 10V4h6M3 14l7-7M14 10l7 7"/></svg>`,
    quest_lord:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    strategist:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`,
    bonus_hunter:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
    perfectionist: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
};

const ACHIEVEMENTS = [
    { id: 'first_blood',   label: 'First Blood',      desc: 'Complete your first quest',            color: '#f87171', check: s => s.quests.some(q => q.completed) },
    { id: 'iron_will',     label: 'Iron Will',         desc: 'Reach a 7-day streak',                 color: '#fb923c', check: s => s.streak >= 7 },
    { id: 'disciplined',   label: 'Disciplined',       desc: 'Reach a 14-day streak',                color: '#10b981', check: s => s.streak >= 14 },
    { id: 'unbroken',      label: 'Unbroken',          desc: 'Reach a 30-day streak',                color: '#38bdf8', check: s => s.streak >= 30 },
    { id: 'veteran',       label: 'Veteran Hunter',    desc: 'Reach a 100-day streak',               color: '#fde68a', check: s => s.streak >= 100 },
    { id: 'system_master', label: 'System Master',     desc: 'Reach a 180-day streak',               color: '#c084fc', check: s => s.streak >= 180 },
    { id: 'unstoppable',   label: 'Unstoppable',       desc: 'Reach a 365-day streak',               color: '#f43f5e', check: s => s.streak >= 365 },

    { id: 'ascendant',     label: 'Ascendant',         desc: 'Reach Level 10',                       color: '#818cf8', check: s => s.level >= 10 },
    { id: 'rising_star',   label: 'Rising Star',       desc: 'Reach Level 15',                       color: '#f472b6', check: s => s.level >= 15 },
    { id: 'overachiever',  label: 'Overachiever',      desc: 'Reach Level 25',                       color: '#fb923c', check: s => s.level >= 25 },
    { id: 'shadow_monarch',label: 'Shadow Monarch',    desc: 'Reach S-Rank (Level 50)',              color: '#fbbf24', check: s => s.level >= 50 },
    { id: 'national_level',label: 'National Level',    desc: 'Reach Level 75',                       color: '#3b82f6', check: s => s.level >= 75 },
    { id: 'monarch',       label: 'Absolute Monarch',  desc: 'Reach Level 100',                      color: '#a855f7', check: s => s.level >= 100 },

    { id: 'grinder',       label: 'The Grinder',       desc: 'Earn 5,000 total XP',                  color: '#34d399', check: s => s.totalXp >= 5000 },
    { id: 'centurion',     label: 'Centurion',         desc: 'Earn 10,000 total XP',                 color: '#fbbf24', check: s => s.totalXp >= 10000 },
    { id: 'adept',         label: 'Adept',             desc: 'Earn 25,000 total XP',                 color: '#2dd4bf', check: s => s.totalXp >= 25000 },
    { id: 'legendary',     label: 'Legendary',         desc: 'Earn 100,000 total XP',                color: '#ef4444', check: s => s.totalXp >= 100000 },
    { id: 'mythic',        label: 'Mythic',            desc: 'Earn 500,000 total XP',                color: '#ec4899', check: s => s.totalXp >= 500000 },

    { id: 'quest_lord',    label: 'Quest Lord',        desc: 'Have 10 active/created quests',        color: '#a78bfa', check: s => s.quests.length >= 10 },
    { id: 'strategist',    label: 'Strategist',        desc: 'Have 25 active/created quests',        color: '#6366f1', check: s => s.quests.length >= 25 },
    { id: 'bonus_hunter',  label: 'Bonus Hunter',      desc: 'Claim a daily bonus reward',           color: '#f472b6', check: s => s.dailyBonusClaimed },
    { id: 'perfectionist', label: 'Perfectionist',     desc: 'Complete all daily quests in one day', color: '#67e8f9', check: s => { const d = s.quests.filter(q => q.type==='daily'||!q.type); return d.length>0&&d.every(q=>q.completed); } },
];

// ==========================================
// --- SAVE & LOAD SYSTEM (The Backpack) ---
// ==========================================

function checkAchievements() {
    if (!systemState.achievements) systemState.achievements = [];
    let newlyUnlocked = [];
    ACHIEVEMENTS.forEach(ach => {
        if (!systemState.achievements.includes(ach.id)) {
            try { if (ach.check(systemState)) { systemState.achievements.push(ach.id); newlyUnlocked.push(ach); } } catch(e) {}
        }
    });
    if (newlyUnlocked.length > 0) {
        saveGameState();
        renderAchievements();
        newlyUnlocked.forEach(ach => {
            queuePopup('achievement', (done) => { showAchievementUnlockPopup(ach, done); });
        });
    }
}

function showAchievementUnlockPopup(ach, done) {
    const overlay = document.createElement('div');
    overlay.className = 'sl-modal-overlay';
    overlay.style.cssText = 'display:flex;';
    const color = ach.color || 'var(--neon-blue)';
    const glow = ach.color ? ach.color + '55' : 'rgba(56,189,248,0.33)';
    const bg = ach.color ? ach.color + '18' : 'rgba(56,189,248,0.1)';
    overlay.innerHTML = `
        <div class="sl-system-box border-ach" style="--ach-color:${color};--ach-glow:${glow};--ach-bg:${bg};">
            <div class="holo-corner tl"></div><div class="holo-corner tr"></div><div class="holo-corner bl"></div><div class="holo-corner br"></div>
            <div class="sl-header-container" style="gap:6px;">
                <div class="ach-popup-badge">✦ ACHIEVEMENT UNLOCKED</div>
                <div class="sl-box-header" style="letter-spacing:3px;font-size:13px;">NEW ACHIEVEMENT</div>
            </div>
            <div class="ach-popup-icon-ring">
                <div class="ach-popup-icon-inner" style="color:${ach.color};">${ACH_ICONS[ach.id] ? ACH_ICONS[ach.id].replace('<svg ', '<svg width="36" height="36" ') : ''}</div>
            </div>
            <div class="ach-popup-label">${ach.label}</div>
            <div class="ach-popup-desc">${ach.desc}</div>
            <div class="sl-btn-row">
                <button class="sl-btn-new" onclick="const b=this.closest('.sl-system-box'); const o=this.closest('.sl-modal-overlay'); b.classList.add('hiding'); o.classList.add('hiding'); setTimeout(()=>{o.remove(); if(window._currentPopupDone){window._currentPopupDone();window._currentPopupDone=null;}}, 300); _sfx('close');">PROCEED</button>
            </div>
        </div>`;
    window._currentPopupDone = done || null;
    document.body.appendChild(overlay);
    _sfx('success');
    popupSound.currentTime = 0;
    popupSound.play().catch(() => {});
}

function renderAchievements() {
    const grid = document.getElementById('achievements-grid');
    // FIXED: Directly target the actual text element in the HTML
    const sheetCount = document.getElementById('ach-sheet-count'); 
    
    if (!grid) return;
    if (!systemState.achievements) systemState.achievements = [];
    
    const unlocked = systemState.achievements;
    
    // Updates instantly the millisecond an achievement is gained
    if (sheetCount) sheetCount.textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
    
    grid.innerHTML = ACHIEVEMENTS.map(ach => {
        const isUnlocked = unlocked.includes(ach.id);
        return `
        <div style="background:${isUnlocked ? `linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.9))` : 'rgba(22,30,52,0.88)'};border:1px solid ${isUnlocked ? ach.color : 'rgba(255,255,255,0.08)'};border-radius:16px;padding:18px 14px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;${isUnlocked ? `box-shadow:0 0 18px ${ach.color}44,inset 0 0 20px ${ach.color}0a;` : 'box-shadow:0 4px 12px rgba(0,0,0,0.4);'}">
            <div style="width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid ${isUnlocked ? ach.color : 'rgba(255,255,255,0.1)'};background:${isUnlocked ? `${ach.color}18` : 'rgba(15,23,42,0.6)'};box-shadow:${isUnlocked ? `0 0 16px ${ach.color}44` : 'none'};flex-shrink:0;">${isUnlocked ? `<div style="width:30px;height:30px;color:${ach.color};">${ACH_ICONS[ach.id] || ''}</div>` : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#707070" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`}</div>
            <div style="font-size:16px;font-weight:900;color:${isUnlocked ? ach.color : '#64748b'};line-height:1.25;letter-spacing:0.3px;">${isUnlocked ? ach.label : '<span style="color:#7a8a9a;">???</span>'}</div>
            <div style="font-size:13px;color:${isUnlocked ? '#cbd5e1' : '#475569'};line-height:1.55;font-weight:500;color:${isUnlocked ? '#cbd5e1' : '#7a8a9a'};">${isUnlocked ? ach.desc : ach.desc}</div>
            ${isUnlocked ? `<div style="font-size:10px;letter-spacing:2px;color:${ach.color};font-weight:800;background:${ach.color}18;border:1px solid ${ach.color}44;padding:3px 10px;border-radius:20px;margin-top:2px;">✔ UNLOCKED</div>` : `<div style="font-size:10px;letter-spacing:2px;color:#7a8a9a;font-weight:700;padding:3px 10px;border-radius:20px;border:1px solid rgba(120,138,154,0.25);">LOCKED</div>`}
        </div>`;
    }).join('');
}

function saveGameState() {
    localStorage.setItem('systemState', JSON.stringify(systemState));
}

// Universal Data Patcher (Ensures old saves NEVER break new versions)
function sanitizeSystemState(loadedState) {
    if (!loadedState) return loadedState;
    
    // 1. Define the absolute baseline for a new account (Including Achievements!)
    const defaults = {
        level: 0, totalXp: 0, todayXp: 0, streak: 0,
        quests: [], streakIncrementedToday: false,
        lastCompletedDate: null, weeklyHistory: [],
        events: [], dailyBonus: null, dailyBonusClaimed: false,
        achievements: []
    };

    // 2. Merge them. The loaded save will overwrite the defaults, 
    // but any missing fields will safely fall back to the defaults!
    return Object.assign({}, defaults, loadedState);
}

function loadGameState() {
    const savedState = localStorage.getItem('systemState');
    if (savedState) {
        systemState = sanitizeSystemState(JSON.parse(savedState));
    }
}

// 7. Export Data (Direct Native File System Save)
async function exportData() {
    const masterSave = {
        _v: 1,
        system: systemState,
        hunterName: localStorage.getItem('hunterName') || '',
        hunterAvatar: localStorage.getItem('hunterAvatar') || '',
        dateJoined: localStorage.getItem('dateJoined') || '',
        lastLoginDate: localStorage.getItem('lastLoginDate') || ''
    };

    const dataString = JSON.stringify(masterSave, null, 2);

    try {
        await navigator.clipboard.writeText(dataString);
        _sfx('success');
        sysAlert("Save data copied to clipboard!\n\nPaste it into any text editor and save as a .json file to keep it safe.", { title: 'EXPORT COMPLETE', icon: '✔', color: 'blue' });
    } catch (err) {
        sysAlert("Clipboard access was blocked. Please allow clipboard permissions and try again.", { title: 'COPY FAILED', icon: '✖', color: 'red' });
    }
}

// 8. Import Data (Unpacking everything)
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedData = JSON.parse(e.target.result);
            
            // ---> NEW: Create a hidden "Quick Load" backup of this exact file in memory
            localStorage.setItem('quickLoadBackup', e.target.result);

            if (!loadedData.system || !loadedData.system.quests) throw new Error("Missing system data");
            if (loadedData.system) systemState = sanitizeSystemState(loadedData.system);
            if (loadedData.hunterName) localStorage.setItem('hunterName', loadedData.hunterName);
            if (loadedData.hunterAvatar) localStorage.setItem('hunterAvatar', loadedData.hunterAvatar);
            if (loadedData.dateJoined) localStorage.setItem('dateJoined', loadedData.dateJoined);
            if (loadedData.lastLoginDate) localStorage.setItem('lastLoginDate', loadedData.lastLoginDate);
            
            saveGameState();
            renderQuests();
            updateStats();
            applySavedDataToUI(); 
            renderEthCalendar();
            renderEventList();
            
            // NEW: Automatically switch them out of "Setup Mode" and into the Dashboard
            toggleProfileMode('dashboard');
            
            sysAlert("All data restored successfully!", { title: 'IMPORT COMPLETE', icon: '✔', color: 'blue' });
        } catch (error) {
            sysAlert("Corrupt save file. Could not restore.", { title: 'SYSTEM ERROR', icon: '✖', color: 'red' });
        }
    };
    reader.readAsText(file); 
    event.target.value = ''; 
}

// 9. Manual Reload / Sync function (QUICK LOAD)
function reloadSaveFile() {
    const backupData = localStorage.getItem('quickLoadBackup');
    
    if (!backupData) {
        sysAlert("No backup found in memory. Import a save file first.", { title: 'SYSTEM ERROR', icon: '✖', color: 'red' });
        return;
    }

    sysConfirm("Reload from your last imported save? This will overwrite your current progress.", { title: 'QUICK LOAD', icon: '↺', color: 'blue' }).then(ok => { if (!ok) return;
        try {
            const loadedData = JSON.parse(backupData);
            
            // Re-apply all data from the backup
            if (loadedData.system) systemState = sanitizeSystemState(loadedData.system);
            if (loadedData.hunterName) localStorage.setItem('hunterName', loadedData.hunterName);
            if (loadedData.hunterAvatar) localStorage.setItem('hunterAvatar', loadedData.hunterAvatar);
            if (loadedData.dateJoined) localStorage.setItem('dateJoined', loadedData.dateJoined);
            if (loadedData.lastLoginDate) localStorage.setItem('lastLoginDate', loadedData.lastLoginDate);
            
            // Save and refresh UI
            saveGameState();
            renderQuests();
            updateStats();
            applySavedDataToUI(); 
            renderEthCalendar();
            renderEventList();
            
            // Quick visual flash to confirm it worked
            const btn = document.querySelector('.reload-profile-btn');
            if (btn) {
                btn.style.color = 'var(--neon-green)';
                btn.style.opacity = '1';
                setTimeout(() => {
                    btn.style.color = 'var(--text-muted)';
                    btn.style.opacity = '0.4';
                }, 400);
            }
        } catch (error) {
            sysAlert("Backup data corrupted.", { title: 'SYSTEM ERROR', icon: '✖', color: 'red' });
        }
    });
}

// ==========================================
// --- DAILY RESET & STREAK SYSTEM ---
// ==========================================
function checkDailyReset() {
    // If the user hasn't registered yet, do nothing.
    if (!localStorage.getItem('hunterName')) return;

    const today = new Date().toDateString(); // Grabs today's date as a simple text string
    const lastLogin = localStorage.getItem('lastLoginDate');

    // If the last login isn't today, a new day has started!
    if (!systemState.dailyBonus || systemState.dailyBonus.date !== today) {
        systemState.dailyBonus = { date: today };
        systemState.dailyBonusClaimed = false;
        saveGameState();
    }

    // If the last login isn't today, a new day has started!
    if (lastLogin !== today) {
        
        if (lastLogin) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            // --- STREAK LOGIC: The Penalty ---
            // Did they actually complete a task yesterday?
            if (systemState.lastCompletedDate === yesterday.toDateString() || systemState.lastCompletedDate === today) {
                // They did the work. Streak is safe.
            } else {
                // They didn't do the work. Penalty applied!
                if (systemState.streak > 0) {
                    // Triggers the punishment sequence!
                    window.showPenaltySequence = true; 
                }
                systemState.streak = 0;
            }
        } else {
            // First time ever opening the app!
            systemState.streak = 0;
        }

        if (window.showPenaltySequence) {
            queuePopup('streakLost', (done) => {
                window._currentPopupDone = done;
                document.getElementById('sl-streak-lost-modal').style.display = 'flex';
            });
        }

        // RESET ONLY DAILY QUESTS & TODAY'S XP
        systemState.quests.forEach(q => {
            if (q.type === 'daily' || !q.type) {
                // If it was due yesterday and wasn't completed, reset streak
                if (!q.completed) {
                    const wasActive = isQuestActiveOnDate(q, new Date(Date.now() - 86400000));
                    if (wasActive) {
                        q.dailyStreak = 0;
                        q.lastStreakDate = null;
                    }
                }
                q.completed = false;
            }
        });
        
        // --- FEATURE 1: Save today's XP to History before resetting ---
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const dayLabel = yesterdayDate.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
        
        if (!systemState.weeklyHistory) systemState.weeklyHistory = [];
        systemState.weeklyHistory.push({ day: dayLabel, xp: systemState.todayXp });
        
        // Keep only the last 7 days
        if (systemState.weeklyHistory.length > 7) {
            systemState.weeklyHistory.shift();
        }

        systemState.todayXp = 0;
        systemState.streakIncrementedToday = false;
        systemState.dailyBonusClaimed = false;
        systemState.dailyBonus = { date: today };

        // Save the new "last login" date to the backpack
        localStorage.setItem('lastLoginDate', today);
        
        // Save the reset quests and new streak to the backpack
        saveGameState();
    }
}

// ==========================================
// --- REMINDERS & NOTIFICATION SYSTEM ---
// ==========================================

function renderReminders() {
    const list = document.getElementById('reminders-list');
    list.innerHTML = '';
    
    // Daily Quests only need a Time. Normal Quests need Date and Time.
    const inputType = currentQuestType === 'daily' ? 'time' : 'datetime-local';

    tempReminders.forEach((rem, index) => {
        list.innerHTML += `
            <div class="reminder-row">
                <button class="remove-rem-btn" onclick="removeReminder(${index})">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <input type="${inputType}" class="clean-input small" value="${rem}" onchange="updateReminder(${index}, this.value)">
            </div>
        `;
    });
}

function addReminderField() {
    tempReminders.push('');
    renderReminders();
}

function removeReminder(idx) {
    tempReminders.splice(idx, 1);
    renderReminders();
}

function updateReminder(idx, val) {
    tempReminders[idx] = val;
}

// Notification Variables
let activeNotificationQuestId = null;
let notificationTimeout = null;

function showNotification(quest) {
    activeNotificationQuestId = quest.id;
    document.getElementById('notif-title').textContent = quest.title;
    document.getElementById('notif-desc').textContent = quest.notes || "No details provided.";
    document.getElementById('notification-toast').style.display = 'block';
    
    // Hide the "COMPLETE" button for system errors and warnings
    const actionsDiv = document.querySelector('.notif-actions');
    if (quest.id === 'error' || quest.id === 'system-warning') {
        actionsDiv.style.display = 'none';
    } else {
        actionsDiv.style.display = 'flex';
    }

    // Play sound when notification pops
    levelUpSound.currentTime = 0;
    levelUpSound.play().catch(e => console.log("Audio blocked"));
    _sfx('notify');

    // Auto-hide after 5 seconds
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => {
        closeNotification();
    }, 5000);
}

function closeNotification() {
    const toast = document.getElementById('notification-toast');
    if (!toast || toast.style.display === 'none') return;

    toast.classList.add('hiding');
    activeNotificationQuestId = null;
    if (notificationTimeout) clearTimeout(notificationTimeout);

    setTimeout(() => {
        toast.style.display = 'none';
        toast.classList.remove('hiding');
    }, 350);
}

function completeFromNotification() {
    if (activeNotificationQuestId !== null) {
        toggleQuest(activeNotificationQuestId);
        closeNotification();
    }
}

// ==========================================
// --- CLASSIC SOLO LEVELING POPUP LOGIC ---
// ==========================================

function closeSLModal(modalId, callback) {
    const overlay = document.getElementById(modalId);
    if (!overlay) return;
    const box = overlay.querySelector('.sl-system-box');
    _sfx('close');
    overlay.classList.add('hiding');
    if (box) box.classList.add('hiding');
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('hiding');
        if (box) box.classList.remove('hiding');
        if (callback) callback();
    }, 300);
}

function proceedStreakUp() {
    closeSLModal('sl-streak-up-modal', () => {
        levelUpSound.currentTime = 0;
        levelUpSound.play().catch(e => console.log("Audio blocked"));
        if (window._currentPopupDone) { window._currentPopupDone(); window._currentPopupDone = null; }
    });
}

function proceedStreakLost() {
    closeSLModal('sl-streak-lost-modal', () => {
        levelUpSound.currentTime = 0;
        levelUpSound.play().catch(e => console.log("Audio blocked"));
        if (window._currentPopupDone) { window._currentPopupDone(); window._currentPopupDone = null; }
        // Penalty is always the direct follow-up to streak lost — inject it next at top priority
        queuePopup('penalty', (done) => {
            window._currentPopupDone = done;
            document.getElementById('sl-penalty-modal').style.display = 'flex';
        });
    });
}

function proceedPenalty() {
    document.getElementById('sl-penalty-modal').style.display = 'none';
    if (window._currentPopupDone) { window._currentPopupDone(); window._currentPopupDone = null; }

    // Play sound for acceptance
    levelUpSound.currentTime = 0;
    levelUpSound.play().catch(e => console.log("Audio blocked"));
    
    // Deduct 5 Levels worth of XP (XP_PER_LEVEL is 500, so 5 * 500 = 2500)
    const penaltyXP = 5 * XP_PER_LEVEL;
    systemState.totalXp -= penaltyXP;
    
    // Ensure XP never goes below 0 (Can't drop below Level 0)
    if (systemState.totalXp < 0) {
        systemState.totalXp = 0;
    }
    
    // Immediately force the UI to update your Level/Rank on the screen to reflect the loss
    updateStats();
    saveGameState();
}

function openAchievementsSheet() {
    // Render the grid & counter before opening so it's fresh!
    if (typeof renderAchievements === 'function') renderAchievements();
    
    const overlay = document.getElementById('achievements-sheet-overlay');
    const sheet = document.getElementById('achievements-sheet');
    overlay.style.display = 'block';
    
    // Trigger slide-up animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            sheet.style.transform = 'translateY(0)';
        });
    });
}

function closeAchievementsSheet(e) {
    if (e && e.target !== document.getElementById('achievements-sheet-overlay')) return;
    const overlay = document.getElementById('achievements-sheet-overlay');
    const sheet = document.getElementById('achievements-sheet');
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => { overlay.style.display = 'none'; }, 350);
}