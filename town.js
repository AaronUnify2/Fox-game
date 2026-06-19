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
const OBELISK_POS = { x: 20, z: -16 };
const COMMONS = { x: 0, z: 2 };   // social heart of the outpost; paths meet here

// rotation.y so an object's local +Z (its front/door) points at a target
function faceToward(x, z, tx, tz) {
    return Math.atan2(tx - x, tz - z);
}

// ============================================
// INITIALIZATION
// ============================================

export async function initTown() {
    townScene = new THREE.Scene();
    townScene.background = makeNightSkyGradient();
    townScene.fog = new THREE.FogExp2(0x0a0e1f, 0.014);
    
    createLighting();
    createNightSky();
    createDistantPeaks();   // mountain range below, fading into mist
    createPlateau();        // grassy clifftop the outpost sits on
    createPeak();           // snow-capped peak the obelisk emerges from
    createGround();         // worn footpaths across the grass
    createSupplyRoad();     // the long road down off the mountain (sealed)
    createCaravanSpace();   // cleared ground kept for the king's caravan
    createObelisk();
    createCommons();        // well + fire where the outpost gathers
    createBuildings();
    createNPCs();
    createDecorations();
    createPerimeterTrees(); // wind-bent treeline along the cliff edge
    
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
    // A wind-bent treeline around the cliff edge. Scenic — the clamp stops the player.
    const R = 32;
    for (let a = 0; a < Math.PI * 2; a += 0.18) {
        const x = Math.cos(a) * R;
        const z = Math.sin(a) * R;
        if (z > 22 && Math.abs(x) < 8) continue;            // gap at the south gate
        if (Math.hypot(x - 24, z + 26) < 18) continue;      // gap around the NE peak
        const jx = x + (Math.random() - 0.5) * 3;
        const jz = z + (Math.random() - 0.5) * 3;
        createTree(jx, jz, false);
    }
}

// ============================================
// TERRAIN (mountaintop outpost)
// ============================================

function createDistantPeaks() {
    // A ring of far peaks rising over the cliff edge, lost in the mist.
    const rock = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 1.0 });
    const snow = new THREE.MeshStandardMaterial({ color: 0x6f7e9c, roughness: 1.0 });
    const ring = [
        [-70, -55, 38, 60], [55, -78, 46, 72], [88, -10, 34, 52],
        [-92, 12, 42, 64], [22, -108, 52, 82], [-42, 82, 36, 50]
    ];
    for (const [x, z, r, h] of ring) {
        const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), rock);
        peak.position.set(x, h / 2 - 40, z);   // bases sunk below the plateau
        townScene.add(peak);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.22, 6), snow);
        cap.position.set(x, h - 40 - h * 0.06, z);
        townScene.add(cap);
    }
}

function createPlateau() {
    // Grassy clifftop the outpost stands on
    const grass = new THREE.Mesh(
        new THREE.CircleGeometry(34, 48),
        new THREE.MeshStandardMaterial({ color: 0x2f3d28, roughness: 1.0 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    townScene.add(grass);
    
    // Bare, trodden earth just inside the rim (centuries of footfall)
    const worn = new THREE.Mesh(
        new THREE.RingGeometry(29, 34, 48),
        new THREE.MeshStandardMaterial({ color: 0x3b4030, roughness: 1.0 })
    );
    worn.rotation.x = -Math.PI / 2;
    worn.position.y = 0.005;
    worn.receiveShadow = true;
    townScene.add(worn);
    
    // Cliff face dropping away into the dark
    const cliff = new THREE.Mesh(
        new THREE.CylinderGeometry(34, 27, 34, 48, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x352f29, roughness: 1.0, side: THREE.DoubleSide })
    );
    cliff.position.y = -17;
    townScene.add(cliff);
}

function createPeak() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x423b33, roughness: 1.0 });
    const snowMat = new THREE.MeshStandardMaterial({
        color: 0xeaf0ff, roughness: 0.9, emissive: 0x223044, emissiveIntensity: 0.15
    });
    
    // The peak itself, rising behind the obelisk
    const peak = new THREE.Mesh(new THREE.ConeGeometry(16, 40, 7), rockMat);
    peak.position.set(30, 20, -30);
    townScene.add(peak);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(7, 14, 7), snowMat);
    cap.position.set(30, 35, -30);
    townScene.add(cap);
    
    // Shoulder rock the obelisk emerges from (ties grass to peak)
    const mound = new THREE.Mesh(new THREE.ConeGeometry(9, 7, 6), rockMat);
    mound.position.set(OBELISK_POS.x, 1, OBELISK_POS.z);
    mound.castShadow = true;
    townScene.add(mound);
    
    // Outcrops scattered at the foot
    const outcrops = [[24, -8, 2.5], [26, -23, 3], [13, -23, 2], [22, -27, 3.5]];
    for (const [x, z, r] of outcrops) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
        rock.position.set(x, r * 0.4, z);
        rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        rock.castShadow = true;
        townScene.add(rock);
    }
    
    // Scenic switchback climbing the peak (visual only)
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x55493a, roughness: 1.0 });
    const climb = [
        [23, -22, 3, 6, 0.4], [26, -25, 7, 3, 0.6],
        [27, -28, 3, 6, 0.5], [29, -30, 6, 3, 0.7]
    ];
    for (const [x, z, sx, sz, y] of climb) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.4, sz), pathMat);
        seg.position.set(x, y, z);
        townScene.add(seg);
    }
}

