// ============================================
// ECHOES OF THE OBELISK - Dungeon System
// Floor generation, rooms, platforms, decorations
// ============================================

import * as THREE from 'three';

let dungeonScene;
let currentFloor = 1;
let rotatingRings = [];   // north-room arc platforms (the rotating climb)
let gates = {};           // hub doorway barriers, keyed by the room they guard

// Room layout data
const roomData = {
    center: { x: 0, z: 0, radius: 12 },
    north: { x: 0, z: -40, radius: 15 },    // Pillar boss
    south: { x: 0, z: 40, radius: 10 },     // Combat room (antechamber of the south wing)
    east: { x: 40, z: 0, radius: 8 },       // Archive
    west: { x: -40, z: 0, radius: 12 }      // Mini-boss
};

// The south "room" is actually a multi-chamber wing: an antechamber plus two
// side chambers. They all roll up to the logical "south" room for the gate
// progression; each spawns its own enemies on entry (see game.js).
const southChambers = {
    ante:  { x: 0,   z: 40, radius: 10 },
    left:  { x: -26, z: 40, radius: 9 },
    right: { x: 26,  z: 40, radius: 9 }
};
export function getSouthChambers() { return southChambers; }

// ============================================
// INITIALIZATION
// ============================================

export async function initDungeon() {
    dungeonScene = new THREE.Scene();
    return Promise.resolve();
}

export function getDungeonScene() {
    return dungeonScene;
}

export function getCurrentFloor() {
    return currentFloor;
}

export function setCurrentFloor(floor) {
    currentFloor = floor;
}

export function getRoomData(roomName) {
    return roomData[roomName];
}

export function disposeDungeon() {
    rotatingRings = [];
    gates = {};
    // Clear scene
    while (dungeonScene.children.length > 0) {
        dungeonScene.remove(dungeonScene.children[0]);
    }
}

// ============================================
// FLOOR GENERATION
// ============================================

export function loadFloor(floor) {
    currentFloor = floor;
    
    // Clear previous floor
    disposeDungeon();
    
    // Get theme based on floor
    const theme = getFloorTheme(floor);
    
    // Setup scene
    dungeonScene.background = new THREE.Color(theme.bgColor);
    dungeonScene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
    
    // Create lighting
    createLighting(theme);
    
    // Create rooms
    createCenterRoom(theme);
    createNorthRoom(theme, floor);  // Pillar boss
    createSouthRoom(theme);         // Combat
    createEastRoom(theme, floor);   // Archive
    createWestRoom(theme, floor);   // Mini-boss
    
    // Create hallways
    // Hallways: connect each room edge to the center room edge (with a small
    // overlap into both so the floors join). Centre edge is at ±12; the outer
    // room edges are at z=-25 (N), z=30 (S), x=32 (E), x=-28 (W).
    createHallway(0, -10, 0, -27, theme);   // Center <-> North
    createHallway(0, 10, 0, 32, theme);     // Center <-> South
    createHallway(10, 0, 34, 0, theme);     // Center <-> East
    createHallway(-10, 0, -30, 0, theme);   // Center <-> West
    
    // Ceilings over every room (east is rectangular; the others are round).
    // Capped at the wall tops (y = 24) and non-shadow-casting so the directional
    // fill still reaches the floor.
    Object.keys(roomData).forEach(name => {
        const room = roomData[name];
        addRoomCeiling(room.x, room.z, room.radius, theme, name === 'east');
    });
    
    // Add decorations
    createDecorations(theme, floor);
    
    // Locked gates at the hub doorways (south is open; the rest unlock in order)
    createGates(theme);
}

// ============================================
// GATES — per-floor unlock progression
// ============================================
// Barriers seal the west, north and east doorways of the central hub. South is
// open from the start. As each room is cleared the next gate is opened (see
// roomCleared in game.js): south -> west -> north -> east(terminal).

