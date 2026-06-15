// ============================================
// ECHOES OF THE OBELISK - Town System
// Safe hub with NPCs, shops, and obelisk entrance
// ============================================

import * as THREE from 'three';

// Callback for NPC interaction (set by game.js to avoid circular import)
let npcInteractionCallback = null;

export function setNPCInteractionCallback(callback) {
    npcInteractionCallback = callback;
}

let townScene;
let npcs = [];
let interactableNPC = null;

// ============================================
// INITIALIZATION
// ============================================

export async function initTown() {
    townScene = new THREE.Scene();
    townScene.background = new THREE.Color(0x1a1520);
    townScene.fog = new THREE.FogExp2(0x1a1520, 0.015);
    
    createLighting();
    createGround();
    createObelisk();
    createBuildings();
    createNPCs();
    createDecorations();
    
    return Promise.resolve();
}

export function getTownScene() {
    return townScene;
}

export function disposeTown() {
    // Cleanup if needed
}

// ============================================
// LIGHTING
// ============================================

function createLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x4466aa, 0.6);
    townScene.add(ambient);
    
    // Hemisphere
    const hemi = new THREE.HemisphereLight(0x6688cc, 0x332244, 0.8);
    townScene.add(hemi);
    
    // Main directional (moonlight)
    const moon = new THREE.DirectionalLight(0x8899cc, 0.8);
    moon.position.set(-20, 30, 10);
    moon.castShadow = true;
    moon.shadow.mapSize.width = 2048;
    moon.shadow.mapSize.height = 2048;
    moon.shadow.camera.near = 0.5;
    moon.shadow.camera.far = 100;
    moon.shadow.camera.left = -30;
    moon.shadow.camera.right = 30;
    moon.shadow.camera.top = 30;
    moon.shadow.camera.bottom = -30;
    townScene.add(moon);
    
    // Obelisk glow
    const obeliskLight = new THREE.PointLight(0x00ffff, 2, 30);
    obeliskLight.position.set(0, 10, -15);
    townScene.add(obeliskLight);
}

// ============================================
// GROUND
// ============================================

function createGround() {
    // Main plaza (stone tiles)
    const plazaGeom = new THREE.PlaneGeometry(50, 50, 10, 10);
    const plazaMat = new THREE.MeshStandardMaterial({
        color: 0x3a3a4a,
        roughness: 0.9,
        metalness: 0.1
    });
    const plaza = new THREE.Mesh(plazaGeom, plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.receiveShadow = true;
    townScene.add(plaza);
    
    // Tile pattern
    const tileGeom = new THREE.PlaneGeometry(4, 4);
    const tileMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a3a,
        roughness: 0.85
    });
    
    for (let x = -20; x <= 20; x += 5) {
        for (let z = -20; z <= 20; z += 5) {
            const tile = new THREE.Mesh(tileGeom, tileMat);
            tile.rotation.x = -Math.PI / 2;
            tile.position.set(x, 0.01, z);
            tile.receiveShadow = true;
            townScene.add(tile);
        }
    }
    
    // Glowing runes on ground (path to obelisk)
    const runeMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3
    });
    
    for (let z = 0; z > -12; z -= 3) {
        const rune = new THREE.Mesh(new THREE.CircleGeometry(0.5, 6), runeMat);
        rune.rotation.x = -Math.PI / 2;
        rune.position.set(0, 0.02, z);
        townScene.add(rune);
    }
}

// ============================================
// OBELISK (Dungeon Entrance)
// ============================================

