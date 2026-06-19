// 0 = arcade live, 1 = coming soon
const ARCADE_COMING_SOON = 1;

// ====== GLOBAL POPUP QUEUE ENGINE (PRIORITY-SORTED) ======
// Priority order (lower number = higher priority, fires first):
// 9=sysDialog, 1=streakUp, 6=dailyBonus, 4=levelUp, 5=rankUp, 2=streakLost, 3=penalty, 7=achievement, 8=toast
const POPUP_PRIORITY = {
    welcomeBack: 0,
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
    return 100 + (level - 1) * 20 + Math.floor(level / 5) * 50;
}

function getTotalXpForLevel(level) {
    let total = 0;
    for (let i = 0; i < level; i++) total += getXpForLevel(i);
    return total;
}

let triggeredReminders = new Set(); // Remembers which notifications have popped up so they don't spam

let systemState = {
    level: 1,
    totalXp: 0,
    todayXp: 0,
    streak: 0,
    quests: [], 
    streakIncrementedToday: false,
    lastCompletedDate: null, 
    weeklyHistory: [], 
    events: [],
    dailyBonus: null,           // { stat, multiplier, date }
    dailyBonusClaimed: false,   // true after reward given
    checklistOpen: {},          // { [questId]: 0 or 1 }
energyCores: 0              // ⚡ Arcade currency earned from completing tasks
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
    // Load saved reset time into settings input
    const rtInput = document.getElementById('reset-time-input');
    if (rtInput) rtInput.value = localStorage.getItem('resetTime') || '00:00';
    initSortable();     // 6. Initialize drag-and-drop reordering
    updateArcadeComingSoon();
    
    // 7. Render Calendar (No Lucide required anymore!)
    renderEthCalendar();
    renderEventList();

    // 8. CRITICAL: Re-register native listeners on boot!
    requestNotificationPermission();

    // 9. UNIVERSAL PHONE HARDWARE BACK BUTTON INTERCEPTOR
    // This helper checks if anything is open and closes it. Returns true if something was closed.
    const handlePhoneBackButton = () => {
        const modals = [
            { id: 'achievements-sheet-overlay', close: () => { const s=document.getElementById('achievements-sheet'); if(s) s.style.transform='translateY(100%)'; setTimeout(()=>{ const o=document.getElementById('achievements-sheet-overlay'); if(o) o.style.display='none'; },350); } },
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
    const setupCapacitorBack = () => {
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
            // Capacitor v8: use the globally registered plugin
            const AppPlugin = (window.Capacitor.Plugins && window.Capacitor.Plugins.App)
                           || (window.CapacitorPlugins && window.CapacitorPlugins.App);
            if (AppPlugin) {
                AppPlugin.addListener('backButton', ({ canGoBack }) => {
                    if (!handlePhoneBackButton()) {
                        AppPlugin.exitApp();
                    }
                });
                return;
            }
        }
        // Fallback: retry after plugins finish loading (sometimes they load async)
        setTimeout(setupCapacitorBack, 500);
    };
    setupCapacitorBack();
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
        onMove: function (evt) {
            const draggedId = parseInt(evt.dragged.getAttribute('data-id'));
            const relatedId = parseInt(evt.related.getAttribute('data-id'));
            const draggedQuest = systemState.quests.find(q => q.id === draggedId);
            const relatedQuest = systemState.quests.find(q => q.id === relatedId);
            if (!draggedQuest || !relatedQuest) return true;
            // Block pinned dragging into unpinned zone and vice versa
            if (draggedQuest.pinned && !relatedQuest.pinned) return false;
            if (!draggedQuest.pinned && relatedQuest.pinned) return false;
            return true;
        },
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

            // 2. If pinned, snap back to top zone; if unpinned, stay below all pinned
            if (movedQuest.pinned) {
                const firstUnpinnedIndex = systemState.quests.findIndex(q => !q.pinned);
                const insertAt = firstUnpinnedIndex === -1 ? systemState.quests.length : firstUnpinnedIndex;
                systemState.quests.splice(insertAt, 0, movedQuest);
            } else if (nextEl) {
                const nextId = parseInt(nextEl.getAttribute('data-id'));
                const nextQuestIndex = systemState.quests.findIndex(q => q.id === nextId);
                systemState.quests.splice(nextQuestIndex, 0, movedQuest);
            } else if (prevEl) {
                const prevId = parseInt(prevEl.getAttribute('data-id'));
                const prevQuestIndex = systemState.quests.findIndex(q => q.id === prevId);
                systemState.quests.splice(prevQuestIndex + 1, 0, movedQuest);
            } else {
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
    
    // Auto-refresh date display at midnight
    setInterval(() => {
        const d2 = new Date();
        if (d2.getHours() === 0 && d2.getMinutes() === 0 && d2.getSeconds() === 0) {
            const optDate = { month: 'long', day: 'numeric', year: 'numeric' };
            const optDay = { weekday: 'long' };
            const newDate = d2.toLocaleDateString('en-US', optDate).toUpperCase();
            const newDay = d2.toLocaleDateString('en-US', optDay).toUpperCase();
            ['current-date','quests-current-date','profile-current-date'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = newDate; });
            ['current-day','quests-current-day','profile-current-day'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = newDay; });
        }
    }, 1000);

    // Countdown to custom reset time
    setInterval(() => {
        const d = new Date();
        const { h: resetH, m: resetM } = getResetTime();
        const resetDate = new Date(d);
        resetDate.setHours(resetH, resetM, 0, 0);
        if (resetDate <= d) resetDate.setDate(resetDate.getDate() + 1);
        const diff = Math.max(0, Math.floor((resetDate - d) / 1000));
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '00')}`;
        
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
        
        if (d.getHours() === 18 && d.getMinutes() === 0 && systemState.streak > 0 && systemState.todayXp === 0) {
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
// ====== COLOR → XP MULTIPLIER TABLES ======
// Normal quest colors: [blue, green, orange, red] (index matches getQuestAgeColor order)
const NORMAL_COLOR_MULTIPLIERS = [1.0, 1.1, 1.3, 1.5];
// Daily quest colors: [gold, green, cyan, sky] (index matches getDailyStreakColor order)
const DAILY_COLOR_MULTIPLIERS  = [1.0, 1.2, 1.3, 1.5];

function getNormalColorIndex(quest) {
    if (!quest.createdAt) return 0;
    const days = Math.floor((Date.now() - quest.createdAt) / 86400000);
    if (days < 2) return 0;
    if (days < 5) return 1;
    if (days < 9) return 2;
    return 3;
}
function getDailyColorIndex(streak) {
    const s = streak || 0;
    if (s <= 3) return 0;
    if (s <= 6) return 1;
    if (s <= 9) return 2;
    return 3;
}
function getQuestMultiplier(quest) {
    const isDaily = quest.type === 'daily' || !quest.type;
    if (isDaily) {
        const idx = getDailyColorIndex(quest.dailyStreak ?? 0);
        return DAILY_COLOR_MULTIPLIERS[idx];
    } else {
        const idx = getNormalColorIndex(quest);
        return NORMAL_COLOR_MULTIPLIERS[idx];
    }
}
// ==========================================
function getDailyStreakColor(streak) {
    const s = streak || 0;
    if (s <= 3)  return '#fbbf24';
    if (s <= 6)  return '#34d399';
    if (s <= 9)  return '#22d3ee';
    return '#38bdf8';
}
    function getQuestAgeColor(quest) {
    if (!quest.createdAt) return null;
    const days = Math.floor((Date.now() - quest.createdAt) / 86400000);
    if (days < 2)  return '#38bdf8';
    if (days < 5)  return '#34d399';
    if (days < 9)  return '#fb923c';
    return '#f87171';
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

        const questEl = document.createElement('div');
        questEl.className = `system-panel quest-item ${quest.completed ? 'completed' : ''}`;

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
            ? `<div class="quest-streak-badge"><span class="streak-chevrons">▶▶</span>${quest.dailyStreak}</div>`
            : '';

        const hasReminder = quest.reminders && quest.reminders.length > 0;
        const reminderIcon = hasReminder
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.45;flex-shrink:0;"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6M22 6l-3-3"/></svg>`
            : '';

        const pinIcon = quest.pinned
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="opacity:0.45;flex-shrink:0;"><path d="M16 3a1 1 0 0 1 .707 1.707L15 6.414V10l3 3v1H6v-1l3-3V6.414L7.293 4.707A1 1 0 0 1 8 3h8zM11 18h2v3h-2z"/></svg>`
            : '';

        const hasChecklist = quest.checklist && quest.checklist.length > 0;
        const clDone = hasChecklist ? quest.checklist.filter(i => i.done).length : 0;
        const clTotal = hasChecklist ? quest.checklist.length : 0;
        const clIndicator = hasChecklist ? `
            <div class="cl-indicator" onclick="event.stopPropagation();toggleChecklistVisibility(${quest.id}, this)">
                <div class="cl-indicator-fraction">
                    <span>${clDone}/${clTotal}</span>
                </div>
            </div>` : '';

        questEl.innerHTML = `
            ${ageSlab}
            <div class="quest-checkbox" onclick="toggleQuest(${quest.id})"></div>
            <div class="quest-details" onclick="openEditQuestModal(${quest.id})">
                <div class="quest-title">${quest.title}</div>
                ${quest.notes ? `<div class="quest-notes">${quest.notes}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;flex-shrink:0;align-self:stretch;padding-bottom:2px;gap:4px;">
                <div style="position:relative;">
                    <div class="quest-three-dot" onclick="event.stopPropagation();toggleQuestMenu(${quest.id}, this)">⋮</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    ${clIndicator}
                    ${streak}
                    ${reminderIcon}
                    ${pinIcon}
                </div>
            </div>
        `;

        // Checklist rows (collapsed by default)
        if (hasChecklist) {
            const clArea = document.createElement('div');
            clArea.className = 'quest-checklist-area';
            clArea.id = `cl-area-${quest.id}`;
            const savedOpen = systemState.checklistOpen && systemState.checklistOpen[quest.id];
        clArea.style.display = savedOpen ? 'flex' : 'none';
        if (savedOpen) clArea.style.flexDirection = 'column';
            quest.checklist.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = `quest-checklist-row${item.done ? ' done' : ''}`;
                row.onclick = (e) => { e.stopPropagation(); toggleChecklistItem(quest.id, idx); };
                row.innerHTML = `
                    <div class="cl-circle">
                        <svg class="cl-check" viewBox="0 0 10 10" fill="none" stroke="white" stroke-width="2">
                            <polyline points="1.5,5 4,7.5 8.5,2.5"/>
                        </svg>
                    </div>
                    <span class="cl-label">${item.text}</span>
                `;
                clArea.appendChild(row);
            });
            questEl.appendChild(clArea);
        }
        
        wrapperEl.appendChild(questEl);

        // Append to the correct tab based on type
        if (isDaily && homeContainer) {
            homeContainer.appendChild(wrapperEl);
        } else if (!isDaily && mainContainer) {
            mainContainer.appendChild(wrapperEl);
        }
    });
}
function toggleQuestMenu(id, btn) {
    // Remove any existing floating dropdown
    const existing = document.getElementById('floating-quest-menu');
    if (existing) {
        existing.remove();
        if (existing.dataset.questId == id) return; // clicking same dot closes it
    }

    const quest = systemState.quests.find(q => q.id === id);
    if (!quest) return;

    const menu = document.createElement('div');
    menu.id = 'floating-quest-menu';
    menu.dataset.questId = id;
    menu.className = 'quest-dropdown open';
    menu.innerHTML = `
        <div class="quest-dropdown-item" onclick="event.stopPropagation();togglePinQuest(${id});document.getElementById('floating-quest-menu')?.remove();">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
            ${quest.pinned ? 'Unpin' : 'Pin'}
        </div>
        <div class="quest-dropdown-item" style="color:var(--neon-red);" onclick="event.stopPropagation();document.getElementById('floating-quest-menu')?.remove();deleteQuest(${id});">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete
        </div>
    `;

    // Position it relative to the button
    const rect = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left - 100}px`;
    menu.style.zIndex = '9999';

    document.body.appendChild(menu);
}

// Close floating menu and checklist popup when tapping elsewhere
document.addEventListener('click', () => {
    document.getElementById('floating-quest-menu')?.remove();
    document.getElementById('floating-checklist-popup')?.remove();
});
function toggleChecklistVisibility(questId, btn) {
    const area = document.getElementById(`cl-area-${questId}`);
    if (!area) return;
    const isOpen = area.style.display !== 'none';
    const newState = isOpen ? 0 : 1;
    area.style.display = newState === 1 ? 'flex' : 'none';
    area.style.flexDirection = 'column';
    // Save per-task checklist open state
    if (!systemState.checklistOpen) systemState.checklistOpen = {};
    systemState.checklistOpen[questId] = newState;
    saveGameState();
}
function togglePinQuest(id) {
    const quest = systemState.quests.find(q => q.id === id);
    if (!quest) return;
    quest.pinned = !quest.pinned;
    // Move pinned to top, unpinned fall below all pinned
    systemState.quests.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    saveGameState();
    renderQuests();
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

        // --- TITLE FLAGS: track runtime conditions ---
        if (!systemState._titleFlags) systemState._titleFlags = {};
        const _h = new Date().getHours();
        if (_h < 7)  systemState._titleFlags.early_bird  = true;
        if (_h < 6)  systemState._titleFlags.dawn_hunter = true;
        if (_h >= 23) systemState._titleFlags.night_owl  = true;
        systemState._titleFlags.totalCompleted = (systemState._titleFlags.totalCompleted || 0) + 1;
        // chain_breaker: rebuilt to 7 after a previous reset
        if (systemState.streak === 7 && systemState._titleFlags._hadStreakReset) {
            systemState._titleFlags.chain_breaker = true;
        }
        const _mult = getQuestMultiplier(quest);
        const _earnedXp = Math.round(quest.xp * _mult);
        quest._earnedXp = _earnedXp; // Snapshot so uncheck always refunds exact amount
        systemState.todayXp += _earnedXp;
        systemState.totalXp += _earnedXp;

        // ⚡ Award Energy Cores based on difficulty
        const _coreMap = { trivial: 2, easy: 5, medium: 10, hard: 18 };
        const _coresEarned = _coreMap[quest.difficulty] || 5;
        if (!systemState.energyCores) systemState.energyCores = 0;
        systemState.energyCores += _coresEarned;
        arcadeUpdateCoresDisplay();

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
        const _undoXp = quest._earnedXp ?? Math.round(quest.xp * getQuestMultiplier(quest));
        quest._earnedXp = undefined;
        systemState.todayXp -= _undoXp;
        systemState.totalXp -= _undoXp;

        // ⚡ Refund cores on uncheck
        const _undoCoreMap = { trivial: 2, easy: 5, medium: 10, hard: 18 };
        const _coresToRefund = _undoCoreMap[quest.difficulty] || 5;
        systemState.energyCores = Math.max(0, (systemState.energyCores || 0) - _coresToRefund);
        arcadeUpdateCoresDisplay();
        
        // Safeguard to ensure XP never drops below 0
        if (systemState.todayXp < 0) systemState.todayXp = 0;
        if (systemState.totalXp < 0) systemState.totalXp = 0;
    }
    
    updateStats();
    renderQuests();
    saveGameState();
    checkAchievements();

    // --- DAILY BONUS CHECK: Did completing this quest finish ALL daily quests? ---
    const _dailyQuests = systemState.quests.filter(q => q.type === 'daily' || !q.type);
    const _today = new Date();
    const _dueDailies = _dailyQuests.filter(q => isQuestActiveOnDate(q, _today));
    const _allDone = _dueDailies.length > 0 && _dueDailies.every(q => q.completed);

    if (!systemState.dailyBonusClaimed && systemState.dailyBonus && _allDone) {
        systemState.dailyBonusClaimed = true;
        const bonusXp = Math.round(systemState.todayXp * 1.11);
        systemState._lastBonusXp = bonusXp;
        systemState.totalXp += bonusXp;
        systemState.todayXp += bonusXp;
        saveGameState();
        updateStats();
        checkAchievements();
        queuePopup('dailyBonus', (done) => { showDailyBonusModal(bonusXp, done); });
    } else if (systemState.dailyBonusClaimed && !_allDone) {
        // A daily was unchecked after the bonus was claimed — reverse it
        const bonusXp = systemState._lastBonusXp || 0;
        systemState.dailyBonusClaimed = false;
        systemState.totalXp = Math.max(0, systemState.totalXp - bonusXp);
        systemState.todayXp = Math.max(0, systemState.todayXp - bonusXp);
        systemState._lastBonusXp = 0;
        saveGameState();
        updateStats();
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
                <div class="sl-box-header">ALL DAILIES COMPLETE</div>
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
                ${(() => {
                    const c = color;
                    const bgColor = 'rgba(0,0,0,0.85)';
                    const innerColor = '#ffffff';
                    const glowColor = color;
                    const l = letter;
                    const badges = {
                        'E': `<svg width="100" height="100" viewBox="0 0 100 100" style="position:absolute;animation:ruPulseGlow 2s 1s ease infinite;overflow:visible;">
                            <defs><filter id="ru_glow_e"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#0a0500" stroke="#3a1a05" stroke-width="1.5"/>
                            <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.3"/>
                            <polygon points="50,20 74,33 74,67 50,80 26,67 26,33" fill="none" stroke="${c}" stroke-width="0.4" opacity="0.15"/>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.5" filter="url(#ru_glow_e)" opacity="0.8"/>
                            <line x1="14" y1="50" x2="86" y2="50" stroke="${c}" stroke-width="0.3" opacity="0.2"/>
                            <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.12">${l}</text>
                            <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#ru_glow_e)">${l}</text>
                        </svg>`,
                        'D': `<svg width="100" height="100" viewBox="0 0 100 100" style="position:absolute;animation:ruPulseGlow 2s 1s ease infinite;overflow:visible;">
                            <defs><filter id="ru_glow_d"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#010810" stroke="#1a3a5c" stroke-width="1.5"/>
                            <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.25"/>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.5" filter="url(#ru_glow_d)" opacity="0.75"/>
                            <line x1="14" y1="50" x2="86" y2="50" stroke="${c}" stroke-width="0.4" opacity="0.2" stroke-dasharray="3,6"/>
                            <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.1">${l}</text>
                            <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#ru_glow_d)">${l}</text>
                            <polygon points="50,8 53,14 47,14" fill="${c}" opacity="0.7"/>
                            <polygon points="50,92 53,86 47,86" fill="${c}" opacity="0.7"/>
                            <rect x="12" y="47" width="4" height="6" fill="${c}" opacity="0.5"/>
                            <rect x="84" y="47" width="4" height="6" fill="${c}" opacity="0.5"/>
                        </svg>`,
                        'C': `<svg width="100" height="100" viewBox="0 0 100 100" style="position:absolute;animation:ruPulseGlow 2s 1s ease infinite;overflow:visible;">
                            <defs><filter id="ru_glow_c"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#000f08" stroke="#0a4030" stroke-width="1.5"/>
                            <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.2"/>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.5" filter="url(#ru_glow_c)" opacity="0.8"/>
                            <line x1="5" y1="44" x2="14" y2="44" stroke="${c}" stroke-width="1" opacity="0.6"/>
                            <line x1="5" y1="56" x2="14" y2="56" stroke="${c}" stroke-width="1" opacity="0.6"/>
                            <line x1="95" y1="44" x2="86" y2="44" stroke="${c}" stroke-width="1" opacity="0.6"/>
                            <line x1="95" y1="56" x2="86" y2="56" stroke="${c}" stroke-width="1" opacity="0.6"/>
                            <rect x="3" y="42" width="3" height="3" fill="${c}" opacity="0.8"/>
                            <rect x="94" y="42" width="3" height="3" fill="${c}" opacity="0.8"/>
                            <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.1">${l}</text>
                            <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#ru_glow_c)">${l}</text>
                            <polygon points="50,8 53,14 47,14" fill="${c}" opacity="0.8"/>
                            <polygon points="50,92 53,86 47,86" fill="${c}" opacity="0.8"/>
                            <polygon points="14,28 20,31 17,37" fill="${c}" opacity="0.7"/>
                            <polygon points="86,28 80,31 83,37" fill="${c}" opacity="0.7"/>
                            <polygon points="14,72 20,69 17,63" fill="${c}" opacity="0.7"/>
                            <polygon points="86,72 80,69 83,63" fill="${c}" opacity="0.7"/>
                        </svg>`,
                        'B': `<svg width="100" height="100" viewBox="0 0 100 100" style="position:absolute;animation:ruPulseGlow 2s 1s ease infinite;overflow:visible;">
                            <defs><filter id="ru_glow_b"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#000510" stroke="#0a2a5a" stroke-width="1.5"/>
                            <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.2"/>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.8" filter="url(#ru_glow_b)" opacity="0.9"/>
                            <polyline points="6,34 2,50 6,66" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
                            <polyline points="94,34 98,50 94,66" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
                            <rect x="0" y="48" width="4" height="4" fill="${c}" opacity="0.9"/>
                            <rect x="96" y="48" width="4" height="4" fill="${c}" opacity="0.9"/>
                            <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.1">${l}</text>
                            <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#ru_glow_b)">${l}</text>
                            <polygon points="50,8 54,15 46,15" fill="${c}" opacity="0.9"/>
                            <polygon points="50,92 54,85 46,85" fill="${c}" opacity="0.9"/>
                            <polygon points="14,28 21,32 18,38" fill="${c}" opacity="0.8"/>
                            <polygon points="86,28 79,32 82,38" fill="${c}" opacity="0.8"/>
                            <polygon points="14,72 21,68 18,62" fill="${c}" opacity="0.8"/>
                            <polygon points="86,72 79,68 82,62" fill="${c}" opacity="0.8"/>
                        </svg>`,
                        'A': `<svg width="100" height="106" viewBox="0 0 100 106" style="position:absolute;animation:ruPulseGlow 2s 1s ease infinite;overflow:visible;">
                            <defs><filter id="ru_glow_a"><feGaussianBlur stdDeviation="3.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#080010" stroke="#3a0a6a" stroke-width="1.5"/>
                            <polygon points="50,15 80,31 80,69 50,85 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.2"/>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.8" filter="url(#ru_glow_a)" opacity="0.9"/>
                            <polygon points="11,27 4,44 4,56 11,73 15,69 9,55 9,45 15,31" fill="#080010" stroke="${c}" stroke-width="1.2" opacity="0.85"/>
                            <polygon points="89,27 96,44 96,56 89,73 85,69 91,55 91,45 85,31" fill="#080010" stroke="${c}" stroke-width="1.2" opacity="0.85"/>
                            <rect x="2" y="47" width="4" height="6" fill="${c}" opacity="0.9"/>
                            <rect x="94" y="47" width="4" height="6" fill="${c}" opacity="0.9"/>
                            <polygon points="50,1 46,8 54,8" fill="${c}" filter="url(#ru_glow_a)"/>
                            <polygon points="50,1 46,8 54,8" fill="#ee88ff"/>
                            <text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.12">${l}</text>
                            <text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#ru_glow_a)">${l}</text>
                            <polygon points="14,28 21,32 18,38" fill="${c}" opacity="0.8"/>
                            <polygon points="86,28 79,32 82,38" fill="${c}" opacity="0.8"/>
                            <polygon points="14,72 21,68 18,62" fill="${c}" opacity="0.8"/>
                            <polygon points="86,72 79,68 82,62" fill="${c}" opacity="0.8"/>
                            <polygon points="50,92 54,85 46,85" fill="${c}" opacity="0.9"/>
                        </svg>`,
                        'S': `<style>@keyframes ruSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes ruPulse{0%,100%{opacity:0.5}50%{opacity:1}}</style>
                        <svg width="100" height="108" viewBox="0 0 100 108" style="position:absolute;animation:ruPulseGlow 2s 1s ease infinite;overflow:visible;">
                            <defs>
                                <filter id="ru_glow_s"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                                <filter id="ru_glow_s2"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                            </defs>
                            <polygon points="50,2 70,11 87,27 94,50 87,73 70,89 50,98 30,89 13,73 6,50 13,27 30,11" fill="none" stroke="${c}" stroke-width="0.6" stroke-dasharray="2,6" opacity="0.35"/>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#0f0500" stroke="#6a2a00" stroke-width="1.5"/>
                            <polygon points="50,15 80,31 80,69 50,85 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.6" opacity="0.25"/>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="#ff6600" stroke-width="2" filter="url(#ru_glow_s2)" opacity="0.6"/>
                            <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.5" filter="url(#ru_glow_s)" opacity="1"/>
                            <polygon points="10,26 3,43 3,57 10,74 14,70 8,55 8,45 14,30" fill="#0f0500" stroke="${c}" stroke-width="1.5" filter="url(#ru_glow_s)" opacity="0.9"/>
                            <polygon points="90,26 97,43 97,57 90,74 86,70 92,55 92,45 86,30" fill="#0f0500" stroke="${c}" stroke-width="1.5" filter="url(#ru_glow_s)" opacity="0.9"/>
                            <polyline points="12,38 9,50 12,62" fill="none" stroke="${c}" stroke-width="0.8" opacity="0.6"/>
                            <polyline points="88,38 91,50 88,62" fill="none" stroke="${c}" stroke-width="0.8" opacity="0.6"/>
                            <polygon points="3,50 6,46 10,50 6,54" fill="${c}" filter="url(#ru_glow_s)"/>
                            <polygon points="97,50 94,46 90,50 94,54" fill="${c}" filter="url(#ru_glow_s)"/>
                            <polygon points="50,0 46,8 54,8" fill="${c}" filter="url(#ru_glow_s2)"/>
                            <polygon points="50,0 46,8 54,8" fill="#ffe066"/>
                            <polygon points="40,4 37,10 43,10" fill="#ff8800" opacity="0.9" filter="url(#ru_glow_s)"/>
                            <polygon points="60,4 57,10 63,10" fill="#ff8800" opacity="0.9" filter="url(#ru_glow_s)"/>
                            <polygon points="20,28 16,24 20,20 24,24" fill="${c}" filter="url(#ru_glow_s)"/>
                            <polygon points="80,28 76,24 80,20 84,24" fill="${c}" filter="url(#ru_glow_s)"/>
                            <polygon points="20,72 16,76 20,80 24,76" fill="${c}" filter="url(#ru_glow_s)"/>
                            <polygon points="80,72 76,76 80,80 84,76" fill="${c}" filter="url(#ru_glow_s)"/>
                            <polygon points="50,92 54,85 46,85" fill="${c}" filter="url(#ru_glow_s)"/>
                            <text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="#ff6600" opacity="0.2" filter="url(#ru_glow_s2)">${l}</text>
                            <text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="#ffe066" filter="url(#ru_glow_s)">${l}</text>
                        </svg>`
                    };
                    return badges[letter] || badges['E'];
                })()}
            </div>
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
        const rankThresholds = [0, 7, 15, 24, 34, 45];
        const prevRankIdx = Math.min(rankThresholds.reduce((acc, t, i) => previousLevel >= t ? i : acc, 0), 5);
        const newRankIdx  = Math.min(rankThresholds.reduce((acc, t, i) => systemState.level >= t ? i : acc, 0), 5);
        const rankNames   = ['E-Rank', 'D-Rank', 'C-Rank', 'B-Rank', 'A-Rank', 'S-Rank'];
        const rankColors  = ['#b57a50', '#8faec6', '#00ffaa', '#00f0ff', '#cc44ff', '#ffb700'];
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

    // 2. Define Rank Logic
    const ranks = [
        { threshold: 0,  letter: 'E', name: 'E-Rank', color: '#b57a50' },
        { threshold: 7,  letter: 'D', name: 'D-Rank', color: '#8faec6' },
        { threshold: 15, letter: 'C', name: 'C-Rank', color: '#00ffaa' },
        { threshold: 24, letter: 'B', name: 'B-Rank', color: '#00f0ff' },
        { threshold: 34, letter: 'A', name: 'A-Rank', color: '#cc44ff' },
        { threshold: 45, letter: 'S', name: 'S-Rank', color: '#ffb700' }
    ];

    // Find current and next rank using custom thresholds
    let currentRankIndex = ranks.reduce((acc, r, i) => systemState.level >= r.threshold ? i : acc, 0);
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

    const xpAtRankStart = getTotalXpForLevel(currentRank.threshold);
    const xpAtRankEnd = getTotalXpForLevel(currentRankIndex < 5 ? nextRank.threshold : 999);
    const rankProgressPercent = currentRankIndex >= 5 ? 100 : Math.floor(((systemState.totalXp - xpAtRankStart) / (xpAtRankEnd - xpAtRankStart)) * 100);
    const levelsToNext = currentRankIndex >= 5 ? 0 : nextRank.threshold - systemState.level;

// --- APPLY TO UI ---
    
    // Home Screen Updates
    const playerLevelEl = document.getElementById('player-level');
    if (playerLevelEl) playerLevelEl.textContent = systemState.level;
    
    const statLevelEl = document.getElementById('stat-level');
    if (statLevelEl) statLevelEl.textContent = systemState.level;
    
    const rankHex = document.querySelector('.rank-hexagon');
    if (rankHex) {
        const c = currentRank.color;
        const l = currentRank.letter;
        const glowColor = c + '99';
        const bgColor = c + '18';
        const innerColor = { 'E': '#86efac', 'D': '#bfdbfe', 'C': '#e9d5ff', 'B': '#fde68a', 'A': '#fecaca', 'S': '#ffffff' }[l] || c;
        const rankBadges = {
            'E': `<svg class="rk-badge" viewBox="0 0 100 100">
                <defs><filter id="glow-e"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#0a0500" stroke="#3a1a05" stroke-width="1.5"/>
                <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.3"/>
                <polygon points="50,20 74,33 74,67 50,80 26,67 26,33" fill="none" stroke="${c}" stroke-width="0.4" opacity="0.15"/>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.5" filter="url(#glow-e)" opacity="0.8"/>
                <line x1="14" y1="50" x2="86" y2="50" stroke="${c}" stroke-width="0.3" opacity="0.2"/>
                <line x1="32" y1="20" x2="68" y2="80" stroke="${c}" stroke-width="0.3" opacity="0.1"/>
                <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.12">${l}</text>
                <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#glow-e)">${l}</text>
            </svg>`,
            'D': `<svg class="rk-badge" viewBox="0 0 100 100">
                <defs><filter id="glow-d"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#010810" stroke="#1a3a5c" stroke-width="1.5"/>
                <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.25"/>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.5" filter="url(#glow-d)" opacity="0.75"/>
                <line x1="14" y1="50" x2="86" y2="50" stroke="${c}" stroke-width="0.4" opacity="0.2" stroke-dasharray="3,6"/>
                <line x1="14" y1="40" x2="86" y2="40" stroke="${c}" stroke-width="0.3" opacity="0.1"/>
                <line x1="14" y1="60" x2="86" y2="60" stroke="${c}" stroke-width="0.3" opacity="0.1"/>
                <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.1">${l}</text>
                <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#glow-d)">${l}</text>
                <polygon points="50,8 53,14 47,14" fill="${c}" opacity="0.7"/>
                <polygon points="50,92 53,86 47,86" fill="${c}" opacity="0.7"/>
                <rect x="12" y="47" width="4" height="6" fill="${c}" opacity="0.5"/>
                <rect x="84" y="47" width="4" height="6" fill="${c}" opacity="0.5"/>
            </svg>`,
            'C': `<svg class="rk-badge" viewBox="0 0 100 100">
                <defs><filter id="glow-c"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#000f08" stroke="#0a4030" stroke-width="1.5"/>
                <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.2"/>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.5" filter="url(#glow-c)" opacity="0.8"/>
                <line x1="5" y1="44" x2="14" y2="44" stroke="${c}" stroke-width="1" opacity="0.6"/>
                <line x1="5" y1="56" x2="14" y2="56" stroke="${c}" stroke-width="1" opacity="0.6"/>
                <line x1="95" y1="44" x2="86" y2="44" stroke="${c}" stroke-width="1" opacity="0.6"/>
                <line x1="95" y1="56" x2="86" y2="56" stroke="${c}" stroke-width="1" opacity="0.6"/>
                <rect x="3" y="42" width="3" height="3" fill="${c}" opacity="0.8"/>
                <rect x="94" y="42" width="3" height="3" fill="${c}" opacity="0.8"/>
                <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.1">${l}</text>
                <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#glow-c)">${l}</text>
                <polygon points="50,8 53,14 47,14" fill="${c}" opacity="0.8"/>
                <polygon points="50,92 53,86 47,86" fill="${c}" opacity="0.8"/>
                <polygon points="14,28 20,31 17,37" fill="${c}" opacity="0.7"/>
                <polygon points="86,28 80,31 83,37" fill="${c}" opacity="0.7"/>
                <polygon points="14,72 20,69 17,63" fill="${c}" opacity="0.7"/>
                <polygon points="86,72 80,69 83,63" fill="${c}" opacity="0.7"/>
            </svg>`,
            'B': `<svg class="rk-badge" viewBox="0 0 100 100">
                <defs><filter id="glow-b"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#000510" stroke="#0a2a5a" stroke-width="1.5"/>
                <polygon points="50,14 80,31 80,69 50,86 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.2"/>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.8" filter="url(#glow-b)" opacity="0.9"/>
                <polyline points="6,34 2,50 6,66" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
                <polyline points="94,34 98,50 94,66" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.7"/>
                <rect x="0" y="48" width="4" height="4" fill="${c}" opacity="0.9"/>
                <rect x="96" y="48" width="4" height="4" fill="${c}" opacity="0.9"/>
                <line x1="14" y1="50" x2="86" y2="50" stroke="${c}" stroke-width="0.3" opacity="0.15" stroke-dasharray="2,8"/>
                <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.1">${l}</text>
                <text x="50" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#glow-b)">${l}</text>
                <polygon points="50,8 54,15 46,15" fill="${c}" opacity="0.9"/>
                <polygon points="50,92 54,85 46,85" fill="${c}" opacity="0.9"/>
                <polygon points="14,28 21,32 18,38" fill="${c}" opacity="0.8"/>
                <polygon points="86,28 79,32 82,38" fill="${c}" opacity="0.8"/>
                <polygon points="14,72 21,68 18,62" fill="${c}" opacity="0.8"/>
                <polygon points="86,72 79,68 82,62" fill="${c}" opacity="0.8"/>
            </svg>`,
            'A': `<svg class="rk-badge" viewBox="0 0 100 106">
                <defs><filter id="glow-a"><feGaussianBlur stdDeviation="3.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#080010" stroke="#3a0a6a" stroke-width="1.5"/>
                <polygon points="50,15 80,31 80,69 50,85 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.5" opacity="0.2"/>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.8" filter="url(#glow-a)" opacity="0.9"/>
                <polygon points="11,27 4,44 4,56 11,73 15,69 9,55 9,45 15,31" fill="#080010" stroke="${c}" stroke-width="1.2" opacity="0.85"/>
                <polygon points="89,27 96,44 96,56 89,73 85,69 91,55 91,45 85,31" fill="#080010" stroke="${c}" stroke-width="1.2" opacity="0.85"/>
                <rect x="2" y="47" width="4" height="6" fill="${c}" opacity="0.9"/>
                <rect x="94" y="47" width="4" height="6" fill="${c}" opacity="0.9"/>
                <polygon points="50,1 46,8 54,8" fill="${c}" filter="url(#glow-a)"/>
                <polygon points="50,1 46,8 54,8" fill="#ee88ff"/>
                <text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" opacity="0.12">${l}</text>
                <text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="${c}" filter="url(#glow-a)">${l}</text>
                <polygon points="14,28 21,32 18,38" fill="${c}" opacity="0.8"/>
                <polygon points="86,28 79,32 82,38" fill="${c}" opacity="0.8"/>
                <polygon points="14,72 21,68 18,62" fill="${c}" opacity="0.8"/>
                <polygon points="86,72 79,68 82,62" fill="${c}" opacity="0.8"/>
                <polygon points="50,92 54,85 46,85" fill="${c}" opacity="0.9"/>
            </svg>`,
            'S': `<svg class="rk-badge" viewBox="0 0 100 108">
                <defs>
                    <filter id="glow-s"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="glow-s2"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
                <polygon points="50,2 70,11 87,27 94,50 87,73 70,89 50,98 30,89 13,73 6,50 13,27 30,11" fill="none" stroke="${c}" stroke-width="0.6" stroke-dasharray="2,6" opacity="0.35"/>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#0f0500" stroke="#6a2a00" stroke-width="1.5"/>
                <polygon points="50,15 80,31 80,69 50,85 20,69 20,31" fill="none" stroke="${c}" stroke-width="0.6" opacity="0.25"/>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="#ff6600" stroke-width="2" filter="url(#glow-s2)" opacity="0.6"/>
                <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="none" stroke="${c}" stroke-width="1.5" filter="url(#glow-s)" opacity="1"/>
                <polygon points="10,26 3,43 3,57 10,74 14,70 8,55 8,45 14,30" fill="#0f0500" stroke="${c}" stroke-width="1.5" filter="url(#glow-s)" opacity="0.9"/>
                <polygon points="90,26 97,43 97,57 90,74 86,70 92,55 92,45 86,30" fill="#0f0500" stroke="${c}" stroke-width="1.5" filter="url(#glow-s)" opacity="0.9"/>
                <polyline points="12,38 9,50 12,62" fill="none" stroke="${c}" stroke-width="0.8" opacity="0.6"/>
                <polyline points="88,38 91,50 88,62" fill="none" stroke="${c}" stroke-width="0.8" opacity="0.6"/>
                <polygon points="3,50 6,46 10,50 6,54" fill="${c}" filter="url(#glow-s)"/>
                <polygon points="97,50 94,46 90,50 94,54" fill="${c}" filter="url(#glow-s)"/>
                <polygon points="50,0 46,8 54,8" fill="${c}" filter="url(#glow-s2)"/>
                <polygon points="50,0 46,8 54,8" fill="#ffe066"/>
                <polygon points="40,4 37,10 43,10" fill="#ff8800" opacity="0.9" filter="url(#glow-s)"/>
                <polygon points="60,4 57,10 63,10" fill="#ff8800" opacity="0.9" filter="url(#glow-s)"/>
                <polygon points="20,28 16,24 20,20 24,24" fill="${c}" filter="url(#glow-s)"/>
                <polygon points="80,28 76,24 80,20 84,24" fill="${c}" filter="url(#glow-s)"/>
                <polygon points="20,72 16,76 20,80 24,76" fill="${c}" filter="url(#glow-s)"/>
                <polygon points="80,72 76,76 80,80 84,76" fill="${c}" filter="url(#glow-s)"/>
                <polygon points="50,92 54,85 46,85" fill="${c}" filter="url(#glow-s)"/>
                <text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="#ff6600" opacity="0.2" filter="url(#glow-s2)">${l}</text>
                <text x="50" y="50" dominant-baseline="central" text-anchor="middle" font-family="Orbitron,sans-serif" font-size="30" font-weight="900" fill="#ffe066" filter="url(#glow-s)">${l}</text>
            </svg>`,
        };
        rankHex.style.cssText = `position:relative;display:flex;align-items:center;justify-content:center;width:100px;height:100px;background:transparent;border:none;`;
        rankHex.innerHTML = rankBadges[l] || rankBadges['E'];
    }

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
    if(rankFill) { rankFill.style.width = `${rankProgressPercent}%`; rankFill.style.background = currentRank.color; rankFill.style.boxShadow = `0 0 10px ${currentRank.color}88`; }
    const rpcPillCurrEl = document.getElementById('dash-pill-current');
    if(rpcPillCurrEl) { rpcPillCurrEl.style.color = currentRank.color; rpcPillCurrEl.style.borderColor = currentRank.color + '66'; rpcPillCurrEl.style.background = currentRank.color + '18'; }
    const rpcPillNextEl = document.getElementById('dash-pill-next');
    if(rpcPillNextEl && currentRankIndex < 5) { rpcPillNextEl.style.color = nextRank.color; rpcPillNextEl.style.borderColor = nextRank.color + '66'; rpcPillNextEl.style.background = nextRank.color + '18'; }
    const dashMiniHexEl = document.getElementById('dash-mini-hex');
    if(dashMiniHexEl) {
        dashMiniHexEl.innerHTML = rankHex ? rankHex.innerHTML : '';
    }
    const rankColors = { E:'#b57a50', D:'#8faec6', C:'#00ffaa', B:'#00f0ff', A:'#cc44ff', S:'#ffb700' };
const cardTheme = localStorage.getItem('cardTheme') || 'default';
const themeColor = cardTheme === 'default' ? '#38bdf8' : (rankColors[cardTheme] || '#38bdf8');
document.documentElement.style.setProperty('--rank-color', themeColor);
document.documentElement.style.setProperty('--rank-color-glow', themeColor + '66');
document.documentElement.style.setProperty('--rank-color-dim', themeColor + '22');
const rankThresholdsCheck = { E: 0, D: 7, C: 15, B: 24, A: 34, S: 45 };
const rankLabels = { default: 'DEFAULT', E: 'E-RANK', D: 'D-RANK', C: 'C-RANK', B: 'B-RANK', A: 'A-RANK', S: 'S-RANK' };
document.querySelectorAll('.theme-opt-btn').forEach(b => {
    const t = b.dataset.theme;
    const locked = t !== 'default' && rankThresholdsCheck[t] !== undefined && systemState.level < rankThresholdsCheck[t];
    b.classList.toggle('active', t === cardTheme);
    if (locked) {
        b.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#555" stroke="#555" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
        b.style.color = '#555';
        b.style.borderColor = '#333';
        b.style.opacity = '0.5';
        b.style.cursor = 'not-allowed';
    } else {
        b.innerHTML = `<div class="theme-dot"></div>${rankLabels[t] || t}`;
        b.style.cursor = 'pointer';
    }
});

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
    if(headerTarget) headerTarget.innerHTML = currentRankIndex >= 5 ? `MAX LEVEL` : `LEVEL ${systemState.level}`;

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
            if (bonusStatLabel) { bonusStatLabel.textContent = `+${systemState._lastBonusXp || 0} XP Claimed`; bonusStatLabel.style.color = '#34d399'; }
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
const tabsOrder = ['home', 'quests', 'analytics', 'arcade', 'profile'];

// --- SWIPE TO SWITCH TABS ---
(function() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    const SWIPE_THRESHOLD = 60;    // min horizontal px to count as a swipe
    const ANGLE_THRESHOLD = 35;    // max degrees off horizontal
    const TIME_LIMIT = 400;        // ms max for a swipe gesture

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        // Ignore if any modal/overlay is open
        // Block swipe if the arcade game panel is open
        const gamePanel = document.getElementById('arcade-game-panel');
        if (gamePanel && gamePanel.classList.contains('open')) return;

        const openOverlays = [
            'add-quest-modal', 'filter-modal', 'confirm-delete-modal',
            'registration-warning-modal', 'sys-dialog-overlay',
            'sl-streak-up-modal', 'sl-streak-lost-modal', 'sl-penalty-modal',
            'sl-welcome-back-modal',
            'achievements-sheet-overlay'
        ];
        if (openOverlays.some(id => {
            const el = document.getElementById(id);
            return el && window.getComputedStyle(el).display !== 'none';
        })) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const elapsed = Date.now() - touchStartTime;

        // Must be fast enough, long enough horizontally, and mostly horizontal
        if (elapsed > TIME_LIMIT) return;
        if (Math.abs(dx) < SWIPE_THRESHOLD) return;
        const angle = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
        if (angle > ANGLE_THRESHOLD) return;

        // Find the current active tab
        const currentTab = tabsOrder.find(tab => {
            const el = document.getElementById(`view-${tab}`);
            return el && el.classList.contains('active');
        });
        if (!currentTab) return;

        const currentIndex = tabsOrder.indexOf(currentTab);
        if (dx < 0) {
            // Swiped left → go to next tab
            if (currentIndex < tabsOrder.length - 1) switchTab(tabsOrder[currentIndex + 1]);
        } else {
            // Swiped right → go to previous tab
            if (currentIndex > 0) switchTab(tabsOrder[currentIndex - 1]);
        }
    }, { passive: true });
})();
function updateArcadeComingSoon() {
    const overlay = document.querySelector('.arcade-coming-soon-overlay');
    if (!overlay) return;
    overlay.style.display = ARCADE_COMING_SOON === 1 ? 'flex' : 'none';
}

function switchTab(tabId) {
    if (tabId === 'profile') { renderAchievements(); }
    if (tabId === 'arcade') { setTimeout(arcadeOnEnter, 80); updateArcadeComingSoon(); }
    // Exit arcade if leaving it
    const wasArcade = document.getElementById('view-arcade')?.classList.contains('active');
    if (wasArcade && tabId !== 'arcade') arcadeOnExit();
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
function ethToGregorian(ethYear, ethMonth, ethDay) {
    const anchorEth = { y: 2018, m: 6, d: 2 };
    const anchorGC  = new Date(2026, 1, 9);
    let totalDays = 0;
    let y = anchorEth.y, m = anchorEth.m, d = anchorEth.d;

    const isAfter = ethYear > anchorEth.y || (ethYear === anchorEth.y && ethMonth > anchorEth.m) || (ethYear === anchorEth.y && ethMonth === anchorEth.m && ethDay > anchorEth.d);
    const isBefore = ethYear < anchorEth.y || (ethYear === anchorEth.y && ethMonth < anchorEth.m) || (ethYear === anchorEth.y && ethMonth === anchorEth.m && ethDay < anchorEth.d);

    if (isAfter) {
        while (!(y === ethYear && m === ethMonth && d === ethDay)) {
            d++;
            totalDays++;
            const dim = (m === 13) ? ((y % 4 === 3) ? 6 : 5) : 30;
            if (d > dim) { d = 1; m++; if (m > 13) { m = 1; y++; } }
        }
    } else if (isBefore) {
        while (!(y === ethYear && m === ethMonth && d === ethDay)) {
            d--;
            totalDays--;
            if (d < 1) { m--; if (m < 1) { m = 13; y--; } const pdim = (m === 13) ? ((y % 4 === 3) ? 6 : 5) : 30; d = pdim; }
        }
    }

    const result = new Date(anchorGC);
    result.setDate(result.getDate() + totalDays);
    return result;
}

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
            const _greg = ethToGregorian(ethCurrentYear, ethCurrentMonth, d);
            const _gregStr = _greg.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            tip.innerHTML = `<div class="tooltip-greg-date">${_gregStr}</div>` + daysEvents.map(ev => `
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
            const _gregEmpty = ethToGregorian(ethCurrentYear, ethCurrentMonth, d);
            const _gregEmptyStr = _gregEmpty.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const emptyTip = document.createElement('div');
            emptyTip.className = 'cal-tooltip';
            emptyTip.innerHTML = `<div class="tooltip-greg-date">${_gregEmptyStr}</div>`;
            div.appendChild(emptyTip);
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
        window._justImported = true;
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
                                id: parseInt(`${quest.id}0${remIdx}0${daysScheduled}`.slice(0, 9)), 
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
        const homeUsernameEl = document.getElementById('home-username');
        if (homeUsernameEl) {
            homeUsernameEl.textContent = savedName;
            homeUsernameEl.setAttribute('data-text', savedName);
        }
        const dashUser = document.getElementById('dash-username');
        if(dashUser) dashUser.textContent = savedName;
        const nameInput = document.getElementById('profile-name-input');
        if(nameInput) nameInput.value = savedName;
        
        const qUsername = document.getElementById('quests-username');
        if (qUsername) qUsername.textContent = savedName;
    }

    if (savedAvatar) {
        const bgUrl = `url(${savedAvatar})`;
        const homeAv = document.getElementById('home-avatar');
        if (homeAv) homeAv.style.backgroundImage = bgUrl;
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

let tempChecklist = []; // [{text, done}]

function addChecklistItem(text = '') {
    tempChecklist.push({ text, done: false });
    renderChecklistEditor();
}

function removeChecklistItem(index) {
    tempChecklist.splice(index, 1);
    renderChecklistEditor();
}

function renderChecklistEditor() {
    const container = document.getElementById('checklist-items');
    if (!container) return;
    container.innerHTML = '';
    tempChecklist.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'checklist-item';
        row.setAttribute('data-index', i);
        row.innerHTML = `
            <div class="checklist-drag-handle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="9" cy="6" r="1.5" fill="currentColor"/>
                    <circle cx="15" cy="6" r="1.5" fill="currentColor"/>
                    <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
                    <circle cx="9" cy="18" r="1.5" fill="currentColor"/>
                    <circle cx="15" cy="18" r="1.5" fill="currentColor"/>
                </svg>
            </div>
            <input type="text" placeholder="Checklist item..." value="${item.text.replace(/"/g, '&quot;')}"
                oninput="tempChecklist[${i}].text = this.value"
                onfocus="setTimeout(() => this.scrollIntoView({behavior:'smooth',block:'center'}), 300)">
            <button class="checklist-item-remove" onclick="removeChecklistItem(${i})">×</button>
        `;
        container.appendChild(row);
    });

    if (window._checklistSortable) window._checklistSortable.destroy();
    window._checklistSortable = Sortable.create(container, {
        animation: 150,
        handle: '.checklist-drag-handle',
        onEnd: function(evt) {
            const moved = tempChecklist.splice(evt.oldIndex, 1)[0];
            tempChecklist.splice(evt.newIndex, 0, moved);
            renderChecklistEditor();
        }
    });
}

function toggleChecklistItem(questId, index) {
    const quest = systemState.quests.find(q => q.id === questId);
    if (!quest || !quest.checklist) return;
    const item = quest.checklist[index];
    if (item.done) {
        // Unchecking — deduct XP
        item.done = false;
        const xpEarned = getChecklistItemXp(quest);
        systemState.todayXp = Math.max(0, systemState.todayXp - xpEarned);
        systemState.totalXp = Math.max(0, systemState.totalXp - xpEarned);
    } else {
        // Checking — award XP
        item.done = true;
        const xpEarned = getChecklistItemXp(quest);
        systemState.todayXp += xpEarned;
        systemState.totalXp += xpEarned;
    }
    levelUpSound.currentTime = 0;
    levelUpSound.play().catch(e => console.log("Audio blocked"));
    saveGameState();
    updateStats();
    renderQuests();
    const area = document.getElementById(`cl-area-${questId}`);
    if (area) {
        area.style.display = 'flex';
        area.style.flexDirection = 'column';
    }
}

function getChecklistItemXp(quest) {
    const base = { trivial: 2, easy: 6, medium: 10, hard: 16 };
    return base[quest.difficulty] || 6;
}

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
    tempChecklist = [];
    renderChecklistEditor();
    document.getElementById('schedule-type').value = 'daily';
    document.getElementById('schedule-interval').value = 1;
    document.getElementById('schedule-start-date').value = new Date().toISOString().split('T')[0];
    selectedScheduleDays = [];
    document.querySelectorAll('.day-circle').forEach(c => c.classList.remove('active'));
    toggleDayPicker();

    selectDifficulty('easy');
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
    tempChecklist = quest.checklist ? quest.checklist.map(i => ({...i})) : [];
    renderChecklistEditor();
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
        quest.checklist = tempChecklist.filter(i => i.text.trim() !== '');
    } else {
        const newId = systemState.quests.length > 0 ? Math.max(...systemState.quests.map(q => q.id)) + 1 : 1;
        
        const scheduleObj = currentQuestType === 'daily' ? {
            type: document.getElementById('schedule-type').value,
            interval: parseInt(document.getElementById('schedule-interval').value),
            startDate: document.getElementById('schedule-start-date').value,
            days: [...selectedScheduleDays]
        } : null;

        const pinnedCount = systemState.quests.filter(q => q.pinned).length;
        systemState.quests.splice(pinnedCount, 0, {
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
            lastStreakDate: null,
            pinned: false,
            checklist: tempChecklist.filter(i => i.text.trim() !== '')
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

    // --- TITLES ---
    early_bird:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>`,
    night_owl:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>`,
    the_relentless: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/><circle cx="18" cy="5" r="3"/></svg>`,
    solo_player:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
    ghost_protocol: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 1 8 8v10l-3-2-2 2-2-2-2 2-2-2-3 2V10a8 8 0 0 1 8-8z"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/></svg>`,
    chain_breaker:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`,
    dawn_hunter:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
    iron_body:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>`,
    hoarder:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    completionist:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
    silent_blade:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></svg>`,
    awakened:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M12 5V2M12 22v-3M5 12H2M22 12h-3"/></svg>`,
    monarch_shadow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/><circle cx="12" cy="7" r="1" fill="currentColor"/></svg>`,
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

    // --- TITLES: Time-based ---
    { id: 'early_bird',     label: 'Early Bird',        desc: 'Complete a daily quest before 7:00 AM',                         color: '#fbbf24', check: s => s._titleFlags && s._titleFlags.early_bird },
    { id: 'night_owl',      label: 'Night Owl',         desc: 'Complete a daily quest after 11:00 PM',                         color: '#818cf8', check: s => s._titleFlags && s._titleFlags.night_owl },
    { id: 'dawn_hunter',    label: 'Dawn Hunter',       desc: 'Complete a daily quest before 6:00 AM',                        color: '#fb923c', check: s => s._titleFlags && s._titleFlags.dawn_hunter },

    // --- TITLES: Streak-based ---
    { id: 'the_relentless', label: 'The Relentless',    desc: 'Maintain a 14-day streak without missing a single day',         color: '#f43f5e', check: s => s.streak >= 14 },
    { id: 'chain_breaker',  label: 'Chain Breaker',     desc: 'Rebuild your streak to 7 after losing it',                     color: '#94a3b8', check: s => s._titleFlags && s._titleFlags.chain_breaker },
    { id: 'iron_body',      label: 'Iron Body',         desc: 'Keep the same daily quest active for 30 consecutive completions',color: '#22d3ee', check: s => s.quests.some(q => (q.dailyStreak ?? 0) >= 30) },
    { id: 'awakened',       label: 'Awakened',          desc: 'Keep the same daily quest active for 100 consecutive completions',color: '#a78bfa', check: s => s.quests.some(q => (q.dailyStreak ?? 0) >= 100) },

    // --- TITLES: Completion-based ---
    { id: 'solo_player',    label: 'Solo Player',       desc: 'Complete 50 total quests (daily + normal combined)',            color: '#34d399', check: s => { const done = s.quests.filter(q=>q.completed).length + (s._titleFlags&&s._titleFlags.totalCompleted||0); return (s._titleFlags&&s._titleFlags.totalCompleted||0) >= 50; } },
    { id: 'completionist',  label: 'Completionist',     desc: 'Complete 200 total quests',                                    color: '#f472b6', check: s => s._titleFlags && s._titleFlags.totalCompleted >= 200 },
    { id: 'silent_blade',   label: 'Silent Blade',      desc: 'Complete 500 total quests',                                    color: '#e2e8f0', check: s => s._titleFlags && s._titleFlags.totalCompleted >= 500 },

    // --- TITLES: Misc ---
    { id: 'ghost_protocol', label: 'Ghost Protocol',    desc: 'Have 5 quests with active reminders at the same time',         color: '#64748b', check: s => s.quests.filter(q => q.reminders && q.reminders.length > 0).length >= 5 },
    { id: 'hoarder',        label: 'The Hoarder',       desc: 'Have 50 quests created at the same time',                      color: '#a16207', check: s => s.quests.length >= 50 },
    { id: 'monarch_shadow', label: 'Monarch of Shadows',desc: 'Unlock every other achievement',                               color: '#ffd700', check: s => { const others = ACHIEVEMENTS.filter(a => a.id !== 'monarch_shadow'); return others.every(a => (s.achievements||[]).includes(a.id)); } },
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
    syncWidgetData();
}

function syncWidgetData() {
    try {
        if (!window.Capacitor || !Capacitor.Plugins.Preferences) return;
        const today = getLiveEthDate(); // reuse your existing Ethiopian date function
        const payload = JSON.stringify({
            todayEthDay:   today.day,
            todayEthMonth: today.month,
            todayEthYear:  today.year,
            events: (systemState.events || []).map(e => ({
                day: e.day,
                month: e.month,
                year: e.year || 0,
                title: e.title,
                color: e.color || '#8b5cf6',
                recurrence: e.recurrence || 'yearly'
            }))
        });
        Capacitor.Plugins.Preferences.set({ key: 'widget_data', value: payload });
    } catch(e) { /* browser or plugin missing, skip silently */ }
}


// Universal Data Patcher (Ensures old saves NEVER break new versions)
function sanitizeSystemState(loadedState) {
    if (!loadedState) return loadedState;
    
    // 1. Define the absolute baseline for a new account (Including Achievements!)
    const defaults = {
        level: 1, totalXp: 0, todayXp: 0, streak: 0,
        quests: [], streakIncrementedToday: false,
        lastCompletedDate: null, weeklyHistory: [],
        events: [], dailyBonus: null, dailyBonusClaimed: false,
        achievements: [], _titleFlags: {}
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
            const todayStr = new Date().toDateString();
            localStorage.setItem('lastLoginDate', todayStr);
            if (!systemState.lastCompletedDate) {
                systemState.lastCompletedDate = todayStr;
            }
            window._justImported = true;
            setTimeout(() => { window._justImported = false; }, 3000);
            
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
            localStorage.setItem('lastLoginDate', new Date().toDateString());
            
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
// ====== CUSTOM RESET TIME ======
function getResetTime() {
    const saved = localStorage.getItem('resetTime') || '00:00';
    const [h, m] = saved.split(':').map(Number);
    return { h, m };
}
function setCardTheme(theme) {
    const rankThresholds = { E: 0, D: 7, C: 15, B: 24, A: 34, S: 45 };
    const rankColors     = { E:'#b57a50', D:'#8faec6', C:'#00ffaa', B:'#00f0ff', A:'#cc44ff', S:'#ffb700' };

    if (theme !== 'default' && rankThresholds[theme] !== undefined) {
        const required = rankThresholds[theme];
        if (systemState.level < required) {
            showFloatingMsg(
                `Locked. Reach Level ${required} to unlock.`,
                rankColors[theme]
            );
            return;
        }
    }
    localStorage.setItem('cardTheme', theme);
    updateStats();
}

function showFloatingMsg(msg, color = '#00f0ff') {
    let el = document.getElementById('floating-theme-msg');
    if (!el) {
        el = document.createElement('div');
        el.id = 'floating-theme-msg';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%) translateY(6px);
        background: rgba(8,12,24,0.96);
        border: 1px solid rgba(255,255,255,0.08);
        border-top: 1px solid ${color}55;
        color: rgba(255,255,255,0.75);
        padding: 9px 16px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.8px;
        font-family: 'Orbitron', sans-serif;
        text-align: center;
        max-width: 75vw;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.25s ease, transform 0.25s ease;
        pointer-events: none;
    `;
    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(6px)';
    }, 2400);
}
function saveResetTime() {
    const input = document.getElementById('reset-time-input');
    if (!input) return;
    localStorage.setItem('resetTime', input.value);
    _sfx('success');
    sysAlert(`Daily reset time set to ${input.value}.`, { title: 'SYSTEM UPDATE', icon: '✔', color: 'blue' });
}
// ===============================

function checkDailyReset() {
    // If the user hasn't registered yet, do nothing.
    if (!localStorage.getItem('hunterName')) return;

    const { h: resetH, m: resetM } = getResetTime();
    const now = new Date();
    const resetToday = new Date(now);
    if (now.getHours() < resetH || (now.getHours() === resetH && now.getMinutes() < resetM)) {
        resetToday.setDate(resetToday.getDate() - 1);
    }
    const today = resetToday.toDateString();
    const lastLogin = localStorage.getItem('lastLoginDate');

    if (!systemState.dailyBonus || systemState.dailyBonus.date !== today) {
        systemState.dailyBonus = { date: today };
        systemState.dailyBonusClaimed = false;
        saveGameState();
    }

    if (lastLogin !== today && !window._justImported) {

        let deferFinish = false;

        if (lastLogin) {
            const lastLoginDate = new Date(lastLogin);
            const daysDiff = Math.floor((resetToday - lastLoginDate) / (1000 * 60 * 60 * 24));

            if (daysDiff >= 2) {
                // Missed a full game-day — penalty applies
                if (systemState.streak > 0) {
                    window.showPenaltySequence = true;
                }
                systemState.streak = 0;
                if (!systemState._titleFlags) systemState._titleFlags = {};
                systemState._titleFlags._hadStreakReset = true;
            } else if (daysDiff === 1) {
                const lastLoginDateStr = new Date(lastLogin).toDateString();
                const yesterday = new Date(Date.now() - 86400000);
                const anyDueYesterdayCompleted = systemState.quests.some(q => {
                    const isDaily = q.type === 'daily' || !q.type;
                    return isDaily && isQuestActiveOnDate(q, yesterday) && q.lastStreakDate === lastLoginDateStr;
                });
                const anyDueYesterdayStreaked = systemState.quests.some(q => {
                    const isDaily = q.type === 'daily' || !q.type;
                    return isDaily && isQuestActiveOnDate(q, yesterday) && q.lastStreakDate === lastLoginDateStr;
                });
                const streakSafe = (
                    systemState.lastCompletedDate === lastLogin ||
                    systemState.lastCompletedDate === lastLoginDateStr ||
                    systemState.lastCompletedDate === today ||
                    systemState.lastCompletedDate === new Date().toDateString() ||
                    anyDueYesterdayCompleted ||
                    anyDueYesterdayStreaked
                );

                const missedQuests = systemState.quests.filter(q => {
                    const isDaily = q.type === 'daily' || !q.type;
                    return isDaily && isQuestActiveOnDate(q, yesterday) && !q.completed;
                });

                if (missedQuests.length > 0) {
                    // Always show Welcome Back if there are any uncompleted dailies from yesterday
                    deferFinish = true;
                    window._pendingFinishToday = today;
                    window._welcomeBackYesterdayStr = lastLoginDateStr;
                    queuePopup('welcomeBack', (done) => {
                        window._currentPopupDone = done;
                        openWelcomeBackModal(missedQuests);
                    });
                } else if (!streakSafe) {
                    // No missed quests to review — apply penalty immediately
                    if (systemState.streak > 0) {
                        window.showPenaltySequence = true;
                    }
                    systemState.streak = 0;
                    if (!systemState._titleFlags) systemState._titleFlags = {};
                    systemState._titleFlags._hadStreakReset = true;
                }
            }
            // daysDiff === 0 means reset time moved back slightly — same game-day, no penalty
        } else {
            // First time ever opening the app!
            systemState.streak = 0;
        }

        if (window.showPenaltySequence) {
            window.showPenaltySequence = false;
            queuePopup('streakLost', (done) => {
                window._currentPopupDone = done;
                document.getElementById('sl-streak-lost-modal').style.display = 'flex';
            });
        }

        if (!deferFinish) {
            finishDailyReset(today);
        }
    }
}

// --- Runs the actual reset of dailies / XP history / lastLoginDate ---
// Called immediately by checkDailyReset(), OR later by confirmWelcomeBack()
// once the player has reviewed missed Dailies.
function finishDailyReset(today) {
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
            if (q.checklist && q.checklist.length > 0) {
                q.checklist.forEach(item => { item.done = false; });
            }
        }
    });

    // --- Save yesterday's XP to History before resetting ---
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const dayLabel = yesterdayDate.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);

    if (!systemState.weeklyHistory) systemState.weeklyHistory = [];
    systemState.weeklyHistory.push({ day: dayLabel, xp: systemState.todayXp });

    if (systemState.weeklyHistory.length > 7) {
        systemState.weeklyHistory.shift();
    }

    systemState.todayXp = 0;
    systemState.streakIncrementedToday = false;
    systemState.dailyBonusClaimed = false;
    systemState.dailyBonus = { date: today };

    localStorage.setItem('lastLoginDate', today);
    saveGameState();
}

