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

// Each building's footprint. Support sits near the gate; research sits up by the
// obelisk. Every site is turned so its local +Z (front) opens toward the commons.
const SITES = {
    wanderer:      { x: -16, z: 4,   type: 'wanderer' },      // gypsy caravan + campfire
    merchant:      { x: 15,  z: 17,  type: 'merchant' },      // oak trade caravan (south)
    quartermaster: { x: 16,  z: 5,   type: 'quartermaster' }, // brewing house (south)
    keeper:        { x: 8,   z: -11, type: 'keeper' },        // chapel
    scholar:       { x: -8,  z: -14, type: 'scholar' }        // mage tower + plinth ring
};
function siteRot(s) { return faceToward(s.x, s.z, COMMONS.x, COMMONS.z); }

// Convert a point in a site's local frame (local +Z = front, toward commons)
// into world XZ, so NPCs and ground patches line up with the structures.
function localToWorld(x, z, rot, lx, lz) {
    return {
        x: x + lx * Math.cos(rot) + lz * Math.sin(rot),
        z: z - lx * Math.sin(rot) + lz * Math.cos(rot)
    };
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
    
    // Trodden earth in front of each building (where folk stand)
    for (const key of ['wanderer', 'merchant', 'quartermaster', 'keeper', 'scholar']) {
        const s = SITES[key];
        const p = localToWorld(s.x, s.z, siteRot(s), 0, 3.0);
        createRoad(p.x, p.z, 5, 5, 0x4a4030);
    }
    
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
    createWandererCaravan(SITES.wanderer.x,      SITES.wanderer.z,      siteRot(SITES.wanderer));
    createMerchantCaravan(SITES.merchant.x,      SITES.merchant.z,      siteRot(SITES.merchant));
    createBrewingHouse(SITES.quartermaster.x,    SITES.quartermaster.z, siteRot(SITES.quartermaster));
    createKeeperChurch(SITES.keeper.x,           SITES.keeper.z,        siteRot(SITES.keeper));
    createScholarTower(SITES.scholar.x,          SITES.scholar.z,       siteRot(SITES.scholar));
}

// ---- small building-kit helpers (local space; +Z faces the commons) ----
function bMat(color, o = {}) {
    return new THREE.MeshStandardMaterial({
        color, roughness: o.r ?? 0.85, metalness: o.m ?? 0.0,
        emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 0,
        side: o.side, transparent: o.t ?? false, opacity: o.o ?? 1
    });
}
function bGlow(color, opacity = 0.9) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
}
function bBox(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
function bCyl(rt, rb, h, seg, m) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); }
function bCone(r, h, seg, m) { return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); }
function siteGroup(x, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    townScene.add(g);
    return g;
}

