// Enemy controller for Fox Adventure game

class Enemy {
    constructor(scene, type, position) {
        this.scene = scene;
        this.type = type;
        this.position = position.clone();
        
        // Enemy properties based on type
        switch (type) {
            case 'fox':
                this.model = ModelGenerator.createEvilFox();
                this.health = 50;
                this.damage = 10;
                this.moveSpeed = 3;
                this.attackRange = 1.5;
                this.detectionRange = 8;
                break;
                
            case 'rabbit':
                this.model = ModelGenerator.createEvilRabbit();
                this.health = 30;
                this.damage = 5;
                this.moveSpeed = 4;
                this.attackRange = 1;
                this.detectionRange = 10;
                break;
                
            default:
                throw new Error(`Unknown enemy type: ${type}`);
        }
        
        // Position the model
        this.model.position.copy(this.position);
        scene.add(this.model);
        
        // Mark as an enemy for easy filtering
        this.model.userData.isEnemy = true;
        this.model.userData.parent = this;
        
        // State
        this.isActive = true;
        this.isAttacking = false;
        this.attackCooldown = 0;
        this.lastKnownPlayerPosition = null;
        this.state = 'idle'; // idle, chasing, attacking
        this.patrolPoints = [];
        this.currentPatrolIndex = 0;
        
        // Generate patrol points around the spawn position
        this.generatePatrolPoints();
    }
    
