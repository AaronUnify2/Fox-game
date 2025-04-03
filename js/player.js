// Player controller for Fox Adventure game

class Player {
    constructor(scene, camera, controls) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        
        // Player properties
        this.moveSpeed = 5;
        this.health = 100;
        this.maxHealth = 100;
        this.keys = 0;
        this.gems = 0;
        this.potions = 0;
        this.bombs = 0;
        
        // Physical properties
        this.height = 1.7;
        this.radius = 0.4;
        this.gravity = 9.8;
        this.jumpForce = 5;
        
        // State
        this.position = new THREE.Vector3(0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.isGrounded = true;
        this.isJumping = false;
        
        // Create player model
        this.model = ModelGenerator.createFoxPlayer();
        this.model.position.y = 0;
        scene.add(this.model);
        
        // Create collision cylinder
        this.collider = new THREE.Mesh(
            new THREE.CylinderGeometry(this.radius, this.radius, this.height, 8),
            new THREE.MeshBasicMaterial({
                color: 0xff0000,
                wireframe: true,
                visible: false // Hide the collider
            })
        );
        this.collider.position.y = this.height / 2;
        this.model.add(this.collider);
        
        // Camera offset
        this.cameraOffset = new THREE.Vector3(0, 1.5, 0);
        
        // Staff attack properties
        this.attackCooldown = 0;
        this.attackDuration = 0;
        this.isAttacking = false;
        
        // Initialize UI
        this.updateHealthUI();
        this.updateInventoryUI();
    }
    
    // Update player position and rotation
    update(deltaTime, inputManager, colliders, enemies, items) {
        // Handle movement
        this.handleMovement(deltaTime, inputManager, colliders);
        
        // Handle attacks
        this.handleAttacks(deltaTime, inputManager, enemies);
        
        // Handle item collection
        this.handleItemCollection(items);
        
        // Update model position and orientation
        this.model.position.copy(this.position);
        
        // Update camera position based on player position
        this.updateCamera();
        
        // Update animation
        this.updateAnimation(deltaTime, inputManager);
    }
    
    // Handle player movement
    handleMovement(deltaTime, inputManager, colliders) {
        // Get movement direction from input
        const direction = new THREE.Vector3(0, 0, 0);
        
        // Forward/backward movement
        if (inputManager.isKeyPressed('KeyW')) {
            direction.z = -1;
        } else if (inputManager.isKeyPressed('KeyS')) {
            direction.z = 1;
        }
        
        // Left/right movement
        if (inputManager.isKeyPressed('KeyA')) {
            direction.x = -1;
        } else if (inputManager.isKeyPressed('KeyD')) {
            direction.x = 1;
        }
        
        // Normalize direction vector
        if (direction.length() > 0) {
            direction.normalize();
        }
        
        // Convert direction to world space (relative to camera)
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();
        
        // Calculate forward and right vectors
        const forward = cameraDirection.clone();
        const right = new THREE.Vector3();
        right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
        
        // Calculate movement vector
        const movement = new THREE.Vector3();
        movement.addScaledVector(forward, direction.z);
        movement.addScaledVector(right, direction.x);
        
        // Normalize and scale by speed
        if (movement.length() > 0) {
            movement.normalize();
            movement.multiplyScalar(this.moveSpeed * deltaTime);
            
            // Store previous position for collision reversion
            const previousPosition = this.position.clone();
            
            // Update position
            this.position.add(movement);
            
            // Check for collisions
            if (this.checkCollisions(colliders)) {
                // Revert to previous position if colliding
                this.position.copy(previousPosition);
            }
            
     // Update model rotation to face movement direction
            const angle = Math.atan2(movement.x, movement.z);
            this.model.rotation.y = angle;
        }
        
        // Handle jumping
        if (inputManager.isKeyPressed('Space') && this.isGrounded) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
            this.isJumping = true;
        }
        
