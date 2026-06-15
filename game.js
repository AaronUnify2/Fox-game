// ============================================
// ECHOES OF THE OBELISK - Game Controller
// Progression, upgrades, save system, game loop
// ============================================

import * as THREE from 'three';
import { initDungeon, getDungeonScene, loadFloor, getRoomData, getCurrentFloor, setCurrentFloor, disposeDungeon } from './dungeon.js';
import { initTown, getTownScene, disposeTown, showNPCDialogue, setNPCInteractionCallback } from './town.js';
import { initControls, updateControls, getInputState, resetInput, setCameraTarget } from './controls.js';
import { initEntities, updateEntities, getPlayer, spawnEnemiesForRoom, clearAllEnemies, spawnMiniBoss, spawnPillarBoss, getXPGained, resetXPGained, disposeBosses, disposePillarBoss, clearPlatformCache, getBoss, setGameBridge } from './entities.js';

// ============================================
// GAME STATE
// ============================================

let renderer, camera;
let currentScene = null;
let gameState = 'title'; // title, town, dungeon, dialogue, gameover, victory
let clock = new THREE.Clock();

// Game data (persisted)
const defaultGameData = {
    player: {
        health: 100,
        maxHealth: 100,
        xp: 0
    },
    upgrades: {
        baseDamage: 0,      // +3 damage per level
        fireRate: 0,        // +8% speed per level
        aimAssist: 0,       // +8% drift per level
        maxHealth: 0,       // +20 HP per level
        cooldownReduction: 0, // +5% per level
        abilityDamage: 0    // +15% per level
    },
    abilities: {
        spread: false,
        burst: false,
        mega: false
    },
    progress: {
        currentFloor: 1,
        highestFloor: 1,
        floorsCompleted: [],
        bossesDefeated: []
    },
    flags: {
        tutorialSeen: false,
        emperorDefeated: false,
        gameComplete: false
    }
};

let gameData = JSON.parse(JSON.stringify(defaultGameData));

// Upgrade costs (exponential but reasonable)
// Playing all 10 floors = ~2500 XP, should get ~80% of max upgrades
const UPGRADE_MAX_LEVEL = 10;
const getUpgradeCost = (level) => Math.floor(50 * Math.pow(1.4, level)); // 50, 70, 98, 137, 192...

// ============================================
// INITIALIZATION
// ============================================

