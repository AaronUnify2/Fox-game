// ============================================
// ECHOES OF THE OBELISK - Controls System
// Mobile: Joystick left, buttons right, swipe camera
// Desktop: WASD + mouse
// ============================================

import * as THREE from 'three';
import { checkNPCInteraction, triggerNPCInteraction } from './town.js';

let camera;
let canvas;
let cameraTarget = null;

// Input state
const inputState = {
    moveX: 0,
    moveZ: 0,
    jump: false,
    attack: false,
    ability1: false,
    ability2: false,
    ability3: false,
    lookX: 0,
    lookY: 0
};

// Touch tracking
const touches = {
    joystick: null,
    camera: null
};

// Joystick state
const joystick = {
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    element: null,
    knob: null
};

// Camera settings
const cameraSettings = {
    distance: 12,
    height: 8,
    angle: Math.PI, // Start behind player
    targetAngle: Math.PI,
    angleSmoothing: 3,
    autoFollowEnabled: true,
    manualControlTimer: 0,
    minDistance: 3,
    smoothing: 0.1
};

// Raycaster for camera collision
const raycaster = new THREE.Raycaster();

// ============================================
// CAMERA MODES
//   'follow'  -> third-person orbit (town)
//   'fps'     -> first person (dungeon default)
//   'topdown' -> zoomed-out top-down debug view (dungeon toggle)
// ============================================
let cameraMode = 'follow';
const fps = { yaw: 0, pitch: -0.05, eyeHeight: 1.6, sens: 0.005 };
const topDown = { height: 55 };
let topDownCenter = null; // when set ({x,z,h}), top-down uses a fixed overview instead of following the player (town map)

export function setCameraMode(mode) {
    cameraMode = mode;
    if (mode !== 'topdown') topDownCenter = null; // keep the fixed town overview only while in top-down
    inputState.cameraRelative = (mode === 'fps');
    inputState.cameraYaw = fps.yaw;
    inputState.cameraPitch = fps.pitch;
    // Crosshair shows only in first person — hide it in the top-down debug view.
    const ui = document.getElementById('game-ui');
    if (ui) ui.classList.toggle('topdown', mode === 'topdown');
    if (camera) {
        // top-down looks straight down, so orient "north" (-Z) toward screen top
        if (mode === 'topdown') camera.up.set(0, 0, -1);
        else camera.up.set(0, 1, 0);
    }

    // Keep both camera-toggle buttons labelled with the mode they switch TO.
    const dBtn = document.getElementById('btn-camera-toggle');
    if (dBtn) dBtn.textContent = (mode === 'topdown') ? 'FPS VIEW' : 'TOP-DOWN';
    const tBtn = document.getElementById('btn-town-camera');
    if (tBtn) tBtn.textContent = (mode === 'topdown') ? 'FPS VIEW' : 'TOP-DOWN MAP';

    // (Legacy) Follow mode is no longer used — town now runs in FPS like the
    // dungeon — but the snap is kept harmless in case follow is ever re-enabled.
    if (mode === 'follow' && camera && cameraTarget) {
        const behind = cameraTarget.rotation.y + Math.PI;
        cameraSettings.angle = behind;
        cameraSettings.targetAngle = behind;
        cameraSettings.manualControlTimer = 0;
        camera.position.set(
            cameraTarget.position.x + Math.sin(behind) * cameraSettings.distance,
            cameraTarget.position.y + cameraSettings.height,
            cameraTarget.position.z + Math.cos(behind) * cameraSettings.distance
        );
        camera.lookAt(cameraTarget.position.x, cameraTarget.position.y + 1, cameraTarget.position.z);
    }
}

export function getCameraMode() {
    return cameraMode;
}

// Toggle between FPS and top-down (dungeon only)
export function toggleDungeonCamera() {
    if (cameraMode === 'follow') return; // no-op in town
    setCameraMode(cameraMode === 'topdown' ? 'fps' : 'topdown');
    const btn = document.getElementById('btn-camera-toggle');
    if (btn) btn.textContent = (cameraMode === 'topdown') ? 'FPS VIEW' : 'TOP-DOWN';
}