        // Apply gravity
        if (!this.isGrounded) {
            this.velocity.y -= this.gravity * deltaTime;
            this.position.y += this.velocity.y * deltaTime;
            
            // Check if we've hit the ground
            if (this.position.y <= 0) {
                this.position.y = 0;
                this.velocity.y = 0;
                this.isGrounded = true;
                this.isJumping = false;
            }
        }
    }
    
    // Check for collisions with objects
    checkCollisions(colliders) {
        for (const collider of colliders) {
            if (Utils.checkCollision(this.collider, collider, -0.1)) {
                return true;
            }
        }
        return false;
    }
    
    // Handle staff attacks
    handleAttacks(deltaTime, inputManager, enemies) {
        // Update attack cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
        
        // Update attack duration
        if (this.attackDuration > 0) {
            this.attackDuration -= deltaTime;
            
            if (this.attackDuration <= 0) {
                this.isAttacking = false;
            }
        }
        
        // Start a new attack
        if (inputManager.mouseDown && this.attackCooldown <= 0 && !this.isAttacking) {
            this.isAttacking = true;
            this.attackDuration = 0.3; // 0.3 seconds attack duration
            this.attackCooldown = 0.5; // 0.5 seconds between attacks
            
            // Do the attack animation
            this.performAttackAnimation();
            
            // Check for enemies in attack range
            this.attackEnemies(enemies);
        }
    }
    
    // Perform attack animation
    performAttackAnimation() {
        // Create a simple attack effect
        const attackEffect = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.7
            })
        );
        
        // Position the effect in front of the player
        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyEuler(this.model.rotation);
        
        attackEffect.position.copy(this.position);
        attackEffect.position.y = 1;
        attackEffect.position.addScaledVector(direction, 1.5);
        
        // Add to scene
        this.scene.add(attackEffect);
        
        // Remove after the attack duration
        setTimeout(() => {
            this.scene.remove(attackEffect);
        }, this.attackDuration * 1000);
    }
    
    // Check and damage enemies in attack range
    attackEnemies(enemies) {
        const attackRange = 2; // Attack range in units
        
        enemies.forEach(enemy => {
            if (enemy.isActive) {
                const distance = Utils.distance(this.position, enemy.position);
                
                if (distance <= attackRange) {
                    // Check if enemy is in front of the player
                    const direction = new THREE.Vector3();
                    direction.subVectors(enemy.position, this.position);
                    direction.y = 0;
                    direction.normalize();
                    
                    const forward = new THREE.Vector3(0, 0, 1);
                    forward.applyEuler(this.model.rotation);
                    
                    const dot = forward.dot(direction);
                    
                    if (dot > 0.5) { // Enemy is within a ~60 degree cone in front
                        enemy.takeDamage(20); // Deal 20 damage
                    }
                }
            }
        });
    }
    
    // Handle item collection
    handleItemCollection(items) {
        const collectionRange = 1.5; // Collection range in units
        
        items.forEach(item => {
            if (item.isActive && Utils.distance(this.position, item.position) <= collectionRange) {
                // Collect the item
                switch (item.type) {
                    case 'key':
                        this.keys++;
                        break;
                    case 'gem':
                        this.gems++;
                        break;
                    case 'potion':
                        this.potions++;
                        this.usePotion(); // Auto-use potions
                        break;
                    case 'bomb':
                        this.bombs++;
                        break;
                }
                
                // Deactivate the item
                item.collect();
                
                // Update UI
                this.updateInventoryUI();
            }
        });
    }
    
    // Use a potion to restore health
    usePotion() {
        if (this.potions > 0 && this.health < this.maxHealth) {
            this.potions--;
            this.health = Math.min(this.health + 30, this.maxHealth); // Restore 30 health
            this.updateHealthUI();
        }
    }
    
    // Take damage from enemies
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        this.updateHealthUI();
        
        // Check for death
        if (this.health <= 0) {
            this.die();
        } else {
            // Flash red when taking damage
            const originalMaterials = [];
            this.model.traverse(child => {
                if (child.isMesh && child.material) {
                    originalMaterials.push({
                        mesh: child,
                        material: child.material.clone()
                    });
                    
                    // Set to red
                    child.material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                }
            });
            
            // Reset after a short time
            setTimeout(() => {
                originalMaterials.forEach(item => {
                    item.mesh.material = item.material;
                });
            }, 200);
        }
    }
    
    // Player death
    die() {
        // Implement death logic (game over, respawn, etc.)
        console.log('Player died');
        
        // Example: Reset player position and health after 2 seconds
        setTimeout(() => {
            this.health = this.maxHealth;
            this.position.set(0, 0, 0);
            this.updateHealthUI();
        }, 2000);
    }
    
    // Update the camera position to follow the player
    updateCamera() {
        // Set camera position to player position plus offset
        const cameraPosition = this.position.clone().add(this.cameraOffset);
        this.camera.position.copy(cameraPosition);
        
        // Update PointerLock controls target
        this.controls.getObject().position.copy(cameraPosition);
    }
    
    // Update player animation based on movement
    updateAnimation(deltaTime, inputManager) {
        // Determine if the player is moving
        const isMoving = (
            inputManager.isKeyPressed('KeyW') ||
            inputManager.isKeyPressed('KeyS') ||
            inputManager.isKeyPressed('KeyA') ||
            inputManager.isKeyPressed('KeyD')
        );
        
        // Simple leg animation when moving (if not jumping)
        if (isMoving && this.isGrounded) {
            // Find the legs
            this.model.traverse(child => {
                if (child.isMesh && child.name.includes('leg')) {
                    // Animate legs
                    child.rotation.x = Math.sin(Date.now() * 0.01) * 0.5;
                }
            });
        }
    }
    
    // Update the health UI
    updateHealthUI() {
        const healthFill = document.getElementById('health-fill');
        if (healthFill) {
            const healthPercent = (this.health / this.maxHealth) * 100;
            healthFill.style.width = `${healthPercent}%`;
        }
    }
    
    // Update the inventory UI
    updateInventoryUI() {
        const inventorySlots = document.querySelectorAll('.inventory-slot');
        
        // Update key slot
        if (inventorySlots[0]) {
            inventorySlots[0].textContent = `🗝️ ${this.keys}`;
        }
        
        // Update bomb slot
        if (inventorySlots[1]) {
            inventorySlots[1].textContent = `💣 ${this.bombs}`;
        }
        
        // Update gem slot
        if (inventorySlots[2]) {
            inventorySlots[2].textContent = `💎 ${this.gems}`;
        }
        
        // Update potion slot
        if (inventorySlots[3]) {
            inventorySlots[3].textContent = `🧪 ${this.potions}`;
        }
    }
    
    // Use a bomb to attack
    useBomb() {
        if (this.bombs > 0) {
            this.bombs--;
            this.updateInventoryUI();
            
            // Create bomb effect
            const bomb = new THREE.Mesh(
                new THREE.SphereGeometry(0.2, 16, 16),
                new THREE.MeshBasicMaterial({ color: 0x000000 })
            );
            
            // Position in front of player
            const direction = new THREE.Vector3(0, 0, 1);
            direction.applyEuler(this.model.rotation);
            
            bomb.position.copy(this.position);
            bomb.position.y = 0.2;
            bomb.position.addScaledVector(direction, 2);
            
            this.scene.add(bomb);
            
            // Explode after a delay
            setTimeout(() => {
                this.scene.remove(bomb);
                
                // Create explosion effect
                const explosion = new THREE.Mesh(
                    new THREE.SphereGeometry(2, 16, 16),
                    new THREE.MeshBasicMaterial({
                        color: 0xff6600,
                        transparent: true,
                        opacity: 0.7
                    })
                );
                
                explosion.position.copy(bomb.position);
                this.scene.add(explosion);
                
                // Damage enemies in explosion radius
                const enemies = this.scene.children.filter(
                    child => child.userData && child.userData.isEnemy
                );
                
                enemies.forEach(enemy => {
                    const distance = Utils.distance(bomb.position, enemy.position);
                    if (distance <= 3) { // Explosion radius
                        const damage = Math.floor(50 * (1 - distance / 3)); // More damage closer to center
                        enemy.takeDamage(damage);
                    }
                });
                
                // Fade out explosion
                let opacity = 0.7;
                const fadeInterval = setInterval(() => {
                    opacity -= 0.05;
                    explosion.material.opacity = opacity;
                    
                    if (opacity <= 0) {
                        clearInterval(fadeInterval);
                        this.scene.remove(explosion);
                    }
                }, 50);
            }, 1000);
        }
    }
}