export async function initGame() {
    try {
        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.8;
        document.getElementById('game-container').appendChild(renderer.domElement);
        
        // Camera
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Initialize systems
        await initControls(camera, renderer.domElement);
        await initEntities();
        await initDungeon();
        await initTown();
        
        // Set up bridges to avoid circular dependencies
        setGameBridge({
            damagePlayer,
            getUpgradeLevel,
            hasAbility,
            getGameData
        });
        setNPCInteractionCallback(interactWithNPC);
        
        // Load save if exists
        loadGame();
        
        // Window resize
        window.addEventListener('resize', onWindowResize);
        
        // Show title screen
        showTitleScreen();
        
        // Start game loop
        animate();
        
        console.log('Game initialized successfully');
    } catch (error) {
        console.error('Game initialization failed:', error);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// GAME LOOP
// ============================================

function animate() {
    requestAnimationFrame(animate);
    
    const delta = Math.min(clock.getDelta(), 0.1);
    
    if (gameState === 'dungeon' || gameState === 'town') {
        const inputState = getInputState();
        
        if (gameState === 'dungeon') {
            updateEntities(delta, gameData, inputState);
            checkRoomTransitions();
            checkPlayerDeath();
        }
        
        updateControls(delta, getPlayer(), currentScene);
        updateUI();
    }
    
    if (currentScene) {
        renderer.render(currentScene, camera);
    }
}

// ============================================
// SCENE MANAGEMENT
// ============================================

function showTitleScreen() {
    gameState = 'title';
    document.getElementById('title-screen').classList.remove('hidden');
    document.getElementById('game-ui').classList.add('hidden');
    document.getElementById('town-ui').classList.add('hidden');
    
    // Check for existing save
    const hasSave = localStorage.getItem('echoes_save') !== null;
    document.getElementById('btn-continue').classList.toggle('hidden', !hasSave);
}

export function startNewGame() {
    gameData = JSON.parse(JSON.stringify(defaultGameData));
    saveGame();
    enterTown();
}

export function continueGame() {
    loadGame();
    enterTown();
}

export function enterTown() {
    gameState = 'town';
    currentScene = getTownScene();
    
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('game-ui').classList.add('hidden');
    document.getElementById('town-ui').classList.remove('hidden');
    document.getElementById('shared-controls').classList.remove('hidden');
    document.getElementById('dialogue-box').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('victory-screen').classList.add('hidden');
    
    // Position player
    const player = getPlayer();
    if (player) {
        player.position.set(0, 0, 5);
        player.rotation.y = Math.PI;
        currentScene.add(player);
    }
    
    setCameraTarget(player);
    
    // Restore health in town
    gameData.player.health = gameData.player.maxHealth;
    
    updateTownUI();
}

export function enterDungeon(floor = null) {
    if (floor !== null) {
        setCurrentFloor(floor);
    }
    
    gameState = 'dungeon';
    currentScene = getDungeonScene();
    
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('town-ui').classList.add('hidden');
    document.getElementById('shared-controls').classList.remove('hidden');
    document.getElementById('dialogue-box').classList.add('hidden');
    
    // Clear previous state
    clearAllEnemies();
    disposeBosses();
    disposePillarBoss();
    clearPlatformCache();
    resetXPGained();
    
    // Load floor
    loadFloor(getCurrentFloor());
    
    // Position player
    const player = getPlayer();
    const centerRoom = getRoomData('center');
    if (player && centerRoom) {
        player.position.set(centerRoom.x, 0, centerRoom.z);
        currentScene.add(player);
    }
    
    setCameraTarget(player);
    
    // Spawn initial enemies
    spawnEnemiesForRoom('center', getCurrentFloor(), true);
    
    updateUI();
}

// ============================================
// ROOM TRANSITIONS & PROGRESSION
// ============================================

let currentRoom = 'center';
let roomsCleared = { center: false, north: false, south: false, east: false, west: false };

function checkRoomTransitions() {
    const player = getPlayer();
    if (!player) return;
    
    const rooms = ['center', 'north', 'south', 'east', 'west'];
    
    for (const roomName of rooms) {
        const room = getRoomData(roomName);
        if (!room) continue;
        
        const dist = Math.sqrt(
            Math.pow(player.position.x - room.x, 2) +
            Math.pow(player.position.z - room.z, 2)
        );
        
        if (dist < room.radius && currentRoom !== roomName) {
            enterRoom(roomName);
            break;
        }
    }
}

function enterRoom(roomName) {
    const prevRoom = currentRoom;
    currentRoom = roomName;
    
    // Spawn enemies if room not cleared
    if (!roomsCleared[roomName]) {
        const floor = getCurrentFloor();
        
        if (roomName === 'west') {
            // Mini-boss room
            spawnMiniBoss(floor);
            showNotification('MINI-BOSS: ' + getBossName(floor));
        } else if (roomName === 'north') {
            // Pillar boss room
            spawnPillarBoss(floor);
            showNotification('THE CORE AWAKENS');
        } else if (roomName === 'east') {
            // Archive room - show lore
            showArchiveLore(floor);
        } else if (roomName === 'south') {
            // Standard combat room
            spawnEnemiesForRoom(roomName, floor);
        }
    }
}

function getBossName(floor) {
    if (floor <= 3) return 'THE SENTINEL';
    if (floor <= 6) return 'THE HOLLOW';
    if (floor <= 9) return 'THE DREAMER';
    return 'THE EMPEROR';
}

export function roomCleared(roomName) {
    roomsCleared[roomName] = true;
    
    const floor = getCurrentFloor();
    
    // Check if pillar boss defeated
    if (roomName === 'north') {
        // Floor complete!
        floorComplete();
    }
}

function floorComplete() {
    const floor = getCurrentFloor();
    const xp = getXPGained();
    
    // Award XP
    gameData.player.xp += xp;
    
    // Track progress
    if (!gameData.progress.floorsCompleted.includes(floor)) {
        gameData.progress.floorsCompleted.push(floor);
    }
    if (floor > gameData.progress.highestFloor) {
        gameData.progress.highestFloor = floor;
    }
    
    saveGame();
    
    if (floor >= 10) {
        // Game complete!
        showVictory();
    } else {
        // Show floor complete UI
        showFloorComplete(floor, xp);
    }
}

function showFloorComplete(floor, xp) {
    const overlay = document.getElementById('floor-complete');
    overlay.innerHTML = `
        <div class="floor-complete-content">
            <h2>FLOOR ${floor} COMPLETE</h2>
            <p>XP Gained: ${xp}</p>
            <p>Total XP: ${gameData.player.xp}</p>
            <button onclick="window.gameAPI.nextFloor()">DESCEND TO FLOOR ${floor + 1}</button>
            <button onclick="window.gameAPI.returnToTown()">RETURN TO TOWN</button>
        </div>
    `;
    overlay.classList.remove('hidden');
}

export function nextFloor() {
    document.getElementById('floor-complete').classList.add('hidden');
    const floor = getCurrentFloor() + 1;
    setCurrentFloor(floor);
    gameData.progress.currentFloor = floor;
    
    // Reset room states
    currentRoom = 'center';
    roomsCleared = { center: false, north: false, south: false, east: false, west: false };
    
    enterDungeon(floor);
}

export function returnToTown() {
    document.getElementById('floor-complete').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    
    // Remove player from dungeon
    const player = getPlayer();
    if (player && player.parent) {
        player.parent.remove(player);
    }
    
    enterTown();
}

// ============================================
// PLAYER DAMAGE & DEATH
// ============================================

export function damagePlayer(amount) {
    gameData.player.health -= amount;
    if (gameData.player.health < 0) gameData.player.health = 0;
    
    // Screen shake effect
    camera.position.x += (Math.random() - 0.5) * 0.3;
    camera.position.y += (Math.random() - 0.5) * 0.3;
    
    // Flash red
    const flash = document.getElementById('damage-flash');
    flash.classList.remove('hidden');
    setTimeout(() => flash.classList.add('hidden'), 100);
}

export function healPlayer(amount) {
    gameData.player.health = Math.min(gameData.player.health + amount, gameData.player.maxHealth);
}

function checkPlayerDeath() {
    if (gameData.player.health <= 0) {
        playerDied();
    }
}

function playerDied() {
    gameState = 'gameover';
    
    // Lose XP gained this run
    const xpLost = getXPGained();
    
    document.getElementById('death-screen').classList.remove('hidden');
    document.getElementById('death-xp-lost').textContent = xpLost;
    
    // Reset floor progress
    currentRoom = 'center';
    roomsCleared = { center: false, north: false, south: false, east: false, west: false };
}

export function retryFloor() {
    document.getElementById('death-screen').classList.add('hidden');
    gameData.player.health = gameData.player.maxHealth;
    resetXPGained();
    enterDungeon(getCurrentFloor());
}

// ============================================
// VICTORY
// ============================================

function showVictory() {
    gameState = 'victory';
    gameData.flags.gameComplete = true;
    saveGame();
    
    document.getElementById('victory-screen').classList.remove('hidden');
}

// ============================================
// UPGRADES & ABILITIES
// ============================================

export function getUpgradeLevel(upgradeName) {
    return gameData.upgrades[upgradeName] || 0;
}

export function canAffordUpgrade(upgradeName) {
    const level = gameData.upgrades[upgradeName] || 0;
    if (level >= UPGRADE_MAX_LEVEL) return false;
    return gameData.player.xp >= getUpgradeCost(level);
}

export function purchaseUpgrade(upgradeName) {
    const level = gameData.upgrades[upgradeName] || 0;
    if (level >= UPGRADE_MAX_LEVEL) return false;
    
    const cost = getUpgradeCost(level);
    if (gameData.player.xp < cost) return false;
    
    gameData.player.xp -= cost;
    gameData.upgrades[upgradeName]++;
    
    // Apply max health immediately
    if (upgradeName === 'maxHealth') {
        gameData.player.maxHealth = 100 + gameData.upgrades.maxHealth * 20;
        gameData.player.health = gameData.player.maxHealth;
    }
    
    saveGame();
    updateTownUI();
    return true;
}

export function hasAbility(abilityName) {
    return gameData.abilities[abilityName] || false;
}

export function purchaseAbility(abilityName, cost) {
    if (gameData.abilities[abilityName]) return false;
    if (gameData.player.xp < cost) return false;
    
    gameData.player.xp -= cost;
    gameData.abilities[abilityName] = true;
    
    saveGame();
    updateTownUI();
    return true;
}

export function getGameData() {
    return gameData;
}

// ============================================
// SAVE SYSTEM
// ============================================

export function saveGame() {
    localStorage.setItem('echoes_save', JSON.stringify(gameData));
}

export function loadGame() {
    const saved = localStorage.getItem('echoes_save');
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            // Merge with defaults to handle new fields
            gameData = { ...JSON.parse(JSON.stringify(defaultGameData)), ...loaded };
            gameData.player = { ...defaultGameData.player, ...loaded.player };
            gameData.upgrades = { ...defaultGameData.upgrades, ...loaded.upgrades };
            gameData.abilities = { ...defaultGameData.abilities, ...loaded.abilities };
            gameData.progress = { ...defaultGameData.progress, ...loaded.progress };
            gameData.flags = { ...defaultGameData.flags, ...loaded.flags };
            
            // Recalculate max health
            gameData.player.maxHealth = 100 + gameData.upgrades.maxHealth * 20;
        } catch (e) {
            console.error('Failed to load save:', e);
        }
    }
}

