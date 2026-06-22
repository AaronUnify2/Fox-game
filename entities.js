// ============================================
// ECHOES OF THE OBELISK - Entity System
// Player, enemies, mini-bosses, pillar boss
// ============================================

import * as THREE from 'three';
import { getDungeonScene, getRoomData, getRotatingRings } from './dungeon.js';

// ============================================
// GAME BRIDGE (to avoid circular imports)
// ============================================

let gameBridge = {
    damagePlayer: () => {},
    getUpgradeLevel: () => 0,
    hasAbility: () => false,
    getGameData: () => ({ player: { health: 100, maxHealth: 100 }, upgrades: {} })
};

export function setGameBridge(bridge) {
    gameBridge = { ...gameBridge, ...bridge };
}

// ============================================
// STATE
// ============================================

let player;
let enemies = [];
let projectiles = [];
let enemyProjectiles = [];
let currentBoss = null;
let pillarBoss = null;
const bossRegistry = {};   // type -> { create, update }, populated by entities.js + the stage files
let xpGained = 0;
let goldGained = 0;
let materialsGained = {};   // material id -> count collected this floor (banks on completion)
let orbs = [];          // collectible XP / gold / material orbs

// Cooldowns
const cooldowns = { attack: 0, spread: 0, burst: 0, mega: 0, sword: 0 };
const baseCooldowns = { attack: 1.0, spread: 8, burst: 15, mega: 20, sword: 0.45 };  // attack = magic-shot cooldown; sword = melee swing cooldown
let burstModeActive = false;
let burstModeTimer = 0;
let aimPitch = 0; // vertical aim angle from the camera look (FPS); 0 = level

// Platform cache
let platformsCache = [];

// Yaw the player was rotated by this frame from riding a spinning ring (0 if not).
let carryYawDelta = 0;
export function getCarryYawDelta() { return carryYawDelta; }

// ============================================
// INITIALIZATION
// ============================================

export async function initEntities() {
    createPlayer();
    return Promise.resolve();
}

export function clearPlatformCache() {
    platformsCache = [];
}

// ============================================
// PLAYER
// ============================================