// Toggle between first-person and a fixed top-down overview (town button).
export function toggleTownCamera() {
    if (cameraMode === 'topdown') {
        setCameraMode('fps'); // back to first person (clears the fixed overview)
    } else {
        setCameraMode('topdown');
        topDownCenter = { x: 0, z: -6, h: 50 }; // fixed overhead framing the whole town
    }
    // Button labels are handled in setCameraMode.
}

// Point the first-person view at a given yaw (and optional pitch). Called on
// scene entry so the player spawns facing something sensible.
export function setFPSLook(yaw, pitch = -0.05) {
    fps.yaw = yaw;
    fps.pitch = pitch;
    inputState.cameraYaw = yaw;
    inputState.cameraPitch = pitch;
}

// Apply look input (swipe/mouse drag) according to the active camera mode
function applyLook(dx, dy) {
    if (cameraMode === 'fps') {
        fps.yaw -= dx * fps.sens;
        fps.pitch -= dy * fps.sens;
        fps.pitch = Math.max(-1.4, Math.min(1.4, fps.pitch));
        inputState.cameraYaw = fps.yaw;
        inputState.cameraPitch = fps.pitch;
    } else if (cameraMode === 'follow') {
        cameraSettings.angle -= dx * 0.01;
        cameraSettings.targetAngle = cameraSettings.angle;
        cameraSettings.height = Math.max(4, Math.min(15, cameraSettings.height - dy * 0.02));
        cameraSettings.manualControlTimer = 1.5;
    }
    // topdown: look input ignored
}

// ============================================
// INITIALIZATION
// ============================================

export async function initControls(cam, canvasElement) {
    camera = cam;
    canvas = canvasElement;
    
    setupJoystick();
    setupButtons();
    setupCameraControls();
    setupKeyboard();
    setupGlobalTouchHandlers();
    
    return Promise.resolve();
}

// ============================================
// JOYSTICK (Left side)
// ============================================

function setupJoystick() {
    joystick.element = document.getElementById('joystick-zone');
    joystick.knob = document.getElementById('joystick-knob');
    
    if (!joystick.element) return;
    
    joystick.element.addEventListener('touchstart', handleJoystickStart, { passive: false });
    joystick.element.addEventListener('touchmove', handleJoystickMove, { passive: false });
    joystick.element.addEventListener('touchend', handleJoystickEnd, { passive: false });
    joystick.element.addEventListener('touchcancel', handleJoystickEnd, { passive: false });
}

function handleJoystickStart(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    touches.joystick = touch.identifier;
    
    const rect = joystick.element.getBoundingClientRect();
    joystick.startX = rect.left + rect.width / 2;
    joystick.startY = rect.top + rect.height / 2;
    joystick.currentX = touch.clientX;
    joystick.currentY = touch.clientY;
    joystick.active = true;
    
    updateJoystickVisual();
}

function handleJoystickMove(e) {
    e.preventDefault();
    
    for (const touch of e.changedTouches) {
        if (touch.identifier === touches.joystick) {
            joystick.currentX = touch.clientX;
            joystick.currentY = touch.clientY;
            
            const dx = joystick.currentX - joystick.startX;
            const dy = joystick.currentY - joystick.startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = 50;
            
            if (dist > 0) {
                const clampedDist = Math.min(dist, maxDist);
                inputState.moveX = (dx / dist) * (clampedDist / maxDist);
                inputState.moveZ = (dy / dist) * (clampedDist / maxDist);
            }
            
            updateJoystickVisual();
            break;
        }
    }
}

function handleJoystickEnd(e) {
    e.preventDefault();
    
    for (const touch of e.changedTouches) {
        if (touch.identifier === touches.joystick) {
            resetJoystick();
            break;
        }
    }
}

function resetJoystick() {
    touches.joystick = null;
    joystick.active = false;
    inputState.moveX = 0;
    inputState.moveZ = 0;
    
    if (joystick.knob) {
        joystick.knob.style.transform = 'translate(-50%, -50%)';
    }
}