function createGates(theme) {
    gates = {};
    const H = 18;       // near corridor height; collision is 2D so jumping can't bypass
    const T = 0.7;      // thickness across the doorway
    const W = 8;        // span (covers the 6-wide corridor + doorway gap)
    
    // Each gate sits in the throat of its doorway. spanX gates are wide along X
    // (north/south corridors); the others are wide along Z (east/west corridors).
    const defs = {
        west:  { x: -11, z: 0,   spanX: false },
        north: { x: 0,   z: -11, spanX: true  },
        east:  { x: 11,  z: 0,   spanX: false }
    };
    
    for (const [room, d] of Object.entries(defs)) {
        const geom = d.spanX
            ? new THREE.BoxGeometry(W, H, T)
            : new THREE.BoxGeometry(T, H, W);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x2a4a66,
            emissive: 0x33ccff,
            emissiveIntensity: 0.6,
            metalness: 0.5,
            roughness: 0.4,
            transparent: true,
            opacity: 0.45
        });
        const gate = new THREE.Mesh(geom, mat);
        gate.position.set(d.x, H / 2, d.z);
        gate.userData.isWall = true;     // blocks the player while closed
        gate.userData.isGate = true;
        gate.userData.room = room;
        dungeonScene.add(gate);
        gates[room] = gate;
    }
}

// Open a gate: drop its collision immediately, then dissolve the barrier.
export function openGate(roomName) {
    const gate = gates[roomName];
    if (!gate) return;
    gate.userData.isWall = false;        // passable the instant it opens
    delete gates[roomName];
    
    const mat = gate.material;
    const start = performance.now();
    const dur = 800;
    const tick = () => {
        if (!gate.parent) return;        // floor was disposed mid-animation
        const t = Math.min(1, (performance.now() - start) / dur);
        mat.opacity = 0.45 * (1 - t);
        gate.position.y += 0.05;         // lifts away as it fades
        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            gate.parent.remove(gate);
        }
    };
    requestAnimationFrame(tick);
}

// ============================================
// THEMES
// ============================================

function getFloorTheme(floor) {
    if (floor <= 3) {
        // Mechanical/Industrial
        return {
            name: 'mechanical',
            bgColor: 0x0a0a12,
            fogColor: 0x0a0a12,
            fogDensity: 0.004,
            ambientColor: 0x334455,
            ambientIntensity: 2.5,
            accentColor: 0x00ffff,
            floorColor: 0x3a3a5e,
            wallColor: 0x3a4a6e,
            platformColor: 0x4a5a7e
        };
    } else if (floor <= 6) {
        // Corrupted/Nightmare bleeding through
        return {
            name: 'corrupted',
            bgColor: 0x0a0812,
            fogColor: 0x100818,
            fogDensity: 0.0035,
            ambientColor: 0x553366,
            ambientIntensity: 2.2,
            accentColor: 0xbf00ff,
            floorColor: 0x3a2a4e,
            wallColor: 0x4a3a5e,
            platformColor: 0x5a4a6e
        };
    } else {
        // Dream/Organic
        return {
            name: 'dream',
            bgColor: 0x100a08,
            fogColor: 0x1a1208,
            fogDensity: 0.003,
            ambientColor: 0x665544,
            ambientIntensity: 2.8,
            accentColor: 0xffd700,
            floorColor: 0x4a4030,
            wallColor: 0x5a5040,
            platformColor: 0x6a6050
        };
    }
}

// ============================================
// LIGHTING
// ============================================

function createLighting(theme) {
    // Ambient
    const ambient = new THREE.AmbientLight(theme.ambientColor, theme.ambientIntensity);
    dungeonScene.add(ambient);
    
    // Hemisphere
    const hemi = new THREE.HemisphereLight(theme.accentColor, theme.wallColor, 1.5);
    dungeonScene.add(hemi);
    
    // Main directional
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dir1.position.set(20, 30, 20);
    dir1.castShadow = true;
    dir1.shadow.mapSize.width = 2048;
    dir1.shadow.mapSize.height = 2048;
    dir1.shadow.camera.near = 1;
    dir1.shadow.camera.far = 100;
    dir1.shadow.camera.left = -60;
    dir1.shadow.camera.right = 60;
    dir1.shadow.camera.top = 60;
    dir1.shadow.camera.bottom = -60;
    dungeonScene.add(dir1);
    
    // Secondary directional
    const dir2 = new THREE.DirectionalLight(theme.accentColor, 0.6);
    dir2.position.set(-20, 20, -20);
    dungeonScene.add(dir2);
    
    // Room-specific lights
    Object.keys(roomData).forEach(roomName => {
        const room = roomData[roomName];
        const light = new THREE.PointLight(theme.accentColor, 2, room.radius * 2);
        light.position.set(room.x, 5, room.z);
        dungeonScene.add(light);
    });
}