// ==========================================
// --- WELCOME BACK (MISSED DAILIES) MODAL ---
// ==========================================

let _welcomeBackItems = [];

function openWelcomeBackModal(missedQuests) {
    _welcomeBackItems = missedQuests.map(q => ({ id: q.id, checked: false, checkedSteps: [] }));
    renderWelcomeBackList();
    document.getElementById('sl-welcome-back-modal').style.display = 'flex';
}

function renderWelcomeBackList() {
    const container = document.getElementById('welcome-back-list');
    if (!container) return;
    container.innerHTML = '';
    _welcomeBackItems.forEach(item => {
        const quest = systemState.quests.find(q => q.id === item.id);
        if (!quest) return;
        const row = document.createElement('div');
        row.className = 'wb-item' + (item.checked ? ' checked' : '');
        row.dataset.questId = item.id;
        const hasChecklist = quest.checklist && quest.checklist.length > 0;
        row.innerHTML = `
            <div class="wb-checkbox${item.checked ? ' checked' : ''}"></div>
            <div class="wb-quest-info">
                <div class="wb-title">${quest.title}</div>
                ${hasChecklist ? `
                <div class="wb-checklist-toggle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                    ${quest.checklist.length} steps
                </div>
                <div class="wb-checklist">
                    ${quest.checklist.map((c, idx) => {
                        const stepDone = item.checkedSteps && item.checkedSteps.includes(idx);
                        return `<div class="wb-checklist-item${stepDone ? ' wb-step-checked' : ''}" data-quest-id="${quest.id}" data-idx="${idx}">
                            <span class="wb-cl-mini-check${stepDone ? ' checked' : ''}"></span>${c.text}
                        </div>`;
                    }).join('')}
                </div>` : ''}
            </div>
        `;
        // Wire up toggle on the checklist expand button
        const toggleBtn = row.querySelector('.wb-checklist-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', e => {
                e.stopPropagation();
                row.querySelector('.wb-checklist').classList.toggle('open');
            });
        }
        // Wire up each checklist step
        row.querySelectorAll('.wb-checklist-item').forEach(stepEl => {
            stepEl.addEventListener('click', e => {
                e.stopPropagation();
                const qid = stepEl.dataset.questId;
                const idx = parseInt(stepEl.dataset.idx);
                const it = _welcomeBackItems.find(i => i.id === qid);
                if (!it) return;
                if (!it.checkedSteps) it.checkedSteps = [];
                const pos = it.checkedSteps.indexOf(idx);
                const miniCheck = stepEl.querySelector('.wb-cl-mini-check');
                if (pos === -1) {
                    it.checkedSteps.push(idx);
                    stepEl.classList.add('wb-step-checked');
                    if (miniCheck) miniCheck.classList.add('checked');
                } else {
                    it.checkedSteps.splice(pos, 1);
                    stepEl.classList.remove('wb-step-checked');
                    if (miniCheck) miniCheck.classList.remove('checked');
                }
                _sfx('tap');
            });
        });
        // Wire up quest row toggle ONLY on the checkbox and title, not the whole row
        const cbEl = row.querySelector('.wb-checkbox');
        const titleEl = row.querySelector('.wb-title');
        [cbEl, titleEl].forEach(el => {
            if (el) el.addEventListener('click', e => {
                e.stopPropagation();
                toggleWelcomeBackItem(item.id);
            });
        });
        container.appendChild(row);
    });
}
function toggleWelcomeBackStep() {} // kept for safety, logic moved inline above
function toggleWelcomeBackItem(id) {
    const item = _welcomeBackItems.find(i => i.id === id);
    if (!item) return;
    item.checked = !item.checked;
    _sfx('tap');
    // patch DOM directly — no re-render so checklists stay open
    const container = document.getElementById('welcome-back-list');
    container.querySelectorAll('.wb-item').forEach(row => {
        if (row.dataset.questId !== id) return;
        row.classList.toggle('checked', item.checked);
        const cb = row.querySelector('.wb-checkbox');
        if (cb) cb.classList.toggle('checked', item.checked);
    });
}