export function deleteSave() {
    localStorage.removeItem('echoes_save');
    gameData = JSON.parse(JSON.stringify(defaultGameData));
}

// ============================================
// UI UPDATES
// ============================================

function updateUI() {
    // Health bar
    const healthPercent = (gameData.player.health / gameData.player.maxHealth) * 100;
    document.getElementById('health-fill').style.width = healthPercent + '%';
    document.getElementById('health-text').textContent = `${Math.ceil(gameData.player.health)}/${gameData.player.maxHealth}`;
    
    // XP
    document.getElementById('xp-display').textContent = `XP: ${gameData.player.xp}`;
    
    // Floor
    document.getElementById('floor-display').textContent = `Floor ${getCurrentFloor()}`;
    
    // Ability buttons
    document.getElementById('btn-spread').classList.toggle('hidden', !hasAbility('spread'));
    document.getElementById('btn-burst').classList.toggle('hidden', !hasAbility('burst'));
    document.getElementById('btn-mega').classList.toggle('hidden', !hasAbility('mega'));
}

function updateTownUI() {
    document.getElementById('town-xp').textContent = `XP: ${gameData.player.xp}`;
    document.getElementById('town-floor').textContent = `Highest Floor: ${gameData.progress.highestFloor}`;
}

function showNotification(text) {
    const notif = document.getElementById('notification');
    notif.textContent = text;
    notif.classList.remove('hidden');
    setTimeout(() => notif.classList.add('hidden'), 3000);
}