function updateJoystickVisual() {
    if (!joystick.knob) return;
    
    const dx = joystick.currentX - joystick.startX;
    const dy = joystick.currentY - joystick.startY;
    const maxDist = 40;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    let clampedX = dx;
    let clampedY = dy;
    
    if (dist > maxDist) {
        clampedX = (dx / dist) * maxDist;
        clampedY = (dy / dist) * maxDist;
    }
    
    joystick.knob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
}

// ============================================
// BUTTONS (Right side)
// ============================================

function setupButtons() {
    // Camera mode toggle (dungeon)
    const camToggle = document.getElementById('btn-camera-toggle');
    if (camToggle) {
        camToggle.addEventListener('click', (e) => {
            e.preventDefault();
            toggleDungeonCamera();
        });
    }

    // Camera mode toggle (town top-down map)
    const townCamToggle = document.getElementById('btn-town-camera');
    if (townCamToggle) {
        townCamToggle.addEventListener('click', (e) => {
            e.preventDefault();
            toggleTownCamera();
        });
    }
    
    // Jump button
    const jumpBtn = document.getElementById('btn-jump');
    if (jumpBtn) {
        jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            inputState.jump = true;
        }, { passive: false });
        jumpBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            inputState.jump = false;
        }, { passive: false });
    }
    
    // Attack button
    const attackBtn = document.getElementById('btn-attack');
    if (attackBtn) {
        attackBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            inputState.attack = true;
        }, { passive: false });
        attackBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            inputState.attack = false;
        }, { passive: false });
    }
    
    // Ability buttons
    ['spread', 'burst', 'mega'].forEach((ability, index) => {
        const btn = document.getElementById(`btn-${ability}`);
        if (btn) {
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                inputState[`ability${index + 1}`] = true;
            }, { passive: false });
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                inputState[`ability${index + 1}`] = false;
            }, { passive: false });
        }
    });
    
    // Town interact button
    const interactBtn = document.getElementById('btn-interact');
    if (interactBtn) {
        interactBtn.addEventListener('click', () => {
            triggerNPCInteraction();
        });
    }
    
    // Enter dungeon button
    const enterBtn = document.getElementById('btn-enter-dungeon');
    if (enterBtn) {
        enterBtn.addEventListener('click', () => {
            window.gameAPI.showFloorSelect();
        });
    }
    
    // Dialogue close
    const dialogueClose = document.getElementById('dialogue-close');
    if (dialogueClose) {
        dialogueClose.addEventListener('click', () => {
            window.gameAPI.closeDialogue();
        });
    }
}

// ============================================
// CAMERA CONTROLS (Swipe on right side)
// ============================================

function setupCameraControls() {
    const cameraZone = document.getElementById('camera-zone');
    if (!cameraZone) return;
    
    cameraZone.addEventListener('touchstart', handleCameraStart, { passive: false });
    cameraZone.addEventListener('touchmove', handleCameraMove, { passive: false });
    cameraZone.addEventListener('touchend', handleCameraEnd, { passive: false });
    cameraZone.addEventListener('touchcancel', handleCameraEnd, { passive: false });
}

let lastCameraX = 0;
let lastCameraY = 0;

function handleCameraStart(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    touches.camera = touch.identifier;
    lastCameraX = touch.clientX;
    lastCameraY = touch.clientY;
    
    // Manual control - disable auto-follow temporarily
    cameraSettings.manualControlTimer = 1.5;
}

function handleCameraMove(e) {
    e.preventDefault();
    
    for (const touch of e.changedTouches) {
        if (touch.identifier === touches.camera) {
            const dx = touch.clientX - lastCameraX;
            const dy = touch.clientY - lastCameraY;
            
            applyLook(dx, dy);
            
            lastCameraX = touch.clientX;
            lastCameraY = touch.clientY;
            break;
        }
    }
}

function handleCameraEnd(e) {
    e.preventDefault();
    
    for (const touch of e.changedTouches) {
        if (touch.identifier === touches.camera) {
            touches.camera = null;
            break;
        }
    }
}

// ============================================
// KEYBOARD CONTROLS
// ============================================

