// ============================================
// ECHOES OF THE OBELISK - Entity System
// Player, enemies, mini-bosses, pillar boss
// ============================================

import * as THREE from 'three';
import { getDungeonScene, getRoomData } from './dungeon.js';

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
let xpGained = 0;

// Cooldowns
const cooldowns = { attack: 0, spread: 0, burst: 0, mega: 0 };
const baseCooldowns = { attack: 0.3, spread: 8, burst: 15, mega: 20 };
let burstModeActive = false;
let burstModeTimer = 0;

// Platform cache
let platformsCache = [];

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
        invulnerableTimer: 0
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
        moveDir.normalize();
        player.rotation.y = Math.atan2(moveDir.x, moveDir.z);
        player.position.x += moveDir.x * userData.moveSpeed * delta;
        player.position.z += moveDir.z * userData.moveSpeed * delta;
    }
    
    // Jump
    if (jump && userData.onGround) {
        userData.velocity.y = userData.jumpForce;
        userData.onGround = false;
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
    }
    
    if (userData.velocity.y < 0) checkPlatformCollision();
    checkWallCollision();
    
    // Combat
    updateCooldowns(delta);
    if (attack) fireBasicAttack();
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

function checkWallCollision() {
    const scene = getDungeonScene();
    if (!scene) return;
    
    player.userData.canWallJump = false;
    const r = player.userData.radius;
    
    scene.traverse(obj => {
        if (!obj.isMesh || obj.userData?.isPlatform || !obj.geometry) return;
        
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        if (size.y < 2) return;
        
        const closestX = Math.max(bbox.min.x, Math.min(player.position.x, bbox.max.x));
        const closestZ = Math.max(bbox.min.z, Math.min(player.position.z, bbox.max.z));
        const distX = player.position.x - closestX;
        const distZ = player.position.z - closestZ;
        const dist = Math.sqrt(distX * distX + distZ * distZ);
        
        if (dist < r && dist > 0) {
            player.position.x += (distX / dist) * (r - dist);
            player.position.z += (distZ / dist) * (r - dist);
            
            if (!player.userData.onGround) {
                player.userData.canWallJump = true;
                player.userData.lastWallNormal = new THREE.Vector3(distX / dist, 0, distZ / dist);
            }
        }
    });
}

// ============================================
// COMBAT
// ============================================