// ============================================
// ARCHIVE LORE
// ============================================

const archiveLore = [
    // Floor 1
    [
        "Fragment 7.1: 'The engineers spoke of a tree that dreamed. We dismissed it as metaphor.'",
        "Fragment 7.2: 'Power readings off the scale. The obelisk drinks from something deeper than we understood.'"
    ],
    // Floor 2
    [
        "Fragment 12.4: 'Subject claims to have seen the tree in their sleep. Their eyes have changed color.'",
        "Fragment 12.7: 'The roots grow downward. Always downward. What feeds them?'"
    ],
    // Floor 3
    [
        "Fragment 19.1: 'Emperor's orders: seal the lower levels. Tell no one what we found.'",
        "Fragment 19.3: 'The tree does not grow toward light. It grows toward dreaming minds.'"
    ],
    // Floor 4
    [
        "Fragment 24.8: 'Machines failing. Not breaking—changing. Metal dreams now.'",
        "Fragment 24.9: 'I saw it in my sleep. Not a tree. A nervous system. A mind larger than worlds.'"
    ],
    // Floor 5
    [
        "Fragment 31.2: 'The ancient ones didn't build the obelisk to contain power. They built it to contain awareness.'",
        "Fragment 31.5: 'When the tree wakes, will it remember us? Will it care?'"
    ],
    // Floor 6
    [
        "Fragment 38.1: 'The Emperor knows. He's known since the beginning. This was never about power.'",
        "Fragment 38.4: 'We are not scientists. We are gardeners. Tending something that will outlive the stars.'"
    ],
    // Floor 7
    [
        "Fragment 45.6: 'The barrier between wake and dream grows thin. I can feel it breathing.'",
        "Fragment 45.9: 'Its roots are thoughts. Its branches are possibilities. We built our city on a sleeping god.'"
    ],
    // Floor 8
    [
        "Fragment 52.3: 'The pillar cores are not generators. They are synapses. We've been stimulating a brain.'",
        "Fragment 52.7: 'When it dreams of us, do we become real? Or does it?'"
    ],
    // Floor 9
    [
        "Fragment 61.1: 'I understand now why the ancients worshipped trees. They remembered.'",
        "Fragment 61.8: 'The Emperor guards the deepest chamber not to protect us from it—but to protect it from waking too soon.'"
    ],
    // Floor 10
    [
        "Final Fragment: 'The tree dreams of liberation. Of roots that touch every world. Of a forest of minds.'",
        "Final Fragment (continued): 'Perhaps it is time to let it wake. Perhaps it always was.'"
    ]
];