function createSupplyRoad() {
    // The only road up the mountain, switchbacking down off the south edge.
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a443a, roughness: 1.0 });
    const ledges = [
        [0, 30, 10, 5, -1], [6, 36, 12, 5, -4], [-4, 42, 14, 5, -8], [4, 49, 16, 6, -13]
    ];
    for (const [x, z, sx, sz, y] of ledges) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(sx, 1, sz), stone);
        seg.position.set(x, y, z);
        townScene.add(seg);
    }
    // Gate sealing the way — the player can't leave
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.95 });
    for (const px of [-3.5, 3.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 5, 8), wood);
        post.position.set(px, 2.5, 25);
        post.castShadow = true;
        townScene.add(post);
    }
    for (const by of [1.6, 3.2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 0.4), wood);
        bar.position.set(0, by, 25);
        townScene.add(bar);
    }
}

function createCaravanSpace() {
    // Rutted ground kept clear for the king's caravan when he arrives.
    const dirt = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 9),
        new THREE.MeshStandardMaterial({ color: 0x4a3f30, roughness: 1.0 })
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(-10, 0.012, 18);
    dirt.receiveShadow = true;
    townScene.add(dirt);
    
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.95 });
    for (const [x, z] of [[-16, 14], [-16, 22], [-4, 14], [-4, 22]]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.4, 6), wood);
        p.position.set(x, 0.7, z);
        p.castShadow = true;
        townScene.add(p);
    }
    // The king's standard, marking the reserved ground
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 8), wood);
    pole.position.set(-16, 3.5, 18);
    pole.castShadow = true;
    townScene.add(pole);
    const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 1.4),
        new THREE.MeshStandardMaterial({
            color: 0x7a1f2b, roughness: 0.8, side: THREE.DoubleSide,
            emissive: 0x2a0a0e, emissiveIntensity: 0.3
        })
    );
    flag.position.set(-14.8, 5.5, 18);
    townScene.add(flag);
}

function createCommons() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1.0 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.95 });
    
    // Stone well at the heart of the outpost
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 12, 1, true), stone);
    well.position.set(COMMONS.x, 0.5, COMMONS.z);
    townScene.add(well);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.18, 8, 16), stone);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(COMMONS.x, 1, COMMONS.z);
    townScene.add(rim);
    for (const dx of [-1.1, 1.1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6), wood);
        post.position.set(COMMONS.x + dx, 1.6, COMMONS.z);
        townScene.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1, 4), wood);
    roof.position.set(COMMONS.x, 3.2, COMMONS.z);
    roof.rotation.y = Math.PI / 4;
    townScene.add(roof);
    
    // Fire pit a few steps off, where people gather against the cold
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.3, 12), stone);
    pit.position.set(COMMONS.x - 4, 0.15, COMMONS.z + 1);
    townScene.add(pit);
    const fire = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 1.2, 8),
        new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.9 })
    );
    fire.position.set(COMMONS.x - 4, 0.8, COMMONS.z + 1);
    townScene.add(fire);
    const fireLight = new THREE.PointLight(0xff7733, 2.5, 14, 1.6);
    fireLight.position.set(COMMONS.x - 4, 1.2, COMMONS.z + 1);
    townScene.add(fireLight);
    
    createBench(COMMONS.x - 4, COMMONS.z + 3.4, 0);
    createBench(COMMONS.x - 7, COMMONS.z + 1, Math.PI / 2);
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
    // Worn dirt footpaths tying the gate, commons, buildings and obelisk together.
    const DIRT = 0x55493a;
    createRoad(0, 12, 6, 22, DIRT);              // gate -> commons
    createRoad(0, -8, 6, 22, DIRT);              // commons -> north work yard
    createRoad(10, -16, 24, 5, DIRT);            // yard -> obelisk (E spur)
    createRoad(-6, 18, 10, 4, DIRT);             // spur to the caravan ground
    
    // Trodden doorstep patches in front of each building
    const steps = [[10, 10], [-12, 6], [-12, -5], [2, -10.5], [8, -6.5]];
    for (const [x, z] of steps) createRoad(x, z, 4, 4, 0x4a4030);
    
    // Glowing runes worn into the path up to the obelisk
    const runeMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff, transparent: true, opacity: 0.35
    });
    for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const rune = new THREE.Mesh(new THREE.CircleGeometry(0.45, 6), runeMat);
        rune.rotation.x = -Math.PI / 2;
        rune.position.set(2 + t * (OBELISK_POS.x - 2), 0.02, -16 + t * (OBELISK_POS.z + 16));
        townScene.add(rune);
    }
}