function createPlayer() {
    player = new THREE.Group();
    player.name = 'player';
    
    const robeColor = 0x1a237e;
    const glowColor = 0x00ffff;
    
    // Body
    const bodyGeom = new THREE.CylinderGeometry(0.3, 0.35, 0.8, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.6;
    player.add(body);
    
    // Robe
    const robeGeom = new THREE.ConeGeometry(0.45, 0.6, 8);
    const robe = new THREE.Mesh(robeGeom, bodyMat);
    robe.position.y = 0.3;
    robe.rotation.x = Math.PI;
    player.add(robe);
    
    // Head
    const headGeom = new THREE.SphereGeometry(0.25, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x111122 });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 1.15;
    player.add(head);
    
    // Hood
    const hoodGeom = new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const hood = new THREE.Mesh(hoodGeom, bodyMat);
    hood.position.y = 1.2;
    hood.rotation.x = 0.2;
    player.add(hood);
    
    // Glowing hands
    const handGeom = new THREE.SphereGeometry(0.1, 8, 8);
    const handMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.8 });
    const leftHand = new THREE.Mesh(handGeom, handMat);
    leftHand.position.set(-0.4, 0.7, 0.2);
    player.add(leftHand);
    const rightHand = new THREE.Mesh(handGeom, handMat);
    rightHand.position.set(0.4, 0.7, 0.2);
    player.add(rightHand);
    
    // Trim
    const trimGeom = new THREE.TorusGeometry(0.35, 0.03, 8, 16);
    const trimMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.6 });
    const trim = new THREE.Mesh(trimGeom, trimMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.5;
    player.add(trim);
    
    // Aura
    const auraGeom = new THREE.RingGeometry(0.3, 0.5, 16);
    const auraMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const aura = new THREE.Mesh(auraGeom, auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.02;
    player.add(aura);
    
    // Light
    const playerLight = new THREE.PointLight(glowColor, 0.5, 5);
    playerLight.position.y = 1;
    player.add(playerLight);
    
    player.userData = {
        velocity: new THREE.Vector3(),
        onGround: true,
        canWallJump: false,
        lastWallNormal: null,
        height: 1.5,
        radius: 0.35,
        moveSpeed: 6,
        jumpForce: 12,
        gravity: -25,
        invulnerable: false,
        invulnerableTimer: 0,
        standingRing: null   // the rotating arc the player is currently riding
    };
    
    player.position.set(0, 0, 0);
}

export function getPlayer() { return player; }

// ============================================
// PLAYER UPDATE
// ============================================

function updatePlayer(delta, inputState) {
    if (!player) return;
    
    const { moveX, moveZ, jump, attack } = inputState;
    const userData = player.userData;
    carryYawDelta = 0;   // set by carryOnRing if the player is riding a spinning ring

    // Vertical aim follows the camera pitch while in FPS; level otherwise.
    aimPitch = inputState.cameraRelative ? (inputState.cameraPitch || 0) : 0;
    
    // Invulnerability
    if (userData.invulnerable) {
        userData.invulnerableTimer -= delta;
        if (userData.invulnerableTimer <= 0) userData.invulnerable = false;
        player.visible = Math.floor(userData.invulnerableTimer * 10) % 2 === 0;
    } else {
        player.visible = true;
    }
    
    // Movement
    const moveDir = new THREE.Vector3(moveX, 0, moveZ);
    if (moveDir.length() > 0.1) {
        let dirX, dirZ;
        if (inputState.cameraRelative) {
            // FPS: stick is relative to where the camera looks.
            // forward = (sin yaw, cos yaw); right = (cos yaw, -sin yaw)
            const yaw = inputState.cameraYaw || 0;
            const s = Math.sin(yaw), c = Math.cos(yaw);
            dirX = (-moveZ) * s - (moveX) * c;
            dirZ = (-moveZ) * c + (moveX) * s;
            const len = Math.hypot(dirX, dirZ) || 1;
            dirX /= len; dirZ /= len;
            player.rotation.y = yaw; // face (and aim) where the camera looks
        } else {
            moveDir.normalize();
            dirX = moveDir.x; dirZ = moveDir.z;
            player.rotation.y = Math.atan2(moveDir.x, moveDir.z);
        }
        player.position.x += dirX * userData.moveSpeed * delta;
        player.position.z += dirZ * userData.moveSpeed * delta;
    }
    
    // Jump
    if (jump && userData.onGround) {
        userData.velocity.y = userData.jumpForce;
        userData.onGround = false;
        userData.standingRing = null;   // step off the ring when launching
    }
    
    // Wall jump (infinite)
    if (jump && !userData.onGround && userData.canWallJump) {
        userData.velocity.y = userData.jumpForce * 0.9;
        if (userData.lastWallNormal) {
            player.position.x += userData.lastWallNormal.x * 0.5;
            player.position.z += userData.lastWallNormal.z * 0.5;
        }
        userData.canWallJump = false;
    }
    
    // Gravity
    if (!userData.onGround) {
        userData.velocity.y += userData.gravity * delta;
        player.position.y += userData.velocity.y * delta;
    }
    
    // Ground
    if (player.position.y <= 0) {
        player.position.y = 0;
        userData.velocity.y = 0;
        userData.onGround = true;
        userData.canWallJump = false;
        userData.standingRing = null;
    }
    
    if (userData.velocity.y < 0) {
        checkPlatformCollision();
        checkRingLanding();
    }
    // Ride the arc you're standing on (and fall off if you walk past its edges)
    if (userData.onGround && userData.standingRing) carryOnRing();
    checkWallCollision();
    
    // Combat
    updateCooldowns(delta);
    if (attack) fireBasicAttack();
    if (inputState.sword) fireSwordAttack();
    if (inputState.ability1 && gameBridge.hasAbility('spread') && cooldowns.spread <= 0) fireSpreadAttack();
    if (inputState.ability2 && gameBridge.hasAbility('burst') && cooldowns.burst <= 0) activateBurstMode();
    if (inputState.ability3 && gameBridge.hasAbility('mega') && cooldowns.mega <= 0) fireMegaBall();
    
    if (burstModeActive) {
        burstModeTimer -= delta;
        if (burstModeTimer <= 0) burstModeActive = false;
    }
    
    checkEnemyCollision();
}

function checkPlatformCollision() {
    const scene = getDungeonScene();
    if (!scene) return;
    
    if (platformsCache.length === 0) {
        scene.traverse(obj => { if (obj.userData?.isPlatform) platformsCache.push(obj); });
    }
    
    for (const platform of platformsCache) {
        const bbox = new THREE.Box3().setFromObject(platform);
        const r = player.userData.radius;
        
        if (player.position.x >= bbox.min.x - r && player.position.x <= bbox.max.x + r &&
            player.position.z >= bbox.min.z - r && player.position.z <= bbox.max.z + r &&
            player.position.y >= bbox.max.y - 0.5 && player.position.y <= bbox.max.y + 1) {
            player.position.y = bbox.max.y;
            player.userData.velocity.y = 0;
            player.userData.onGround = true;
            break;
        }
    }
}

function checkRingLanding() {
    const rings = getRotatingRings();
    if (!rings || rings.length === 0) return;
    const pr = player.userData.radius;
    const px = player.position.x, pz = player.position.z, py = player.position.y;
    const TAU = Math.PI * 2;
    for (const ring of rings) {
        const dx = px - ring.cx, dz = pz - ring.cz;
        const r = Math.hypot(dx, dz);
        if (r < ring.innerR - pr || r > ring.outerR + pr) continue;
        // local angle on the ring = world angle + current spin; solid arc is [0, L]
        let al = (Math.atan2(dz, dx) + ring.spin) % TAU;
        if (al < 0) al += TAU;
        if (al > ring.arcLength) continue;   // over the open wedge -> no landing
        if (py >= ring.top - 0.5 && py <= ring.top + 1) {
            player.position.y = ring.top;
            player.userData.velocity.y = 0;
            player.userData.onGround = true;
            player.userData.standingRing = ring;
            break;
        }
    }
}

function carryOnRing() {
    const ring = player.userData.standingRing;
    if (!ring) return;
    const dx = player.position.x - ring.cx;
    const dz = player.position.z - ring.cz;
    // Carry the player around with the ring (rotate by this frame's spin amount)
    const a = ring.lastDelta, ca = Math.cos(a), sa = Math.sin(a);
    const ndx = dx * ca + dz * sa;
    const ndz = -dx * sa + dz * ca;
    player.position.x = ring.cx + ndx;
    player.position.z = ring.cz + ndz;
    carryYawDelta = a;   // turn the view with the platform by the same amount
    // Walked past the arc's ends or off the band? Step off and fall.
    const pr = player.userData.radius;
    const r = Math.hypot(ndx, ndz);
    const TAU = Math.PI * 2;
    let al = (Math.atan2(ndz, ndx) + ring.spin) % TAU;
    if (al < 0) al += TAU;
    const onBand = r >= ring.innerR - pr && r <= ring.outerR + pr;
    const onArc = al <= ring.arcLength;
    if (!onBand || !onArc) {
        player.userData.onGround = false;
        player.userData.standingRing = null;
    }
}

// Collect the solid (isWall) meshes in a scene once per frame, so several
// entities can be resolved against them without re-traversing per entity.
function collectWalls(scene) {
    const walls = [];
    if (!scene) return walls;
    scene.traverse(o => {
        if (o.isMesh && o.userData?.isWall && o.geometry?.parameters) walls.push(o);
    });
    return walls;
}

// Eject a circle (radius, in XZ) at `pos` out of every wall it overlaps.
// Mutates pos.x / pos.z and returns the last contact normal (or null). Shared
// by the player and the enemies so both respect the same geometry.
function ejectFromWalls(pos, radius, walls) {
    let normal = null;
    for (const obj of walls) {
        if (!obj.userData?.isWall) continue;   // e.g. a gate that has since opened
        const g = obj.geometry.parameters;
        const px = pos.x, pz = pos.z;

        // Cylindrical pillars: circle-vs-circle in XZ.
        if (g.radiusTop !== undefined || g.radiusBottom !== undefined) {
            const pr = Math.max(g.radiusTop || 0, g.radiusBottom || 0);
            let dx = px - obj.position.x, dz = pz - obj.position.z;
            let dist = Math.hypot(dx, dz);
            const minDist = pr + radius;
            if (dist < minDist) {
                if (dist < 1e-4) { dx = 1; dz = 0; dist = 1e-4; }
                const push = minDist - dist;
                pos.x += (dx / dist) * push;
                pos.z += (dz / dist) * push;
                normal = { x: dx / dist, z: dz / dist };
            }
            continue;
        }

        // Box walls: oriented-box vs circle (handles rotation and center-inside).
        const hw = (g.width || 0) / 2, hd = (g.depth || 0) / 2;
        if (hw === 0 || hd === 0) continue;
        const theta = obj.rotation.y;
        const cos = Math.cos(theta), sin = Math.sin(theta);
        const dx = px - obj.position.x, dz = pz - obj.position.z;
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        const cxp = Math.max(-hw, Math.min(lx, hw));
        const czp = Math.max(-hd, Math.min(lz, hd));
        const ox = lx - cxp, oz = lz - czp;
        const d2 = ox * ox + oz * oz;

        let pushLX = 0, pushLZ = 0, nlx = 0, nlz = 0, hit = false;
        if (d2 > 1e-8) {
            const dist = Math.sqrt(d2);
            if (dist < radius) {
                const pen = radius - dist;
                pushLX = (ox / dist) * pen; pushLZ = (oz / dist) * pen;
                nlx = ox / dist; nlz = oz / dist; hit = true;
            }
        } else {
            // center inside the box -> push out through the nearest face
            const penX = hw - Math.abs(lx), penZ = hd - Math.abs(lz);
            if (penX < penZ) { const sgn = lx >= 0 ? 1 : -1; pushLX = sgn * (penX + radius); nlx = sgn; }
            else { const sgn = lz >= 0 ? 1 : -1; pushLZ = sgn * (penZ + radius); nlz = sgn; }
            hit = true;
        }

        if (hit) {
            pos.x += pushLX * cos + pushLZ * sin;
            pos.z += -pushLX * sin + pushLZ * cos;
            normal = { x: nlx * cos + nlz * sin, z: -nlx * sin + nlz * cos };
        }
    }
    return normal;
}

function checkWallCollision() {
    const scene = player.parent;   // the scene the player is currently in (town or dungeon)
    if (!scene) return;
    player.userData.canWallJump = false;
    const normal = ejectFromWalls(player.position, player.userData.radius, collectWalls(scene));
    if (normal && !player.userData.onGround) {
        player.userData.canWallJump = true;
        player.userData.lastWallNormal = new THREE.Vector3(normal.x, 0, normal.z);
    }
}

// ============================================
// COMBAT
// ============================================

function updateCooldowns(delta) {
    const cdMod = 1 - (gameBridge.getUpgradeLevel('cooldownReduction') * 0.08);
    ['attack', 'spread', 'burst', 'mega', 'sword'].forEach(cd => { if (cooldowns[cd] > 0) cooldowns[cd] -= delta; });
    
    // Update UI (dim a button while its cooldown is running)
    ['attack', 'spread', 'burst', 'mega', 'sword'].forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        if (btn) btn.style.opacity = cooldowns[id] > 0 ? '0.5' : '1';
    });
}