// ============================================
// ROOMS
// ============================================

function createCenterRoom(theme) {
    const room = roomData.center;
    
    // Floor
    const floorGeom = new THREE.CircleGeometry(room.radius, 32);
    const floorMat = new THREE.MeshStandardMaterial({
        color: theme.floorColor,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0, room.z);
    floor.receiveShadow = true;
    dungeonScene.add(floor);
    
    // Walls (curved segments)
    createRingWalls(room.x, room.z, room.radius, theme, [0, Math.PI/2, Math.PI, -Math.PI/2]); // doors: E,S,W,N
    
    // Central pillar decoration
    const pillarGeom = new THREE.CylinderGeometry(1, 1.2, 6, 8);
    const pillarMat = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.6,
        metalness: 0.4
    });
    const pillar = new THREE.Mesh(pillarGeom, pillarMat);
    pillar.position.set(room.x, 3, room.z);
    pillar.castShadow = true;
    pillar.userData = { isWall: true };
    dungeonScene.add(pillar);
    
    // Glowing top
    const glowGeom = new THREE.SphereGeometry(0.8, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
        color: theme.accentColor,
        transparent: true,
        opacity: 0.8
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.set(room.x, 6.5, room.z);
    dungeonScene.add(glow);
}

function createNorthRoom(theme, floor) {
    const room = roomData.north;
    
    // Floor
    const floorGeom = new THREE.CircleGeometry(room.radius, 32);
    const floorMat = new THREE.MeshStandardMaterial({
        color: theme.floorColor,
        roughness: 0.8,
        metalness: 0.2,
        emissive: theme.accentColor,
        emissiveIntensity: 0.05
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(room.x, 0, room.z);
    floorMesh.receiveShadow = true;
    dungeonScene.add(floorMesh);
    
    // Walls
    createRingWalls(room.x, room.z, room.radius, theme, [Math.PI/2]); // door faces center (south)
    
    // --- Rotating arc-platform climb ---
    // Five concentric rings stacked above one another. Each is an arc covering
    // part of a circle (the rest is open air) and spins about the vertical axis.
    // The player rides whichever arc they stand on and times jumps up through the
    // gaps to the next level. Spacing (~2.3) is inside the jump height (~2.9), and
    // the climb ramps: higher rings have smaller arcs and spin faster.
    const ringMat = new THREE.MeshStandardMaterial({
        color: theme.platformColor,
        roughness: 0.7,
        metalness: 0.3,
        emissive: theme.accentColor,
        emissiveIntensity: 0.15
    });
    const innerR = 6.75, outerR = 9.25, thickness = 0.4;
    const levels = [
        { height: 2.5,  arc: 4.54, speed:  0.30 },  // ~260 deg, slow
        { height: 4.8,  arc: 3.75, speed: -0.45 },  // ~215 deg
        { height: 7.1,  arc: 2.97, speed:  0.62 },  // ~170 deg
        { height: 9.4,  arc: 2.18, speed: -0.82 },  // ~125 deg
        { height: 11.7, arc: 1.57, speed:  1.05 }   // ~90 deg, fast
    ];
    levels.forEach((lv, i) => {
        const geom = makeArcGeometry(innerR, outerR, lv.arc, thickness);
        const mesh = new THREE.Mesh(geom, ringMat);
        mesh.receiveShadow = true;   // catches light, but does NOT cast (perf + no flicker)
        const group = new THREE.Group();
        group.add(mesh);
        group.position.set(room.x, lv.height, room.z);
        const spin = i * 1.25;       // stagger start phases so gaps don't line up
        group.rotation.y = spin;
        dungeonScene.add(group);
        rotatingRings.push({
            group, cx: room.x, cz: room.z,
            innerR, outerR, top: lv.height,
            arcLength: lv.arc, speed: lv.speed, spin, lastDelta: 0
        });
    });
    
    // Conduit lines on floor
    const lineMat = new THREE.MeshBasicMaterial({
        color: theme.accentColor,
        transparent: true,
        opacity: 0.4
    });
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, room.radius), lineMat);
        line.position.set(room.x, 0.03, room.z);
        line.rotation.y = angle;
        line.position.x += Math.cos(angle) * room.radius / 2;
        line.position.z += Math.sin(angle) * room.radius / 2;
        dungeonScene.add(line);
    }
}

