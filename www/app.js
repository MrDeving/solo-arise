// --- State Management ---
// We define how much XP it takes to gain 1 Level. (You can change this later!)
const XP_PER_LEVEL = 500;

let triggeredReminders = new Set(); // Remembers which notifications have popped up so they don't spam

let systemState = {
    level: 0,
    totalXp: 0,
    todayXp: 0,
    streak: 0,
    quests: [] // Quests are now completely empty by default!
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
    initChart();
    loadSavedProfile(); // 5. Load the Profile image & name
});

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
        // --- REMINDER CHECKER ---
        const nowStr = new Date().toISOString().slice(0, 16); // Gets current time in "YYYY-MM-DDTHH:mm" format
        systemState.quests.forEach(quest => {
            if (!quest.completed && quest.reminders) {
                quest.reminders.forEach(rem => {
                    if (rem === nowStr && !triggeredReminders.has(`${quest.id}-${rem}`)) {
                        triggeredReminders.add(`${quest.id}-${rem}`);
                        showNotification(quest);
                    }
                });
            }
        });
    }, 1000);
}

function renderQuests() {
    const homeContainer = document.getElementById('quest-container');
    const mainContainer = document.getElementById('main-quest-container');
    
    if (homeContainer) homeContainer.innerHTML = '';
    if (mainContainer) mainContainer.innerHTML = '';

    systemState.quests.forEach(quest => {
        const isDaily = quest.type === 'daily' || !quest.type;

        // --- SCHEDULING FILTER ---
        if (isDaily && quest.schedule) {
            const today = new Date();
            const dayOfWeek = today.getDay(); 
            
            // 1. Day of Week Filter (The Circles)
            // If user selected specific days, hide quest if today isn't one of them
            if (quest.schedule.type === 'weekly' && quest.schedule.days && quest.schedule.days.length > 0) {
                if (!quest.schedule.days.includes(dayOfWeek)) return;
            }
            
            // 2. Interval Logic (Daily, Weekly, Monthly)
            if (quest.schedule.interval > 1 && quest.schedule.startDate) {
                const start = new Date(quest.schedule.startDate);
                const diffTime = Math.abs(today - start);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                let cycle = 1;
                if (quest.schedule.type === 'daily') cycle = quest.schedule.interval;
                if (quest.schedule.type === 'weekly') cycle = quest.schedule.interval * 7;
                if (quest.schedule.type === 'monthly') cycle = quest.schedule.interval * 30; // Approx month
                
                if (diffDays % cycle !== 0) return;
            }
        }
        
        // Pick the correct filter based on whether this is a daily or main quest
        const activeFilter = isDaily ? filters.home : filters.quests;
        
        // Skip rendering if it doesn't match the active filter for its specific tab
        // Filter rules!
        if (activeFilter === 'due' && quest.completed) return; // Dailies: Hide finished ones today
        
        if (activeFilter === 'scheduled') {
            if (quest.completed) return; // Normal Quests: Hide finished ones
            if (!quest.dueDate) return;  // Normal Quests: Hide ones with no due date assigned
        }
        
        if (activeFilter === 'done' && !quest.completed) return; // Both: Hide unfinished ones

        // Hide completed Main Quests from the list unless the 'done' filter is selected
        if (!isDaily && quest.completed && activeFilter !== 'done') return;

        const questEl = document.createElement('div');
        questEl.className = `system-panel quest-item ${quest.completed ? 'completed' : ''}`;
        
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
        
        // Append to the correct tab based on type (Older tasks default to daily)
        
if (isDaily && homeContainer) {
    homeContainer.appendChild(questEl);
} else if (!isDaily && mainContainer) {
    mainContainer.appendChild(questEl);
}
    });
}

function deleteQuest(id) {
    if(confirm("SYSTEM WARNING: Delete this quest?")) {
        systemState.quests = systemState.quests.filter(q => q.id !== id);
        saveGameState();
        renderQuests();
    }
}

function toggleQuest(id) {
    const quest = systemState.quests.find(q => q.id === id);
    
    if (!quest.completed) {
        // Checking the quest
        quest.completed = true;
        systemState.todayXp += quest.xp;
        systemState.totalXp += quest.xp;
        
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
    document.getElementById('stat-today-xp').textContent = systemState.todayXp;
    document.getElementById('stat-total-xp').textContent = systemState.totalXp;
    
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
    document.getElementById('player-level').textContent = systemState.level;
    document.getElementById('stat-level').textContent = systemState.level;
    document.getElementById('home-rank-text').textContent = currentRank.letter;

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

// --- Chart.js Initialization ---
function initChart() {
    const ctx = document.getElementById('activityChart');
    if (ctx && window.Chart) {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['F', 'S', 'S', 'M', 'T', 'W', 'T'],
                datasets: [{
                    label: 'Activity',
                    data: [100, 100, 105, 50, 48, 55, 0],
                    borderColor: '#00e676', // Neon green
                    backgroundColor: 'rgba(0, 230, 118, 0.1)',
                    borderWidth: 3,
                    tension: 0.4, // Smooth curves
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true, max: 120, 
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8ba3c7' }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#8ba3c7' }
                    }
                }
            }
        });
    } else {
        console.warn("Chart.js not loaded. Ensure chart.min.js is in the www folder.");
    }
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

    // Switch to dashboard view
    toggleProfileMode('dashboard');
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

        systemState.quests.push({
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
    }
}

// 7. Export Data (Including literally everything)
function exportData() {
    const masterSave = {
        system: systemState,
        hunterName: localStorage.getItem('hunterName') || '',
        hunterAvatar: localStorage.getItem('hunterAvatar') || '',
        dateJoined: localStorage.getItem('dateJoined') || '',
        lastLoginDate: localStorage.getItem('lastLoginDate') || ''
    };

    const dataStr = JSON.stringify(masterSave);
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
            // Check if they logged in EXACTLY yesterday
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (lastLogin === yesterday.toDateString()) {
                // They kept the streak!
                systemState.streak += 1;
            } else {
                // They missed a day. Penalty! Reset streak.
                systemState.streak = 0;
            }
        } else {
            // First time ever opening the app!
            systemState.streak = 1;
        }

        // RESET ONLY DAILY QUESTS & TODAY'S XP
        systemState.quests.forEach(q => {
            if (q.type === 'daily' || !q.type) {
                q.completed = false;
            }
        });
        systemState.todayXp = 0;

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
    tempReminders.forEach((rem, index) => {
        list.innerHTML += `
            <div class="reminder-row">
                <button class="icon-btn remove-rem-btn" onclick="removeReminder(${index})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <input type="datetime-local" class="sci-fi-input small" value="${rem}" onchange="updateReminder(${index}, this.value)">
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

function showNotification(quest) {
    activeNotificationQuestId = quest.id;
    document.getElementById('notif-title').textContent = quest.title;
    document.getElementById('notif-desc').textContent = quest.notes || "No details provided.";
    document.getElementById('notification-toast').style.display = 'block';
    
    // Play sound when notification pops
    levelUpSound.currentTime = 0;
    levelUpSound.play().catch(e => console.log("Audio blocked"));
}

function closeNotification() {
    document.getElementById('notification-toast').style.display = 'none';
    activeNotificationQuestId = null;
}

function completeFromNotification() {
    if (activeNotificationQuestId !== null) {
        toggleQuest(activeNotificationQuestId);
        closeNotification();
    }
}