function updateCooldowns(delta) {
    const cdMod = 1 - (gameBridge.getUpgradeLevel('cooldownReduction') * 0.08);
    ['attack', 'spread', 'burst', 'mega'].forEach(cd => { if (cooldowns[cd] > 0) cooldowns[cd] -= delta; });
    
    // Update UI
    ['spread', 'burst', 'mega'].forEach(id => {
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
    proj.position.y += 0.8;
    
    const glowGeom = new THREE.SphereGeometry(cfg.size * 1.5, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.3 });
    proj.add(new THREE.Mesh(glowGeom, glowMat));
    proj.add(new THREE.PointLight(cfg.color, 0.5, 3));
    
    proj.userData = {
        velocity: new THREE.Vector3(Math.sin(angle) * cfg.speed, 0, Math.cos(angle) * cfg.speed),
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
        
        // Hit enemies
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (proj.position.distanceTo(enemies[j].position) < enemies[j].userData.radius + 0.2) {
                damageEnemy(enemies[j], proj.userData.damage);
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

function createHitEffect(position, color) {
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

function createEnemy(type, position, floor) {
    const scene = getDungeonScene();
    if (!scene) return null;
    
    const enemy = new THREE.Group();
    const hpScale = 1 + (floor - 1) * 0.3;
    const dmgScale = 1 + (floor - 1) * 0.2;
    
    let bodyColor = floor <= 3 ? 0x334455 : floor <= 6 ? 0x3d2b5e : 0x4a4030;
    let glowColor = floor <= 3 ? 0x00ffff : floor <= 6 ? 0xbf00ff : 0xffaa00;
    
    const configs = {
        drone: { hp: 30, dmg: 10, radius: 0.5, speed: 3, atkRate: 2 },
        walker: { hp: 50, dmg: 20, radius: 0.6, speed: 5, chargeSpeed: 12 },
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
        body.position.y = 0.5;
        enemy.add(body);
        [[-0.3, 0.2, 0.3], [0.3, 0.2, 0.3], [-0.3, 0.2, -0.3], [0.3, 0.2, -0.3]].forEach(pos => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), new THREE.MeshStandardMaterial({ color: bodyColor }));
            leg.position.set(...pos);
            enemy.add(leg);
        });
        const eyeMat = new THREE.MeshBasicMaterial({ color: glowColor });
        const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
        leftEye.position.set(-0.2, 0.9, 0.45);
        enemy.add(leftEye);
        const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
        rightEye.position.set(0.2, 0.9, 0.45);
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
        explodeRange: cfg.explodeRange || 0
    };
    
    enemy.position.copy(position);
    scene.add(enemy);
    enemies.push(enemy);
    return enemy;
}

function updateEnemies(delta) {
    if (!player) return;
    
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
                if (dist < 1) { d.isCharging = false; d.chargeCooldown = 4; }
            } else {
                if (dist > 3) {
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
    }
}

function createEnemyProjectile(origin, target, damage, color, speed = 8) {
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

function damageEnemy(enemy, damage) {
    enemy.userData.health -= damage;
    enemy.traverse(child => {
        if (child.material?.color) {
            const orig = child.material.color.getHex();
            child.material.color.setHex(0xff0000);
            setTimeout(() => child.material.color.setHex(orig), 100);
        }
    });
    if (enemy.userData.health <= 0) {
        const idx = enemies.indexOf(enemy);
        if (idx > -1) destroyEnemy(enemy, idx, true);
    }
}

function destroyEnemy(enemy, index, giveXP) {
    const scene = getDungeonScene();
    if (!scene) return;
    
    if (giveXP) {
        const xpVals = { drone: 15, walker: 20, turret: 18, wisp: 12 };
        xpGained += xpVals[enemy.userData.type] || 10;
    }
    
    createHitEffect(enemy.position.clone(), 0xff8800);
    scene.remove(enemy);
    enemies.splice(index, 1);
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

export function clearAllEnemies() {
    const scene = getDungeonScene();
    enemies.forEach(e => scene?.remove(e));
    enemies = [];
    projectiles.forEach(p => scene?.remove(p));
    projectiles = [];
    enemyProjectiles.forEach(p => scene?.remove(p));
    enemyProjectiles = [];
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
    
    let type = floor <= 3 ? 'sentinel' : floor <= 6 ? 'hollow' : floor <= 9 ? 'dreamer' : 'emperor';
    const tier = ((floor - 1) % 3) + 1;
    
    if (type === 'sentinel') currentBoss = createSentinel(pos, tier, floor);
    else if (type === 'hollow') currentBoss = createHollow(pos, tier, floor);
    else if (type === 'dreamer') currentBoss = createDreamer(pos, tier, floor);
    else currentBoss = createEmperor(pos, floor);
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

function createHollow(pos, tier, floor) {
    const scene = getDungeonScene();
    const boss = new THREE.Group();
    const hp = [250, 400, 600][tier - 1];
    
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1020, emissive: 0x200030, emissiveIntensity: 0.2 });
    boss.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2, 8), bodyMat).translateY(1));
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.9 });
    for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 8, Math.PI), ribMat);
        rib.position.y = 0.6 + i * 0.3;
        rib.rotation.y = Math.PI / 2;
        boss.add(rib);
    }
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), bodyMat).translateY(2.3));
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xbf00ff });
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat).translateX(-0.12).translateY(2.35).translateZ(0.2));
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat).translateX(0.12).translateY(2.35).translateZ(0.2));
    boss.add(new THREE.PointLight(0xbf00ff, 1, 8).translateY(1.5));
    
    boss.userData = { type: 'hollow', tier, health: hp, maxHealth: hp, radius: 0.8, teleportCooldown: 2, slamCooldown: 4, trailTimer: 0, trails: [], phase: 'idle' };
    boss.position.copy(pos);
    scene.add(boss);
    return boss;
}