function createSouthRoom(theme) {
    const C = southChambers;
    
    // Antechamber (the wing's hub). Openings face the center hub, the left
    // chamber, and the right chamber. Its ceiling comes from the loadFloor pass.
    makeChamberFloor(C.ante.x, C.ante.z, C.ante.radius, theme);
    createRingWalls(C.ante.x, C.ante.z, C.ante.radius, theme, [-Math.PI/2, 0, Math.PI]);
    addChamberPillars(C.ante.x, C.ante.z, theme, [[-5,-3],[5,-3],[-5,3],[5,3]]);
    
    // Left side chamber — door faces the antechamber (+x).
    makeChamberFloor(C.left.x, C.left.z, C.left.radius, theme);
    createRingWalls(C.left.x, C.left.z, C.left.radius, theme, [0]);
    addRoomCeiling(C.left.x, C.left.z, C.left.radius, theme, false);
    addChamberPillars(C.left.x, C.left.z, theme, [[-3,-3],[-3,3]]);
    
    // Right side chamber — door faces the antechamber (-x).
    makeChamberFloor(C.right.x, C.right.z, C.right.radius, theme);
    createRingWalls(C.right.x, C.right.z, C.right.radius, theme, [Math.PI]);
    addRoomCeiling(C.right.x, C.right.z, C.right.radius, theme, false);
    addChamberPillars(C.right.x, C.right.z, theme, [[3,-3],[3,3]]);
    
    // Connecting halls (overlap into both rooms at each end).
    createHallway(-8, 40, -19, 40, theme);   // antechamber <-> left
    createHallway(8, 40, 19, 40, theme);     // antechamber <-> right
}

function makeChamberFloor(cx, cz, radius, theme) {
    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 24),
        new THREE.MeshStandardMaterial({ color: theme.floorColor, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    dungeonScene.add(floor);
}

function addChamberPillars(cx, cz, theme, offsets) {
    offsets.forEach(([px, pz]) => {
        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.6, 4, 8),
            new THREE.MeshStandardMaterial({ color: theme.wallColor, roughness: 0.7 })
        );
        pillar.position.set(cx + px, 2, cz + pz);
        pillar.castShadow = true;
        pillar.userData = { isWall: true };
        dungeonScene.add(pillar);
    });
}

function createEastRoom(theme, floor) {
    const room = roomData.east;
    
    // Floor
    const floorGeom = new THREE.BoxGeometry(room.radius * 2, 0.2, room.radius * 2);
    const floorMat = new THREE.MeshStandardMaterial({
        color: theme.floorColor,
        roughness: 0.8
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.position.set(room.x, 0, room.z);
    floorMesh.receiveShadow = true;
    dungeonScene.add(floorMesh);
    
    // Walls (rectangular room)
    createRectWalls(room.x, room.z, room.radius, theme, 'west');
    
    // Archive shelves
    const shelfMat = new THREE.MeshStandardMaterial({
        color: 0x3a3020,
        roughness: 0.9
    });
    
    [-1, 1].forEach(side => {
        for (let i = 0; i < 3; i++) {
            const shelf = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 4, 5),
                shelfMat
            );
            shelf.position.set(
                room.x + side * 5,
                2,
                room.z - 3 + i * 3
            );
            shelf.castShadow = true;
            dungeonScene.add(shelf);
        }
    });
    
    // Archive terminal (glowing)
    const terminal = new THREE.Mesh(
        new THREE.BoxGeometry(2, 3, 0.5),
        new THREE.MeshStandardMaterial({
            color: theme.wallColor,
            roughness: 0.5,
            metalness: 0.5
        })
    );
    terminal.position.set(room.x, 1.5, room.z + room.radius - 1);
    dungeonScene.add(terminal);
    
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 2),
        new THREE.MeshBasicMaterial({
            color: theme.accentColor,
            transparent: true,
            opacity: 0.8
        })
    );
    screen.position.set(room.x, 1.8, room.z + room.radius - 0.7);
    dungeonScene.add(screen);
    
    // Floating data particles
    createDataParticles(room.x, room.z, theme);
}

