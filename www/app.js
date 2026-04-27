// --- State Management ---
// We define how much XP it takes to gain 1 Level. (You can change this later!)
const XP_PER_LEVEL = 500;

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
    events: [] // --- CALENDAR: Stores all scheduled events
};

// Track filters separately for home (Dailies) and quests
let filters = {
    home: localStorage.getItem('filter_home') || 'all',
    quests: localStorage.getItem('filter_quests') || 'all'
};
let currentActiveTab = 'home'; // Tracks which tab we are currently looking at

// Initialize Audio (Ensure saved.mp3 is in the www folder)
const levelUpSound = new Audio('saved.mp3');

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
    
    document.getElementById('current-date').textContent = dateStr;
    document.getElementById('current-day').textContent = dayStr;
    
    const qDate = document.getElementById('quests-current-date');
    const qDay = document.getElementById('quests-current-day');
    if (qDate) qDate.textContent = dateStr;
    if (qDay) qDay.textContent = dayStr;
    
    // Simple Timer Mock (Counts down to midnight)
    setInterval(() => {
        const d = new Date();
        const h = 23 - d.getHours();
        const m = 59 - d.getMinutes();
        const s = 59 - d.getSeconds();
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        document.getElementById('reset-timer').textContent = timeStr;
        
        const qTimer = document.getElementById('quests-reset-timer');
        if (qTimer) qTimer.textContent = timeStr;
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
        
        // 3. "Scheduled" Filter (Main Quests): Hides completed, and hides ones missing a due date.
        if (activeFilter === 'scheduled') {
            if (quest.completed) return; 
            if (!quest.dueDate) return;  
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

        questEl.innerHTML = `
            <!-- Checkbox -->
            <div class="quest-checkbox" onclick="toggleQuest(${quest.id})"></div>
            
            <!-- Details (Clicking this opens the Edit Menu) -->
            <div class="quest-details" onclick="openEditQuestModal(${quest.id})">
                <div class="quest-title">${quest.title}</div>
                ${quest.notes ? `<div class="quest-notes">${quest.notes}</div>` : ''}
            </div>
            
            <!-- Rewards & Colored Difficulty -->
            <div class="quest-rewards">
                <div class="quest-xp">+${quest.xp} XP</div>
                <div style="color: ${diffColor}; font-size: 10px; font-weight: 800; margin-top: 4px;">${diffLabel}</div>
            </div>
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
    if(confirm("SYSTEM WARNING: Delete this quest?")) {
        cancelWorkManagerTasks(id); // Delete background tasks from OS!
        systemState.quests = systemState.quests.filter(q => q.id !== id);
        saveGameState();
        renderQuests();
    }
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
        if (isDaily) {
            systemState.lastCompletedDate = new Date().toDateString(); // Register that work was done today
            
            if (!systemState.streakIncrementedToday) {
                systemState.streak += 1;
                systemState.streakIncrementedToday = true;
            }
        }
        
        // Play System Sound
        levelUpSound.currentTime = 0;
        levelUpSound.play().catch(e => console.log("Audio play blocked by browser policy until user interaction."));
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
    saveGameState(); // Saves to the Magical Backpack instantly!
}

function updateStats() {
    const statToday = document.getElementById('stat-today-xp');
    if (statToday) statToday.textContent = systemState.todayXp;

    const statTotal = document.getElementById('stat-total-xp');
    if (statTotal) statTotal.textContent = systemState.totalXp;
    
    // 1. Calculate Level based on Total XP
    const previousLevel = systemState.level;
    systemState.level = Math.floor(systemState.totalXp / XP_PER_LEVEL);
    
    if (systemState.level > previousLevel) {
        alert(`SYSTEM MESSAGE: You have leveled up to Level ${systemState.level}!`);
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

    // Calculate Rank Progress percentage
    let levelsIntoRank = systemState.level % 10;
    if (currentRankIndex === 5) levelsIntoRank = 10; // Maxed out
    
    const xpIntoCurrentLevel = systemState.totalXp % XP_PER_LEVEL;
    const rankProgressPercent = currentRankIndex === 5 ? 100 : 
        Math.floor((((levelsIntoRank * XP_PER_LEVEL) + xpIntoCurrentLevel) / (10 * XP_PER_LEVEL)) * 100);
        
    const levelsToNext = currentRankIndex === 5 ? 0 : 10 - levelsIntoRank;

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

    // Dashboard Updates (Level/Rank Pill)
    const dashLevelElement = document.getElementById('dash-level');
    if(dashLevelElement) dashLevelElement.textContent = systemState.level;
    
    const dashMiniHex = document.getElementById('dash-mini-hex');
    if(dashMiniHex) dashMiniHex.textContent = currentRank.letter;

    // Dashboard Updates (Progress Box)
    const rpcLevel = document.getElementById('dash-rpc-level');
    if(rpcLevel) rpcLevel.textContent = `Level ${systemState.level}`;
    
    const rpcRank = document.getElementById('dash-rpc-rank');
    if(rpcRank) rpcRank.textContent = currentRank.name;

    const rpcPillCurr = document.getElementById('dash-pill-current');
    if(rpcPillCurr) rpcPillCurr.textContent = currentRank.name;
    
    const rpcPillNext = document.getElementById('dash-pill-next');
    if(rpcPillNext) rpcPillNext.textContent = currentRankIndex === 5 ? 'MAX' : nextRank.name;

    const rpcProgText = document.getElementById('dash-progress-text');
    if(rpcProgText) rpcProgText.textContent = `${rankProgressPercent}% in ${currentRank.name}`;
    
    const rpcLevelsLeft = document.getElementById('dash-levels-left');
    if(rpcLevelsLeft) rpcLevelsLeft.textContent = currentRankIndex === 5 ? 'Max Rank Reached' : `${levelsToNext} levels to next rank`;

    const rpcFill = document.getElementById('dash-progress-fill');
    if(rpcFill) rpcFill.style.width = `${rankProgressPercent}%`;

    // --- STREAK UPDATES ---
    const streakCountHome = document.getElementById('streak-count');
    if (streakCountHome) streakCountHome.textContent = `${systemState.streak} Days`;
    
    const dashStreak = document.getElementById('dash-streak');
    if (dashStreak) dashStreak.textContent = `${systemState.streak} Days`;

    const qStreak = document.getElementById('quests-streak-count');
    if (qStreak) qStreak.textContent = `${systemState.streak} Days`;
}

// --- Navigation ---
// We define the exact order of tabs to calculate which way to swipe
const tabsOrder = ['home', 'quests', 'analytics', 'profile'];

function switchTab(tabId) {
    // Check if the user is registered. If not, block navigation and show warning.
    if (tabId !== 'profile' && !localStorage.getItem('hunterName')) {
        document.getElementById('registration-warning-modal').style.display = 'flex';
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
    if(confirm("SYSTEM WARNING: Delete this event?")) {
        systemState.events = systemState.events.filter(e => e.id !== id);
        saveGameState();
        renderEthCalendar();
        renderEventList();
    }
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
        
        // Only show the 'Close' button if they already have an active profile
        if(localStorage.getItem('hunterName')) {
            closeBtn.style.display = 'block';
        } else {
            closeBtn.style.display = 'none';
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
            await Capacitor.Plugins.LocalNotifications.createChannel({
                id: 'system_alerts',
                name: 'System Alerts',
                description: 'Time-sensitive Quest Notifications',
                importance: 5, 
                visibility: 1, 
                vibration: true
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
        // If on mobile, the Android WorkManager already scheduled reminders in the background!
        // We only use this immediate popup for the 6 PM System Penalty warning now.
        if (quest.id === 'system-warning') {
            await Capacitor.Plugins.LocalNotifications.schedule({
                notifications: [{
                    title: quest.title,
                    body: quest.notes || "System penalty imminent.",
                    id: 99999, // Unique ID for penalty
                    schedule: { at: new Date(Date.now() + 1000) }, 
                    smallIcon: "ic_stat_icon_config_sample" 
                }]
            });
        }
    } catch (e) {
        // Browser Fallback (Since PCs don't have Android WorkManager)
        showNotification(quest); 
    }
}

// ==========================================
// --- WORKMANAGER BACKGROUND SCHEDULER ---
// ==========================================
async function scheduleNativeWorkManager(quest) {
    try {
        // Failsafe: Ensure permissions are valid before scheduling
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
                    const [hours, minutes] = rem.split(':').map(Number);
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
                                schedule: { at: checkDate },
                                smallIcon: "ic_stat_icon_config_sample",
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
                            schedule: { at: remDate },
                            smallIcon: "ic_stat_icon_config_sample",
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
        console.log("App running in browser. Background WorkManager skipped.");
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
        alert("SYSTEM ERROR: Please provide a Task Title.");
        return;
    }
    
    let xpPercent = 0.04; 
    if (currentDifficulty === 'trivial') xpPercent = 0.01;
    if (currentDifficulty === 'medium') xpPercent = 0.07;
    if (currentDifficulty === 'hard') xpPercent = 0.10;
    const xpReward = Math.max(1, Math.round(XP_PER_LEVEL * xpPercent));
    
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
            reminders: tempReminders.filter(r => r !== '')
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
    // Hides the "Are you sure?" popup
    document.getElementById('confirm-delete-modal').style.display = 'none';
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
    document.getElementById('registration-warning-modal').style.display = 'none';
}

// ==========================================
// --- SAVE & LOAD SYSTEM (The Backpack) ---
// ==========================================

function saveGameState() {
    localStorage.setItem('systemState', JSON.stringify(systemState));
}

function loadGameState() {
    const savedState = localStorage.getItem('systemState');
    if (savedState) {
        systemState = JSON.parse(savedState);
        // SAFETY CATCH: Ensures older save files get the new features without crashing!
        if (!systemState.events) systemState.events = [];
        if (!systemState.weeklyHistory) systemState.weeklyHistory = [];
    }
}

// 7. Export Data (Using Native Share Menu)
async function exportData() {
    const masterSave = {
        system: systemState,
        hunterName: localStorage.getItem('hunterName') || '',
        hunterAvatar: localStorage.getItem('hunterAvatar') || '',
        dateJoined: localStorage.getItem('dateJoined') || '',
        lastLoginDate: localStorage.getItem('lastLoginDate') || ''
    };

    const dataStr = JSON.stringify(masterSave, null, 2);

    // 1. Try the Native Share Menu (Allows "Save to Files", Drive, etc.)
    if (navigator.canShare) {
        try {
            // Package the data into a physical File object
            const file = new File([dataStr], "solo-leveling-save.json", { type: "application/json" });
            
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'System Data Backup',
                    text: 'Here is your exported Hunter Data.',
                    files: [file]
                });
                return; // Successfully handed off to the OS!
            }
        } catch (err) {
            // If the user just swipes the share menu away, ignore the error
            if (err.name === 'AbortError') return; 
            console.log("Share failed, falling back to direct download...");
        }
    }

    // 2. Fallback for PC/Browsers that don't support Mobile Share menus
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'solo-leveling-save.json'; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// 8. Import Data (Unpacking everything)
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedData = JSON.parse(e.target.result);
            if (loadedData.system) systemState = loadedData.system;
            if (loadedData.hunterName) localStorage.setItem('hunterName', loadedData.hunterName);
            if (loadedData.hunterAvatar) localStorage.setItem('hunterAvatar', loadedData.hunterAvatar);
            if (loadedData.dateJoined) localStorage.setItem('dateJoined', loadedData.dateJoined);
            if (loadedData.lastLoginDate) localStorage.setItem('lastLoginDate', loadedData.lastLoginDate);
            
            saveGameState();
            renderQuests();
            updateStats();
            applySavedDataToUI(); 
            
            alert("SYSTEM MESSAGE: All Data Restored Successfully!");
        } catch (error) {
            alert("SYSTEM ERROR: Corrupt Save File.");
        }
    };
    reader.readAsText(file); 
    event.target.value = ''; 
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
                systemState.streak = 0;
            }
        } else {
            // First time ever opening the app!
            systemState.streak = 0;
        }

        // RESET ONLY DAILY QUESTS & TODAY'S XP
        systemState.quests.forEach(q => {
            if (q.type === 'daily' || !q.type) {
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
        systemState.streakIncrementedToday = false; // Reset the daily streak tracker

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
    
    // Play sound when notification pops
    levelUpSound.currentTime = 0;
    levelUpSound.play().catch(e => console.log("Audio blocked"));

    // Auto-hide after 5 seconds
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => {
        closeNotification();
    }, 5000);
}

function closeNotification() {
    document.getElementById('notification-toast').style.display = 'none';
    activeNotificationQuestId = null;
    if (notificationTimeout) clearTimeout(notificationTimeout);
}

function completeFromNotification() {
    if (activeNotificationQuestId !== null) {
        toggleQuest(activeNotificationQuestId);
        closeNotification();
    }
}