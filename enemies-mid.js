// enemies-mid.js — mid-game minibosses (floors 4-9): Hollow, Dreamer.
// Behaviors operate on a passed-in entity so the same type can later spawn
// as an elite in the common pool. Registers itself with the engine on load.
import * as THREE from 'three';
import { getDungeonScene } from './dungeon.js';
import {
    registerBoss,
    registerEnemy,
    getPlayer,
    createHitEffect,
    createShockwave,
    createEnemyProjectile,
    getProjectiles,
    hurtPlayer,
    disposeObject3D,
} from './entities.js';

// ---------------------------------------------------------------------------
// HOLLOW (floors 4-6) — teleporter that lays damaging trails and slams.
// ---------------------------------------------------------------------------
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

function updateHollow(boss, delta) {
    const player = getPlayer();
    if (!player) return;
    const d = boss.userData;

    boss.rotation.y += Math.sin(Date.now() * 0.01) * 0.02;
    boss.position.y = Math.sin(Date.now() * 0.005) * 0.1;
    const toP = new THREE.Vector3().subVectors(player.position, boss.position);
    toP.y = 0;
    boss.rotation.y += (Math.atan2(toP.x, toP.z) - boss.rotation.y) * delta * 3;

    d.trailTimer -= delta;
    if (d.trailTimer <= 0 && d.phase === 'moving') {
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8), new THREE.MeshBasicMaterial({ color: 0x4a0066, transparent: true, opacity: 0.6 }));
        tr.position.copy(boss.position);
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
            hurtPlayer(5);
            player.userData.invulnerable = true;
            player.userData.invulnerableTimer = 0.3;
        }
        if (tr.userData.lifespan <= 0) {
            getDungeonScene().remove(tr);
            disposeObject3D(tr);
            d.trails.splice(i, 1);
        }
    }

    d.teleportCooldown -= delta;
    if (d.teleportCooldown <= 0 && d.phase === 'idle') {
        d.phase = 'teleporting';
        toP.normalize().multiplyScalar(3);
        const newPos = player.position.clone().sub(toP);
        createHitEffect(boss.position.clone(), 0xbf00ff);
        boss.position.x = newPos.x;
        boss.position.z = newPos.z;
        createHitEffect(boss.position.clone(), 0xbf00ff);
        if (boss.position.distanceTo(player.position) < 2 && !player.userData.invulnerable) {
            hurtPlayer(20);
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
            createShockwave(boss.position.clone(), d.tier);
            if (d.tier >= 2) setTimeout(() => createShockwave(boss.position.clone(), d.tier), 500);
            d.slamCooldown = 5;
            d.phase = 'idle';
        }, 500);
    }
}

// ---------------------------------------------------------------------------
// DREAMER (floors 7-9) — radial shards, orbiting mirrors, chasing zones.
// ---------------------------------------------------------------------------
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