function createObelisk() {
    const group = new THREE.Group();
    
    // Base platform
    const baseGeom = new THREE.CylinderGeometry(5, 6, 1, 8);
    const baseMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a3e,
        roughness: 0.7,
        metalness: 0.3
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.5;
    base.receiveShadow = true;
    group.add(base);
    
    // Steps
    for (let i = 0; i < 3; i++) {
        const step = new THREE.Mesh(
            new THREE.CylinderGeometry(5.5 + i * 0.5, 5.5 + i * 0.5, 0.3, 8),
            baseMat
        );
        step.position.y = -0.15 * i;
        group.add(step);
    }
    
    // Main obelisk
    const obeliskGeom = new THREE.CylinderGeometry(1.5, 2, 15, 6);
    const obeliskMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.4,
        metalness: 0.6,
        emissive: 0x001122,
        emissiveIntensity: 0.3
    });
    const obelisk = new THREE.Mesh(obeliskGeom, obeliskMat);
    obelisk.position.y = 8.5;
    obelisk.castShadow = true;
    group.add(obelisk);
    
    // Glowing veins on obelisk
    const veinMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8
    });
    
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const vein = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 12, 0.1),
            veinMat
        );
        vein.position.set(
            Math.cos(angle) * 1.6,
            8,
            Math.sin(angle) * 1.6
        );
        group.add(vein);
    }
    
    // Top crystal
    const crystalGeom = new THREE.OctahedronGeometry(1, 0);
    const crystalMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.9
    });
    const crystal = new THREE.Mesh(crystalGeom, crystalMat);
    crystal.position.y = 17;
    crystal.rotation.y = Math.PI / 6;
    group.add(crystal);
    
    // Crystal glow
    const glowGeom = new THREE.SphereGeometry(2, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.2
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 17;
    group.add(glow);
    
    // Portal entrance
    const portalGeom = new THREE.RingGeometry(1.5, 2, 32);
    const portalMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    const portal = new THREE.Mesh(portalGeom, portalMat);
    portal.position.set(0, 2, 3);
    group.add(portal);
    
    // Portal inner (dark)
    const portalInner = new THREE.Mesh(
        new THREE.CircleGeometry(1.5, 32),
        new THREE.MeshBasicMaterial({ color: 0x000011 })
    );
    portalInner.position.set(0, 2, 2.99);
    group.add(portalInner);
    
    group.position.set(0, 0, -15);
    group.userData = { type: 'obelisk', interactable: true };
    townScene.add(group);
}

// ============================================
// BUILDINGS
// ============================================

function createBuildings() {
    // Scholar's Tower (left)
    createBuilding(-12, -5, 'scholar', 0x2a3a4a, "Scholar's Tower");
    
    // Apprentice's Study (left back)
    createBuilding(-15, -12, 'apprentice', 0x3a3a5a, "Apprentice's Study");
    
    // Merchant's Tent (right)
    createBuilding(12, -5, 'merchant', 0x4a3a3a, "Merchant's Stall");
    
    // Wanderer's Corner (right back)
    createBuilding(15, -12, 'wanderer', 0x3a4a3a, "Wanderer's Rest");
    
    // Keeper's Archive (back center-right)
    createBuilding(5, -20, 'keeper', 0x3a3a4a, "Keeper's Archive");
}

function createBuilding(x, z, npcType, color, name) {
    const group = new THREE.Group();
    
    // Main structure
    const buildingGeom = new THREE.BoxGeometry(6, 5, 6);
    const buildingMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.2
    });
    const building = new THREE.Mesh(buildingGeom, buildingMat);
    building.position.y = 2.5;
    building.castShadow = true;
    building.receiveShadow = true;
    group.add(building);
    
    // Roof
    const roofGeom = new THREE.ConeGeometry(4.5, 2.5, 4);
    const roofMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a3a,
        roughness: 0.9
    });
    const roof = new THREE.Mesh(roofGeom, roofMat);
    roof.position.y = 6.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    
    // Door
    const doorGeom = new THREE.BoxGeometry(1.5, 2.5, 0.2);
    const doorMat = new THREE.MeshStandardMaterial({
        color: 0x4a3020,
        roughness: 0.9
    });
    const door = new THREE.Mesh(doorGeom, doorMat);
    door.position.set(0, 1.25, 3);
    group.add(door);
    
    // Window glow
    const windowGeom = new THREE.PlaneGeometry(1, 1);
    const windowMat = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.6
    });
    const window1 = new THREE.Mesh(windowGeom, windowMat);
    window1.position.set(-1.5, 3.5, 3.01);
    group.add(window1);
    const window2 = new THREE.Mesh(windowGeom, windowMat);
    window2.position.set(1.5, 3.5, 3.01);
    group.add(window2);
    
    // Building light
    const light = new THREE.PointLight(0xffaa44, 0.5, 8);
    light.position.set(0, 3, 4);
    group.add(light);
    
    group.position.set(x, 0, z);
    group.userData = { type: 'building', npcType, name };
    townScene.add(group);
}

// ============================================
// NPCs
// ============================================