function confirmWelcomeBack() {
    const yesterdayStr = window._welcomeBackYesterdayStr;
    const checkedItems = _welcomeBackItems.filter(i => i.checked);

    // Count quests where the whole quest OR at least one checklist item was checked
    let anyDone = checkedItems.length > 0;

    checkedItems.forEach(item => {
        const quest = systemState.quests.find(q => q.id === item.id);
        if (!quest) return;
        quest.dailyStreak = (quest.dailyStreak ?? 0) + 1;
        quest.lastStreakDate = yesterdayStr;
        quest.completed = true; // protects it from the dailyStreak reset in finishDailyReset
    });

    // Also check: any quest where individual checklist items were ticked (but full quest not checked)
    _welcomeBackItems.filter(i => !i.checked).forEach(item => {
        const quest = systemState.quests.find(q => q.id === item.id);
        if (!quest || !quest.checklist) return;
        const anyChecklistDone = item.checkedSteps && item.checkedSteps.length > 0;
        if (anyChecklistDone) {
            anyDone = true;
            // Apply checklist progress retroactively
            item.checkedSteps.forEach(stepIdx => {
                if (quest.checklist[stepIdx]) quest.checklist[stepIdx].done = true;
            });
            // Award per-quest streak for partial checklist completion too
            quest.dailyStreak = (quest.dailyStreak ?? 0) + 1;
            quest.lastStreakDate = yesterdayStr;
            quest.completed = true;
        }
    });

    if (anyDone) {
        // At least one Daily or checklist item was retroactively completed — streak is safe
        systemState.lastCompletedDate = yesterdayStr;
        systemState.streak = (systemState.streak ?? 0) + 1;
        queuePopup('streakUp', (done) => {
            window._currentPopupDone = done;
            document.getElementById('sl-streak-display').textContent = systemState.streak;
            document.getElementById('sl-streak-up-modal').style.display = 'flex';
        });
    } else {
        // Nothing was checked — penalty applies
        if (systemState.streak > 0) {
            queuePopup('streakLost', (done) => {
                window._currentPopupDone = done;
                document.getElementById('sl-streak-lost-modal').style.display = 'flex';
            });
        }
        systemState.streak = 0;
        if (!systemState._titleFlags) systemState._titleFlags = {};
        systemState._titleFlags._hadStreakReset = true;
    }

    finishDailyReset(window._pendingFinishToday);

    closeSLModal('sl-welcome-back-modal', () => {
        _sfx('success');
        renderQuests();
        updateStats();
        if (window._currentPopupDone) { window._currentPopupDone(); window._currentPopupDone = null; }
    });
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
    
    // Deduct 5 levels worth of XP based on actual current level scaling
    let penaltyXP = 0;
    for (let i = 0; i < 5; i++) {
        penaltyXP += getXpForLevel(Math.max(1, systemState.level - i));
    }
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

// ============================================================
// ARCADE — VOID HUNTER (Space Shooter)
// ============================================================
let _arcadeLoop = null;
let _arcadeRunning = false;

const ARCADE = {
    canvas: null, ctx: null,
    W: 0, H: 0,
    score: 0, bestScore: 0,
    cores: 0,           // cores earned THIS run (trickle)
    coreTimer: 0,       // frames since last trickle
    player: null,
    bullets: [], enemies: [], particles: [], stars: [],
    enemyTimer: 0, enemyInterval: 90,
    frame: 0,
    touchX: null,
    upgrades: { speed: 1, fireRate: 1, shield: 0 },
    shieldHp: 0,
    fireTimer: 0,
};

function arcadeUpdateCoresDisplay() {
    const el = document.getElementById('arcade-cores-display');
    if (el) el.textContent = (systemState.energyCores || 0) + ' ⚡';
}

function arcadeInit() {
    ARCADE.canvas = document.getElementById('game-canvas');
    if (!ARCADE.canvas) return;
    ARCADE.ctx = ARCADE.canvas.getContext('2d');
    arcadeResize();
    arcadeUpdateCoresDisplay();
    ARCADE.bestScore = parseInt(localStorage.getItem('arcadeBestScore') || '0');
    document.getElementById('arcade-best-score').textContent = ARCADE.bestScore;

    // Touch controls
    ARCADE.canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        ARCADE.touchX = t.clientX;
        if (!_arcadeRunning) arcadeStartGame();
    }, { passive: false });
    ARCADE.canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        ARCADE.touchX = e.touches[0].clientX;
    }, { passive: false });
    ARCADE.canvas.addEventListener('touchend', () => { ARCADE.touchX = null; }, { passive: false });

    // Mouse controls (desktop)
    ARCADE.canvas.addEventListener('mousemove', e => {
        if (_arcadeRunning) ARCADE.touchX = e.clientX;
    });
    ARCADE.canvas.addEventListener('click', () => {
        if (!_arcadeRunning) arcadeStartGame();
    });
}

