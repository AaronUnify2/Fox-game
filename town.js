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

// Obelisk (dungeon entrance) — placed in the NE corner so the town has room.
const OBELISK_POS = { x: 17, z: -18 };

// ============================================
// INITIALIZATION
// ============================================

export async function initTown() {
    townScene = new THREE.Scene();
    townScene.background = makeNightSkyGradient();
    townScene.fog = new THREE.FogExp2(0x0a0e1f, 0.012);
    
    createLighting();
    createNightSky();
    createGround();
    createObelisk();
    createBuildings();
    createNPCs();
    createDecorations();
    createPerimeterTrees();
    
    return Promise.resolve();
}

export function getTownScene() {
    return townScene;
}

export function disposeTown() {
    // Cleanup if needed
}

// ============================================
// NIGHT SKY
// ============================================

function makeNightSkyGradient() {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#05060f');  // zenith
    g.addColorStop(0.55, '#0a1024');
    g.addColorStop(1.0, '#1a2342');  // horizon glow
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(canvas);
}

function createNightSky() {
    // Star field on a large dome (ignores fog so it stays crisp)
    const count = 500;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random());       // upper hemisphere
        const r = 90;
        pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.cos(phi) + 6;     // lift above the horizon
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xbcd0ff, size: 0.7, sizeAttenuation: true,
        transparent: true, opacity: 0.9, fog: false
    });
    townScene.add(new THREE.Points(geo, mat));
    
    // Moon (toward the moonlight source) with a soft halo
    const moonPos = new THREE.Vector3(-45, 48, 28);
    const moon = new THREE.Mesh(
        new THREE.SphereGeometry(4.5, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xe6ecff, fog: false })
    );
    moon.position.copy(moonPos);
    townScene.add(moon);
    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(7, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x9fb4e8, transparent: true, opacity: 0.22, fog: false })
    );
    halo.position.copy(moonPos);
    townScene.add(halo);
}

function createPerimeterTrees() {
    // A ring of trees walls the town in so the player can't wander into the void.
    const edge = 24, step = 4;
    const nearOb = (x, z) => Math.hypot(x - OBELISK_POS.x, z - OBELISK_POS.z) < 8;
    for (let x = -edge; x <= edge; x += step) {
        if (!nearOb(x, -edge)) createTree(x, -edge, false);  // north row
        if (!nearOb(x,  edge)) createTree(x,  edge, false);  // south row
    }
    for (let z = -edge + step; z <= edge - step; z += step) {
        if (!nearOb(-edge, z)) createTree(-edge, z, false);  // west column
        if (!nearOb( edge, z)) createTree( edge, z, false);  // east column
    }
}

// ============================================
// LIGHTING
// ============================================

function createLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x6680b0, 1.0);
    townScene.add(ambient);
    
    // Hemisphere
    const hemi = new THREE.HemisphereLight(0x88aae0, 0x33304a, 1.1);
    townScene.add(hemi);
    
    // Main directional (moonlight)
    const moon = new THREE.DirectionalLight(0xaab8e0, 1.1);
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
    obeliskLight.position.set(OBELISK_POS.x, 10, OBELISK_POS.z);
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
    
    // Stone pathways: main street, cross street, and a spur to the obelisk.
    createRoad(0, -3, 7, 28);    // main street (N-S)
    createRoad(0, -6, 24, 5);    // cross street (E-W)
    createRoad(10, -17, 16, 4);  // spur to the obelisk in the NE corner
    
    // Glowing runes leading along the spur to the obelisk
    const runeMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.35
    });
    for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const rune = new THREE.Mesh(new THREE.CircleGeometry(0.45, 6), runeMat);
        rune.rotation.x = -Math.PI / 2;
        rune.position.set(3 + t * (OBELISK_POS.x - 3), 0.02, -17 + t * (OBELISK_POS.z + 17));
        townScene.add(rune);
    }
}