function setupKeyboard() {
    const keys = {};
    
    window.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        updateKeyboardInput(keys);
        
        if (e.code === 'Space') {
            inputState.jump = true;
        }
        if (e.code === 'KeyJ' || e.code === 'Enter') {
            inputState.attack = true;
        }
        if (e.code === 'Digit1') inputState.ability1 = true;
        if (e.code === 'Digit2') inputState.ability2 = true;
        if (e.code === 'Digit3') inputState.ability3 = true;
        if (e.code === 'KeyE') triggerNPCInteraction();
        if (e.code === 'KeyV') toggleDungeonCamera();
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
        updateKeyboardInput(keys);
        
        if (e.code === 'Space') inputState.jump = false;
        if (e.code === 'KeyJ' || e.code === 'Enter') inputState.attack = false;
        if (e.code === 'Digit1') inputState.ability1 = false;
        if (e.code === 'Digit2') inputState.ability2 = false;
        if (e.code === 'Digit3') inputState.ability3 = false;
    });
    
    // Mouse for camera on desktop
    let mouseDown = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    
    canvas.addEventListener('mousedown', (e) => {
        mouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        cameraSettings.manualControlTimer = 1.5;
    });
    
    window.addEventListener('mouseup', () => {
        mouseDown = false;
    });
    
    window.addEventListener('mousemove', (e) => {
        if (mouseDown) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            // mouse is less sensitive than touch in follow mode; applyLook handles both
            applyLook(cameraMode === 'follow' ? dx * 0.5 : dx, cameraMode === 'follow' ? dy * 0.5 : dy);
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });
}

function updateKeyboardInput(keys) {
    inputState.moveX = 0;
    inputState.moveZ = 0;
    
    if (keys['KeyW'] || keys['ArrowUp']) inputState.moveZ = -1;
    if (keys['KeyS'] || keys['ArrowDown']) inputState.moveZ = 1;
    if (keys['KeyA'] || keys['ArrowLeft']) inputState.moveX = -1;
    if (keys['KeyD'] || keys['ArrowRight']) inputState.moveX = 1;
    
    // Normalize diagonal
    if (inputState.moveX !== 0 && inputState.moveZ !== 0) {
        inputState.moveX *= 0.707;
        inputState.moveZ *= 0.707;
    }
}

// ============================================
// GLOBAL TOUCH HANDLERS (Fix stuck joystick)
// ============================================

function setupGlobalTouchHandlers() {
    document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });
    document.addEventListener('touchcancel', handleGlobalTouchEnd, { passive: false });
}

function handleGlobalTouchEnd(e) {
    // Check if joystick touch is still active
    if (touches.joystick !== null) {
        let joystickTouchStillActive = false;
        for (const touch of e.touches) {
            if (touch.identifier === touches.joystick) {
                joystickTouchStillActive = true;
                break;
            }
        }
        if (!joystickTouchStillActive) {
            resetJoystick();
        }
    }
    
    // Check camera touch
    if (touches.camera !== null) {
        let cameraTouchStillActive = false;
        for (const touch of e.touches) {
            if (touch.identifier === touches.camera) {
                cameraTouchStillActive = true;
                break;
            }
        }
        if (!cameraTouchStillActive) {
            touches.camera = null;
        }
    }
}

// ============================================
// CAMERA UPDATE
// ============================================

export function updateControls(delta, target, scene) {
    if (!camera || !target) return;
    
    cameraTarget = target;
    
    if (cameraMode === 'fps') {
        // First person: camera sits at the player's eye, body hidden
        target.visible = false;
        target.rotation.y = fps.yaw;            // body + attacks face the view
        inputState.cameraRelative = true;
        inputState.cameraYaw = fps.yaw;
        inputState.cameraPitch = fps.pitch;
        updateFPSCamera(target);
    } else if (cameraMode === 'topdown') {
        // Zoomed-out top-down debug view
        target.visible = true;
        inputState.cameraRelative = false;
        updateTopDownCamera(target);
    } else {
        // Third-person follow (town)
        target.visible = true;
        inputState.cameraRelative = false;
        updateFollowCamera(delta, target, scene);
        // NPC proximity prompts only matter in the follow/town view
        checkNPCInteraction(target.position);
    }
}