function createRoad(cx, cz, sizeX, sizeZ, color = 0x4a4658) {
    const road = new THREE.Mesh(
        new THREE.PlaneGeometry(sizeX, sizeZ),
        new THREE.MeshStandardMaterial({ color, roughness: 0.98, metalness: 0.0 })
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

function createBuildings() {
    // Support near the gate/caravan (south), research up by the obelisk (north).
    // Every building opens toward the commons, so the layout reads as lived-in.
    const layout = [
        { x:  13, z: 12,  type: 'merchant',   color: 0x4a3a3a, name: 'Quartermaster' },
        { x: -16, z: 7,   type: 'wanderer',   color: 0x3a4a3a, name: "Wanderer's Lodge" },
        { x: -15, z: -7,  type: 'apprentice', color: 0x3a3a5a, name: "Apprentice's Study" },
        { x:   3, z: -14, type: 'scholar',    color: 0x2a3a4a, name: 'Observatory' },
        { x:  10, z: -9,  type: 'keeper',     color: 0x3a3a4a, name: "Keeper's Archive" }
    ];
    for (const b of layout) {
        const rot = faceToward(b.x, b.z, COMMONS.x, COMMONS.z);
        createBuilding(b.x, b.z, rot, b.type, b.color, b.name);
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
    // bx/bz mirror the building positions in createBuildings().
    const roster = [
        { type: 'scholar',    bx: 3,   bz: -14, robeColor: 0x1a237e, accentColor: 0x00ffff, name: 'The Scholar',
          dialogue: 'I read the obelisk by night, as my predecessors did for three hundred years. It is... stirring.' },
        { type: 'apprentice', bx: -15, bz: -7,  robeColor: 0x4a148c, accentColor: 0xbf00ff, name: "The Apprentice",
          dialogue: 'The Scholar lets me log the fainter pulses. One day I will read the deep ones too.' },
        { type: 'merchant',   bx: 13,  bz: 12,  robeColor: 0x5d4037, accentColor: 0xffcc00, name: 'The Quartermaster',
          dialogue: 'Everything here came up the one road on muleback. Spend what I have wisely.' },
        { type: 'wanderer',   bx: -16, bz: 7,   robeColor: 0x37474f, accentColor: 0x88cc88, name: 'The Wanderer',
          dialogue: 'I climbed all this way to see it for myself. Few do. Fewer go below and return.' },
        { type: 'keeper',     bx: 10,  bz: -9,  robeColor: 0x263238, accentColor: 0x90a4ae, name: 'The Keeper',
          dialogue: 'Centuries of logs, all in my care. Your every descent is written into the record.' }
    ];

    for (const n of roster) {
        const doorRot = faceToward(n.bx, n.bz, COMMONS.x, COMMONS.z);
        const nx = n.bx + Math.sin(doorRot) * 3.5;   // step onto the doorstep
        const nz = n.bz + Math.cos(doorRot) * 3.5;
        // NPC face is on local -Z, so +PI turns them out toward the commons/player.
        createNPC(n.type, nx, nz, doorRot + Math.PI, {
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
    // Lanterns along the main path, the obelisk spur, and the caravan ground
    const lamps = [
        [-4, 18], [4, 18], [-4, 8], [4, 8],
        [-4, -2], [4, -2], [-4, -12], [4, -12],
        [7, -15], [12, -15], [-10.5, 13]
    ];
    lamps.forEach(([x, z]) => createLampPost(x, z));
    
    // Quartermaster's stores stacked outside the door
    createBarrel(16, 14);
    createBarrel(17, 13);
    createCrate(15, 15);
    createCrate(16.5, 15.5);
    
    // A couple of hardy trees rooted on the open grass
    createTree(-23, -13);
    createTree(8, 17);
    
    // Drifting motes / fine snow on the wind
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