function wagonWheel(lx, ly, lz, radius) {
    const g = new THREE.Group();
    const iron = bMat(0x1a1410, { m: 0.5 });
    g.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.09, 6, 16), iron));
    for (let i = 0; i < 6; i++) {
        const sp = bBox(0.06, radius * 1.8, 0.06, bMat(0x2a1f16));
        sp.rotation.z = i * Math.PI / 3;
        g.add(sp);
    }
    const hub = bCyl(0.12, 0.12, 0.22, 8, iron); hub.rotation.x = Math.PI / 2; g.add(hub);
    g.position.set(lx, ly, lz);
    return g;
}
function bBarrel(lx, lz) {
    const g = new THREE.Group();
    const b = bCyl(0.4, 0.45, 1.0, 10, bMat(0x5a3a22, { r: 0.9 })); b.position.y = 0.5; g.add(b);
    for (const yy of [0.28, 0.72]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 14), bMat(0x2a1f16, { m: 0.4 }));
        band.rotation.x = Math.PI / 2; band.position.y = yy; g.add(band);
    }
    g.position.set(lx, 0, lz); return g;
}
function bCrate(lx, lz, s = 0.9) {
    const g = new THREE.Group();
    const c = bBox(s, s, s, bMat(0x6a4a2a, { r: 0.95 })); c.position.y = s / 2; g.add(c);
    g.position.set(lx, 0, lz); return g;
}
function bPlinth(lx, lz, color, h = 1.2) {
    const g = new THREE.Group();
    const post = bCyl(0.3, 0.4, h, 6, bMat(0x3f3a44, { r: 1 })); post.position.y = h / 2; g.add(post);
    const cap = bBox(0.66, 0.16, 0.66, bMat(0x4a4658)); cap.position.y = h + 0.05; g.add(cap);
    const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), bGlow(color, 0.85)); rune.position.y = h + 0.38; g.add(rune);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), bGlow(color, 0.16)); halo.position.y = h + 0.38; g.add(halo);
    g.position.set(lx, 0, lz); return g;
}
function bCampfire(lx, lz) {
    const g = new THREE.Group();
    const stone = bMat(0x4a4640, { r: 1 });
    for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), stone);
        s.position.set(Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9);
        g.add(s);
    }
    const logMat = bMat(0x3a2a1a);
    for (let i = 0; i < 3; i++) {
        const log = bCyl(0.1, 0.1, 1.2, 6, logMat);
        log.rotation.z = Math.PI / 2; log.rotation.y = i * Math.PI / 3; log.position.y = 0.15; g.add(log);
    }
    const f1 = bCone(0.4, 1.0, 7, bGlow(0xff7722, 0.9)); f1.position.y = 0.7; g.add(f1);
    const f2 = bCone(0.22, 0.6, 7, bGlow(0xffcc44, 0.95)); f2.position.y = 0.55; g.add(f2);
    const light = new THREE.PointLight(0xff8844, 2.4, 12, 1.6); light.position.y = 1.2; g.add(light);
    g.position.set(lx, 0, lz); return g;
}
function bStove(lx, lz, potion) {
    const g = new THREE.Group();
    const base = bCyl(0.5, 0.6, 0.7, 8, bMat(0x4a4640, { r: 1 })); base.position.y = 0.35; g.add(base);
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 8), bGlow(0xff5522, 0.7)); ember.position.y = 0.72; g.add(ember);
    const pot = bCyl(0.42, 0.32, 0.5, 10, bMat(0x222018, { m: 0.4 })); pot.position.y = 1.05; g.add(pot);
    const brew = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), bGlow(potion, 0.9)); brew.position.y = 1.28; g.add(brew);
    for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.03, 8, 8), bGlow(0xddeeff, 0.12));
        s.position.set((Math.random() - 0.5) * 0.25, 1.6 + i * 0.4, (Math.random() - 0.5) * 0.25);
        g.add(s);
    }
    g.position.set(lx, 0, lz); return g;
}

// ---- 1. The Wanderer: dark-wood gypsy caravan with a campfire ----
function createWandererCaravan(x, z, rot) {
    const g = siteGroup(x, z, rot);
    const darkWood = bMat(0x3a2a1a, { r: 0.9 });
    const trim = bMat(0xc89a3a, { m: 0.3 });
    const body = bBox(4.4, 2.0, 2.2, darkWood); body.position.y = 1.9; body.castShadow = true; g.add(body);
    const roof = bCyl(1.2, 1.2, 4.5, 14, bMat(0x244030, { r: 0.85 }));
    roof.rotation.z = Math.PI / 2; roof.position.y = 3.0; roof.castShadow = true; g.add(roof);
    for (const zz of [1.05, -1.05]) { const e = bBox(4.6, 0.12, 0.12, trim); e.position.set(0, 2.9, zz); g.add(e); }
    const door = bBox(1.0, 1.5, 0.1, bMat(0x2a1d12)); door.position.set(0, 1.65, 1.12); g.add(door);
    const dg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), bGlow(0xffb347, 0.5)); dg.position.set(0, 1.7, 1.18); g.add(dg);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), bGlow(0xffcc66, 0.6)); win.position.set(1.5, 2.05, 1.111); g.add(win);
    const chim = bCyl(0.14, 0.16, 0.7, 8, bMat(0x2a2420)); chim.position.set(-1.4, 3.7, 0); g.add(chim);
    const emb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), bGlow(0xff7733, 0.8)); emb.position.set(-1.4, 4.15, 0); g.add(emb);
    [[-1.7, 1.0], [1.7, 1.0], [-1.7, -1.0], [1.7, -1.0]].forEach(([wx, wz]) => g.add(wagonWheel(wx, 0.7, wz, 0.7)));
    const step = bBox(1.0, 0.2, 0.5, bMat(0x2a1d12)); step.position.set(0, 0.6, 1.6); g.add(step);
    g.add(bCampfire(0, 4.3));
    const seat = bCyl(0.2, 0.2, 1.4, 6, bMat(0x3a2a1a)); seat.rotation.x = Math.PI / 2; seat.position.set(1.7, 0.2, 4.3); g.add(seat);
}