function createWestRoom(theme, floor) {
    const room = roomData.west;
    
    // Floor (arena style)
    const floorGeom = new THREE.CircleGeometry(room.radius, 32);
    const floorMat = new THREE.MeshStandardMaterial({
        color: theme.floorColor,
        roughness: 0.75,
        metalness: 0.25,
        emissive: theme.accentColor,
        emissiveIntensity: 0.03
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(room.x, 0, room.z);
    floorMesh.receiveShadow = true;
    dungeonScene.add(floorMesh);
    
    // Walls
    createRingWalls(room.x, room.z, room.radius, theme, [0]); // door faces center (east)
    
    // Arena ring
    const ringGeom = new THREE.TorusGeometry(room.radius - 2, 0.2, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: theme.accentColor,
        transparent: true,
        opacity: 0.5
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(room.x, 0.1, room.z);
    dungeonScene.add(ring);
}

// ============================================
// HALLWAYS
// ============================================

function createHallway(x1, z1, x2, z2, theme) {
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
    const angle = Math.atan2(z2 - z1, x2 - x1);
    const centerX = (x1 + x2) / 2;
    const centerZ = (z1 + z2) / 2;
    
    // Floor
    const floorGeom = new THREE.BoxGeometry(length, 0.2, 6);
    const floorMat = new THREE.MeshStandardMaterial({
        color: theme.floorColor,
        roughness: 0.85
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.position.set(centerX, 0, centerZ);
    floor.rotation.y = -angle;
    floor.receiveShadow = true;
    dungeonScene.add(floor);
    
    // Walls
    const wallGeom = new THREE.BoxGeometry(length, 20, 0.5);
    const wallMat = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.8,
        metalness: 0.2
    });
    
    [-1, 1].forEach(side => {
        const wall = new THREE.Mesh(wallGeom, wallMat);
        wall.position.set(centerX, 10, centerZ);
        wall.rotation.y = -angle;
        wall.position.x += Math.cos(angle + Math.PI / 2) * 3 * side;
        wall.position.z += Math.sin(angle + Math.PI / 2) * 3 * side;
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData = { isWall: true };
        dungeonScene.add(wall);
    });
    
    // Ceiling
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.3, 6),
        wallMat
    );
    ceiling.position.set(centerX, 20, centerZ);
    ceiling.rotation.y = -angle;
    dungeonScene.add(ceiling);
    
    // Lights along hallway
    const numLights = Math.floor(length / 5);
    for (let i = 0; i < numLights; i++) {
        const t = (i + 0.5) / numLights;
        const lx = x1 + (x2 - x1) * t;
        const lz = z1 + (z2 - z1) * t;
        
        const light = new THREE.PointLight(theme.accentColor, 2.5, 20);
        light.position.set(lx, 17, lz);
        dungeonScene.add(light);
        
        // Light fixture
        const fixture = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshBasicMaterial({
                color: theme.accentColor,
                transparent: true,
                opacity: 0.8
            })
        );
        fixture.position.set(lx, 19, lz);
        dungeonScene.add(fixture);
    }
}

// ============================================
// WALL HELPERS
// ============================================