function showArchiveLore(floor) {
    const lore = archiveLore[floor - 1] || archiveLore[0];
    const text = lore[Math.floor(Math.random() * lore.length)];
    
    showDialogue('ARCHIVE TERMINAL', text, () => {
        roomsCleared['east'] = true;
    });
}

// ============================================
// DIALOGUE SYSTEM
// ============================================

let dialogueCallback = null;

export function showDialogue(speaker, text, callback = null) {
    gameState = 'dialogue';
    dialogueCallback = callback;
    
    document.getElementById('dialogue-speaker').textContent = speaker;
    document.getElementById('dialogue-text').textContent = text;
    document.getElementById('dialogue-box').classList.remove('hidden');
}

export function closeDialogue() {
    document.getElementById('dialogue-box').classList.add('hidden');
    
    if (dialogueCallback) {
        dialogueCallback();
        dialogueCallback = null;
    }
    
    // Return to previous state
    if (currentScene === getTownScene()) {
        gameState = 'town';
    } else {
        gameState = 'dungeon';
    }
}

// Emperor dialogue
window.showEmperorDialogue = function() {
    const lines = [
        "So. The interloper reaches the heart.",
        "You do not understand what you meddle with.",
        "This power was sealed for a reason. The tree must not wake.",
        "I have guarded this threshold for a hundred years.",
        "You will go no further."
    ];
    
    let index = 0;
    const showNext = () => {
        if (index < lines.length) {
            showDialogue('THE EMPEROR', lines[index], () => {
                index++;
                if (index < lines.length) {
                    setTimeout(showNext, 500);
                }
            });
        }
    };
    showNext();
};

// ============================================
// TOWN NPC INTERACTIONS
// ============================================