function createNPCs() {
    // Scholar - ability teacher
    createNPC('scholar', -12, -2, {
        robeColor: 0x1a237e,
        accentColor: 0x00ffff,
        name: 'The Scholar',
        dialogue: 'The obelisk holds many secrets. I can teach you to harness its power.'
    });
    
    // Apprentice - upgrade vendor
    createNPC('apprentice', -15, -9, {
        robeColor: 0x4a148c,
        accentColor: 0xbf00ff,
        name: "Scholar's Apprentice",
        dialogue: 'My master taught me to enhance the connection between mage and obelisk.'
    });
    
    // Merchant - health potions
    createNPC('merchant', 12, -2, {
        robeColor: 0x5d4037,
        accentColor: 0xffcc00,
        name: 'The Merchant',
        dialogue: 'Supplies for the depths. Reasonable prices.'
    });
    
    // Wanderer - hints and lore
    createNPC('wanderer', 15, -9, {
        robeColor: 0x37474f,
        accentColor: 0x88cc88,
        name: 'The Wanderer',
        dialogue: 'I have traveled the lower floors. Listen well, if you wish to survive.'
    });
    
    // Keeper - save/load
    createNPC('keeper', 5, -17, {
        robeColor: 0x263238,
        accentColor: 0x90a4ae,
        name: 'The Keeper',
        dialogue: 'I maintain the records. Your progress is etched in the obelisk itself.'
    });
}

function createNPC(type, x, z, config) {
    const group = new THREE.Group();
    
    // Body
    const bodyGeom = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: config.robeColor,
        roughness: 0.8
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    
    // Robe bottom
    const robeGeom = new THREE.ConeGeometry(0.5, 0.8, 8);
    const robe = new THREE.Mesh(robeGeom, bodyMat);
    robe.position.y = 0.4;
    robe.rotation.x = Math.PI;
    group.add(robe);
    
    // Head
    const headGeom = new THREE.SphereGeometry(0.25, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x8a7766 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.55;
    group.add(head);
    
    // Hood
    const hoodGeom = new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const hood = new THREE.Mesh(hoodGeom, bodyMat);
    hood.position.y = 1.6;
    hood.rotation.x = 0.3;
    group.add(hood);
    
    // Glowing accent (belt/sash)
    const accentGeom = new THREE.TorusGeometry(0.35, 0.03, 8, 16);
    const accentMat = new THREE.MeshBasicMaterial({
        color: config.accentColor,
        transparent: true,
        opacity: 0.8
    });
    const accent = new THREE.Mesh(accentGeom, accentMat);
    accent.rotation.x = Math.PI / 2;
    accent.position.y = 0.9;
    group.add(accent);
    
    // NPC light
    const light = new THREE.PointLight(config.accentColor, 0.3, 4);
    light.position.y = 1;
    group.add(light);
    
    // Interaction indicator (floating symbol)
    const indicatorGeom = new THREE.OctahedronGeometry(0.15, 0);
    const indicatorMat = new THREE.MeshBasicMaterial({
        color: config.accentColor,
        transparent: true,
        opacity: 0.8
    });
    const indicator = new THREE.Mesh(indicatorGeom, indicatorMat);
    indicator.position.y = 2.2;
    indicator.name = 'indicator';
    group.add(indicator);
    
    group.position.set(x, 0, z);
    group.userData = {
        type: 'npc',
        npcType: type,
        name: config.name,
        dialogue: config.dialogue,
        interactable: true
    };
    
    townScene.add(group);
    npcs.push(group);
}

// ============================================
// DECORATIONS
// ============================================

function createDecorations() {
    // Lamp posts
    const lampPositions = [
        [-8, 5], [8, 5],
        [-8, -5], [8, -5],
        [-5, -15], [10, -15]
    ];
    
    lampPositions.forEach(([x, z]) => {
        createLampPost(x, z);
    });
    
    // Benches
    createBench(-6, 2, 0);
    createBench(6, 2, 0);
    
    // Barrels and crates near merchant
    createBarrel(14, -3);
    createBarrel(14.5, -4);
    createCrate(13, -4);
    
    // Trees/plants around edges
    createTree(-20, 5);
    createTree(20, 5);
    createTree(-20, -10);
    createTree(20, -10);
    
    // Floating particles
    createAmbientParticles();
}

function createLampPost(x, z) {
    const group = new THREE.Group();
    
    // Post
    const postGeom = new THREE.CylinderGeometry(0.1, 0.15, 4, 8);
    const postMat = new THREE.MeshStandardMaterial({
        color: 0x3a3a4a,
        metalness: 0.7
    });
    const post = new THREE.Mesh(postGeom, postMat);
    post.position.y = 2;
    post.castShadow = true;
    group.add(post);
    
    // Lamp housing
    const housingGeom = new THREE.BoxGeometry(0.5, 0.6, 0.5);
    const housing = new THREE.Mesh(housingGeom, postMat);
    housing.position.y = 4.3;
    group.add(housing);
    
    // Glow
    const glowGeom = new THREE.SphereGeometry(0.2, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.9
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 4.3;
    group.add(glow);
    
    // Light
    const light = new THREE.PointLight(0xffaa44, 0.8, 10);
    light.position.y = 4.3;
    light.castShadow = true;
    group.add(light);
    
    group.position.set(x, 0, z);
    townScene.add(group);
}

function createBench(x, z, rotation) {
    const group = new THREE.Group();
    
    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x5d4037,
        roughness: 0.9
    });
    
    // Seat
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.6), woodMat);
    seat.position.y = 0.5;
    group.add(seat);
    
    // Back
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 0.1), woodMat);
    back.position.set(0, 0.8, -0.25);
    group.add(back);
    
    // Legs
    const legGeom = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    [[-0.8, 0.25, 0.2], [0.8, 0.25, 0.2], [-0.8, 0.25, -0.2], [0.8, 0.25, -0.2]].forEach(pos => {
        const leg = new THREE.Mesh(legGeom, woodMat);
        leg.position.set(...pos);
        group.add(leg);
    });
    
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    townScene.add(group);
}