function createRingWalls(cx, cz, radius, theme, openings = [], gapWidth = 8) {
    const wallMat = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.8,
        metalness: 0.2
    });

    // Finer segments = smoother ring and shorter doorway jambs.
    const segments = Math.max(12, Math.min(48, Math.round((2 * Math.PI * radius) / 3)));
    const segArc = (2 * Math.PI) / segments;
    const segLen = (2 * Math.PI * radius / segments) * 1.04; // slight overlap = no corner gaps
    const openHalf = (gapWidth / 2) / radius;                // half-width of a doorway, in radians

    const keptEdges = []; // gap-facing endpoints of the segments next to each doorway
    for (let i = 0; i < segments; i++) {
        const mid = (i + 0.5) * segArc;

        // Skip this segment if it falls within a doorway opening.
        let skip = false;
        for (const o of openings) {
            const d = Math.atan2(Math.sin(mid - o), Math.cos(mid - o)); // shortest signed diff
            if (Math.abs(d) < openHalf) { skip = true; break; }
        }
        if (skip) continue;

        const wall = new THREE.Mesh(new THREE.BoxGeometry(segLen, 24, 0.6), wallMat);
        wall.position.set(cx + Math.cos(mid) * radius, 12, cz + Math.sin(mid) * radius);
        wall.rotation.y = -mid + Math.PI / 2; // lay the segment tangent to the ring
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData = { isWall: true };
        dungeonScene.add(wall);

        // Record both angular ends of this kept segment (points on the ring).
        for (const e of [mid - segArc / 2, mid + segArc / 2]) {
            keptEdges.push({ ang: e, x: cx + Math.cos(e) * radius, z: cz + Math.sin(e) * radius });
        }
    }

    // Door jambs: for each opening, find where the curved wall actually ends on
    // each side and run a short wall from that point to the straight corridor
    // wall (perp +/-3). This closes the wedge gap no matter how the segments fall.
    for (const o of openings) {
        const dax = Math.cos(o), daz = Math.sin(o);   // door axis (outward)
        const px = -Math.sin(o), pz = Math.cos(o);    // perpendicular across the doorway
        for (const side of [1, -1]) {
            // Point where the corridor wall meets the room edge, this side.
            const corrX = cx + dax * radius + px * (3 * side);
            const corrZ = cz + daz * radius + pz * (3 * side);

            // Nearest kept ring edge on the same side as this corridor wall
            // (+perp side corresponds to +angular offset from the door).
            let best = null, bestD = Infinity;
            for (const e of keptEdges) {
                const d = Math.atan2(Math.sin(e.ang - o), Math.cos(e.ang - o));
                if (Math.sign(d) !== side) continue;
                if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = e; }
            }
            if (!best) continue;

            const jx = best.x - corrX, jz = best.z - corrZ;
            const len = Math.hypot(jx, jz);
            if (len < 0.05) continue;
            const jamb = new THREE.Mesh(new THREE.BoxGeometry(len + 0.8, 24, 0.7), wallMat);
            jamb.position.set((best.x + corrX) / 2, 12, (best.z + corrZ) / 2);
            jamb.rotation.y = -Math.atan2(jz, jx);
            jamb.castShadow = true;
            jamb.receiveShadow = true;
            jamb.userData = { isWall: true };
            dungeonScene.add(jamb);
        }
    }
}

function createRectWalls(cx, cz, halfSize, theme, gapSide = null) {
    const wallMat = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.8,
        metalness: 0.2
    });
    
    const sides = ['north', 'south', 'east', 'west'];
    const configs = {
        north: { pos: [cx, 12, cz - halfSize], size: [halfSize * 2, 24, 0.5], rot: 0 },
        south: { pos: [cx, 12, cz + halfSize], size: [halfSize * 2, 24, 0.5], rot: 0 },
        east: { pos: [cx + halfSize, 12, cz], size: [0.5, 24, halfSize * 2], rot: 0 },
        west: { pos: [cx - halfSize, 12, cz], size: [0.5, 24, halfSize * 2], rot: 0 }
    };
    
    sides.forEach(side => {
        if (side === gapSide) return;
        
        const cfg = configs[side];
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(...cfg.size),
            wallMat
        );
        wall.position.set(...cfg.pos);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData = { isWall: true };
        dungeonScene.add(wall);
    });

    // Doorway jambs on the open side so the corridor (6 wide) meets a framed
    // opening instead of a fully open wall. Only the west side is opened here.
    if (gapSide === 'west') {
        const jambMat = wallMat;
        // The west wall spans z in [cz-halfSize, cz+halfSize] at x = cx-halfSize.
        // Leave a 6-wide doorway centred on cz; wall the rest.
        const wx = cx - halfSize;
        [[-1], [1]].forEach(([s]) => {
            const inner = 3 * s;                       // edge of the 6-wide doorway
            const outer = halfSize * s;                // room corner
            const segLen = Math.abs(outer - inner);
            if (segLen < 0.1) return;
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 24, segLen), jambMat);
            seg.position.set(wx, 12, cz + (inner + outer) / 2);
            seg.castShadow = true;
            seg.receiveShadow = true;
            seg.userData = { isWall: true };
            dungeonScene.add(seg);
        });
    }
}