function fireBasicAttack() {
    const fireRateMod = 1 - (gameBridge.getUpgradeLevel('fireRate') * 0.08);
    let cd = baseCooldowns.attack * fireRateMod;
    if (burstModeActive) cd *= 0.3;
    if (cooldowns.attack > 0) return;
    cooldowns.attack = cd;
    createProjectile(player.position.clone(), player.rotation.y, 'basic');
}

// Melee swing: damages enemies/mini-boss in a short arc in front of the player.
// Weak (base 7) until the King's sword lessons raise 'swordDamage'. The combo
// rhythm: open with magic on cooldown, finish with the sword.
function fireSwordAttack() {
    if (cooldowns.sword > 0) return;
    cooldowns.sword = baseCooldowns.sword;
    
    const reach = 2.8;
    const dotThreshold = Math.cos(0.95);   // ~55 deg half-arc swing
    const dmg = 7 + (gameBridge.getUpgradeLevel('swordDamage') || 0) * 4;
    
    const px = player.position.x, pz = player.position.z;
    const fx = Math.sin(player.rotation.y), fz = Math.cos(player.rotation.y);
    const inArc = (ox, oz, pad) => {
        const dist = Math.hypot(ox, oz);
        if (dist > reach + pad) return false;
        if (dist < 0.001) return true;
        return (ox * fx + oz * fz) / dist >= dotThreshold;
    };
    
    // Regular enemies — iterate backwards since damageEnemy may remove on death
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (inArc(e.position.x - px, e.position.z - pz, e.userData.radius || 0.5)) {
            damageEnemy(e, dmg, 'sword');
        }
    }
    // Mini-boss
    if (currentBoss && inArc(currentBoss.position.x - px, currentBoss.position.z - pz, 1.6)) {
        damageBoss(currentBoss, dmg);
    }
    
    swingEffect();
}

function swingEffect() {
    const fx = Math.sin(player.rotation.y), fz = Math.cos(player.rotation.y);
    const p = player.position.clone();
    p.x += fx * 1.8; p.z += fz * 1.8; p.y += 1.0;
    createHitEffect(p, 0xbfe0ff);   // pale steel flash where the blade lands
}

function fireSpreadAttack() {
    const cdMod = 1 - (gameBridge.getUpgradeLevel('cooldownReduction') * 0.05);
    cooldowns.spread = baseCooldowns.spread * cdMod;
    [-0.4, -0.2, 0, 0.2, 0.4].forEach(offset => {
        createProjectile(player.position.clone(), player.rotation.y + offset, 'spread');
    });
}

function activateBurstMode() {
    const cdMod = 1 - (gameBridge.getUpgradeLevel('cooldownReduction') * 0.05);
    cooldowns.burst = baseCooldowns.burst * cdMod;
    burstModeActive = true;
    burstModeTimer = 4;
}

function fireMegaBall() {
    const cdMod = 1 - (gameBridge.getUpgradeLevel('cooldownReduction') * 0.05);
    cooldowns.mega = baseCooldowns.mega * cdMod;
    createProjectile(player.position.clone(), player.rotation.y, 'mega');
}

function createProjectile(position, angle, type) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    const baseDmg = 10 + (gameBridge.getUpgradeLevel('baseDamage') * 3);
    const abilityMod = 1 + (gameBridge.getUpgradeLevel('abilityDamage') * 0.15);
    const aimAssist = gameBridge.getUpgradeLevel('aimAssist') * 0.08;
    
    const configs = {
        basic: { size: 0.15, speed: 20, damage: baseDmg, color: 0x00ffff, life: 2 },
        spread: { size: 0.12, speed: 18, damage: baseDmg * 0.6 * abilityMod, color: 0x00ff88, life: 1.5 },
        mega: { size: 0.5, speed: 10, damage: baseDmg * 4 * abilityMod, color: 0xffff00, life: 4, pierce: true }
    };
    const cfg = configs[type];
    
    const geom = new THREE.SphereGeometry(cfg.size, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.9 });
    const proj = new THREE.Mesh(geom, mat);
    
    proj.position.copy(position);
    proj.position.y += 1.2;
    
    const glowGeom = new THREE.SphereGeometry(cfg.size * 1.5, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.3 });
    proj.add(new THREE.Mesh(glowGeom, glowMat));
    proj.add(new THREE.PointLight(cfg.color, 0.5, 3));
    
    const cosP = Math.cos(aimPitch);
    proj.userData = {
        // Aim along the full camera look direction (yaw + pitch) so shots are no
        // longer locked to the horizontal plane. pitch > 0 sends the bolt upward.
        velocity: new THREE.Vector3(
            Math.sin(angle) * cfg.speed * cosP,
            Math.sin(aimPitch) * cfg.speed,
            Math.cos(angle) * cfg.speed * cosP
        ),
        damage: cfg.damage,
        lifespan: cfg.life,
        aimAssist,
        piercing: cfg.pierce || false
    };
    
    scene.add(proj);
    projectiles.push(proj);
}

function updateProjectiles(delta) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        
        // Aim assist drift
        if (proj.userData.aimAssist > 0 && enemies.length > 0) {
            let nearest = null, nearestDist = 15;
            for (const e of enemies) {
                const d = proj.position.distanceTo(e.position);
                if (d < nearestDist) { nearestDist = d; nearest = e; }
            }
            if (nearest) {
                const toE = new THREE.Vector3().subVectors(nearest.position, proj.position);
                toE.y = 0;
                toE.normalize();
                proj.userData.velocity.x += toE.x * proj.userData.aimAssist * delta * 10;
                proj.userData.velocity.z += toE.z * proj.userData.aimAssist * delta * 10;
                const spd = proj.userData.velocity.length();
                proj.userData.velocity.normalize().multiplyScalar(spd);
            }
        }
        
        proj.position.add(proj.userData.velocity.clone().multiplyScalar(delta));
        proj.userData.lifespan -= delta;
        
        if (proj.userData.lifespan <= 0) {
            scene.remove(proj);
            projectiles.splice(i, 1);
            continue;
        }
        
        // Hit enemies — generous cylinder: wide in XZ, tall in Y so that
        // floating drones (y~2) and low floor enemies are both easy to hit.
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            const dxz = Math.hypot(proj.position.x - e.position.x, proj.position.z - e.position.z);
            const dy = Math.abs(proj.position.y - e.position.y);
            if (dxz < e.userData.radius + 1.0 && dy < 2.2) {
                damageEnemy(e, proj.userData.damage, 'magic');
                hit = true;
                if (!proj.userData.piercing) break;
            }
        }
        
        // Hit boss
        if (currentBoss && proj.position.distanceTo(currentBoss.position) < currentBoss.userData.radius + 0.3) {
            damageBoss(currentBoss, proj.userData.damage);
            hit = true;
        }
        
        // Hit pillar nodes
        if (pillarBoss) {
            for (const node of pillarBoss.userData.weakSpots) {
                if (!node.userData.active || node.userData.shielded) continue;
                const nodeWorld = new THREE.Vector3();
                node.getWorldPosition(nodeWorld);
                if (proj.position.distanceTo(nodeWorld) < 1) {
                    damagePillarNode(node, proj.userData.damage);
                    hit = true;
                    break;
                }
            }
        }
        
        if (hit && !proj.userData.piercing) {
            createHitEffect(proj.position.clone(), proj.material.color.getHex());
            scene.remove(proj);
            projectiles.splice(i, 1);
        }
    }
}