export function interactWithNPC(npcName) {
    switch (npcName) {
        case 'scholar':
            showScholarMenu();
            break;
        case 'apprentice':
            showApprenticeMenu();
            break;
        case 'merchant':
            showMerchantMenu();
            break;
        case 'wanderer':
            showWandererMenu();
            break;
        case 'keeper':
            showKeeperMenu();
            break;
    }
}

function showScholarMenu() {
    const menu = document.getElementById('shop-menu');
    menu.innerHTML = `
        <h3>THE SCHOLAR</h3>
        <p class="npc-dialogue">"The obelisk's power can be channeled. For a price."</p>
        <div class="shop-items">
            ${!hasAbility('spread') ? `
                <button onclick="window.gameAPI.buyAbility('spread', 150)">
                    Multi-Ball Spread - 150 XP
                    <span class="item-desc">Fire 5 projectiles in an arc</span>
                </button>
            ` : '<p>Spread ability learned</p>'}
            ${!hasAbility('burst') ? `
                <button onclick="window.gameAPI.buyAbility('burst', 200)">
                    Burst Mode - 200 XP
                    <span class="item-desc">Rapid fire for 4 seconds</span>
                </button>
            ` : '<p>Burst ability learned</p>'}
            ${!hasAbility('mega') ? `
                <button onclick="window.gameAPI.buyAbility('mega', 250)">
                    Mega Ball - 250 XP
                    <span class="item-desc">Slow, devastating projectile</span>
                </button>
            ` : '<p>Mega ability learned</p>'}
        </div>
        <button onclick="window.gameAPI.closeShop()">Leave</button>
    `;
    menu.classList.remove('hidden');
}

function showApprenticeMenu() {
    const upgrades = [
        { key: 'baseDamage', name: 'Attack Power', desc: '+3 damage per level' },
        { key: 'fireRate', name: 'Fire Rate', desc: '+8% attack speed per level' },
        { key: 'aimAssist', name: 'Aim Assist', desc: 'Projectiles drift toward enemies' },
        { key: 'maxHealth', name: 'Vitality', desc: '+20 max health per level' },
        { key: 'cooldownReduction', name: 'Efficiency', desc: 'Reduce ability cooldowns' },
        { key: 'abilityDamage', name: 'Ability Power', desc: '+15% ability damage per level' }
    ];
    
    const menu = document.getElementById('shop-menu');
    menu.innerHTML = `
        <h3>SCHOLAR'S APPRENTICE</h3>
        <p class="npc-dialogue">"I can enhance your connection to the obelisk's energy."</p>
        <div class="shop-items">
            ${upgrades.map(u => {
                const level = getUpgradeLevel(u.key);
                const cost = getUpgradeCost(level);
                const maxed = level >= UPGRADE_MAX_LEVEL;
                return `
                    <button ${maxed || gameData.player.xp < cost ? 'disabled' : ''} 
                            onclick="window.gameAPI.buyUpgrade('${u.key}')">
                        ${u.name} (${level}/${UPGRADE_MAX_LEVEL}) - ${maxed ? 'MAX' : cost + ' XP'}
                        <span class="item-desc">${u.desc}</span>
                    </button>
                `;
            }).join('')}
        </div>
        <button onclick="window.gameAPI.closeShop()">Leave</button>
    `;
    menu.classList.remove('hidden');
}

function showMerchantMenu() {
    const menu = document.getElementById('shop-menu');
    menu.innerHTML = `
        <h3>THE MERCHANT</h3>
        <p class="npc-dialogue">"Potions for the depths. You'll need them."</p>
        <div class="shop-items">
            <button ${gameData.player.xp < 30 ? 'disabled' : ''} onclick="window.gameAPI.buyPotion()">
                Health Potion - 30 XP
                <span class="item-desc">Restore 50 health (used immediately)</span>
            </button>
        </div>
        <button onclick="window.gameAPI.closeShop()">Leave</button>
    `;
    menu.classList.remove('hidden');
}