function arcadeResize() {
    const c = ARCADE.canvas;
    if (!c) return;
    c.width  = window.innerWidth;
    c.height = window.innerHeight - 52; // subtract panel top bar height
    ARCADE.W = c.width;
    ARCADE.H = c.height;
}

function arcadeStartGame() {
    arcadeResize();
    const overlay = document.getElementById('game-overlay');
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => { overlay.style.display = 'none'; }, 300);

    ARCADE.score = 0;
    ARCADE.cores = 0;
    ARCADE.coreTimer = 0;
    ARCADE.frame = 0;
    ARCADE.bullets = [];
    ARCADE.enemies = [];
    ARCADE.particles = [];
    ARCADE.enemyTimer = 0;
    ARCADE.enemyInterval = 90;
    ARCADE.fireTimer = 0;
    ARCADE.touchX = null;

    // Stars
    ARCADE.stars = Array.from({ length: 80 }, () => ({
        x: Math.random() * ARCADE.W,
        y: Math.random() * ARCADE.H,
        r: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 1.5 + 0.3,
        opacity: Math.random() * 0.7 + 0.2,
    }));

    // Player
    const lvl = systemState.level || 1;
    ARCADE.upgrades.speed    = 1 + Math.min(lvl * 0.05, 1.5);
    ARCADE.upgrades.fireRate = 1 + Math.min(lvl * 0.04, 1.2);
    ARCADE.upgrades.shield   = lvl >= 10 ? 1 : 0;
    ARCADE.shieldHp = ARCADE.upgrades.shield ? 1 : 0;

    ARCADE.player = {
        x: ARCADE.W / 2,
        y: ARCADE.H - 90,
        w: 32, h: 38,
        hp: 3 + ARCADE.upgrades.shield,
        maxHp: 3 + ARCADE.upgrades.shield,
        invFrames: 0,
    };

    _arcadeRunning = true;
    if (_arcadeLoop) cancelAnimationFrame(_arcadeLoop);
    _arcadeLoop = requestAnimationFrame(arcadeLoop);
}