function createDreamer(pos, tier, floor) {
    const scene = getDungeonScene();
    const boss = new THREE.Group();
    const hp = [300, 500, 700][tier - 1];
    
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 })));
    const mistGeom = new THREE.SphereGeometry(1.2, 16, 16);
    mistGeom.scale(0.8, 1.5, 0.8);
    boss.add(new THREE.Mesh(mistGeom, new THREE.MeshBasicMaterial({ color: 0xbf00ff, transparent: true, opacity: 0.3 })));
    for (let i = 0; i < 3; i++) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
        face.position.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.5, 0.8);
        face.name = `face${i}`;
        boss.add(face);
    }
    boss.add(new THREE.PointLight(0xffaa00, 2, 15));
    
    boss.userData = { type: 'dreamer', tier, health: hp, maxHealth: hp, radius: 1.2, attackCooldown: 0, mirrorCooldown: 5, zoneCooldown: 8, mirrors: [], zones: [] };
    boss.position.copy(pos);
    boss.position.y = 2;
    scene.add(boss);
    return boss;
}

function createEmperor(pos, floor) {
    const scene = getDungeonScene();
    const boss = new THREE.Group();
    
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2040, emissive: 0x200030, emissiveIntensity: 0.3 });
    boss.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 8), bodyMat).translateY(1));
    const robeMat = new THREE.MeshStandardMaterial({ color: 0x4a2060, emissive: 0x100020, emissiveIntensity: 0.2 });
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 8), robeMat);
    robe.position.y = 0.5;
    robe.rotation.x = Math.PI;
    boss.add(robe);
    
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2 });
    boss.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 6), crownMat).translateY(2.4));
    for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), crownMat);
        const angle = (i / 6) * Math.PI * 2;
        spike.position.set(Math.cos(angle) * 0.2, 2.6, Math.sin(angle) * 0.2);
        boss.add(spike);
    }
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), new THREE.MeshStandardMaterial({ color: 0x8a7766 })).translateY(2.1));
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat).translateX(-0.1).translateY(2.15).translateZ(0.25));
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat).translateX(0.1).translateY(2.15).translateZ(0.25));
    boss.add(new THREE.PointLight(0xffd700, 1.5, 12).translateY(1.5));
    
    boss.userData = { type: 'emperor', health: 800, maxHealth: 800, radius: 1, attackCooldown: 0, slamCooldown: 0, summonCooldown: 10, speechGiven: false };
    boss.position.copy(pos);
    scene.add(boss);
    return boss;
}