// ---- 2. The Merchant: oak trade caravan with a service counter ----
function createMerchantCaravan(x, z, rot) {
    const g = siteGroup(x, z, rot);
    const oak = bMat(0x6b4a2a, { r: 0.85 });
    const canvas = bMat(0xcdbd98, { r: 0.9 });
    const body = bBox(4.2, 2.0, 2.0, oak); body.position.y = 1.9; body.castShadow = true; g.add(body);
    const roof = bCone(2.6, 1.2, 4, canvas); roof.rotation.y = Math.PI / 4; roof.position.y = 3.5; roof.scale.set(1.0, 1, 0.55); g.add(roof);
    const awning = bBox(4.0, 0.1, 1.6, canvas); awning.position.set(0, 2.7, 1.9); awning.rotation.x = -0.35; g.add(awning);
    for (const px of [-1.8, 1.8]) { const p = bCyl(0.08, 0.08, 2.2, 6, oak); p.position.set(px, 1.1, 2.5); g.add(p); }
    const counter = bBox(3.6, 0.2, 0.7, oak); counter.position.set(0, 1.05, 2.2); g.add(counter);
    const cfront = bBox(3.6, 1.0, 0.1, oak); cfront.position.set(0, 0.55, 2.5); g.add(cfront);
    [0x8a5a2a, 0x5a6a3a, 0x6a4a6a].forEach((c, i) => { const w = bBox(0.4, 0.4, 0.4, bMat(c)); w.position.set(-1.2 + i * 1.2, 1.35, 2.2); g.add(w); });
    [[-1.6, 0.9], [1.6, 0.9], [-1.6, -0.9], [1.6, -0.9]].forEach(([wx, wz]) => g.add(wagonWheel(wx, 0.7, wz, 0.7)));
    g.add(bBarrel(-2.6, 1.6)); g.add(bBarrel(-2.6, 0.4)); g.add(bCrate(2.7, 1.3)); g.add(bCrate(2.8, 0.1, 0.7)); g.add(bCrate(2.6, 2.2, 0.7));
    const lp = bCyl(0.06, 0.06, 3, 6, bMat(0x2a2420)); lp.position.set(2.1, 1.5, 2.7); g.add(lp);
    const lantern = bBox(0.3, 0.4, 0.3, bMat(0x2a2420, { e: 0xffaa44, ei: 0.5 })); lantern.position.set(2.1, 3.0, 2.7); g.add(lantern);
    const lglow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), bGlow(0xffcc66, 0.9)); lglow.position.set(2.1, 2.95, 2.7); g.add(lglow);
    const ll = new THREE.PointLight(0xffaa44, 1.4, 9, 1.6); ll.position.set(2.1, 2.9, 2.8); g.add(ll);
}