function updateDreamer(boss, delta) {
    const player = getPlayer();
    if (!player) return;
    const d = boss.userData;
    const projectiles = getProjectiles();

    boss.position.y = 2 + Math.sin(Date.now() * 0.002) * 0.5;
    boss.children[0].material.opacity = 0.7 + Math.sin(Date.now() * 0.005) * 0.2;
    boss.children.forEach(c => {
        if (c.name?.startsWith('face')) {
            c.material.opacity = Math.random() > 0.7 ? 0.6 : 0.2;
            c.position.x += (Math.random() - 0.5) * 0.02;
            c.position.y += (Math.random() - 0.5) * 0.02;
        }
    });
    boss.lookAt(player.position.x, boss.position.y, player.position.z);

    d.attackCooldown -= delta;
    if (d.attackCooldown <= 0) {
        const numShards = 5 + d.tier * 2;
        for (let i = 0; i < numShards; i++) {
            const a = (i / numShards) * Math.PI * 2 + Date.now() * 0.001;
            const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
            createEnemyProjectile(boss.position.clone(), boss.position.clone().add(dir.multiplyScalar(20)), 10, 0xffaa00, 6);
        }
        d.attackCooldown = 2 - d.tier * 0.3;
    }

    d.mirrorCooldown -= delta;
    if (d.mirrorCooldown <= 0 && d.mirrors.length < d.tier) {
        const mirror = boss.clone();
        mirror.scale.setScalar(0.8);
        const clonedLights = [];
        mirror.traverse(c => { if (c.isLight) clonedLights.push(c); else if (c.material) { c.material = c.material.clone(); c.material.opacity *= 0.6; } });
        clonedLights.forEach(l => l.parent?.remove(l));   // no duplicated boss lights
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
        m.position.x = boss.position.x + Math.cos(angle) * 4;
        m.position.z = boss.position.z + Math.sin(angle) * 4;
        m.position.y = boss.position.y;

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
            // Dispose only the cloned materials; the geometries are shared by
            // reference with the living boss, so they must survive.
            m.traverse(c => { if (c.material && !c.material.userData?.shared) c.material.dispose(); });
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
            hurtPlayer(10);
            player.userData.invulnerable = true;
            player.userData.invulnerableTimer = 0.5;
        }
        if (z.userData.lifespan <= 0) {
            getDungeonScene().remove(z);
            disposeObject3D(z);
            d.zones.splice(i, 1);
        }
    }
}

registerBoss('hollow', { create: createHollow, update: updateHollow });
registerBoss('dreamer', { create: createDreamer, update: updateDreamer });

// ===========================================================================
// MIDGAME ENEMY POOL (Hybrid theme) — Hybrid, Bulwark, Arc Capacitor.
// Each registers a config (stats), build (mesh), update (behavior), and
// optionally onDamage (how it takes player damage by method/direction).
// ===========================================================================

const DREAM = 0xc850ff;   // corrupted dream-core accent
const ARC = 0x66ddff;     // energy shield / capacitor accent

// ---- HYBRID: a corrupted machine. Sword the chassis, magic the exposed core.
function buildHybrid(enemy, { bodyColor }) {
    const mat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.7, roughness: 0.4 });
    enemy.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.8), mat).translateY(0.9));      // chassis
    enemy.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.6), mat).translateY(1.4));      // shoulders
    [[-0.35, 0.4], [0.35, 0.4]].forEach(p => enemy.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), mat).translateX(p[0]).translateY(p[1])));
    enemy.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), mat).translateY(1.75));   // head
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: DREAM }));
    core.name = 'hybridCore';
    core.position.set(0, 1.0, 0.42);   // exposed at the front
    enemy.add(core);
}

function updateHybrid(e, delta, dist, toPlayer) {
    const player = getPlayer();
    if (!player) return;
    const d = e.userData;
    e.lookAt(player.position.x, e.position.y, player.position.z);
    if (dist > 1.2) {
        const dir = toPlayer.clone().normalize();
        e.position.x += dir.x * d.speed * delta;
        e.position.z += dir.z * d.speed * delta;
    }
    const core = e.getObjectByName('hybridCore');
    if (core) core.scale.setScalar(1 + Math.sin(Date.now() * 0.006) * 0.18);
}

registerEnemy('hybrid', {
    config: { hp: 70, dmg: 16, radius: 0.7, speed: 2.5 },
    build: buildHybrid,
    update: updateHybrid,
    onDamage: (e, damage, source) => source === 'magic' ? damage * 1.6 : damage,   // core melts to magic
});

// ---- BULWARK: a slow-turning shielded advancer. Its front deflects magic;
// flank it for a magic hit, or just sword it.
function buildBulwark(enemy, { bodyColor }) {
    const mat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.8, roughness: 0.3 });
    enemy.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.4, 8), mat).translateY(0.9));
    enemy.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), mat).translateY(1.7));
    [[-0.25, 0.4], [0.25, 0.4]].forEach(p => enemy.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), mat).translateX(p[0]).translateY(p[1])));
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.8, 0.08), new THREE.MeshBasicMaterial({ color: ARC, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    shield.position.set(0, 1.0, 0.7);   // on the +z face (front)
    shield.name = 'shield';
    enemy.add(shield);
    enemy.add(new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 4), new THREE.MeshStandardMaterial({ color: ARC, emissive: ARC, emissiveIntensity: 0.5 })).translateY(1.0).translateZ(0.7));
}