export function createHitEffect(position, color) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    for (let i = 0; i < 6; i++) {
        const geom = new THREE.SphereGeometry(0.05, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
        const p = new THREE.Mesh(geom, mat);
        p.position.copy(position);
        p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5);
        p.userData.life = 0.3;
        scene.add(p);
        
        const animate = () => {
            p.userData.life -= 0.016;
            if (p.userData.life <= 0) { scene.remove(p); return; }
            p.position.add(p.userData.vel.clone().multiplyScalar(0.016));
            p.userData.vel.y -= 10 * 0.016;
            p.material.opacity = p.userData.life / 0.3;
            requestAnimationFrame(animate);
        };
        animate();
    }
}

// ============================================
// ENEMIES
// ============================================

const ENEMY_TYPES = { DRONE: 'drone', WALKER: 'walker', TURRET: 'turret', WISP: 'wisp' };

export function createEnemy(type, position, floor) {
    const scene = getDungeonScene();
    if (!scene) return null;
    
    const enemy = new THREE.Group();
    const hpScale = 1 + (floor - 1) * 0.3;
    const dmgScale = 1 + (floor - 1) * 0.2;
    
    let bodyColor = floor <= 3 ? 0x334455 : floor <= 6 ? 0x3d2b5e : 0x4a4030;
    let glowColor = floor <= 3 ? 0x00ffff : floor <= 6 ? 0xbf00ff : 0xffaa00;
    
    const configs = {
        drone: { hp: 30, dmg: 10, radius: 0.5, speed: 3, atkRate: 2 },
        walker: { hp: 50, dmg: 20, radius: 0.6, speed: 5, chargeSpeed: 12, attackReach: 2.6 },
        turret: { hp: 40, dmg: 8, radius: 0.7, speed: 0, atkRate: 0.5 },
        wisp: { hp: 20, dmg: 30, radius: 0.4, speed: 4, explodeRange: 1.5 }
    };
    const cfg = configs[type];
    
    // Visuals
    if (type === 'drone') {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.8 }));
        enemy.add(body);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 16), new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.9 }));
        ring.name = 'ring';
        enemy.add(ring);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: glowColor }));
        eye.position.z = 0.35;
        enemy.add(eye);
        enemy.add(new THREE.PointLight(glowColor, 0.3, 3));
    } else if (type === 'walker') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 1), new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.7 }));
        body.position.y = 1.2;
        enemy.add(body);
        [[-0.3, 0.45, 0.3], [0.3, 0.45, 0.3], [-0.3, 0.45, -0.3], [0.3, 0.45, -0.3]].forEach(pos => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), new THREE.MeshStandardMaterial({ color: bodyColor }));
            leg.position.set(...pos);
            enemy.add(leg);
        });
        const eyeMat = new THREE.MeshBasicMaterial({ color: glowColor });
        const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
        leftEye.position.set(-0.2, 1.45, 0.5);
        enemy.add(leftEye);
        const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
        rightEye.position.set(0.2, 1.45, 0.5);
        enemy.add(rightEye);
    } else if (type === 'turret') {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 8), new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.8 }));
        base.position.y = 0.15;
        enemy.add(base);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 8), new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.8 }));
        body.position.y = 0.6;
        enemy.add(body);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8), new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.9 }));
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.7, 0.4);
        enemy.add(barrel);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 16), new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.6 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.9;
        enemy.add(ring);
    } else if (type === 'wisp') {
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.9 }));
        enemy.add(core);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.3 }));
        enemy.add(glow);
        enemy.add(new THREE.PointLight(glowColor, 0.5, 4));
    }
    
    enemy.userData = {
        type,
        health: cfg.hp * hpScale,
        maxHealth: cfg.hp * hpScale,
        damage: cfg.dmg * dmgScale,
        radius: cfg.radius,
        speed: cfg.speed,
        attackCooldown: 0,
        attackRate: cfg.atkRate || 2,
        floatOffset: Math.random() * Math.PI * 2,
        isCharging: false,
        chargeCooldown: 0,
        chargeSpeed: cfg.chargeSpeed || 0,
        burstCount: 0,
        erraticTimer: 0,
        erraticDir: new THREE.Vector3(),
        explodeRange: cfg.explodeRange || 0,
        attackReach: cfg.attackReach || 0
    };
    
    enemy.position.copy(position);
    scene.add(enemy);
    enemies.push(enemy);
    return enemy;
}

function updateEnemies(delta) {
    if (!player) return;
    const walls = collectWalls(player.parent);
    
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const d = e.userData;
        const toPlayer = new THREE.Vector3().subVectors(player.position, e.position);
        toPlayer.y = 0;
        const dist = toPlayer.length();
        
        if (d.type === 'drone') {
            d.floatOffset += delta * 2;
            e.position.y = 2 + Math.sin(d.floatOffset) * 0.3;
            const ring = e.getObjectByName('ring');
            if (ring) ring.rotation.x += delta * 2;
            if (dist > 6) {
                toPlayer.normalize();
                e.position.x += toPlayer.x * d.speed * delta;
                e.position.z += toPlayer.z * d.speed * delta;
            }
            e.lookAt(player.position.x, e.position.y, player.position.z);
            d.attackCooldown -= delta;
            if (d.attackCooldown <= 0 && dist < 12) {
                createEnemyProjectile(e.position.clone(), player.position.clone(), d.damage, 0xff0000);
                d.attackCooldown = d.attackRate;
            }
        } else if (d.type === 'walker') {
            if (dist > 0.1) e.lookAt(player.position.x, e.position.y, player.position.z);
            d.chargeCooldown -= delta;
            if (d.isCharging) {
                toPlayer.normalize();
                e.position.x += toPlayer.x * d.chargeSpeed * delta;
                e.position.z += toPlayer.z * d.chargeSpeed * delta;
                if (dist < 2.5) { d.isCharging = false; d.chargeCooldown = 4; }
            } else {
                if (dist > 4) {
                    toPlayer.normalize();
                    e.position.x += toPlayer.x * d.speed * delta;
                    e.position.z += toPlayer.z * d.speed * delta;
                } else if (d.chargeCooldown <= 0) {
                    d.isCharging = true;
                }
            }
        } else if (d.type === 'turret') {
            e.lookAt(player.position.x, e.position.y, player.position.z);
            d.attackCooldown -= delta;
            if (d.attackCooldown <= 0 && dist < 15) {
                createEnemyProjectile(e.position.clone(), player.position.clone(), d.damage, 0xff4400, 12);
                d.burstCount++;
                if (d.burstCount >= 3) { d.attackCooldown = 2; d.burstCount = 0; }
                else d.attackCooldown = d.attackRate;
            }
        } else if (d.type === 'wisp') {
            d.erraticTimer -= delta;
            if (d.erraticTimer <= 0) {
                d.erraticDir = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
                d.erraticTimer = 0.3 + Math.random() * 0.5;
            }
            if (dist > d.explodeRange) {
                toPlayer.normalize();
                const moveDir = toPlayer.add(d.erraticDir).normalize();
                e.position.x += moveDir.x * d.speed * delta;
                e.position.z += moveDir.z * d.speed * delta;
            } else {
                createExplosion(e.position.clone(), d.damage);
                destroyEnemy(e, i, false);
                continue;
            }
            e.position.y = 1 + Math.sin(Date.now() * 0.01) * 0.2;
        }
        
        // Respect walls: slide along them instead of clipping through.
        ejectFromWalls(e.position, e.userData.radius || 0.6, walls);
    }
}