function createRoad(cx, cz, sizeX, sizeZ) {
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(sizeX, sizeZ),
        new THREE.MeshStandardMaterial({ color: 0x4a4658, roughness: 0.95, metalness: 0.05 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(cx, 0.015, cz);
    road.receiveShadow = true;
    townScene.add(road);
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
    
    group.position.set(OBELISK_POS.x, 0, OBELISK_POS.z);
    group.userData = { type: 'obelisk', interactable: true };
    townScene.add(group);
}

// ============================================
// BUILDINGS
// ============================================

// Building/NPC facings (rotation.y so local +Z — the front — points a way).
const FACE_E = Math.PI / 2;   // door faces east  (+X)
const FACE_W = -Math.PI / 2;  // door faces west  (-X)
const FACE_S = 0;             // door faces south (+Z, toward the entrance)

function createBuildings() {
    // A main street (x=0) lined with shops; the Keeper caps the north end.
    const layout = [
        { x: -8, z: 0,   rot: FACE_E, type: 'scholar',    color: 0x2a3a4a, name: "Scholar's Tower" },
        { x: -8, z: -11, rot: FACE_E, type: 'apprentice', color: 0x3a3a5a, name: "Apprentice's Study" },
        { x:  7, z: 0,   rot: FACE_W, type: 'merchant',   color: 0x4a3a3a, name: "Merchant's Stall" },
        { x:  7, z: -11, rot: FACE_W, type: 'wanderer',   color: 0x3a4a3a, name: "Wanderer's Rest" },
        { x:  0, z: -20, rot: FACE_S, type: 'keeper',     color: 0x3a3a4a, name: "Keeper's Archive" }
    ];
    for (const b of layout) {
        createBuilding(b.x, b.z, b.rot, b.type, b.color, b.name);
    }
}

function createBuilding(x, z, rotationY, npcType, color, name) {
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
    group.rotation.y = rotationY;
    group.userData = { type: 'building', npcType, name };
    townScene.add(group);
}

// ============================================
// NPCs
// ============================================

function createNPCs() {
    // Each NPC stands just outside their door, facing the street.
    const roster = [
        { type: 'scholar',    bx: -8, bz: 0,   rot: FACE_E, robeColor: 0x1a237e, accentColor: 0x00ffff, name: 'The Scholar',
          dialogue: 'The obelisk holds many secrets. I can teach you to harness its power.' },
        { type: 'apprentice', bx: -8, bz: -11, rot: FACE_E, robeColor: 0x4a148c, accentColor: 0xbf00ff, name: "Scholar's Apprentice",
          dialogue: 'My master taught me to enhance the connection between mage and obelisk.' },
        { type: 'merchant',   bx: 7,  bz: 0,   rot: FACE_W, robeColor: 0x5d4037, accentColor: 0xffcc00, name: 'The Merchant',
          dialogue: 'Supplies for the depths. Reasonable prices.' },
        { type: 'wanderer',   bx: 7,  bz: -11, rot: FACE_W, robeColor: 0x37474f, accentColor: 0x88cc88, name: 'The Wanderer',
          dialogue: 'I have traveled the lower floors. Listen well, if you wish to survive.' },
        { type: 'keeper',     bx: 0,  bz: -20, rot: FACE_S, robeColor: 0x263238, accentColor: 0x90a4ae, name: 'The Keeper',
          dialogue: 'I maintain the records. Your progress is etched in the obelisk itself.' }
    ];

    for (const n of roster) {
        // step out of the doorway (door is local +Z of the building) onto the street
        const nx = n.bx + Math.sin(n.rot) * 3.5;
        const nz = n.bz + Math.cos(n.rot) * 3.5;
        // NPC model's face is on its local -Z, so add PI to look out toward the street.
        createNPC(n.type, nx, nz, n.rot + Math.PI, {
            robeColor: n.robeColor, accentColor: n.accentColor, name: n.name, dialogue: n.dialogue
        });
    }
}

function createNPC(type, x, z, rotationY, config) {
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
    group.rotation.y = rotationY;
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
    // Lamp posts lining the main street and the spur to the obelisk
    const lampPositions = [
        [-4.5, 5], [4.5, 5],
        [-4.5, -5], [4.5, -5],
        [-4.5, -15], [4.5, -15],
        [7, -16], [10.5, -16]
    ];
    lampPositions.forEach(([x, z]) => {
        createLampPost(x, z);
    });
    
    // Benches along the cross street
    createBench(-6, -6, 0);
    createBench(6, -6, 0);
    
    // Barrels and crates beside the merchant
    createBarrel(11, 2);
    createBarrel(12, 1);
    createCrate(11, 3);
    
    // Trees framing the plaza (NE corner left clear for the obelisk)
    createTree(-22, 8);
    createTree(22, 8);
    createTree(-22, -22);
    createTree(-14, 10);
    
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
    const housingMat = new THREE.MeshStandardMaterial({
        color: 0x3a3a4a,
        metalness: 0.7,
        emissive: 0xffaa44,
        emissiveIntensity: 0.4
    });
    const housing = new THREE.Mesh(housingGeom, housingMat);
    housing.position.y = 4.3;
    group.add(housing);
    
    // Glow (hangs just BELOW the housing so it isn't sealed inside it)
    const glowGeom = new THREE.SphereGeometry(0.22, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffcc66,
        transparent: true,
        opacity: 0.95
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 3.85;
    group.add(glow);
    
    // Light (placed below the housing so it actually casts light on the plaza)
    const light = new THREE.PointLight(0xffaa44, 2.2, 16, 1.5);
    light.position.y = 3.8;
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

function createTree(x, z, castShadow = true) {
    const group = new THREE.Group();
    
    // Trunk
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 })
    );
    trunk.position.y = 1.5;
    trunk.castShadow = castShadow;
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
    foliage.castShadow = castShadow;
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
        Math.pow(playerPosition.x - OBELISK_POS.x, 2) +
        Math.pow(playerPosition.z - OBELISK_POS.z, 2)
    );
    
    // Update interact button visibility
    const interactBtn = document.getElementById('btn-interact');
    const enterBtn = document.getElementById('btn-enter-dungeon');
    
    if (interactBtn && enterBtn) {
        if (interactableNPC) {
            interactBtn.classList.remove('hidden');
            interactBtn.textContent = `Talk to ${interactableNPC.userData.name}`;
            enterBtn.classList.add('hidden');
        } else if (obeliskDist < 7) {
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