// Cap a room at the top of its 24-high walls. Round rooms get a disc; the
// rectangular east room gets a square slab. castShadow is left off so the
// scene's directional light still lights the floor below.
function addRoomCeiling(cx, cz, radius, theme, rect) {
    const mat = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.85,
        metalness: 0.2
    });
    const geom = rect
        ? new THREE.BoxGeometry(radius * 2, 0.4, radius * 2)
        : new THREE.CylinderGeometry(radius + 0.3, radius + 0.3, 0.4, 32);
    const ceiling = new THREE.Mesh(geom, mat);
    ceiling.position.set(cx, 24, cz);
    ceiling.castShadow = false;
    ceiling.receiveShadow = true;
    dungeonScene.add(ceiling);
}

// ============================================
// PLATFORMS
// ============================================

// ROTATING-RING HELPERS (north room)
// Build a flat, solid annular-sector slab. The solid arc occupies LOCAL angle
// [0, L] (measured as atan2(z, x) in the ring group's frame); the rest is open.
// The top surface sits at local y = 0, so a ring group placed at y = height lands
// the player exactly at that height.
function makeArcGeometry(innerR, outerR, L, thickness) {
    const shape = new THREE.Shape();
    const a0 = -L, a1 = 0;
    shape.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    shape.lineTo(Math.cos(a0) * outerR, Math.sin(a0) * outerR);
    shape.absarc(0, 0, outerR, a0, a1, false);   // outer arc forward
    shape.lineTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
    shape.absarc(0, 0, innerR, a1, a0, true);     // inner arc back
    const geom = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);          // lay flat, thickness becomes vertical
    geom.translate(0, -thickness, 0);    // put the top surface at local y = 0
    return geom;
}

// Spin every ring by this frame's amount. Called from the game loop BEFORE the
// player update so the carry logic can use each ring's lastDelta.
export function updateRotatingRings(delta) {
    for (const r of rotatingRings) {
        r.lastDelta = r.speed * delta;
        r.spin += r.lastDelta;
        r.group.rotation.y = r.spin;
    }
}

export function getRotatingRings() {
    return rotatingRings;
}

function createPlatforms(cx, cz, radius, count, theme) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const dist = radius * (0.5 + Math.random() * 0.3);
        const height = 2 + Math.random() * 4;
        
        const platGeom = new THREE.BoxGeometry(
            2 + Math.random() * 2,
            0.4,
            2 + Math.random() * 2
        );
        const platMat = new THREE.MeshStandardMaterial({
            color: theme.platformColor,
            roughness: 0.7,
            metalness: 0.3
        });
        const plat = new THREE.Mesh(platGeom, platMat);
        plat.position.set(
            cx + Math.cos(angle) * dist,
            height,
            cz + Math.sin(angle) * dist
        );
        plat.castShadow = true;
        plat.receiveShadow = true;
        plat.userData = { isPlatform: true };
        dungeonScene.add(plat);
    }
}

// ============================================
// DECORATIONS
// ============================================

function createDecorations(theme, floor) {
    // Theme-specific decorations
    if (theme.name === 'mechanical') {
        createMechanicalDecorations(theme);
    } else if (theme.name === 'corrupted') {
        createCorruptedDecorations(theme);
    } else {
        createDreamDecorations(theme);
    }
    
    // Common elements
    createAmbientParticles(theme);
}

