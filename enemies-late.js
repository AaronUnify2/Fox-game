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
    getProjectiles,
    getEnemies,
    hurtPlayer,
    disposeObject3D,
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

// ===========================================================================
// LATE-GAME MINIBOSSES — Amalgam (A5), Progenitor (A6), Warden (A7).
// Enlarged versions of the new pool enemies with extra abilities. Registered
// with the boss registry; spawnMiniBoss maps them to floors 13-15/16-18/19-21.
// ===========================================================================

// ---- THE AMALGAM (floors 13-15) — enlarged Hybrid. Three orbiting dream-cores
// keep its chassis armored; MAGIC the cores to strip the armor while you SWORD
// the body. Vents shockwaves and summons a Hybrid add.
function createAmalgam(pos, tier, floor) {
    const scene = getDungeonScene();
    const boss = new THREE.Group();
    const hp = [900, 1200, 1500][tier - 1];
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2438, metalness: 0.7, roughness: 0.4, emissive: 0x1a0f2a, emissiveIntensity: 0.3 });
    boss.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 1.6), mat).translateY(1.4));
    boss.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 1.0), mat).translateY(2.2));
    [[-0.7, 0.6], [0.7, 0.6]].forEach(p => boss.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat).translateX(p[0]).translateY(p[1])));
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), mat).translateY(2.7));
    boss.add(new THREE.PointLight(0xc850ff, 1.2, 14).translateY(1.8));
    // dream-cores as separate, world-positioned satellites (magic weak points)
    const cores = [];
    for (let i = 0; i < 3; i++) {
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color: 0xc850ff }));
        core.userData = { hp: 60 + tier * 20, ang: (i / 3) * Math.PI * 2 };
        scene.add(core);
        cores.push(core);
    }
    boss.userData = { type: 'amalgam', tier, health: hp, maxHealth: hp, radius: 1.5, armor: 0.75, cores, ventTimer: 3, summonTimer: 6 };
    boss.position.copy(pos);
    scene.add(boss);
    return boss;
}

function updateAmalgam(boss, delta) {
    const player = getPlayer();
    if (!player) return;
    const d = boss.userData;
    boss.lookAt(player.position.x, boss.position.y, player.position.z);
    const projectiles = getProjectiles();

    let alive = 0;
    for (let i = d.cores.length - 1; i >= 0; i--) {
        const core = d.cores[i];
        core.userData.ang += delta * 0.8;
        const r = 2.6;
        core.position.set(boss.position.x + Math.cos(core.userData.ang) * r, 1.6 + Math.sin(core.userData.ang * 2) * 0.5, boss.position.z + Math.sin(core.userData.ang) * r);
        core.scale.setScalar(1 + Math.sin(Date.now() * 0.006 + i) * 0.15);
        for (let j = projectiles.length - 1; j >= 0; j--) {
            if (projectiles[j].position.distanceTo(core.position) < 0.7) {
                core.userData.hp -= projectiles[j].userData.damage;
                createHitEffect(core.position.clone(), 0xc850ff);
                getDungeonScene().remove(projectiles[j]);
                projectiles.splice(j, 1);
                break;
            }
        }
        if (core.userData.hp <= 0) { getDungeonScene().remove(core); disposeObject3D(core); d.cores.splice(i, 1); }
        else alive++;
    }
    // Armor scales with cores remaining: 3 -> 0.75 (chassis takes 25%), 0 -> exposed.
    d.armor = alive > 0 ? 0.25 + 0.5 * (alive / 3) : 0;

    d.ventTimer -= delta;
    if (d.ventTimer <= 0) { createShockwave(boss.position.clone(), 3); d.ventTimer = 4; }

    d.summonTimer -= delta;
    if (d.summonTimer <= 0 && getEnemies().length < 4) {
        const a = Math.random() * Math.PI * 2;
        createEnemy('hybrid', new THREE.Vector3(boss.position.x + Math.cos(a) * 4, 0, boss.position.z + Math.sin(a) * 4), d.tier + 12);
        d.summonTimer = 8;
    }
}

registerBoss('amalgam', { create: createAmalgam, update: updateAmalgam });

// ---- THE PROGENITOR (floors 16-18) — enlarged Splitter. Cycles between an
// OPEN window (vulnerable) and a BUDDING window (shielded, spits out Splitters).
// Burst the core between spawns.
function createProgenitor(pos, tier, floor) {
    const scene = getDungeonScene();
    const boss = new THREE.Group();
    const hp = [800, 1100, 1400][tier - 1];
    const sac = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 16), new THREE.MeshStandardMaterial({ color: 0x3a4a1a, emissive: 0x4a6a1a, emissiveIntensity: 0.3, roughness: 0.7 }));
    sac.scale.set(1, 1.2, 1); sac.position.y = 1.4; sac.name = 'sac';
    boss.add(sac);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0x9fd84f }));
    core.position.y = 1.4; core.name = 'pcore';
    boss.add(core);
    boss.add(new THREE.PointLight(0x9fd84f, 1.0, 12).translateY(1.4));
    boss.userData = { type: 'progenitor', tier, health: hp, maxHealth: hp, radius: 1.4, armor: 0, phase: 'open', phaseTimer: 3, budTimer: 0 };
    boss.position.copy(pos);
    scene.add(boss);
    return boss;
}