function updateBulwark(e, delta, dist, toPlayer) {
    const player = getPlayer();
    if (!player) return;
    const d = e.userData;
    // Turn slowly toward the player so a quick player can round its flank.
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    let diff = targetYaw - e.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = 1.2 * delta;
    e.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
    if (dist > 1.3) {
        const dir = toPlayer.clone().normalize();
        e.position.x += dir.x * d.speed * delta;
        e.position.z += dir.z * d.speed * delta;
    }
}

function bulwarkDeflect(e, damage, source, fromPos) {
    if (source === 'magic' && fromPos) {
        const fwd = new THREE.Vector3(Math.sin(e.rotation.y), 0, Math.cos(e.rotation.y));
        const toHit = new THREE.Vector3(fromPos.x - e.position.x, 0, fromPos.z - e.position.z).normalize();
        if (fwd.dot(toHit) > 0.6) {   // struck the shielded front arc
            createHitEffect(new THREE.Vector3(e.position.x + fwd.x * 0.8, 1, e.position.z + fwd.z * 0.8), ARC);
            return 0;                 // deflected
        }
    }
    return damage;
}

registerEnemy('bulwark', {
    config: { hp: 60, dmg: 14, radius: 0.7, speed: 3 },
    build: buildBulwark,
    update: updateBulwark,
    onDamage: bulwarkDeflect,
});

// ---- ARC CAPACITOR: stationary; overcharges (telegraph) then releases a
// shockwave. Burst it with magic before it discharges, or back out of range.
function buildCapacitor(enemy, { bodyColor }) {
    const mat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.8, roughness: 0.3 });
    enemy.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8), mat).translateY(0.2));   // base
    enemy.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8), mat).translateY(0.9)); // pillar
    for (let i = 0; i < 3; i++) {
        enemy.add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 12), new THREE.MeshStandardMaterial({ color: ARC, emissive: ARC, emissiveIntensity: 0.4 })).translateY(0.6 + i * 0.3).rotateX(Math.PI / 2));
    }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), new THREE.MeshBasicMaterial({ color: ARC, transparent: true, opacity: 0.7 }));
    orb.position.y = 1.7;
    orb.name = 'capOrb';
    enemy.add(orb);
}

function updateCapacitor(e, delta, dist, toPlayer) {
    const player = getPlayer();
    if (!player) return;
    const d = e.userData;
    if (d.capPhase === undefined) { d.capPhase = 'idle'; d.capTimer = 1.5 + Math.random(); }
    const cap = e.getObjectByName('capOrb');

    if (d.capPhase === 'idle') {
        if (cap) cap.scale.setScalar(1);
        d.capTimer -= delta;
        if (d.capTimer <= 0 && dist < 9) { d.capPhase = 'charging'; d.capTimer = 1.8; }
    } else if (d.capPhase === 'charging') {
        d.capTimer -= delta;
        const t = 1 - Math.max(0, d.capTimer) / 1.8;   // 0 -> 1
        if (cap) {
            cap.scale.setScalar(1 + t * 1.2);          // swell as it charges
            cap.material.opacity = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() * 0.03 * (1 + t * 3)));
        }
        if (d.capTimer <= 0) {
            createShockwave(e.position.clone(), 2);    // damages the player if caught in the wave
            d.capPhase = 'idle';
            d.capTimer = 2.5;
            if (cap) cap.scale.setScalar(1);
        }
    }
}

registerEnemy('capacitor', {
    config: { hp: 50, dmg: 12, radius: 0.6, speed: 0 },
    build: buildCapacitor,
    update: updateCapacitor,
});