function createBarrel(x, z) {
    const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.35, 0.8, 12),
        new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 })
    );
    barrel.position.set(x, 0.4, z);
    barrel.castShadow = true;
    townScene.add(barrel);
}

function createCrate(x, z) {
    const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.7, 0.7),
        new THREE.MeshStandardMaterial({ color: 0x6d5037, roughness: 0.9 })
    );
    crate.position.set(x, 0.35, z);
    crate.rotation.y = Math.random();
    crate.castShadow = true;
    townScene.add(crate);
}

function createTree(x, z) {
    const group = new THREE.Group();
    
    // Trunk
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 })
    );
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    group.add(trunk);
    
    // Foliage (mystical purple-blue)
    const foliageGeom = new THREE.SphereGeometry(2, 8, 8);
    const foliageMat = new THREE.MeshStandardMaterial({
        color: 0x2a3a4a,
        roughness: 0.8,
        emissive: 0x112233,
        emissiveIntensity: 0.2
    });
    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.y = 4;
    foliage.castShadow = true;
    group.add(foliage);
    
    group.position.set(x, 0, z);
    townScene.add(group);
}

function createAmbientParticles() {
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 1] = Math.random() * 10;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0x88ccff,
        size: 0.1,
        transparent: true,
        opacity: 0.6
    });
    
    const particles = new THREE.Points(geometry, material);
    particles.name = 'ambientParticles';
    townScene.add(particles);
}

// ============================================
// NPC INTERACTION
// ============================================

export function checkNPCInteraction(playerPosition) {
    interactableNPC = null;
    
    for (const npc of npcs) {
        const dist = playerPosition.distanceTo(npc.position);
        
        // Update indicator visibility
        const indicator = npc.getObjectByName('indicator');
        if (indicator) {
            indicator.visible = dist < 4;
            indicator.rotation.y += 0.02;
            indicator.position.y = 2.2 + Math.sin(Date.now() * 0.003) * 0.1;
        }
        
        if (dist < 2.5) {
            interactableNPC = npc;
        }
    }
    
    // Also check obelisk interaction
    const obeliskDist = Math.sqrt(
        Math.pow(playerPosition.x, 2) +
        Math.pow(playerPosition.z + 12, 2)
    );
    
    // Update interact button visibility
    const interactBtn = document.getElementById('btn-interact');
    const enterBtn = document.getElementById('btn-enter-dungeon');
    
    if (interactBtn && enterBtn) {
        if (interactableNPC) {
            interactBtn.classList.remove('hidden');
            interactBtn.textContent = `Talk to ${interactableNPC.userData.name}`;
            enterBtn.classList.add('hidden');
        } else if (obeliskDist < 5) {
            interactBtn.classList.add('hidden');
            enterBtn.classList.remove('hidden');
        } else {
            interactBtn.classList.add('hidden');
            enterBtn.classList.add('hidden');
        }
    }
    
    return interactableNPC;
}

export function triggerNPCInteraction() {
    if (interactableNPC && npcInteractionCallback) {
        npcInteractionCallback(interactableNPC.userData.npcType);
    }
}

export function getInteractableNPC() {
    return interactableNPC;
}

export function showNPCDialogue(npc) {
    // This would show floating dialogue above NPC
    // Implementation depends on UI system
}
