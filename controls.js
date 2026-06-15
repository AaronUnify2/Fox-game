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
            
            // Rotate camera
            cameraSettings.angle -= dx * 0.01;
            cameraSettings.targetAngle = cameraSettings.angle;
            
            // Adjust height slightly with vertical swipe
            cameraSettings.height = Math.max(4, Math.min(15, cameraSettings.height - dy * 0.02));
            
            lastCameraX = touch.clientX;
            lastCameraY = touch.clientY;
            
            // Keep manual control active
            cameraSettings.manualControlTimer = 1.5;
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
    
    canvas.addEventListener('mousedown', (e) => {
        mouseDown = true;
        lastMouseX = e.clientX;
        cameraSettings.manualControlTimer = 1.5;
    });
    
    window.addEventListener('mouseup', () => {
        mouseDown = false;
    });
    
    window.addEventListener('mousemove', (e) => {
        if (mouseDown) {
            const dx = e.clientX - lastMouseX;
            cameraSettings.angle -= dx * 0.005;
            cameraSettings.targetAngle = cameraSettings.angle;
            lastMouseX = e.clientX;
            cameraSettings.manualControlTimer = 1.5;
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
    
    // Manual control timer
    if (cameraSettings.manualControlTimer > 0) {
        cameraSettings.manualControlTimer -= delta;
    }
    
    // Auto-follow when moving (if not manually controlling)
    if (cameraSettings.autoFollowEnabled && cameraSettings.manualControlTimer <= 0) {
        const isMoving = Math.abs(inputState.moveX) > 0.1 || Math.abs(inputState.moveZ) > 0.1;
        
        if (isMoving) {
            // Calculate desired angle (behind player's movement direction)
            const playerFacingAngle = Math.atan2(inputState.moveX, inputState.moveZ);
            cameraSettings.targetAngle = playerFacingAngle + Math.PI;
        }
        
        // Smooth interpolation toward target angle
        let angleDiff = cameraSettings.targetAngle - cameraSettings.angle;
        
        // Normalize to -PI to PI for shortest rotation
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        cameraSettings.angle += angleDiff * delta * cameraSettings.angleSmoothing;
    }
    
    // Calculate desired camera position
    const desiredPos = new THREE.Vector3(
        target.position.x + Math.sin(cameraSettings.angle) * cameraSettings.distance,
        target.position.y + cameraSettings.height,
        target.position.z + Math.cos(cameraSettings.angle) * cameraSettings.distance
    );
    
    // Check for wall collision
    const finalPos = checkCameraCollision(target.position, desiredPos, scene);
    
    // Smooth camera movement
    camera.position.lerp(finalPos, cameraSettings.smoothing);
    
    // Look at player
    const lookTarget = new THREE.Vector3(
        target.position.x,
        target.position.y + 1.2,
        target.position.z
    );
    camera.lookAt(lookTarget);
    
    // Check NPC interaction in town
    if (scene && scene.name !== 'dungeon') {
        checkNPCInteraction(target.position);
    }
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
