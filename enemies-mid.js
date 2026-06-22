// enemies-mid.js — mid-game minibosses (floors 4-9): Hollow, Dreamer.
// Behaviors operate on a passed-in entity so the same type can later spawn
// as an elite in the common pool. Registers itself with the engine on load.
import * as THREE from 'three';
import { getDungeonScene } from './dungeon.js';
import {
    registerBoss,
    getPlayer,
    createHitEffect,
    createShockwave,
    createEnemyProjectile,
    getProjectiles,
    hurtPlayer,
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
            d.zones.splice(i, 1);
        }
    }
}

registerBoss('hollow', { create: createHollow, update: updateHollow });
registerBoss('dreamer', { create: createDreamer, update: updateDreamer });