function arcadeLoop() {
    if (!_arcadeRunning) return;
    arcadeUpdate();
    arcadeDraw();
    _arcadeLoop = requestAnimationFrame(arcadeLoop);
}

function arcadeUpdate() {
    const A = ARCADE;
    A.frame++;

    // Move player toward touch
    if (A.touchX !== null && A.player) {
        const rect = A.canvas.getBoundingClientRect();
        const targetX = A.touchX - rect.left;
        const dx = targetX - A.player.x;
        const spd = 5 * A.upgrades.speed;
        if (Math.abs(dx) > spd) A.player.x += dx > 0 ? spd : -spd;
        else A.player.x = targetX;
        A.player.x = Math.max(A.player.w / 2, Math.min(A.W - A.player.w / 2, A.player.x));
    }

    // Invincibility frames
    if (A.player && A.player.invFrames > 0) A.player.invFrames--;

    // Auto-fire
    const fireInterval = Math.max(8, Math.round(18 / A.upgrades.fireRate));
    A.fireTimer++;
    if (A.fireTimer >= fireInterval && A.player) {
        A.fireTimer = 0;
        A.bullets.push({ x: A.player.x, y: A.player.y - 20, w: 4, h: 12, speed: 10, dmg: 1 });
    }

    // Scroll stars
    A.stars.forEach(s => {
        s.y += s.speed;
        if (s.y > A.H) { s.y = 0; s.x = Math.random() * A.W; }
    });

    // Spawn enemies — get harder over time
    A.enemyTimer++;
    const minInterval = Math.max(28, 90 - Math.floor(A.score / 3));
    if (A.enemyTimer >= minInterval) {
        A.enemyTimer = 0;
        const type = A.score > 40 && Math.random() < 0.25 ? 'tank' : (Math.random() < 0.3 ? 'fast' : 'normal');
        const cfg = {
            normal: { w: 28, h: 28, speed: 1.4, hp: 1, color: '#f87171' },
            fast:   { w: 22, h: 22, speed: 2.6, hp: 1, color: '#fb923c' },
            tank:   { w: 36, h: 36, speed: 0.8, hp: 3, color: '#c084fc' },
        }[type];
        A.enemies.push({
            x: Math.random() * (A.W - 40) + 20,
            y: -30, type, ...cfg, maxHp: cfg.hp,
        });
    }

    // Move bullets
    A.bullets = A.bullets.filter(b => b.y > -20);
    A.bullets.forEach(b => { b.y -= b.speed; });

    // Move enemies
    A.enemies = A.enemies.filter(e => e.y < A.H + 40);
    A.enemies.forEach(e => { e.y += e.speed; });

    // Bullet-enemy collision
    for (let bi = A.bullets.length - 1; bi >= 0; bi--) {
        const b = A.bullets[bi];
        for (let ei = A.enemies.length - 1; ei >= 0; ei--) {
            const e = A.enemies[ei];
            if (Math.abs(b.x - e.x) < (e.w / 2 + b.w / 2) &&
                Math.abs(b.y - e.y) < (e.h / 2 + b.h / 2)) {
                A.bullets.splice(bi, 1);
                e.hp -= b.dmg;
                if (e.hp <= 0) {
                    A.score++;
                    arcadeSpawnParticles(e.x, e.y, e.color, e.type === 'tank' ? 12 : 7);
                    A.enemies.splice(ei, 1);
                } else {
                    arcadeSpawnParticles(e.x, e.y, e.color, 3);
                }
                break;
            }
        }
    }

    // Enemy-player collision
    if (A.player && A.player.invFrames === 0) {
        for (let ei = A.enemies.length - 1; ei >= 0; ei--) {
            const e = A.enemies[ei];
            if (Math.abs(e.x - A.player.x) < (e.w / 2 + A.player.w / 2 - 4) &&
                Math.abs(e.y - A.player.y) < (e.h / 2 + A.player.h / 2 - 4)) {
                A.enemies.splice(ei, 1);
                A.player.hp--;
                A.player.invFrames = 60;
                arcadeSpawnParticles(A.player.x, A.player.y, '#38bdf8', 10);
                if (A.player.hp <= 0) { arcadeGameOver(); return; }
                break;
            }
        }
    }

    // Particles
    A.particles = A.particles.filter(p => p.life > 0);
    A.particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.06;
        p.life--;
        p.opacity = p.life / p.maxLife;
    });

    // Core trickle — 1 core every ~10 seconds of play
    A.coreTimer++;
    if (A.coreTimer >= 600) {
        A.coreTimer = 0;
        A.cores += 1;
    }

    // Score display
    const scoreEl = document.querySelector('.arcade-hud-center');
    if (scoreEl) scoreEl.innerHTML = `<span class="arcade-title-text">SCORE: ${A.score}</span>`;
}

function arcadeSpawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const life = 20 + Math.random() * 20;
        ARCADE.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4 - 1,
            color, life, maxLife: life,
            r: Math.random() * 3 + 1,
            opacity: 1,
        });
    }
}

function arcadeGameOver() {
    _arcadeRunning = false;
    cancelAnimationFrame(_arcadeLoop);

    const A = ARCADE;
    const earned = A.cores;

    // Save best score
    if (A.score > A.bestScore) {
        A.bestScore = A.score;
        localStorage.setItem('arcadeBestScore', A.bestScore);
        document.getElementById('arcade-best-score').textContent = A.bestScore;
    }

    // Deposit trickle cores into main wallet
    if (!systemState.energyCores) systemState.energyCores = 0;
    systemState.energyCores += earned;
    saveGameState();
    arcadeUpdateCoresDisplay();

    // Show overlay
    const overlay = document.getElementById('game-overlay');
    const title    = document.getElementById('overlay-title');
    const sub      = document.getElementById('overlay-subtitle');
    const scoreRow = document.getElementById('overlay-score-row');
    const finalSc  = document.getElementById('overlay-final-score');
    const rewardRow= document.getElementById('overlay-reward-row');
    const rewardTx = document.getElementById('overlay-reward-text');
    const btn      = document.getElementById('overlay-btn');

    title.textContent = 'GAME OVER';
    sub.textContent   = A.score > A.bestScore ? '★ NEW BEST!' : 'MISSION FAILED';
    finalSc.textContent = A.score;
    scoreRow.style.display = 'flex';
    rewardRow.style.display = earned > 0 ? 'flex' : 'none';
    rewardTx.textContent = `+${earned} ⚡ CORES EARNED`;
    btn.textContent = 'RETRY';

    overlay.style.display = 'flex';
    overlay.style.opacity = '0';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    });
}