export function createEnemyProjectile(origin, target, damage, color, speed = 8) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    const dir = new THREE.Vector3().subVectors(target, origin).normalize();
    const geom = new THREE.SphereGeometry(0.12, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const proj = new THREE.Mesh(geom, mat);
    proj.position.copy(origin);
    proj.position.y = Math.max(proj.position.y, 1);
    proj.userData = { velocity: dir.multiplyScalar(speed), damage, lifespan: 5 };
    scene.add(proj);
    enemyProjectiles.push(proj);
}

function updateEnemyProjectiles(delta) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const proj = enemyProjectiles[i];
        proj.position.add(proj.userData.velocity.clone().multiplyScalar(delta));
        proj.userData.lifespan -= delta;
        
        if (proj.userData.lifespan <= 0) {
            scene.remove(proj);
            enemyProjectiles.splice(i, 1);
            continue;
        }
        
        if (proj.position.distanceTo(player.position) < player.userData.radius + 0.2 && !player.userData.invulnerable) {
            gameBridge.damagePlayer(proj.userData.damage);
            player.userData.invulnerable = true;
            player.userData.invulnerableTimer = 0.5;
            scene.remove(proj);
            enemyProjectiles.splice(i, 1);
        }
    }
}

function createExplosion(position, damage) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    if (position.distanceTo(player.position) < 2.5 && !player.userData.invulnerable) {
        gameBridge.damagePlayer(damage);
        player.userData.invulnerable = true;
        player.userData.invulnerableTimer = 0.5;
    }
    
    const explosion = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 })
    );
    explosion.position.copy(position);
    scene.add(explosion);
    
    let scale = 1;
    const animate = () => {
        scale += 0.3;
        explosion.scale.setScalar(scale);
        explosion.material.opacity -= 0.1;
        if (explosion.material.opacity <= 0) { scene.remove(explosion); return; }
        requestAnimationFrame(animate);
    };
    animate();
}

function damageEnemy(enemy, damage, source = 'magic') {
    enemy.userData.health -= damage;
    
    // Record what hit this enemy, for the kill-method (sword / magic / combo)
    if (!enemy.userData.hitBy) enemy.userData.hitBy = { sword: false, magic: false };
    enemy.userData.hitBy[source === 'sword' ? 'sword' : 'magic'] = true;
    
    enemy.traverse(child => {
        if (child.material?.color) {
            const orig = child.material.color.getHex();
            child.material.color.setHex(0xff0000);
            setTimeout(() => child.material.color.setHex(orig), 100);
        }
    });
    
    const dmgN = Math.round(damage);
    if (enemy.userData.health <= 0) {
        const idx = enemies.indexOf(enemy);
        if (idx > -1) {
            const hb = enemy.userData.hitBy;
            const method = (hb.sword && hb.magic) ? 'combo' : (hb.sword ? 'sword' : 'magic');
            gameBridge.spawnCombatText?.(enemy.position, dmgN, { kill: true, method });
            
            // Kill method picks the drop's rarity: sword -> rarest, combo -> common
            const mat = MATERIALS[method];
            if (mat && Math.random() < mat.chance) spawnMaterialOrb(enemy.position, mat);
            
            destroyEnemy(enemy, idx, true);
        }
    } else {
        gameBridge.spawnCombatText?.(enemy.position, dmgN, {});
    }
}

function destroyEnemy(enemy, index, giveXP) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    if (giveXP) {
        const xpVals = { drone: 15, walker: 20, turret: 18, wisp: 12 };
        const goldVals = { drone: 3, walker: 4, turret: 4, wisp: 2 };
        spawnOrbs(enemy.position, xpVals[enemy.userData.type] || 10, goldVals[enemy.userData.type] || 2);
    }
    
    createHitEffect(enemy.position.clone(), 0xff8800);
    scene.remove(enemy);
    enemies.splice(index, 1);
}

// ---- Drops: materials by kill method ----
// Kill method picks the drop's rarity. Sword-only kills are hardest, so the
// Tempered Core is rarest; combo is the reliable kill, so Salvage is common.
const MATERIALS = {
    sword: { id: 'tempered_core',  name: 'Tempered Core',  color: 0xff5533, css: '#ff8866', chance: 0.12 },
    magic: { id: 'resonant_shard', name: 'Resonant Shard', color: 0xaa66ff, css: '#c79bff', chance: 0.20 },
    combo: { id: 'salvage',        name: 'Salvage',        color: 0xbbbbbb, css: '#dddddd', chance: 0.30 }
};

function spawnMaterialOrb(position, mat) {
    const scene = getDungeonScene();
    if (!scene) return;
    const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshStandardMaterial({ color: mat.color, emissive: mat.color, emissiveIntensity: 1.0, metalness: 0.6, roughness: 0.25 })
    );
    orb.position.set(position.x, 1.2, position.z);
    orb.userData = { mat, vy: 3.5, spin: 3 };
    scene.add(orb);
    orbs.push(orb);
}

// ---- XP / Gold orbs ----
// Kills drop orbs that magnet to the player and add to the floor's haul
// (xpGained / goldGained). The haul banks on floor completion and is lost on
// death — so collecting is part of the floor's risk/reward.
function spawnOrbs(position, xpTotal, goldTotal) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    const drop = (total, count, color, isGold) => {
        const base = Math.floor(total / count);
        let rem = total - base * count;
        for (let i = 0; i < count; i++) {
            const value = base + (rem-- > 0 ? 1 : 0);
            if (value <= 0) continue;
            const orb = new THREE.Mesh(
                new THREE.IcosahedronGeometry(isGold ? 0.3 : 0.24, 0),
                new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3 })
            );
            const a = Math.random() * Math.PI * 2;
            const r = 0.3 + Math.random() * 1.1;
            orb.position.set(position.x + Math.cos(a) * r, 1.0 + Math.random() * 0.5, position.z + Math.sin(a) * r);
            orb.userData = { isGold, value, vy: 3 + Math.random() * 2.5, spin: (Math.random() - 0.5) * 5 };
            scene.add(orb);
            orbs.push(orb);
        }
    };
    if (xpTotal > 0) drop(xpTotal, 2, 0x33ddaa, false);    // XP = teal
    if (goldTotal > 0) drop(goldTotal, 1, 0xffcc33, true);  // gold = amber
}

