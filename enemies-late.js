// enemies-late.js — late-game miniboss (floors 10+): the Emperor.
// Behavior operates on a passed-in entity so the type can later spawn as an
// elite in the common pool. Registers itself with the engine on load.
import * as THREE from 'three';
import { getDungeonScene } from './dungeon.js';
import {
    registerBoss,
    getPlayer,
    createEnemyProjectile,
    createShockwave,
    createEnemy,
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