function arcadeDraw() {
    const A = ARCADE;
    const ctx = A.ctx;
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, A.W, A.H);

    // Stars
    A.stars.forEach(s => {
        ctx.globalAlpha = s.opacity;
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Enemies
    A.enemies.forEach(e => {
        const pulse = 0.85 + 0.15 * Math.sin(A.frame * 0.12);
        ctx.save();
        ctx.translate(e.x, e.y);
        // Glow
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = pulse;
        // Enemy shape: diamond
        const s = e.w / 2;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s, 0);
        ctx.lineTo(0, s);  ctx.lineTo(-s, 0);
        ctx.closePath();
        ctx.stroke();
        if (e.type === 'tank') {
            ctx.globalAlpha = 0.3 * pulse;
            ctx.fillStyle = e.color;
            ctx.fill();
        }
        // HP pips for tank
        if (e.type === 'tank' && e.hp > 1) {
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.fillStyle = e.color;
            for (let i = 0; i < e.hp; i++) {
                ctx.beginPath();
                ctx.arc(-4 + i * 4, s + 6, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    });

    // Bullets
    A.bullets.forEach(b => {
        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#7dd3fc';
        ctx.beginPath();
        ctx.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 3);
        ctx.fill();
        ctx.restore();
    });

    // Particles
    A.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // Player
    if (A.player && (A.player.invFrames === 0 || Math.floor(A.frame / 4) % 2 === 0)) {
        const p = A.player;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 20;
        // Ship body
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -p.h / 2);
        ctx.lineTo(p.w / 2, p.h / 2);
        ctx.lineTo(p.w / 4, p.h / 3);
        ctx.lineTo(-p.w / 4, p.h / 3);
        ctx.lineTo(-p.w / 2, p.h / 2);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.globalAlpha = 1;
        // Engine glow
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-p.w / 4, p.h / 3);
        ctx.lineTo(0, p.h / 2 + 6 + Math.random() * 5);
        ctx.lineTo(p.w / 4, p.h / 3);
        ctx.stroke();
        ctx.restore();

        // HP bar
        const barW = 40, barH = 4;
        const bx = p.x - barW / 2, by = p.y + p.h / 2 + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, barW, barH);
        const pct = p.hp / p.maxHp;
        ctx.fillStyle = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : '#f87171';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
        ctx.fillRect(bx, by, barW * pct, barH);
        ctx.shadowBlur = 0;
    }

    // Score HUD (bottom of canvas)
    ctx.fillStyle = 'rgba(56,189,248,0.08)';
    ctx.fillRect(0, A.H - 38, A.W, 38);
    ctx.strokeStyle = 'rgba(56,189,248,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, A.H - 38); ctx.lineTo(A.W, A.H - 38); ctx.stroke();
    ctx.fillStyle = 'rgba(56,189,248,0.6)';
    ctx.font = '700 11px Rajdhani, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.textAlign = 'left';
    ctx.fillText('⚡ ' + ((systemState.energyCores || 0) + A.cores), 12, A.H - 14);
    ctx.textAlign = 'right';
    ctx.fillText('HP ' + (A.player ? A.player.hp : 0) + ' / ' + (A.player ? A.player.maxHp : 0), A.W - 12, A.H - 14);
}