function updateBoss(delta) {
    if (!currentBoss) return;
    const d = currentBoss.userData;
    
    if (d.type === 'sentinel') {
        currentBoss.children.forEach((c, i) => { if (c.name?.startsWith('ring')) { c.rotation.x += delta * (1 + i * 0.5); c.rotation.y += delta * (0.5 + i * 0.3); } });
        currentBoss.position.y = 2 + Math.sin(Date.now() * 0.002) * 0.3;
        const eye = currentBoss.getObjectByName('eye');
        if (eye && player) {
            const toP = new THREE.Vector3().subVectors(player.position, currentBoss.position);
            const a = Math.atan2(toP.x, toP.z);
            eye.position.x = Math.sin(a) * 0.5;
            eye.position.z = Math.cos(a) * 0.5;
        }
        
        d.droneSpawnTimer -= delta;
        if (d.droneSpawnTimer <= 0 && d.drones.length < d.maxDrones) {
            const drone = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 }));
            drone.position.copy(currentBoss.position);
            drone.userData = { orbitAngle: Math.random() * Math.PI * 2, orbitSpeed: 1 + Math.random() * 0.5, attackCooldown: 2, health: 20 };
            getDungeonScene().add(drone);
            d.drones.push(drone);
            d.droneSpawnTimer = 5;
        }
        
        for (let i = d.drones.length - 1; i >= 0; i--) {
            const dr = d.drones[i];
            dr.userData.orbitAngle += dr.userData.orbitSpeed * delta;
            dr.position.x = currentBoss.position.x + Math.cos(dr.userData.orbitAngle) * 2.5;
            dr.position.z = currentBoss.position.z + Math.sin(dr.userData.orbitAngle) * 2.5;
            dr.position.y = currentBoss.position.y + Math.sin(dr.userData.orbitAngle * 2) * 0.5;
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
            const eye = currentBoss.getObjectByName('eye');
            if (eye) eye.material.color.setHex(0xff0000);
        }
        if (d.beamCharging) {
            d.beamTimer -= delta;
            if (d.beamTimer <= 0) {
                fireSentinelBeam();
                d.beamCharging = false;
                d.attackCooldown = 3 - d.tier * 0.5;
                const eye = currentBoss.getObjectByName('eye');
                if (eye) eye.material.color.setHex(0x00ffff);
            }
        }
    } else if (d.type === 'hollow') {
        currentBoss.rotation.y += Math.sin(Date.now() * 0.01) * 0.02;
        currentBoss.position.y = Math.sin(Date.now() * 0.005) * 0.1;
        const toP = new THREE.Vector3().subVectors(player.position, currentBoss.position);
        toP.y = 0;
        currentBoss.rotation.y += (Math.atan2(toP.x, toP.z) - currentBoss.rotation.y) * delta * 3;
        
        d.trailTimer -= delta;
        if (d.trailTimer <= 0 && d.phase === 'moving') {
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8), new THREE.MeshBasicMaterial({ color: 0x4a0066, transparent: true, opacity: 0.6 }));
            tr.position.copy(currentBoss.position);
            tr.position.y = 0.05;
            tr.userData = { lifespan: d.tier >= 2 ? 3 : 2, maxLife: d.tier >= 2 ? 3 : 2 };
            getDungeonScene().add(tr);
            d.trails.push(tr);
            d.trailTimer = 0.2;
        }
        
        for (let i = d.trails.length - 1; i >= 0; i--) {
            const tr = d.trails[i];
            tr.userData.lifespan -= delta;
            tr.material.opacity = tr.userData.lifespan / tr.userData.maxLife * 0.6;
            if (player.position.distanceTo(tr.position) < 1 && !player.userData.invulnerable) {
                gameBridge.damagePlayer(5);
                player.userData.invulnerable = true;
                player.userData.invulnerableTimer = 0.3;
            }
            if (tr.userData.lifespan <= 0) {
                getDungeonScene().remove(tr);
                d.trails.splice(i, 1);
            }
        }
        
        d.teleportCooldown -= delta;
        if (d.teleportCooldown <= 0 && d.phase === 'idle') {
            d.phase = 'teleporting';
            toP.normalize().multiplyScalar(3);
            const newPos = player.position.clone().sub(toP);
            createHitEffect(currentBoss.position.clone(), 0xbf00ff);
            currentBoss.position.x = newPos.x;
            currentBoss.position.z = newPos.z;
            createHitEffect(currentBoss.position.clone(), 0xbf00ff);
            if (currentBoss.position.distanceTo(player.position) < 2 && !player.userData.invulnerable) {
                gameBridge.damagePlayer(20);
                player.userData.invulnerable = true;
                player.userData.invulnerableTimer = 0.5;
            }
            d.teleportCooldown = 4 - d.tier * 0.5;
            setTimeout(() => d.phase = 'idle', d.tier >= 3 ? 900 : 300);
        }
        
        d.slamCooldown -= delta;
        if (d.slamCooldown <= 0 && d.phase === 'idle' && toP.length() < 5) {
            d.phase = 'slamming';
            setTimeout(() => {
                createShockwave(currentBoss.position.clone(), d.tier);
                if (d.tier >= 2) setTimeout(() => createShockwave(currentBoss.position.clone(), d.tier), 500);
                d.slamCooldown = 5;
                d.phase = 'idle';
            }, 500);
        }
    } else if (d.type === 'dreamer') {
        currentBoss.position.y = 2 + Math.sin(Date.now() * 0.002) * 0.5;
        currentBoss.children[0].material.opacity = 0.7 + Math.sin(Date.now() * 0.005) * 0.2;
        currentBoss.children.forEach(c => {
            if (c.name?.startsWith('face')) {
                c.material.opacity = Math.random() > 0.7 ? 0.6 : 0.2;
                c.position.x += (Math.random() - 0.5) * 0.02;
                c.position.y += (Math.random() - 0.5) * 0.02;
            }
        });
        currentBoss.lookAt(player.position.x, currentBoss.position.y, player.position.z);
        
        d.attackCooldown -= delta;
        if (d.attackCooldown <= 0) {
            const numShards = 5 + d.tier * 2;
            for (let i = 0; i < numShards; i++) {
                const a = (i / numShards) * Math.PI * 2 + Date.now() * 0.001;
                const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
                createEnemyProjectile(currentBoss.position.clone(), currentBoss.position.clone().add(dir.multiplyScalar(20)), 10, 0xffaa00, 6);
            }
            d.attackCooldown = 2 - d.tier * 0.3;
        }
        
        d.mirrorCooldown -= delta;
        if (d.mirrorCooldown <= 0 && d.mirrors.length < d.tier) {
            const mirror = currentBoss.clone();
            mirror.scale.setScalar(0.8);
            mirror.traverse(c => { if (c.material) { c.material = c.material.clone(); c.material.opacity *= 0.6; } });
            mirror.userData = { health: 50 + d.tier * 20, lifespan: 15, attackCooldown: 2 };
            getDungeonScene().add(mirror);
            d.mirrors.push(mirror);
            d.mirrorCooldown = 8;
        }
        
        for (let i = d.mirrors.length - 1; i >= 0; i--) {
            const m = d.mirrors[i];
            m.userData.lifespan -= delta;
            m.userData.attackCooldown -= delta;
            if (m.userData.attackCooldown <= 0) {
                for (let j = 0; j < 3; j++) {
                    const a = (j / 3) * Math.PI * 2;
                    createEnemyProjectile(m.position.clone(), m.position.clone().add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(20)), 8, 0xffaa00, 5);
                }
                m.userData.attackCooldown = 3;
            }
            const angle = Date.now() * 0.001 + i * 2;
            m.position.x = currentBoss.position.x + Math.cos(angle) * 4;
            m.position.z = currentBoss.position.z + Math.sin(angle) * 4;
            m.position.y = currentBoss.position.y;
            
            for (let j = projectiles.length - 1; j >= 0; j--) {
                if (projectiles[j].position.distanceTo(m.position) < 1) {
                    m.userData.health -= projectiles[j].userData.damage;
                    createHitEffect(m.position.clone(), 0xffaa00);
                    getDungeonScene().remove(projectiles[j]);
                    projectiles.splice(j, 1);
                    break;
                }
            }
            if (m.userData.lifespan <= 0 || m.userData.health <= 0) {
                getDungeonScene().remove(m);
                d.mirrors.splice(i, 1);
            }
        }
        
        d.zoneCooldown -= delta;
        if (d.zoneCooldown <= 0) {
            const zone = new THREE.Mesh(new THREE.CircleGeometry(2, 16), new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
            zone.position.copy(player.position);
            zone.position.y = 0.1;
            zone.rotation.x = -Math.PI / 2;
            zone.userData = { lifespan: 5 + d.tier * 2 };
            getDungeonScene().add(zone);
            d.zones.push(zone);
            d.zoneCooldown = 10;
        }
        
        for (let i = d.zones.length - 1; i >= 0; i--) {
            const z = d.zones[i];
            z.userData.lifespan -= delta;
            z.material.opacity = 0.3 + Math.sin(Date.now() * 0.01) * 0.1;
            if (d.tier >= 2) {
                const toP = new THREE.Vector3().subVectors(player.position, z.position);
                toP.y = 0;
                toP.normalize().multiplyScalar(delta * 2);
                z.position.add(toP);
            }
            if (player.position.distanceTo(z.position) < 2 && !player.userData.invulnerable) {
                gameBridge.damagePlayer(10);
                player.userData.invulnerable = true;
                player.userData.invulnerableTimer = 0.5;
            }
            if (z.userData.lifespan <= 0) {
                getDungeonScene().remove(z);
                d.zones.splice(i, 1);
            }
        }
    } else if (d.type === 'emperor') {
        if (!d.speechGiven) { d.speechGiven = true; if (window.showEmperorDialogue) window.showEmperorDialogue(); }
        currentBoss.position.y = 0.2 + Math.sin(Date.now() * 0.002) * 0.1;
        currentBoss.lookAt(player.position.x, currentBoss.position.y, player.position.z);
        
        d.attackCooldown -= delta;
        if (d.attackCooldown <= 0) {
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2 + Date.now() * 0.001;
                createEnemyProjectile(currentBoss.position.clone(), currentBoss.position.clone().add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(20)), 15, 0xffd700, 10);
            }
            d.attackCooldown = 2;
        }
        
        d.slamCooldown -= delta;
        if (d.slamCooldown <= 0) {
            createShockwave(currentBoss.position.clone(), 3);
            d.slamCooldown = 5;
        }
        
        d.summonCooldown -= delta;
        if (d.summonCooldown <= 0 && enemies.length < 3) {
            const a = Math.random() * Math.PI * 2;
            createEnemy('drone', new THREE.Vector3(currentBoss.position.x + Math.cos(a) * 4, 0, currentBoss.position.z + Math.sin(a) * 4), 10);
            d.summonCooldown = 8;
        }
    }
}

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