function updateOrbs(delta) {
    if (!player) return;
    const scene = getDungeonScene();
    const MAGNET = 6, COLLECT = 1.3;
    for (let i = orbs.length - 1; i >= 0; i--) {
        const orb = orbs[i];
        const d = orb.userData;
        orb.rotation.y += d.spin * delta;
        
        // little pop on spawn, then hover
        d.vy -= 10 * delta;
        orb.position.y += d.vy * delta;
        if (orb.position.y < 0.7) { orb.position.y = 0.7; d.vy = 0; }
        
        const dx = player.position.x - orb.position.x;
        const dz = player.position.z - orb.position.z;
        const dist = Math.hypot(dx, dz);
        
        if (dist < MAGNET) {
            const pull = (1 - dist / MAGNET) * 24 + 5;
            const inv = 1 / (dist || 1);
            orb.position.x += dx * inv * pull * delta;
            orb.position.z += dz * inv * pull * delta;
        }
        
        if (dist < COLLECT) {
            if (d.mat) {
                materialsGained[d.mat.id] = (materialsGained[d.mat.id] || 0) + 1;
                gameBridge.spawnCombatText?.(orb.position, '+ ' + d.mat.name, { material: true, css: d.mat.css });
                createHitEffect(orb.position.clone(), d.mat.color);
            } else if (d.isGold) {
                goldGained += d.value;
                createHitEffect(orb.position.clone(), 0xffcc33);
            } else {
                xpGained += d.value;
                createHitEffect(orb.position.clone(), 0x33ddaa);
            }
            scene?.remove(orb);
            orb.geometry.dispose();
            orb.material.dispose();
            orbs.splice(i, 1);
        }
    }
}

function clearOrbs() {
    const scene = getDungeonScene();
    orbs.forEach(o => { scene?.remove(o); o.geometry.dispose(); o.material.dispose(); });
    orbs = [];
}

export function spawnEnemiesForRoom(roomType, floor, reduced = false) {
    const roomData = getRoomData(roomType);
    const count = reduced ? 3 : 5 + Math.floor(floor / 2);
    
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const dist = 4 + Math.random() * 3;
        const pos = new THREE.Vector3(roomData.x + Math.cos(angle) * dist, 0, roomData.z + Math.sin(angle) * dist);
        const types = ['drone', 'walker', 'turret', 'wisp'];
        createEnemy(types[Math.floor(Math.random() * types.length)], pos, floor);
    }
}

// Spawn `count` enemies in a ring around an arbitrary point. Used by the south
// wing's sub-chambers, which aren't top-level rooms in roomData.
export function spawnEnemiesAt(cx, cz, floor, count) {
    const types = ['drone', 'walker', 'turret', 'wisp'];
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const dist = 3 + Math.random() * 3;
        const pos = new THREE.Vector3(cx + Math.cos(angle) * dist, 0, cz + Math.sin(angle) * dist);
        createEnemy(types[Math.floor(Math.random() * types.length)], pos, floor);
    }
}

export function clearAllEnemies() {
    const scene = getDungeonScene();
    enemies.forEach(e => scene?.remove(e));
    enemies = [];
    projectiles.forEach(p => scene?.remove(p));
    projectiles = [];
    enemyProjectiles.forEach(p => scene?.remove(p));
    enemyProjectiles = [];
    clearOrbs();
}

export function getEnemies() { return enemies; }

// ============================================
// MINI-BOSSES
// ============================================

export function spawnMiniBoss(floor) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    const roomData = getRoomData('west');
    const pos = new THREE.Vector3(roomData.x, 0, roomData.z);
    
    const type = floor <= 3 ? 'sentinel' : floor <= 6 ? 'hollow' : floor <= 9 ? 'dreamer' : 'emperor';
    const tier = ((floor - 1) % 3) + 1;
    
    const def = bossRegistry[type];
    if (def) currentBoss = def.create(pos, tier, floor);
}

function createSentinel(pos, tier, floor) {
    const scene = getDungeonScene();
    const boss = new THREE.Group();
    const hp = [200, 350, 500][tier - 1];
    
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshStandardMaterial({ color: 0x334455, metalness: 0.9, emissive: 0x001122, emissiveIntensity: 0.3 })));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    eye.position.z = 0.5;
    eye.name = 'eye';
    boss.add(eye);
    for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1 + i * 0.3, 0.05, 8, 32), new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.95 }));
        ring.name = `ring${i}`;
        boss.add(ring);
    }
    boss.add(new THREE.PointLight(0x00ffff, 1, 10));
    
    boss.userData = { type: 'sentinel', tier, health: hp, maxHealth: hp, radius: 1.5, attackCooldown: 0, beamCharging: false, beamTimer: 0, drones: [], maxDrones: tier + 1, droneSpawnTimer: 0 };
    boss.position.copy(pos);
    boss.position.y = 2;
    scene.add(boss);
    return boss;
}

function updateSentinel(boss, delta) {
    const d = boss.userData;

        boss.children.forEach((c, i) => { if (c.name?.startsWith('ring')) { c.rotation.x += delta * (1 + i * 0.5); c.rotation.y += delta * (0.5 + i * 0.3); } });
        boss.position.y = 2 + Math.sin(Date.now() * 0.002) * 0.3;
        const eye = boss.getObjectByName('eye');
        if (eye && player) {
            const toP = new THREE.Vector3().subVectors(player.position, boss.position);
            const a = Math.atan2(toP.x, toP.z);
            eye.position.x = Math.sin(a) * 0.5;
            eye.position.z = Math.cos(a) * 0.5;
        }
        
        d.droneSpawnTimer -= delta;
        if (d.droneSpawnTimer <= 0 && d.drones.length < d.maxDrones) {
            const drone = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }));
            drone.position.copy(boss.position);
            drone.userData = { orbitAngle: Math.random() * Math.PI * 2, orbitSpeed: 1 + Math.random() * 0.5, attackCooldown: 2, health: 20 };
            getDungeonScene().add(drone);
            d.drones.push(drone);
            d.droneSpawnTimer = 5;
        }
        
        for (let i = d.drones.length - 1; i >= 0; i--) {
            const dr = d.drones[i];
            dr.userData.orbitAngle += dr.userData.orbitSpeed * delta;
            dr.position.x = boss.position.x + Math.cos(dr.userData.orbitAngle) * 2.5;
            dr.position.z = boss.position.z + Math.sin(dr.userData.orbitAngle) * 2.5;
            dr.position.y = boss.position.y + Math.sin(dr.userData.orbitAngle * 2) * 0.5;
            dr.userData.attackCooldown -= delta;
            if (dr.userData.attackCooldown <= 0) {
                createEnemyProjectile(dr.position.clone(), player.position.clone(), 8, 0x00ffff);
                dr.userData.attackCooldown = 2;
            }
            for (let j = projectiles.length - 1; j >= 0; j--) {
                if (projectiles[j].position.distanceTo(dr.position) < 0.5) {
                    dr.userData.health -= projectiles[j].userData.damage;
                    createHitEffect(dr.position.clone(), 0x00ffff);
                    getDungeonScene().remove(projectiles[j]);
                    projectiles.splice(j, 1);
                    if (dr.userData.health <= 0) {
                        if (d.tier >= 3) createExplosion(dr.position.clone(), 15);
                        getDungeonScene().remove(dr);
                        d.drones.splice(i, 1);
                    }
                    break;
                }
            }
        }
        
        d.attackCooldown -= delta;
        if (d.attackCooldown <= 0 && !d.beamCharging) {
            d.beamCharging = true;
            d.beamTimer = 1.5;
            const eye = boss.getObjectByName('eye');
            if (eye) eye.material.color.setHex(0xff0000);
        }
        if (d.beamCharging) {
            d.beamTimer -= delta;
            if (d.beamTimer <= 0) {
                fireSentinelBeam();
                d.beamCharging = false;
                d.attackCooldown = 3 - d.tier * 0.5;
                const eye = boss.getObjectByName('eye');
                if (eye) eye.material.color.setHex(0x00ffff);
            }
        }
    }

function updateBoss(delta) {
    if (!currentBoss) return;
    const def = bossRegistry[currentBoss.userData.type];
    if (def?.update) def.update(currentBoss, delta);
}

