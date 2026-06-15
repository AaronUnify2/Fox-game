// ============================================
// ECHOES OF THE OBELISK - Dungeon System
// Floor generation, rooms, platforms, decorations
// ============================================

import * as THREE from 'three';

let dungeonScene;
let currentFloor = 1;

// Room layout data
const roomData = {
    center: { x: 0, z: 0, radius: 12 },
    north: { x: 0, z: -40, radius: 15 },    // Pillar boss
    south: { x: 0, z: 40, radius: 10 },     // Combat room
    east: { x: 40, z: 0, radius: 8 },       // Archive
    west: { x: -40, z: 0, radius: 12 }      // Mini-boss
};

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
    createHallway(0, -20, 0, -30, theme);   // Center to North
    createHallway(0, 20, 0, 30, theme);     // Center to South
    createHallway(20, 0, 30, 0, theme);     // Center to East
    createHallway(-20, 0, -30, 0, theme);   // Center to West
    
    // Add decorations
    createDecorations(theme, floor);
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
    createCurvedWalls(room.x, room.z, room.radius, 8, theme, [0, 2, 4, 6]); // Gaps for hallways
    
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
    
    // Platforms
    createPlatforms(room.x, room.z, room.radius, 4, theme);
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
    createCurvedWalls(room.x, room.z, room.radius, 8, theme, [4]); // Gap for hallway
    
    // Spiral platforms around where pillar boss will be
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const dist = 8;
        const height = 2 + (i % 4) * 3;
        
        const platGeom = new THREE.BoxGeometry(3, 0.5, 2);
        const platMat = new THREE.MeshStandardMaterial({
            color: theme.platformColor,
            roughness: 0.7,
            metalness: 0.3
        });
        const plat = new THREE.Mesh(platGeom, platMat);
        plat.position.set(
            room.x + Math.cos(angle) * dist,
            height,
            room.z + Math.sin(angle) * dist
        );
        plat.rotation.y = angle + Math.PI / 2;
        plat.castShadow = true;
        plat.receiveShadow = true;
        plat.userData = { isPlatform: true };
        dungeonScene.add(plat);
    }
    
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
    const room = roomData.south;
    
    // Floor
    const floorGeom = new THREE.CircleGeometry(room.radius, 24);
    const floorMat = new THREE.MeshStandardMaterial({
        color: theme.floorColor,
        roughness: 0.85
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0, room.z);
    floor.receiveShadow = true;
    dungeonScene.add(floor);
    
    // Walls
    createCurvedWalls(room.x, room.z, room.radius, 6, theme, [0]); // Gap for hallway
    
    // Combat platforms
    createPlatforms(room.x, room.z, room.radius * 0.6, 3, theme);
    
    // Pillars for cover
    const pillarPositions = [
        [-5, -3], [5, -3], [-5, 3], [5, 3]
    ];
    pillarPositions.forEach(([px, pz]) => {
        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.6, 4, 8),
            new THREE.MeshStandardMaterial({ color: theme.wallColor, roughness: 0.7 })
        );
        pillar.position.set(room.x + px, 2, room.z + pz);
        pillar.castShadow = true;
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
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0, room.z);
    floor.receiveShadow = true;
    dungeonScene.add(floor);
    
    // Walls
    createCurvedWalls(room.x, room.z, room.radius, 8, theme, [2]); // Gap for hallway
    
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
    
    // Raised platforms at edges
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const plat = new THREE.Mesh(
            new THREE.BoxGeometry(3, 1, 3),
            new THREE.MeshStandardMaterial({ color: theme.platformColor, roughness: 0.7 })
        );
        plat.position.set(
            room.x + Math.cos(angle) * (room.radius - 3),
            0.5,
            room.z + Math.sin(angle) * (room.radius - 3)
        );
        plat.castShadow = true;
        plat.receiveShadow = true;
        plat.userData = { isPlatform: true };
        dungeonScene.add(plat);
    }
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
    floor.rotation.y = -angle + Math.PI / 2;
    floor.receiveShadow = true;
    dungeonScene.add(floor);
    
    // Walls
    const wallGeom = new THREE.BoxGeometry(length, 5, 0.5);
    const wallMat = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.8,
        metalness: 0.2
    });
    
    [-1, 1].forEach(side => {
        const wall = new THREE.Mesh(wallGeom, wallMat);
        wall.position.set(centerX, 2.5, centerZ);
        wall.rotation.y = -angle + Math.PI / 2;
        wall.position.x += Math.cos(angle + Math.PI / 2) * 3 * side;
        wall.position.z += Math.sin(angle + Math.PI / 2) * 3 * side;
        wall.castShadow = true;
        wall.receiveShadow = true;
        dungeonScene.add(wall);
    });
    
    // Ceiling
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.3, 6),
        wallMat
    );
    ceiling.position.set(centerX, 5, centerZ);
    ceiling.rotation.y = -angle + Math.PI / 2;
    dungeonScene.add(ceiling);
    
    // Lights along hallway
    const numLights = Math.floor(length / 5);
    for (let i = 0; i < numLights; i++) {
        const t = (i + 0.5) / numLights;
        const lx = x1 + (x2 - x1) * t;
        const lz = z1 + (z2 - z1) * t;
        
        const light = new THREE.PointLight(theme.accentColor, 1.5, 8);
        light.position.set(lx, 4, lz);
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
        fixture.position.set(lx, 4.5, lz);
        dungeonScene.add(fixture);
    }
}

// ============================================
// WALL HELPERS
// ============================================

function createCurvedWalls(cx, cz, radius, segments, theme, gaps = []) {
    const wallMat = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.8,
        metalness: 0.2
    });
    
    for (let i = 0; i < segments; i++) {
        if (gaps.includes(i)) continue;
        
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;
        const midAngle = (angle1 + angle2) / 2;
        
        const segLength = 2 * radius * Math.sin(Math.PI / segments);
        
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(segLength, 6, 0.5),
            wallMat
        );
        wall.position.set(
            cx + Math.cos(midAngle) * radius,
            3,
            cz + Math.sin(midAngle) * radius
        );
        wall.rotation.y = -midAngle + Math.PI / 2;
        wall.castShadow = true;
        wall.receiveShadow = true;
        dungeonScene.add(wall);
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
        north: { pos: [cx, 3, cz - halfSize], size: [halfSize * 2, 6, 0.5], rot: 0 },
        south: { pos: [cx, 3, cz + halfSize], size: [halfSize * 2, 6, 0.5], rot: 0 },
        east: { pos: [cx + halfSize, 3, cz], size: [0.5, 6, halfSize * 2], rot: 0 },
        west: { pos: [cx - halfSize, 3, cz], size: [0.5, 6, halfSize * 2], rot: 0 }
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
        dungeonScene.add(wall);
    });
}

// ============================================
// PLATFORMS
// ============================================

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
