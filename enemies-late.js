// enemies-late.js — late-game miniboss (floors 10+): the Emperor.
// Behavior operates on a passed-in entity so the type can later spawn as an
// elite in the common pool. Registers itself with the engine on load.
import * as THREE from 'three';
import { getDungeonScene } from './dungeon.js';
import {
    registerBoss,
    registerEnemy,
    getPlayer,
    createHitEffect,
    createEnemy,
    createEnemyProjectile,
    createShockwave,
    getEnemies,
} from './entities.js';

// ---------------------------------------------------------------------------
// EMPEROR (floors 10+) — radial volleys, ground slams, summons drones, speaks.
// Signature is (pos, tier, floor) to match the registry; tier is unused here.
// ---------------------------------------------------------------------------
function createEmperor(pos, tier, floor) {
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

function updateEmperor(boss, delta) {
    const player = getPlayer();
    if (!player) return;
    const d = boss.userData;

    if (!d.speechGiven) { d.speechGiven = true; if (window.showEmperorDialogue) window.showEmperorDialogue(); }
    boss.position.y = 0.2 + Math.sin(Date.now() * 0.002) * 0.1;
    boss.lookAt(player.position.x, boss.position.y, player.position.z);

    d.attackCooldown -= delta;
    if (d.attackCooldown <= 0) {
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + Date.now() * 0.001;
            createEnemyProjectile(boss.position.clone(), boss.position.clone().add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(20)), 15, 0xffd700, 10);
        }
        d.attackCooldown = 2;
    }

    d.slamCooldown -= delta;
    if (d.slamCooldown <= 0) {
        createShockwave(boss.position.clone(), 3);
        d.slamCooldown = 5;
    }

    d.summonCooldown -= delta;
    if (d.summonCooldown <= 0 && getEnemies().length < 3) {
        const a = Math.random() * Math.PI * 2;
        createEnemy('drone', new THREE.Vector3(boss.position.x + Math.cos(a) * 4, 0, boss.position.z + Math.sin(a) * 4), 10);
        d.summonCooldown = 8;
    }
}

registerBoss('emperor', { create: createEmperor, update: updateEmperor });

// ===========================================================================
// LATE-GAME ENEMY POOL (Nightmare theme) — Splitter, Phase-wraith, Lurker.
// ===========================================================================

// ---- SPLITTER: a nightmare cell. A clean SWORD kill destroys it whole; a
// MAGIC kill makes it DIVIDE into weaker cells (down to a generation cap).
function buildSplitter(enemy, { bodyColor }) {
    const CELL = 0x9fd84f;
    const skin = new THREE.MeshStandardMaterial({ color: CELL, emissive: CELL, emissiveIntensity: 0.3, transparent: true, opacity: 0.85, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), skin);
    body.name = 'cell';
    body.position.y = 0.5;
    enemy.add(body);
    for (let k = 0; k < 3; k++) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x335500 }));
        n.position.set((Math.random() - 0.5) * 0.4, 0.5 + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4);
        enemy.add(n);
    }
    enemy.add(new THREE.PointLight(CELL, 0.4, 4).translateY(0.5));
}

function updateSplitter(e, delta, dist, toPlayer) {
    const player = getPlayer();
    if (!player) return;
    const d = e.userData;
    if (dist > 1.0) {
        const dir = toPlayer.clone().normalize();
        e.position.x += dir.x * d.speed * delta;
        e.position.z += dir.z * d.speed * delta;
    }
    const cell = e.getObjectByName('cell');
    if (cell) {
        const s = 1 + Math.sin(Date.now() * 0.008 + (d.floor || 0)) * 0.12;
        cell.scale.set(s, 1 / s, s);   // wobble/squish
    }
}

function spawnSplitterChildren(parent, gen) {
    const floor = parent.userData.floor || 1;
    const hpFrac = gen === 1 ? 0.5 : 0.3;
    const scale = gen === 1 ? 0.7 : 0.5;
    for (let k = 0; k < 2; k++) {
        const off = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
        const child = createEnemy('splitter', parent.position.clone().add(off), floor);
        if (!child) continue;
        child.userData.gen = gen;
        child.userData.maxHealth = Math.max(8, Math.round(child.userData.maxHealth * hpFrac));
        child.userData.health = child.userData.maxHealth;
        child.userData.radius *= scale;
        child.scale.setScalar(scale);
    }
    createHitEffect(parent.position.clone(), 0x9fd84f);
}

registerEnemy('splitter', {
    config: { hp: 40, dmg: 12, radius: 0.5, speed: 3.2 },
    build: buildSplitter,
    update: updateSplitter,
    onDeath: (e, source) => {
        const gen = e.userData.gen || 0;
        if (source === 'magic' && gen < 2) {   // magic kill divides it (unless smallest)
            spawnSplitterChildren(e, gen + 1);
            return true;                         // handled: no drop, parent removed
        }
        return false;                            // sword kill (or smallest cell): dies whole
    },
});