// ---- 5. The Quartermaster: house ringed with brewing stoves ----
function createBrewingHouse(x, z, rot) {
    const g = siteGroup(x, z, rot);
    const wall = bMat(0x6a5e4e, { r: 0.95 });
    const house = bBox(5, 4, 5, wall); house.position.y = 2; house.castShadow = true; house.receiveShadow = true; g.add(house);
    const roof = bCone(4.0, 2.4, 4, bMat(0x3a2a20, { r: 0.9 })); roof.rotation.y = Math.PI / 4; roof.position.y = 5.2; roof.castShadow = true; g.add(roof);
    const chim = bBox(0.7, 1.6, 0.7, wall); chim.position.set(1.4, 5.0, -1.0); g.add(chim);
    const door = bBox(1.2, 2.2, 0.15, bMat(0x3a2a1a)); door.position.set(0, 1.1, 2.55); g.add(door);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), bGlow(0xff9944, 0.5)); win.position.set(-1.7, 2.6, 2.56); g.add(win);
    const potions = [0x33ff77, 0xaa44ff, 0x33ddff, 0xff8833, 0xff4466];
    // stoves stand out in the yard, clear of the house front (local z = 2.5)
    [[-2.2, 4.6], [0, 5.6], [2.2, 4.6], [-3.0, 3.4], [3.0, 3.4]].forEach(([sx, sz], i) => g.add(bStove(sx, sz, potions[i])));
    const l1 = new THREE.PointLight(0xff8844, 2.0, 12, 1.7); l1.position.set(0, 1.4, 4.4); g.add(l1);
    const l2 = new THREE.PointLight(0x66ddaa, 1.0, 9, 1.8); l2.position.set(0, 1.0, 5.2); g.add(l2);
}

// ---- 4. The Keeper: a chapel that reveres the obelisk ----
function createKeeperChurch(x, z, rot) {
    const g = siteGroup(x, z, rot);
    const stone = bMat(0x5a5648, { r: 0.95 });
    const slate = bMat(0x33343f, { r: 0.9 });
    const nave = bBox(5, 4.5, 8, stone); nave.position.set(0, 2.25, -1); nave.castShadow = true; nave.receiveShadow = true; g.add(nave);
    const r1 = bBox(3.4, 0.3, 8.2, slate); r1.position.set(-1.25, 5.1, -1); r1.rotation.z = 0.62; g.add(r1);
    const r2 = bBox(3.4, 0.3, 8.2, slate); r2.position.set(1.25, 5.1, -1); r2.rotation.z = -0.62; g.add(r2);
    const tower = bBox(2.4, 8, 2.4, stone); tower.position.set(0, 4, 3.2); tower.castShadow = true; g.add(tower);
    const spire = bCone(1.6, 4.5, 4, slate); spire.rotation.y = Math.PI / 4; spire.position.set(0, 10.2, 3.2); spire.castShadow = true; g.add(spire);
    // obelisk-cyan finial crowning the spire
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), bGlow(0x00ffff, 0.95)); finial.position.set(0, 12.7, 3.2); g.add(finial);
    const fhalo = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), bGlow(0x00ffff, 0.18)); fhalo.position.set(0, 12.7, 3.2); g.add(fhalo);
    const fl = new THREE.PointLight(0x33ffff, 1.2, 12, 2); fl.position.set(0, 12.5, 3.2); g.add(fl);
    const front = 4.42;   // +Z face of the tower
    const door = bBox(1.6, 2.6, 0.2, bMat(0x2a1d12)); door.position.set(0, 1.3, front); g.add(door);
    const rose = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), bGlow(0x66ccff, 0.6)); rose.position.set(0, 5.0, front); g.add(rose);
    const belfry = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.2), bGlow(0x14141c, 1)); belfry.position.set(0, 6.7, front); g.add(belfry);
    const winMat = bGlow(0xffcc66, 0.45);
    for (const sx of [-2.51, 2.51]) for (const wz of [-3, -1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.6), winMat);
        w.position.set(sx, 2.6, wz); w.rotation.y = Math.PI / 2; g.add(w);
    }
    const step = bBox(2.6, 0.3, 1.0, stone); step.position.set(0, 0.15, front + 0.9); g.add(step);
}