    // Generate random patrol points around the spawn position
    generatePatrolPoints() {
        const radius = 3;
        const numPoints = 4;
        
        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const x = this.position.x + Math.cos(angle) * radius;
            const z = this.position.z + Math.sin(angle) * radius;
            
            this.patrolPoints.push(new THREE.Vector3(x, 0, z));
        }
    }
    
    // Update enemy behavior
    update(deltaTime, player, colliders) {
        if (!this.isActive) return;
        
        // Position tracking
        this.position.copy(this.model.position);
        
        // Update attack cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= deltaTime;
        }
        
        // Check distance to player
        const distanceToPlayer = Utils.distance(this.position, player.position);
        
        // Update enemy state based on distance
        if (distanceToPlayer <= this.attackRange) {
            this.state = 'attacking';
            this.lastKnownPlayerPosition = player.position.clone();
        } else if (distanceToPlayer <= this.detectionRange) {
            this.state = 'chasing';
            this.lastKnownPlayerPosition = player.position.clone();
        } else if (this.lastKnownPlayerPosition) {
            // If we lost the player, go to the last known position
            const distanceToLastKnown = Utils.distance(this.position, this.lastKnownPlayerPosition);
            
            if (distanceToLastKnown <= 0.5) {
                // If we reached the last known position, go back to patrolling
                this.state = 'idle';
                this.lastKnownPlayerPosition = null;
            } else {
                this.state = 'chasing';
            }
        } else {
            this.state = 'idle';
        }
        
        // Handle behavior based on state
        switch (this.state) {
            case 'idle':
                this.patrol(deltaTime, colliders);
                break;
                
            case 'chasing':
                this.chase(deltaTime, this.lastKnownPlayerPosition, colliders);
                break;
                
            case 'attacking':
                this.attack(deltaTime, player);
                break;
        }
    }
    
    // Patrol between points
    patrol(deltaTime, colliders) {
        const target = this.patrolPoints[this.currentPatrolIndex];
        const distanceToTarget = Utils.distance(this.position, target);
        
        if (distanceToTarget <= 0.5) {
            // Move to the next patrol point
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
        } else {
            // Move towards the current patrol point
            this.moveTowards(target, deltaTime * this.moveSpeed * 0.5, colliders);
        }
    }
    
    // Chase the player or last known position
    chase(deltaTime, targetPosition, colliders) {
        this.moveTowards(targetPosition, deltaTime * this.moveSpeed, colliders);
    }
    
    // Attack the player
    attack(deltaTime, player) {
        if (this.attackCooldown <= 0) {
            // Face the player
            this.faceTarget(player.position);
            
            // Set attack state
            this.isAttacking = true;
            
            // Deal damage
            player.takeDamage(this.damage);
            
            // Reset cooldown
            this.attackCooldown = 1; // 1 second between attacks
            
            // Reset attack state after a short time
            setTimeout(() => {
                this.isAttacking = false;
            }, 500);
        }
    }
    
    // Move towards a target position
    moveTowards(targetPosition, speed, colliders) {
        // Calculate direction to target
        const direction = new THREE.Vector3();
        direction.subVectors(targetPosition, this.position);
        direction.y = 0; // Keep movement on the ground plane
        
        // Normalize and scale by speed
        if (direction.length() > 0) {
            direction.normalize();
            direction.multiplyScalar(speed);
            
            // Store previous position for collision reversion
            const previousPosition = this.position.clone();
            
            // Update position
            this.position.add(direction);
            this.model.position.copy(this.position);
            
            // Check for collisions
            if (this.checkCollisions(colliders)) {
                // Revert to previous position if colliding
                this.position.copy(previousPosition);
                this.model.position.copy(previousPosition);
            }
            
            // Face the direction of movement
            this.faceTarget(targetPosition);
        }
    }
    
    // Check for collisions with objects
    checkCollisions(colliders) {
        for (const collider of colliders) {
            if (Utils.checkCollision(this.model, collider, -0.1)) {
                return true;
            }
        }
        return false;
    }
    
    // Face a target position
    faceTarget(targetPosition) {
        // Calculate direction to target
        const direction = new THREE.Vector3();
        direction.subVectors(targetPosition, this.position);
        direction.y = 0; // Keep on the ground plane
        
        // Calculate angle
        if (direction.length() > 0) {
            const angle = Math.atan2(direction.x, direction.z);
            this.model.rotation.y = angle;
        }
    }
    
    // Take damage from the player
    takeDamage(amount) {
        this.health -= amount;
        
        // Check for death
        if (this.health <= 0) {
            this.die();
            return;
        }
        
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
    
    // Enemy death
    die() {
        this.isActive = false;
        
        // Fade out effect
        let opacity = 1;
        const fadeInterval = setInterval(() => {
            opacity -= 0.1;
            
            this.model.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.transparent = true;
                    child.material.opacity = opacity;
                }
            });
            
            if (opacity <= 0) {
                clearInterval(fadeInterval);
                this.scene.remove(this.model);
            }
        }, 100);
        
        // Spawn a random item
        this.spawnLoot();
    }
    
    // Spawn loot when the enemy dies
    spawnLoot() {
        // 50% chance to drop an item
        if (Math.random() > 0.5) {
            // Determine item type
            const itemTypes = ['potion', 'bomb'];
            const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
            
            // Create the item
            let item;
            switch (itemType) {
                case 'potion':
                    item = ModelGenerator.createPotion();
                    break;
                case 'bomb':
                    item = ModelGenerator.createBomb();
                    break;
            }
            
            if (item) {
                // Position at the enemy's location
                item.position.copy(this.position);
                item.position.y = 0.5; // Lift off the ground
                
                // Add item properties
                item.userData.isItem = true;
                item.userData.type = itemType;
                item.userData.isActive = true;
                
                // Add collection method
                item.collect = function() {
                    this.userData.isActive = false;
                    
                    // Fade out
                    let opacity = 1;
                    const fadeInterval = setInterval(() => {
                        opacity -= 0.1;
                        
                        this.traverse(child => {
                            if (child.isMesh && child.material) {
                                child.material.transparent = true;
                                child.material.opacity = opacity;
                            }
                        });
                        
                        if (opacity <= 0) {
                            clearInterval(fadeInterval);
                            this.parent.remove(this);
                        }
                    }, 50);
                };
                
                // Add to scene
                this.scene.add(item);
            }
        }
    }
}

// Enemy manager to handle all enemies in the game
const EnemyManager = {
    enemies: [],
    
    // Create enemies and add them to the scene
    createEnemies: function(scene, dungeon, count) {
        this.enemies = [];
        
        // Create fox enemies
        for (let i = 0; i < Math.floor(count * 0.6); i++) {
            const enemy = new Enemy(scene, 'fox', new THREE.Vector3(0, 0, 0));
            this.enemies.push(enemy);
        }
        
        // Create rabbit enemies
        for (let i = 0; i < Math.floor(count * 0.4); i++) {
            const enemy = new Enemy(scene, 'rabbit', new THREE.Vector3(0, 0, 0));
            this.enemies.push(enemy);
        }
        
        // Place enemies in dungeon rooms
        DungeonGenerator.placeEnemies(dungeon, this.enemies);
        
        return this.enemies;
    },
    
    // Update all enemies
    updateEnemies: function(deltaTime, player, colliders) {
        this.enemies.forEach(enemy => {
            enemy.update(deltaTime, player, colliders);
        });
    }
};