function updateFPSCamera(target) {
    const ex = target.position.x;
    const ey = target.position.y + fps.eyeHeight;
    const ez = target.position.z;
    camera.position.set(ex, ey, ez);
    
    const cp = Math.cos(fps.pitch);
    const fx = Math.sin(fps.yaw) * cp;
    const fy = Math.sin(fps.pitch);
    const fz = Math.cos(fps.yaw) * cp;
    camera.lookAt(ex + fx, ey + fy, ez + fz);
}

function updateTopDownCamera(target) {
    // Town map uses a fixed overview (topDownCenter); the dungeon follows the player.
    const cx = topDownCenter ? topDownCenter.x : target.position.x;
    const cz = topDownCenter ? topDownCenter.z : target.position.z;
    const cy = topDownCenter ? topDownCenter.h : target.position.y + topDown.height;
    camera.position.set(cx, cy, cz);
    camera.lookAt(cx, 0, cz);
}

function updateFollowCamera(delta, target, scene) {
    // Manual control timer
    if (cameraSettings.manualControlTimer > 0) {
        cameraSettings.manualControlTimer -= delta;
    }
    
    // Auto-follow when moving (if not manually controlling)
    if (cameraSettings.autoFollowEnabled && cameraSettings.manualControlTimer <= 0) {
        const isMoving = Math.abs(inputState.moveX) > 0.1 || Math.abs(inputState.moveZ) > 0.1;
        
        if (isMoving) {
            const playerFacingAngle = Math.atan2(inputState.moveX, inputState.moveZ);
            cameraSettings.targetAngle = playerFacingAngle + Math.PI;
        }
        
        let angleDiff = cameraSettings.targetAngle - cameraSettings.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        cameraSettings.angle += angleDiff * delta * cameraSettings.angleSmoothing;
    }
    
    const desiredPos = new THREE.Vector3(
        target.position.x + Math.sin(cameraSettings.angle) * cameraSettings.distance,
        target.position.y + cameraSettings.height,
        target.position.z + Math.cos(cameraSettings.angle) * cameraSettings.distance
    );
    
    const finalPos = checkCameraCollision(target.position, desiredPos, scene);
    camera.position.lerp(finalPos, cameraSettings.smoothing);
    
    const lookTarget = new THREE.Vector3(
        target.position.x,
        target.position.y + 1.2,
        target.position.z
    );
    camera.lookAt(lookTarget);
}

function checkCameraCollision(playerPos, desiredCamPos, scene) {
    if (!scene) return desiredCamPos;
    
    const rayOrigin = new THREE.Vector3(
        playerPos.x,
        playerPos.y + 1.5,
        playerPos.z
    );
    
    const direction = new THREE.Vector3().subVectors(desiredCamPos, rayOrigin);
    const distance = direction.length();
    direction.normalize();
    
    raycaster.set(rayOrigin, direction);
    raycaster.far = distance;
    
    // Get collidable objects (walls, large objects)
    const collidables = [];
    scene.traverse(obj => {
        if (!obj.isMesh) return;
        if (obj.userData?.isPlatform || obj.userData?.isPortal) return;
        
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        
        // Only check large objects
        if (size.x > 1 || size.y > 1 || size.z > 1) {
            collidables.push(obj);
        }
    });
    
    const intersects = raycaster.intersectObjects(collidables, false);
    
    if (intersects.length > 0) {
        const hitDistance = intersects[0].distance;
        const safeDistance = Math.max(hitDistance - 0.5, cameraSettings.minDistance);
        
        return new THREE.Vector3(
            rayOrigin.x + direction.x * safeDistance,
            rayOrigin.y + direction.y * safeDistance,
            rayOrigin.z + direction.z * safeDistance
        );
    }
    
    return desiredCamPos;
}

// ============================================
// EXPORTS
// ============================================

export function getInputState() {
    return inputState;
}

export function resetInput() {
    inputState.moveX = 0;
    inputState.moveZ = 0;
    inputState.jump = false;
    inputState.attack = false;
    inputState.ability1 = false;
    inputState.ability2 = false;
    inputState.ability3 = false;
}

export function setCameraTarget(target) {
    cameraTarget = target;
}