function createShockwave(position, tier) {
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
    boss.traverse(c => { if (c.material?.emissive) { const orig = c.material.emissive.getHex(); c.material.emissive.setHex(0xffffff); setTimeout(() => c.material.emissive.setHex(orig), 100); } });
    if (boss.userData.health <= 0) destroyBoss();
}

function destroyBoss() {
    const scene = getDungeonScene();
    if (!currentBoss) return;
    const xpVals = { sentinel: 100, hollow: 150, dreamer: 200, emperor: 500 };
    xpGained += xpVals[currentBoss.userData.type] || 100;
    if (currentBoss.userData.drones) currentBoss.userData.drones.forEach(d => scene.remove(d));
    if (currentBoss.userData.mirrors) currentBoss.userData.mirrors.forEach(m => scene.remove(m));
    if (currentBoss.userData.zones) currentBoss.userData.zones.forEach(z => scene.remove(z));
    if (currentBoss.userData.trails) currentBoss.userData.trails.forEach(t => scene.remove(t));
    createHitEffect(currentBoss.position.clone(), 0xffffff);
    scene.remove(currentBoss);
    currentBoss = null;
}

export function getBoss() { return currentBoss; }
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
    const orig = node.material.color.getHex();
    node.material.color.setHex(0xffffff);
    setTimeout(() => node.material.color.setHex(orig), 100);
    
    if (node.userData.health <= 0) {
        node.userData.active = false;
        node.visible = false;
        createHitEffect(node.getWorldPosition(new THREE.Vector3()), pillarBoss.userData.glowColor);
        xpGained += 30;
        
        if (pillarBoss.userData.weakSpots.filter(n => n.userData.active).length === 0) {
            xpGained += 200 + pillarBoss.userData.floor * 30;
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
        if (player.position.distanceTo(e.position) < player.userData.radius + e.userData.radius) {
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

// ============================================
// MAIN UPDATE
// ============================================

export function updateEntities(delta, gameData, inputState) {
    updatePlayer(delta, inputState);
    updateProjectiles(delta);
    updateEnemyProjectiles(delta);
    updateEnemies(delta);
    updateBoss(delta);
    updatePillarBoss(delta);
}