function updateProgenitor(boss, delta) {
    const player = getPlayer();
    if (!player) return;
    const d = boss.userData;
    const core = boss.getObjectByName('pcore');
    const sac = boss.getObjectByName('sac');
    d.phaseTimer -= delta;

    if (d.phase === 'open') {
        d.armor = 0;
        if (core) core.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.1);
        if (d.phaseTimer <= 0) { d.phase = 'budding'; d.phaseTimer = 2.0; d.budTimer = 0; }
    } else {
        d.armor = 0.8;
        if (sac) { const s = 1 + Math.sin(Date.now() * 0.02) * 0.08; sac.scale.set(s, 1.2, s); }
        d.budTimer -= delta;
        if (d.budTimer <= 0 && getEnemies().length < 6) {
            const a = Math.random() * Math.PI * 2;
            createEnemy('splitter', new THREE.Vector3(boss.position.x + Math.cos(a) * 2.5, 0, boss.position.z + Math.sin(a) * 2.5), d.tier + 15);
            d.budTimer = 0.6;
        }
        if (d.phaseTimer <= 0) { d.phase = 'open'; d.phaseTimer = 4.0; }
    }
}

registerBoss('progenitor', { create: createProgenitor, update: updateProgenitor });

// ---- THE WARDEN (floors 19-21) — enlarged Phase-wraith, last guard before the
// Dreamer. Long intangible phases (immune), teleport-lunges when solid, and
// leaves damaging after-images in its wake.
function createWarden(pos, tier, floor) {
    const scene = getDungeonScene();
    const boss = new THREE.Group();
    const hp = [1000, 1300, 1600][tier - 1];
    const mat = new THREE.MeshStandardMaterial({ color: 0xaab4d8, emissive: 0x4455aa, emissiveIntensity: 0.4, transparent: true, opacity: 0.9 });
    boss.add(new THREE.Mesh(new THREE.ConeGeometry(0.8, 3.0, 8), mat).translateY(1.5));
    boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), mat).translateY(2.9));
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x88aaff, emissive: 0x4466ff, emissiveIntensity: 0.6, metalness: 0.6 });
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        boss.add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 4), crownMat).translateX(Math.cos(a) * 0.3).translateY(3.2).translateZ(Math.sin(a) * 0.3));
    }
    [-0.13, 0.13].forEach(x => boss.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0x66ccff })).translateX(x).translateY(2.95).translateZ(0.3)));
    boss.add(new THREE.PointLight(0x6688ff, 1.0, 14).translateY(2));
    boss.userData = { type: 'warden', tier, health: hp, maxHealth: hp, radius: 1.0, phase: 'solid', phaseTimer: 2.0, armor: 0, lungeTimer: 1.0, trails: [] };
    boss.position.copy(pos);
    scene.add(boss);
    return boss;
}

function updateWarden(boss, delta) {
    const player = getPlayer();
    if (!player) return;
    const d = boss.userData;
    d.phaseTimer -= delta;
    if (d.phaseTimer <= 0) {
        if (d.phase === 'solid') { d.phase = 'phased'; d.phaseTimer = 3.0; }
        else {
            d.phase = 'solid'; d.phaseTimer = 2.2;
            const a = Math.random() * Math.PI * 2;     // teleport in on re-materializing
            boss.position.x = player.position.x + Math.cos(a) * 4;
            boss.position.z = player.position.z + Math.sin(a) * 4;
            createHitEffect(boss.position.clone(), 0x6688ff);
            d.lungeTimer = 0.6;
        }
    }
    const solid = d.phase === 'solid';
    d.armor = solid ? 0 : 1;   // immune while phased
    boss.traverse(c => { if (c.material && c.material.transparent) c.material.opacity = solid ? 0.92 : 0.25; });
    boss.position.y = Math.sin(Date.now() * 0.002) * 0.2;
    boss.lookAt(player.position.x, boss.position.y, player.position.z);

    const toP = new THREE.Vector3().subVectors(player.position, boss.position); toP.y = 0;
    const dist = toP.length();
    if (solid) {
        d.lungeTimer -= delta;
        let sp = 4;
        if (d.lungeTimer <= 0 && d.lungeTimer > -0.5) {
            sp = 16;   // lunge burst
            const img = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3.0, 8), new THREE.MeshBasicMaterial({ color: 0x6688ff, transparent: true, opacity: 0.4 }));
            img.position.copy(boss.position); img.position.y = 1.5;
            img.userData = { life: 2.0 };
            getDungeonScene().add(img);
            d.trails.push(img);
        }
        if (d.lungeTimer <= -0.5) d.lungeTimer = 1.6;
        if (dist > 1.2) { toP.normalize(); boss.position.x += toP.x * sp * delta; boss.position.z += toP.z * sp * delta; }
    } else if (dist > 3) {
        toP.normalize(); boss.position.x += toP.x * 1.5 * delta; boss.position.z += toP.z * 1.5 * delta;
    }

    for (let i = d.trails.length - 1; i >= 0; i--) {
        const img = d.trails[i];
        img.userData.life -= delta;
        img.material.opacity = img.userData.life / 2.0 * 0.4;
        if (player.position.distanceTo(img.position) < 1.3 && !player.userData.invulnerable) {
            hurtPlayer(12);
            player.userData.invulnerable = true;
            player.userData.invulnerableTimer = 0.5;
        }
        if (img.userData.life <= 0) { getDungeonScene().remove(img); disposeObject3D(img); d.trails.splice(i, 1); }
    }
}

registerBoss('warden', { create: createWarden, update: updateWarden });