// Called when arcade tab becomes visible
function arcadeOnEnter() {
    arcadeUpdateCoresDisplay();
    // Update best score on card
    const best = parseInt(localStorage.getItem('arcadeBestScore') || '0');
    const cardBest = document.getElementById('card-best-voidhunter');
    if (cardBest) cardBest.textContent = best;
    // Draw card preview animation
    arcadeDrawCardPreview();
}

function arcadeOnExit() {
    if (_arcadeRunning) {
        _arcadeRunning = false;
        cancelAnimationFrame(_arcadeLoop);
    }
    // Also close the game panel if open
    const panel = document.getElementById('arcade-game-panel');
    if (panel) panel.classList.remove('open');
}

function arcadeOpenGame(gameId) {
    const panel = document.getElementById('arcade-game-panel');
    const titleEl = document.getElementById('arcade-panel-title');
    if (!panel) return;

    // Set panel title based on game
    const titles = { voidhunter: 'VOID HUNTER' };
    if (titleEl) titleEl.textContent = titles[gameId] || gameId.toUpperCase();

    // Slide panel up
    panel.classList.add('open');

    // Init the canvas after panel is visible
    setTimeout(() => {
        arcadeInit();
        arcadeUpdatePanelCores();
    }, 80);
}

function arcadeCloseGame() {
    // Stop game if running
    if (_arcadeRunning) {
        _arcadeRunning = false;
        cancelAnimationFrame(_arcadeLoop);
    }
    // Slide panel back down
    const panel = document.getElementById('arcade-game-panel');
    if (panel) panel.classList.remove('open');

    // Refresh lobby best score
    const best = parseInt(localStorage.getItem('arcadeBestScore') || '0');
    const cardBest = document.getElementById('card-best-voidhunter');
    if (cardBest) cardBest.textContent = best;

    arcadeUpdateCoresDisplay();
}

function arcadeUpdatePanelCores() {
    const el = document.getElementById('arcade-panel-cores');
    if (el) el.textContent = (systemState.energyCores || 0) + ' ⚡';
}

// Animated preview on lobby card
function arcadeDrawCardPreview() {
    const c = document.getElementById('preview-voidhunter');
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    let frame = 0;
    const stars = Array.from({ length: 30 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.2 + 0.3, speed: Math.random() * 0.6 + 0.2,
    }));
    const enemies = [
        { x: W * 0.3, y: -10 }, { x: W * 0.7, y: -40 }, { x: W * 0.5, y: -70 }
    ];

    function drawFrame() {
        // Only animate while arcade view is active and panel closed
        const panel = document.getElementById('arcade-game-panel');
        if (panel && panel.classList.contains('open')) return;

        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, W, H);

        // Stars
        stars.forEach(s => {
            s.y += s.speed;
            if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#e0f2fe';
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Enemies drifting down
        enemies.forEach((e, i) => {
            e.y += 0.5;
            if (e.y > H + 20) e.y = -20;
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.shadowColor = '#f87171'; ctx.shadowBlur = 8;
            ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.5;
            const s = 8;
            ctx.beginPath();
            ctx.moveTo(0,-s); ctx.lineTo(s,0); ctx.lineTo(0,s); ctx.lineTo(-s,0);
            ctx.closePath(); ctx.stroke();
            ctx.restore();
        });

        // Mini ship
        const px = W / 2 + Math.sin(frame * 0.04) * 12;
        const py = H - 20;
        ctx.save();
        ctx.translate(px, py);
        ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 12;
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0,-10); ctx.lineTo(8,10); ctx.lineTo(4,7); ctx.lineTo(-4,7); ctx.lineTo(-8,10);
        ctx.closePath(); ctx.stroke();
        // Engine
        ctx.shadowColor = '#fbbf24'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4,7); ctx.lineTo(0, 14 + Math.random()*3); ctx.lineTo(4,7);
        ctx.stroke();
        ctx.restore();

        frame++;
        requestAnimationFrame(drawFrame);
    }
    drawFrame();
}

// Also update panel cores whenever cores change
const _origArcadeUpdateCoresDisplay = arcadeUpdateCoresDisplay;
function arcadeUpdateCoresDisplay() {
    const el = document.getElementById('arcade-cores-display');
    if (el) el.textContent = (systemState.energyCores || 0) + ' ⚡';
    arcadeUpdatePanelCores();
}
// ============================================================
// END ARCADE
// ============================================================