function createMechanicalDecorations(theme) {
    // Pipes
    const pipeMat = new THREE.MeshStandardMaterial({
        color: 0x4a5a6a,
        metalness: 0.8,
        roughness: 0.3
    });
    
    const pipePositions = [
        [-15, 4, -10], [15, 4, -10],
        [-15, 4, 10], [15, 4, 10]
    ];
    
    pipePositions.forEach(([x, y, z]) => {
        const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 8, 8),
            pipeMat
        );
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(x, y, z);
        dungeonScene.add(pipe);
    });
    
    // Warning signs (billboards)
    const signMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.8
    });
    
    [[-8, 3, 35], [8, 3, 35]].forEach(([x, y, z]) => {
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            signMat
        );
        sign.position.set(x, y, z);
        dungeonScene.add(sign);
    });
}

function createCorruptedDecorations(theme) {
    // Cracks with purple glow
    const crackMat = new THREE.MeshBasicMaterial({
        color: 0xbf00ff,
        transparent: true,
        opacity: 0.4
    });
    
    for (let i = 0; i < 10; i++) {
        const crack = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 3 + Math.random() * 4),
            crackMat
        );
        crack.rotation.x = -Math.PI / 2;
        crack.rotation.z = Math.random() * Math.PI;
        crack.position.set(
            (Math.random() - 0.5) * 60,
            0.02,
            (Math.random() - 0.5) * 60
        );
        dungeonScene.add(crack);
    }
    
    // Corruption tendrils on walls
    const tendrilMat = new THREE.MeshStandardMaterial({
        color: 0x2a1030,
        roughness: 0.9,
        emissive: 0x200020,
        emissiveIntensity: 0.3
    });
    
    for (let i = 0; i < 8; i++) {
        const tendril = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.3, 4, 6),
            tendrilMat
        );
        const angle = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * 20;
        tendril.position.set(
            Math.cos(angle) * dist,
            2,
            Math.sin(angle) * dist
        );
        tendril.rotation.z = Math.PI / 4 * (Math.random() - 0.5);
        dungeonScene.add(tendril);
    }
}

function createDreamDecorations(theme) {
    // Luminous plants
    const plantMat = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.7
    });
    
    for (let i = 0; i < 15; i++) {
        const plant = new THREE.Mesh(
            new THREE.ConeGeometry(0.3, 1 + Math.random(), 6),
            plantMat
        );
        const angle = Math.random() * Math.PI * 2;
        const dist = 5 + Math.random() * 35;
        plant.position.set(
            Math.cos(angle) * dist,
            0.5,
            Math.sin(angle) * dist
        );
        dungeonScene.add(plant);
        
        // Plant glow
        const glow = new THREE.PointLight(0xffaa44, 0.3, 3);
        glow.position.copy(plant.position);
        glow.position.y += 0.5;
        dungeonScene.add(glow);
    }
    
    // Floating dream fragments
    const fragmentMat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.6
    });
    
    for (let i = 0; i < 20; i++) {
        const fragment = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.2, 0),
            fragmentMat
        );
        fragment.position.set(
            (Math.random() - 0.5) * 60,
            3 + Math.random() * 5,
            (Math.random() - 0.5) * 60
        );
        fragment.name = 'dreamFragment';
        dungeonScene.add(fragment);
    }
}

function createDataParticles(cx, cz, theme) {
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = cx + (Math.random() - 0.5) * 10;
        positions[i * 3 + 1] = 1 + Math.random() * 4;
        positions[i * 3 + 2] = cz + (Math.random() - 0.5) * 10;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: theme.accentColor,
        size: 0.1,
        transparent: true,
        opacity: 0.8
    });
    
    const particles = new THREE.Points(geometry, material);
    particles.name = 'dataParticles';
    dungeonScene.add(particles);
}

function createAmbientParticles(theme) {
    const particleCount = 100;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 80;
        positions[i * 3 + 1] = Math.random() * 8;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: theme.accentColor,
        size: 0.08,
        transparent: true,
        opacity: 0.5
    });
    
    const particles = new THREE.Points(geometry, material);
    particles.name = 'ambientParticles';
    dungeonScene.add(particles);
}
