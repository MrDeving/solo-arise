// --- State Management ---
// We define how much XP it takes to gain 1 Level. (You can change this later!)
const XP_PER_LEVEL = 500;

let systemState = {
    level: 0,
    totalXp: 0,
    todayXp: 0,
    streak: 0,
    quests: [] // Quests are now completely empty by default!
};

// Initialize Audio (Ensure saved.mp3 is in the www folder)
const levelUpSound = new Audio('saved.mp3');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initDates();
    loadGameState();    // 1. Load the Backpack
    checkDailyReset();  // 2. Check if a new day started (Resets quests/streak if needed)
    renderQuests();     // 3. Draw the quests
    updateStats();      // 4. Update the math (Level, Rank, Streak, XP)
    initChart();
    loadSavedProfile(); // 5. Load the Profile image & name
});

// --- UI Functions ---
function initDates() {
    const now = new Date();
    const optionsDate = { month: 'long', day: 'numeric', year: 'numeric' };
    const optionsDay = { weekday: 'long' };
    
    document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', optionsDate).toUpperCase();
    document.getElementById('current-day').textContent = now.toLocaleDateString('en-US', optionsDay).toUpperCase();
    
    // Simple Timer Mock (Counts down to midnight)
    setInterval(() => {
        const d = new Date();
        const h = 23 - d.getHours();
        const m = 59 - d.getMinutes();
        const s = 59 - d.getSeconds();
        document.getElementById('reset-timer').textContent = 
            `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }, 1000);
}

function renderQuests() {
    const container = document.getElementById('quest-container');
    container.innerHTML = '';

    systemState.quests.forEach(quest => {
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
                <div class="quest-title" style="color: var(--neon-blue);">${quest.title}</div>
                ${quest.notes ? `<div class="quest-notes">${quest.notes}</div>` : ''}
            </div>
            
            <!-- Rewards & Colored Difficulty -->
            <div class="quest-rewards">
                <div class="quest-xp">+${quest.xp} XP</div>
                <div style="color: ${diffColor}; font-size: 10px; font-weight: 800; margin-top: 4px;">${diffLabel}</div>
            </div>
        `;
        container.appendChild(questEl);
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
        quest.completed = true;
        systemState.todayXp += quest.xp;
        systemState.totalXp += quest.xp;
        
        // Play System Sound
        levelUpSound.currentTime = 0;
        levelUpSound.play().catch(e => console.log("Audio play blocked by browser policy until user interaction."));
        
        updateStats();
        renderQuests();
        saveGameState(); // Saves to the Magical Backpack instantly!
    }
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
}

// --- Navigation ---
function switchTab(tabId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    // Show target view
    document.getElementById(`view-${tabId}`).classList.add('active');
    
    // Update Nav UI
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    event.currentTarget.classList.add('active');
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
    }

    if (savedAvatar) {
        const bgUrl = `url(${savedAvatar})`;
        document.getElementById('home-avatar').style.backgroundImage = bgUrl;
        const dashAv = document.getElementById('dash-avatar');
        if(dashAv) dashAv.style.backgroundImage = bgUrl;
        const profAv = document.getElementById('profile-avatar-preview');
        if(profAv) profAv.style.backgroundImage = bgUrl;
    }

    if (dateJoined) {
        const dashDate = document.getElementById('dash-date-joined');
        if(dashDate) dashDate.textContent = dateJoined;
    }
}

// 6. Check if user is New or Returning when app opens
function loadSavedProfile() {
    const savedName = localStorage.getItem('hunterName');
    
    // Create Date Joined if it doesn't exist
    if (!localStorage.getItem('dateJoined')) {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        localStorage.setItem('dateJoined', new Date().toLocaleDateString('en-US', options));
    }
    
    if (savedName) {
        applySavedDataToUI();
        toggleProfileMode('dashboard');
    } else {
        toggleProfileMode('edit');
    }
}

// ==========================================
// --- ADD / EDIT QUEST SYSTEM ---
// ==========================================
let currentDifficulty = 'easy'; 
let editingQuestId = null; // null means "Create", a number means "Edit"

// ==========================================
// --- ADD / EDIT QUEST SYSTEM ---
// ==========================================

function openAddQuestModal() {
    editingQuestId = null; 
    document.getElementById('modal-title').textContent = 'CREATE QUEST';
    document.getElementById('new-quest-title').value = '';
    document.getElementById('new-quest-notes').value = '';
    document.getElementById('modal-delete-btn').style.display = 'none'; // Hide delete button for NEW quests
    selectDifficulty('easy');
    document.getElementById('add-quest-modal').style.display = 'flex';
}

function openEditQuestModal(id) {
    editingQuestId = id; 
    const quest = systemState.quests.find(q => q.id === id);
    
    document.getElementById('modal-title').textContent = 'EDIT QUEST';
    document.getElementById('new-quest-title').value = quest.title;
    document.getElementById('new-quest-notes').value = quest.notes || '';
    document.getElementById('modal-delete-btn').style.display = 'block'; // Show delete button for EXISTING quests
    selectDifficulty(quest.difficulty || 'easy');
    
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
    
    // Dynamic XP Calculation
    let xpPercent = 0.04; 
    if (currentDifficulty === 'trivial') xpPercent = 0.01;
    if (currentDifficulty === 'medium') xpPercent = 0.07;
    if (currentDifficulty === 'hard') xpPercent = 0.10;
    const xpReward = Math.max(1, Math.round(XP_PER_LEVEL * xpPercent));
    
    if (editingQuestId !== null) {
        // We are editing an existing quest
        const quest = systemState.quests.find(q => q.id === editingQuestId);
        quest.title = title;
        quest.notes = notes;
        quest.xp = xpReward;
        quest.difficulty = currentDifficulty;
    } else {
        // We are adding a new quest
        const newId = systemState.quests.length > 0 ? Math.max(...systemState.quests.map(q => q.id)) + 1 : 1;
        systemState.quests.push({
            id: newId,
            title: title,
            notes: notes,
            xp: xpReward,
            difficulty: currentDifficulty,
            completed: false
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

        // RESET DAILY QUESTS & TODAY'S XP
        systemState.quests.forEach(q => q.completed = false);
        systemState.todayXp = 0;

        // Save the new "last login" date to the backpack
        localStorage.setItem('lastLoginDate', today);
        
        // Save the reset quests and new streak to the backpack
        saveGameState();
    }
}