// ---- PHASE-WRAITH: cycles intangible/solid. Only damageable (and only
// dangerous) when solid; lunges in those windows. Phases through shots otherwise.
function buildWraith(enemy, { bodyColor }) {
    const GHOST = 0xccddff;
    const mat = new THREE.MeshStandardMaterial({ color: GHOST, emissive: GHOST, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
    enemy.add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.0, 8), mat).translateY(1.0));
    enemy.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), mat).translateY(1.9));
    [-0.1, 0.1].forEach(x => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0x3355ff }));
        eye.position.set(x, 1.92, 0.22);
        enemy.add(eye);
    });
    enemy.add(new THREE.PointLight(GHOST, 0.4, 5).translateY(1.3));
}

function updateWraith(e, delta, dist, toPlayer) {
    const player = getPlayer();
    if (!player) return;
    const d = e.userData;
    if (d.phase === undefined) { d.phase = 'phased'; d.phaseTimer = 1.5; d.baseDamage = d.damage; d.lungeCd = 1.0; }
    d.phaseTimer -= delta;
    if (d.phaseTimer <= 0) {
        d.phase = d.phase === 'phased' ? 'solid' : 'phased';
        d.phaseTimer = d.phase === 'solid' ? 1.6 : 2.0;
    }
    const solid = d.phase === 'solid';
    e.traverse(c => { if (c.material && c.material.transparent) c.material.opacity = solid ? 0.9 : 0.22; });
    d.damage = solid ? d.baseDamage : 0;   // harmless while intangible
    e.lookAt(player.position.x, e.position.y, player.position.z);
    e.position.y = Math.sin(Date.now() * 0.003) * 0.15;

    if (solid) {
        d.lungeCd -= delta;
        let sp = d.speed;
        if (d.lungeCd <= 0 && d.lungeCd > -0.4) sp = d.speed * 3.5;   // 0.4s lunge burst
        if (d.lungeCd <= -0.4) d.lungeCd = 1.5;
        if (dist > 0.8) {
            const dir = toPlayer.clone().normalize();
            e.position.x += dir.x * sp * delta;
            e.position.z += dir.z * sp * delta;
        }
    } else if (dist > 2) {
        const dir = toPlayer.clone().normalize();   // drift slowly while phased
        e.position.x += dir.x * d.speed * 0.4 * delta;
        e.position.z += dir.z * d.speed * 0.4 * delta;
    }
}

registerEnemy('wraith', {
    config: { hp: 35, dmg: 18, radius: 0.5, speed: 3 },
    build: buildWraith,
    update: updateWraith,
    onDamage: (e, damage, source) => {
        if (e.userData.phase === 'phased') {
            createHitEffect(e.position.clone(), 0xccddff);   // shot passes through
            return 0;
        }
        return damage;
    },
});

// ---- LURKER: fast ambusher, semi-invisible at range (only its eyes glint),
// opaque as it closes in. Watch for the shimmer.
function buildLurker(enemy, { bodyColor }) {
    const SHADE = 0x7733bb;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a0d2e, emissive: SHADE, emissiveIntensity: 0.5, transparent: true, opacity: 0.5, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat);
    body.name = 'shade';
    body.scale.set(1.3, 0.7, 1.0);
    body.position.y = 0.6;
    enemy.add(body);
    [-0.12, 0.12].forEach(x => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3366 }));
        eye.position.set(x, 0.65, 0.4);
        enemy.add(eye);
    });
    enemy.add(new THREE.PointLight(SHADE, 0.3, 3).translateY(0.6));
}

function updateLurker(e, delta, dist, toPlayer) {
    const player = getPlayer();
    if (!player) return;
    const d = e.userData;
    if (dist > 0.9) {
        const dir = toPlayer.clone().normalize();
        e.position.x += dir.x * d.speed * delta;
        e.position.z += dir.z * d.speed * delta;
    }
    e.lookAt(player.position.x, e.position.y, player.position.z);
    e.position.y = 0.1 + Math.sin(Date.now() * 0.006) * 0.05;
    // Opaque up close, near-invisible at range (the eyes stay as the shimmer).
    const vis = Math.max(0.12, Math.min(1, (10 - dist) / 8));
    const shade = e.getObjectByName('shade');
    if (shade) shade.material.opacity = vis;
}

registerEnemy('lurker', {
    config: { hp: 30, dmg: 16, radius: 0.45, speed: 5.5 },
    build: buildLurker,
    update: updateLurker,
});