// ---- 3. The Scholar: mage tower with a ring of enchanting plinths ----
function createScholarTower(x, z, rot) {
    const g = siteGroup(x, z, rot);
    const stone = bMat(0x4a4658, { r: 0.9 });
    const tower = bCyl(1.7, 2.2, 9, 12, stone); tower.position.y = 4.5; tower.castShadow = true; g.add(tower);
    const roof = bCone(2.5, 3.2, 12, bMat(0x2a2a4a, { r: 0.8 })); roof.position.y = 10.6; roof.castShadow = true; g.add(roof);
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), bGlow(0x00ffff, 0.9)); finial.position.y = 12.6; g.add(finial);
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + 0.4;
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), bGlow(0x66e0ff, 0.6));
        w.position.set(Math.cos(a) * 1.95, 2.6 + i * 1.6, Math.sin(a) * 1.95);
        w.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
        g.add(w);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.08, 8, 24), bGlow(0x00ffff, 0.5));
    ring.rotation.x = Math.PI / 2; ring.position.y = 8.4; g.add(ring);
    const door = bBox(1.0, 2.0, 0.2, bMat(0x2a2438)); door.position.set(0, 1.0, 2.05); g.add(door);
    // front yard: a ring of faintly glowing plinths around a brighter focus stone
    const yx = 0, yz = 4.6, N = 6, R = 2.4;
    for (let i = 0; i < N; i++) {
        const a = i / N * Math.PI * 2;
        g.add(bPlinth(yx + Math.cos(a) * R, yz + Math.sin(a) * R, 0x00ffff, 1.1));
    }
    g.add(bPlinth(yx, yz, 0x66ffff, 1.4));
    // the apprentice's own single plinth, just off the ring
    g.add(bPlinth(3.0, 3.2, 0xbf66ff, 1.0));
    const yl = new THREE.PointLight(0x33ccff, 1.6, 12, 1.8); yl.position.set(yx, 1.6, yz); g.add(yl);
}

// ============================================
// NPCs
// ============================================

function createNPCs() {
    // Each entry: site key, local anchor (lx,lz) in that building's frame, and config.
    const roster = [
        { site: 'wanderer', lx: 1.0, lz: 3.2, type: 'wanderer',
          robeColor: 0x37474f, accentColor: 0x88cc88, name: 'The Wanderer',
          dialogue: 'I climbed all this way just to sit by my own fire and look at it. Madness, maybe.' },
        { site: 'merchant', lx: 0, lz: 1.3, type: 'merchant',
          robeColor: 0x5d4037, accentColor: 0xffcc00, name: 'The Merchant',
          dialogue: 'Step up to the counter. Everything on this wagon was hauled up the one road — so haggle gently.' },
        { site: 'quartermaster', lx: -0.8, lz: 4.6, type: 'quartermaster',
          robeColor: 0x4e342e, accentColor: 0x66ddaa, name: 'The Quartermaster',
          dialogue: 'Mind the pots. Healing draughts, nerve tonics, worse things — all brewing at once.' },
        { site: 'keeper', lx: 0, lz: 6.0, type: 'keeper',
          robeColor: 0x263238, accentColor: 0x90a4ae, name: 'The Keeper',
          dialogue: 'We keep the chapel for the obelisk, and the records beneath it. Your every descent is written down.' },
        { site: 'scholar', lx: -0.8, lz: 4.6, type: 'scholar',
          robeColor: 0x1a237e, accentColor: 0x00ffff, name: 'The Scholar',
          dialogue: 'We bind what the obelisk teaches into these stones. Bring me one and I can wake an ability in you.' },
        { site: 'scholar', lx: 3.7, lz: 3.0, type: 'apprentice',
          robeColor: 0x4a148c, accentColor: 0xbf00ff, name: 'The Apprentice',
          dialogue: 'My one plinth, my one stone. The Scholar reads the deep pulses; I am still learning the faint ones.' }
    ];

    for (const n of roster) {
        const s = SITES[n.site];
        const rot = siteRot(s);
        const w = localToWorld(s.x, s.z, rot, n.lx, n.lz);
        // NPC face is on local -Z, so +PI turns them out to face the commons/player.
        const face = faceToward(w.x, w.z, COMMONS.x, COMMONS.z) + Math.PI;
        createNPC(n.type, w.x, w.z, face, {
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
        [-4.5, 18], [4.5, 18], [-4.5, 9], [4.5, 9], [-4.5, 0], [4.5, 0],
        [4.5, -6], [4.5, -15], [12, -17], [-10.5, 13]
    ];
    lamps.forEach(([x, z]) => createLampPost(x, z));
    
    // A few hardy trees rooted on the open grass, clear of the buildings
    createTree(-22, -10);
    createTree(20, 6);
    createTree(-20, -18);
    
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