registerBoss('sentinel', { create: createSentinel, update: updateSentinel });

function fireSentinelBeam() {
    const scene = getDungeonScene();
    const tier = currentBoss.userData.tier;
    const toP = new THREE.Vector3().subVectors(player.position, currentBoss.position);
    toP.y = 0;
    const angle = Math.atan2(toP.x, toP.z);
    
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 20, 8), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 }));
    beam.position.copy(currentBoss.position);
    beam.rotation.x = Math.PI / 2;
    beam.rotation.z = -angle;
    beam.position.x += Math.sin(angle) * 10;
    beam.position.z += Math.cos(angle) * 10;
    scene.add(beam);
    
    const dist = currentBoss.position.distanceTo(player.position);
    const pAngle = Math.atan2(player.position.x - currentBoss.position.x, player.position.z - currentBoss.position.z);
    if (dist < 15 && Math.abs(angle - pAngle) < 0.3 && !player.userData.invulnerable) {
        gameBridge.damagePlayer(25);
        player.userData.invulnerable = true;
        player.userData.invulnerableTimer = 1;
    }
    
    if (tier >= 2) {
        let sweep = 0;
        const dir = Math.random() > 0.5 ? 1 : -1;
        const interval = setInterval(() => {
            sweep += 0.1 * dir;
            beam.rotation.z = -(angle + sweep);
            beam.position.x = currentBoss.position.x + Math.sin(angle + sweep) * 10;
            beam.position.z = currentBoss.position.z + Math.cos(angle + sweep) * 10;
            const newPAngle = Math.atan2(player.position.x - currentBoss.position.x, player.position.z - currentBoss.position.z);
            if (dist < 15 && Math.abs((angle + sweep) - newPAngle) < 0.3 && !player.userData.invulnerable) {
                gameBridge.damagePlayer(25);
                player.userData.invulnerable = true;
                player.userData.invulnerableTimer = 1;
            }
            if (Math.abs(sweep) > 0.8) clearInterval(interval);
        }, 50);
    }
    
    setTimeout(() => scene.remove(beam), tier >= 2 ? 1000 : 300);
}

export function createShockwave(position, tier) {
    const scene = getDungeonScene();
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 32), new THREE.MeshBasicMaterial({ color: 0xbf00ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    wave.rotation.x = -Math.PI / 2;
    wave.position.copy(position);
    wave.position.y = 0.1;
    scene.add(wave);
    
    let scale = 1;
    const animate = () => {
        scale += 0.3;
        wave.scale.setScalar(scale);
        wave.material.opacity = 1 - scale / 6;
        const dist = player.position.distanceTo(position);
        if (dist < scale && dist > scale - 1 && !player.userData.invulnerable) {
            gameBridge.damagePlayer(15);
            player.userData.invulnerable = true;
            player.userData.invulnerableTimer = 0.5;
        }
        if (scale >= 6) { scene.remove(wave); return; }
        requestAnimationFrame(animate);
    };
    animate();
}

function damageBoss(boss, damage) {
    boss.userData.health -= damage;
    gameBridge.spawnCombatText?.(boss.position, Math.round(damage), {});
    boss.traverse(c => { if (c.material?.emissive) { const orig = c.material.emissive.getHex(); c.material.emissive.setHex(0xffffff); setTimeout(() => c.material.emissive.setHex(orig), 100); } });
    if (boss.userData.health <= 0) destroyBoss();
}

function destroyBoss() {
    const scene = getDungeonScene();
    if (!currentBoss) return;
    const xpVals = { sentinel: 100, hollow: 150, dreamer: 200, emperor: 500 };
    const bossXP = xpVals[currentBoss.userData.type] || 100;
    spawnOrbs(currentBoss.position, bossXP, Math.round(bossXP / 4));
    if (currentBoss.userData.drones) currentBoss.userData.drones.forEach(d => scene.remove(d));
    if (currentBoss.userData.mirrors) currentBoss.userData.mirrors.forEach(m => scene.remove(m));
    if (currentBoss.userData.zones) currentBoss.userData.zones.forEach(z => scene.remove(z));
    if (currentBoss.userData.trails) currentBoss.userData.trails.forEach(t => scene.remove(t));
    createHitEffect(currentBoss.position.clone(), 0xffffff);
    scene.remove(currentBoss);
    currentBoss = null;
}

export function getBoss() { return currentBoss; }
export function getPillarBoss() { return pillarBoss; }

// Boss/elite plumbing shared with the stage content files (enemies-mid/late).
export function registerBoss(type, def) { bossRegistry[type] = def; }
export function getProjectiles() { return projectiles; }
export function hurtPlayer(amount) { gameBridge.damagePlayer?.(amount); }
export function disposeBosses() {
    const scene = getDungeonScene();
    if (currentBoss) {
        ['drones', 'mirrors', 'zones', 'trails'].forEach(k => { if (currentBoss.userData[k]) currentBoss.userData[k].forEach(x => scene?.remove(x)); });
        scene?.remove(currentBoss);
        currentBoss = null;
    }
    if (pillarBoss) { scene?.remove(pillarBoss); pillarBoss = null; }
}

// ============================================
// PILLAR BOSS
// ============================================

export function spawnPillarBoss(floor) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    const roomData = getRoomData('north');
    pillarBoss = new THREE.Group();
    pillarBoss.name = 'pillarBoss';
    
    const height = 18, radius = 2;
    let bodyColor = floor <= 3 ? 0x334455 : floor <= 6 ? 0x3d2b5e : 0x4a4030;
    let glowColor = floor <= 3 ? 0x00ffff : floor <= 6 ? 0xbf00ff : 0xffd700;
    
    const pillarMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.7, roughness: 0.3, emissive: glowColor, emissiveIntensity: 0.1 });
    pillarBoss.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.2, height, 16), pillarMat).translateY(height / 2));
    
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.1, height - 2, 0.1), new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.6 }));
        conduit.position.set(Math.cos(a) * (radius - 0.1), height / 2, Math.sin(a) * (radius - 0.1));
        pillarBoss.add(conduit);
    }
    
    const numNodes = 3 + Math.floor(floor / 3);
    const weakSpots = [];
    for (let i = 0; i < numNodes; i++) {
        const node = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.9 }));
        const a = (i / numNodes) * Math.PI * 2;
        const h = 3 + (i / numNodes) * (height - 6);
        node.position.set(Math.cos(a) * (radius + 0.3), h, Math.sin(a) * (radius + 0.3));
        node.userData = { active: true, health: 50 + floor * 10, maxHealth: 50 + floor * 10, shielded: false, shieldTimer: 0, baseAngle: a, baseHeight: h };
        pillarBoss.add(node);
        weakSpots.push(node);
    }
    
    pillarBoss.userData = { floor, weakSpots, rotationSpeed: 0.2 + floor * 0.05, attackCooldown: 0, sweepCooldown: 0, ventCooldown: 0, enraged: false, glowColor };
    pillarBoss.position.set(roomData.x, 0, roomData.z);
    scene.add(pillarBoss);
}