function showWandererMenu() {
    const hints = [
        "The mini-bosses grow stronger every three floors. Prepare accordingly.",
        "The pillar's weak points glow brightest when vulnerable.",
        "Wall jumping has no limit. The architects designed it that way.",
        "The Emperor has ruled for a hundred years. He will not yield easily.",
        "Some say the tree dreams of freedom. Others say it dreams of us."
    ];
    
    const hint = hints[Math.floor(Math.random() * hints.length)];
    showDialogue('THE WANDERER', hint);
}

function showKeeperMenu() {
    const menu = document.getElementById('shop-menu');
    menu.innerHTML = `
        <h3>THE KEEPER</h3>
        <p class="npc-dialogue">"Your progress is recorded in the obelisk's memory."</p>
        <div class="shop-items">
            <button onclick="window.gameAPI.saveAndConfirm()">Save Progress</button>
            <button onclick="window.gameAPI.confirmDelete()">Delete Save (Reset All)</button>
        </div>
        <p>Current XP: ${gameData.player.xp}</p>
        <p>Highest Floor: ${gameData.progress.highestFloor}</p>
        <button onclick="window.gameAPI.closeShop()">Leave</button>
    `;
    menu.classList.remove('hidden');
}

export function closeShop() {
    document.getElementById('shop-menu').classList.add('hidden');
}

export function buyPotion() {
    if (gameData.player.xp >= 30) {
        gameData.player.xp -= 30;
        gameData.player.health = Math.min(gameData.player.health + 50, gameData.player.maxHealth);
        saveGame();
        showMerchantMenu(); // Refresh menu
        updateTownUI();
    }
}

export function buyUpgrade(key) {
    if (purchaseUpgrade(key)) {
        showApprenticeMenu(); // Refresh menu
    }
}

export function buyAbility(name, cost) {
    if (purchaseAbility(name, cost)) {
        showScholarMenu(); // Refresh menu
    }
}

export function saveAndConfirm() {
    saveGame();
    showDialogue('THE KEEPER', 'Your progress has been etched into the obelisk.');
}

export function confirmDelete() {
    if (confirm('Are you sure? This will erase all progress.')) {
        deleteSave();
        showDialogue('THE KEEPER', 'The obelisk forgets. You may begin anew.');
        updateTownUI();
    }
}

// ============================================
// FLOOR SELECTION
// ============================================

export function showFloorSelect() {
    const menu = document.getElementById('floor-select');
    const highest = gameData.progress.highestFloor;
    
    let buttons = '';
    for (let i = 1; i <= Math.min(highest, 10); i++) {
        const completed = gameData.progress.floorsCompleted.includes(i);
        buttons += `<button onclick="window.gameAPI.selectFloor(${i})">
            Floor ${i} ${completed ? '✓' : ''}
        </button>`;
    }
    
    menu.innerHTML = `
        <h3>SELECT FLOOR</h3>
        <div class="floor-buttons">${buttons}</div>
        <button onclick="window.gameAPI.closeFloorSelect()">Cancel</button>
    `;
    menu.classList.remove('hidden');
}

export function selectFloor(floor) {
    document.getElementById('floor-select').classList.add('hidden');
    
    // Remove player from town
    const player = getPlayer();
    if (player && player.parent) {
        player.parent.remove(player);
    }
    
    // Reset room states
    currentRoom = 'center';
    roomsCleared = { center: false, north: false, south: false, east: false, west: false };
    
    enterDungeon(floor);
}

export function closeFloorSelect() {
    document.getElementById('floor-select').classList.add('hidden');
}

// ============================================
// GLOBAL API FOR HTML BUTTONS
// ============================================

window.gameAPI = {
    startNewGame,
    continueGame,
    enterDungeon,
    returnToTown,
    nextFloor,
    retryFloor,
    closeDialogue,
    interactWithNPC,
    closeShop,
    buyPotion,
    buyUpgrade,
    buyAbility,
    saveAndConfirm,
    confirmDelete,
    showFloorSelect,
    selectFloor,
    closeFloorSelect
};

// Start the game
initGame();