function updatePillarBoss(delta) {
    if (!pillarBoss) return;
    const d = pillarBoss.userData;
    const floor = d.floor;
    
    pillarBoss.rotation.y += d.rotationSpeed * delta;
    
    d.weakSpots.forEach((node, i) => {
        if (!node.userData.active) return;
        const a = node.userData.baseAngle + pillarBoss.rotation.y;
        if (floor >= 5) {
            node.userData.baseHeight += Math.sin(Date.now() * 0.001 + i) * delta * 2;
            node.userData.baseHeight = Math.max(3, Math.min(15, node.userData.baseHeight));
        }
        node.position.x = Math.cos(a) * 2.3;
        node.position.z = Math.sin(a) * 2.3;
        node.position.y = node.userData.baseHeight;
        
        if (node.userData.shielded) {
            node.userData.shieldTimer -= delta;
            if (node.userData.shieldTimer <= 0) {
                node.userData.shielded = false;
                node.material.color.setHex(d.glowColor);
            }
        }
        node.material.opacity = 0.7 + Math.sin(Date.now() * 0.005 + i) * 0.2;
    });
    
    const activeCount = d.weakSpots.filter(n => n.userData.active).length;
    if (activeCount / d.weakSpots.length <= 0.25 && !d.enraged && floor >= 8) {
        d.enraged = true;
        d.rotationSpeed *= 2;
    }
    
    d.attackCooldown -= delta;
    if (d.attackCooldown <= 0) {
        for (let i = 0; i < 3 + Math.floor(floor / 3); i++) {
            const a = Math.random() * Math.PI * 2;
            const h = 3 + Math.random() * 12;
            const origin = pillarBoss.position.clone();
            origin.x += Math.cos(a) * 2.5;
            origin.z += Math.sin(a) * 2.5;
            origin.y = h;
            createEnemyProjectile(origin, player.position.clone(), 12, d.glowColor, 8);
        }
        d.attackCooldown = d.enraged ? 1 : 2;
    }
    
    if (floor >= 2) {
        d.sweepCooldown -= delta;
        if (d.sweepCooldown <= 0) {
            const beam = new THREE.Mesh(new THREE.BoxGeometry(25, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 }));
            const h = 1 + Math.random() * 3;
            beam.position.copy(pillarBoss.position);
            beam.position.y = h;
            getDungeonScene().add(beam);
            
            let sweep = 0;
            const animate = () => {
                sweep += 0.05;
                beam.rotation.y = sweep * Math.PI;
                if (Math.abs(player.position.y - h) < 1.5 && !player.userData.invulnerable) {
                    const pAngle = Math.atan2(player.position.z - pillarBoss.position.z, player.position.x - pillarBoss.position.x);
                    const bAngle = beam.rotation.y % (Math.PI * 2);
                    if (Math.abs(pAngle - bAngle) < 0.3 || Math.abs(pAngle - bAngle) > Math.PI * 2 - 0.3) {
                        gameBridge.damagePlayer(20);
                        player.userData.invulnerable = true;
                        player.userData.invulnerableTimer = 1;
                    }
                }
                if (sweep >= 2) { getDungeonScene().remove(beam); return; }
                requestAnimationFrame(animate);
            };
            animate();
            d.sweepCooldown = d.enraged ? 4 : 6;
        }
    }
    
    if (floor >= 4) {
        d.ventCooldown -= delta;
        if (d.ventCooldown <= 0) {
            platformsCache.forEach(p => {
                if (Math.random() < 0.5) {
                    const orig = p.material.color.getHex();
                    p.material.color.setHex(0xff4400);
                    p.userData.hazardous = true;
                    setTimeout(() => { p.material.color.setHex(orig); p.userData.hazardous = false; }, 3000);
                }
            });
            d.ventCooldown = 8;
        }
    }
    
    if (floor >= 5 && Math.random() < delta * 0.2) {
        const unshielded = d.weakSpots.filter(n => n.userData.active && !n.userData.shielded);
        if (unshielded.length > 1) {
            const node = unshielded[Math.floor(Math.random() * unshielded.length)];
            node.userData.shielded = true;
            node.userData.shieldTimer = 3;
            node.material.color.setHex(0x888888);
        }
    }
}

function damagePillarNode(node, damage) {
    node.userData.health -= damage;
    gameBridge.spawnCombatText?.(node.getWorldPosition(new THREE.Vector3()), Math.round(damage), {});
    const orig = node.material.color.getHex();
    node.material.color.setHex(0xffffff);
    setTimeout(() => node.material.color.setHex(orig), 100);
    
    if (node.userData.health <= 0) {
        node.userData.active = false;
        node.visible = false;
        createHitEffect(node.getWorldPosition(new THREE.Vector3()), pillarBoss.userData.glowColor);
        spawnOrbs(node.getWorldPosition(new THREE.Vector3()), 30, 5);
        
        if (pillarBoss.userData.weakSpots.filter(n => n.userData.active).length === 0) {
            spawnOrbs(pillarBoss.position, 200 + pillarBoss.userData.floor * 30, 50);
            for (let i = 0; i < 20; i++) {
                setTimeout(() => {
                    const pos = pillarBoss.position.clone();
                    pos.y = Math.random() * 18;
                    createHitEffect(pos, pillarBoss.userData.glowColor);
                }, i * 100);
            }
            setTimeout(() => { getDungeonScene().remove(pillarBoss); pillarBoss = null; }, 2000);
        }
    }
}

export function disposePillarBoss() {
    if (pillarBoss) { getDungeonScene()?.remove(pillarBoss); pillarBoss = null; }
}

// ============================================
// COLLISION & DAMAGE
// ============================================

function checkEnemyCollision() {
    if (!player || player.userData.invulnerable) return;
    
    for (const e of enemies) {
        const reach = e.userData.attackReach || (player.userData.radius + e.userData.radius);
        if (player.position.distanceTo(e.position) < reach) {
            gameBridge.damagePlayer(e.userData.damage);
            player.userData.invulnerable = true;
            player.userData.invulnerableTimer = 0.5;
            break;
        }
    }
    
    if (currentBoss && player.position.distanceTo(currentBoss.position) < player.userData.radius + currentBoss.userData.radius) {
        gameBridge.damagePlayer(15);
        player.userData.invulnerable = true;
        player.userData.invulnerableTimer = 0.5;
    }
    
    if (player.userData.onGround) {
        for (const p of platformsCache) {
            if (p.userData?.hazardous) {
                const bbox = new THREE.Box3().setFromObject(p);
                if (player.position.x >= bbox.min.x && player.position.x <= bbox.max.x &&
                    player.position.z >= bbox.min.z && player.position.z <= bbox.max.z &&
                    Math.abs(player.position.y - bbox.max.y) < 0.5) {
                    gameBridge.damagePlayer(5);
                    player.userData.invulnerable = true;
                    player.userData.invulnerableTimer = 0.3;
                }
            }
        }
    }
}

export function playerTakeDamage(amount) {
    if (player.userData.invulnerable) return;
    gameBridge.damagePlayer(amount);
    player.userData.invulnerable = true;
    player.userData.invulnerableTimer = 0.5;
}

export function isPlayerDead() {
    return gameBridge.getGameData().player.health <= 0;
}

export function getXPGained() { return xpGained; }
export function resetXPGained() { xpGained = 0; }
export function getGoldGained() { return goldGained; }
export function resetGoldGained() { goldGained = 0; }
export function getMaterialsGained() { return materialsGained; }
export function resetMaterialsGained() { materialsGained = {}; }

// ============================================
// MAIN UPDATE
// ============================================

export function updateEntities(delta, gameData, inputState) {
    updatePlayer(delta, inputState);
    updateProjectiles(delta);
    updateEnemyProjectiles(delta);
    updateEnemies(delta);
    updateOrbs(delta);
    updateBoss(delta);
    updatePillarBoss(delta);
}
