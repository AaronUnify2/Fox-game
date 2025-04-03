// Dungeon generation for Fox Adventure game

const DungeonGenerator = {
    // Dungeon parameters
    roomSize: 8, // Size of a single room
    wallThickness: 0.5, // Thickness of walls
    wallHeight: 3, // Height of walls
    corridorWidth: 2, // Width of corridors
    dungeonSize: 3, // Number of rooms in each direction (3x3 grid)
    
    // Generate a complete dungeon
    generateDungeon: function() {
        const dungeon = new THREE.Group();
        
        // Room grid (2D array to track room connections)
        const roomGrid = [];
        for (let x = 0; x < this.dungeonSize; x++) {
            roomGrid[x] = [];
            for (let z = 0; z < this.dungeonSize; z++) {
                roomGrid[x][z] = {
                    visited: false,
                    connections: {
                        north: false,
                        east: false,
                        south: false,
                        west: false
                    }
                };
            }
        }
        
        // Generate a maze using depth-first search
        this.generateMaze(roomGrid, 0, 0);
        
        // Create rooms and corridors based on the generated maze
        for (let x = 0; x < this.dungeonSize; x++) {
            for (let z = 0; z < this.dungeonSize; z++) {
                const room = this.createRoom(x, z, roomGrid[x][z].connections);
                dungeon.add(room);
            }
        }
        
        // Add entrance and exit
        dungeon.userData.startPosition = this.getRoomCenter(0, 0);
        dungeon.userData.exitPosition = this.getRoomCenter(
            this.dungeonSize - 1, 
            this.dungeonSize - 1
        );
        
        // Add exit marker
        const exitMarker = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16),
            new THREE.MeshStandardMaterial({
                color: 0x00ff00,
                emissive: 0x00ff00,
                emissiveIntensity: 0.5
            })
        );
        exitMarker.position.copy(dungeon.userData.exitPosition);
        exitMarker.position.y = 0.05;
        dungeon.add(exitMarker);
        
        return dungeon;
    },
    
    // Generate maze using depth-first search
    generateMaze: function(grid, x, z) {
        grid[x][z].visited = true;
        
        // Define directions: [dx, dz, direction, opposite]
        const directions = [
            [0, -1, 'north', 'south'],
            [1, 0, 'east', 'west'],
            [0, 1, 'south', 'north'],
            [-1, 0, 'west', 'east']
        ];
        
        // Shuffle directions for randomness
        directions.sort(() => Math.random() - 0.5);
        
        // Try each direction
        for (const [dx, dz, dir, oppositeDir] of directions) {
            const newX = x + dx;
            const newZ = z + dz;
            
            // Check if the new position is valid
            if (
                newX >= 0 && newX < this.dungeonSize &&
                newZ >= 0 && newZ < this.dungeonSize &&
                !grid[newX][newZ].visited
            ) {
                // Connect current room to the next room
                grid[x][z].connections[dir] = true;
                grid[newX][newZ].connections[oppositeDir] = true;
                
                // Continue the maze generation recursively
                this.generateMaze(grid, newX, newZ);
            }
        }
    },
    
    // Create a single room with its walls and openings
    createRoom: function(gridX, gridZ, connections) {
        const room = new THREE.Group();
        
        // Calculate room position in the world
        const worldX = gridX * (this.roomSize + this.wallThickness);
        const worldZ = gridZ * (this.roomSize + this.wallThickness);
        
        // Add floor
        const floor = ModelGenerator.createFloor(this.roomSize, this.roomSize);
        floor.position.set(
            worldX + this.roomSize / 2,
            0,
            worldZ + this.roomSize / 2
        );
        room.add(floor);
        
        // Add ceiling (optional, commented out for better visibility)
        /*
        const ceiling = ModelGenerator.createFloor(this.roomSize, this.roomSize);
        ceiling.position.set(
            worldX + this.roomSize / 2,
            this.wallHeight,
            worldZ + this.roomSize / 2
        );
        ceiling.rotation.x = Math.PI;
        room.add(ceiling);
        */
        
        // Add walls with openings for corridors
        this.addWalls(room, worldX, worldZ, connections);
        
        // Add random decorations
        this.addDecorations(room, worldX, worldZ);
        
        return room;
    },
    
    // Add walls to a room with openings for corridors
    addWalls: function(room, x, z, connections) {
        const size = this.roomSize;
        const thickness = this.wallThickness;
        const height = this.wallHeight;
        const corridorWidth = this.corridorWidth;
        
        // North wall (with or without opening)
        if (!connections.north) {
            // Full wall
            const northWall = ModelGenerator.createWall(size, height, thickness);
            northWall.position.set(
                x + size / 2,
                height / 2,
                z
            );
            room.add(northWall);
        } else {
            // Wall with opening
            const openingStart = (size - corridorWidth) / 2;
            
            // Left section
            const northWallLeft = ModelGenerator.createWall(openingStart, height, thickness);
            northWallLeft.position.set(
                x + openingStart / 2,
                height / 2,
                z
            );
            room.add(northWallLeft);
            
            // Right section
            const northWallRight = ModelGenerator.createWall(openingStart, height, thickness);
            northWallRight.position.set(
                x + size - openingStart / 2,
                height / 2,
                z
            );
            room.add(northWallRight);
        }
        
        // South wall (with or without opening)
        if (!connections.south) {
            // Full wall
            const southWall = ModelGenerator.createWall(size, height, thickness);
            southWall.position.set(
                x + size / 2,
                height / 2,
                z + size
            );
            room.add(southWall);
        } else {
            // Wall with opening
            const openingStart = (size - corridorWidth) / 2;
            
            // Left section
            const southWallLeft = ModelGenerator.createWall(openingStart, height, thickness);
            southWallLeft.position.set(
                x + openingStart / 2,
                height / 2,
                z + size
            );
            room.add(southWallLeft);
            
            // Right section
            const southWallRight = ModelGenerator.createWall(openingStart, height, thickness);
            southWallRight.position.set(
                x + size - openingStart / 2,
                height / 2,
                z + size
            );
            room.add(southWallRight);
        }
        
        // East wall (with or without opening)
        if (!connections.east) {
            // Full wall
            const eastWall = ModelGenerator.createWall(thickness, height, size);
            eastWall.position.set(
                x + size,
                height / 2,
                z + size / 2
            );
            room.add(eastWall);
        } else {
            // Wall with opening
            const openingStart = (size - corridorWidth) / 2;
            
            // Front section
            const eastWallFront = ModelGenerator.createWall(thickness, height, openingStart);
            eastWallFront.position.set(
                x + size,
                height / 2,
                z + openingStart / 2
            );
            room.add(eastWallFront);
            
            // Back section
            const eastWallBack = ModelGenerator.createWall(thickness, height, openingStart);
            eastWallBack.position.set(
                x + size,
                height / 2,
                z + size - openingStart / 2
            );
            room.add(eastWallBack);
        }
        
        // West wall (with or without opening)
        if (!connections.west) {
            // Full wall
            const westWall = ModelGenerator.createWall(thickness, height, size);
            westWall.position.set(
                x,
                height / 2,
                z + size / 2
            );
            room.add(westWall);
        } else {
            // Wall with opening
            const openingStart = (size - corridorWidth) / 2;
            
            // Front section
            const westWallFront = ModelGenerator.createWall(thickness, height, openingStart);
            westWallFront.position.set(
                x,
                height / 2,
                z + openingStart / 2
            );
            room.add(westWallFront);
            
            // Back section
            const westWallBack = ModelGenerator.createWall(thickness, height, openingStart);
            westWallBack.position.set(
                x,
                height / 2,
                z + size - openingStart / 2
            );
            room.add(westWallBack);
        }
    },
    
    // Add random decorations to a room
    addDecorations: function(room, x, z) {
        const size = this.roomSize;
        
        // Random number of crates (0-3)
        const numCrates = Utils.randomInt(0, 3);
        for (let i = 0; i < numCrates; i++) {
            const crate = ModelGenerator.createCrate();
            
            // Position randomly in the room, avoiding walls
            const padding = 1.5;
            crate.position.set(
                x + Utils.randomFloat(padding, size - padding),
                0.4, // Half height of the crate
                z + Utils.randomFloat(padding, size - padding)
            );
            
            // Random rotation
            crate.rotation.y = Utils.randomFloat(0, Math.PI * 2);
            
            room.add(crate);
        }
        
        // Random torch on one of the walls (50% chance)
        if (Math.random() > 0.5) {
            const torch = this.createTorch();
            const wallIndex = Utils.randomInt(0, 3);
            
            switch (wallIndex) {
                case 0: // North wall
                    torch.position.set(
                        x + Utils.randomFloat(1, size - 1),
                        1.5,
                        z + 0.3
                    );
                    torch.rotation.y = Math.PI;
                    break;
                case 1: // East wall
                    torch.position.set(
                        x + size - 0.3,
                        1.5,
                        z + Utils.randomFloat(1, size - 1)
                    );
                    torch.rotation.y = -Math.PI / 2;
                    break;
                case 2: // South wall
                    torch.position.set(
                        x + Utils.randomFloat(1, size - 1),
                        1.5,
                        z + size - 0.3
                    );
                    torch.rotation.y = 0;
                    break;
                case 3: // West wall
                    torch.position.set(
                        x + 0.3,
                        1.5,
                        z + Utils.randomFloat(1, size - 1)
                    );
                    torch.rotation.y = Math.PI / 2;
                    break;
            }
            
            room.add(torch);
        }
    },
    
    // Create a torch decoration with light
    createTorch: function() {
        const torch = new THREE.Group();
        
        // Torch handle
        const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8),
            Utils.createColorMaterial(0x8B4513) // Brown
        );
        handle.rotation.x = Math.PI / 2;
        torch.add(handle);
        
        // Torch head
        const head = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.03, 0.15, 8),
            Utils.createColorMaterial(0x8B4513) // Brown
        );
        head.position.set(0, 0, -0.2);
        head.rotation.x = Math.PI / 2;
        torch.add(head);
        
        // Flame (animated mesh)
        const flame = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({
                color: 0xFF6600,
                transparent: true,
                opacity: 0.9
            })
        );
        flame.position.set(0, 0, -0.27);
        torch.add(flame);
        
        // Point light for the torch
        const light = new THREE.PointLight(0xFF6600, 1, 6);
        light.position.set(0, 0, -0.3);
        torch.add(light);
        
        // Animation data
        torch.userData.flameAnimation = {
            time: Math.random() * Math.PI * 2,
            speed: 8,
            baseScale: 1,
            scaleVariation: 0.2
        };
        
        return torch;
    },
    
    // Get the center position of a room
    getRoomCenter: function(gridX, gridZ) {
        const worldX = gridX * (this.roomSize + this.wallThickness);
        const worldZ = gridZ * (this.roomSize + this.wallThickness);
        
        return new THREE.Vector3(
            worldX + this.roomSize / 2,
            0,
            worldZ + this.roomSize / 2
        );
    },
    
    // Place items in the dungeon
    placeItems: function(dungeon, items) {
        // Create a list of all room positions except start and exit rooms
        const roomPositions = [];
        for (let x = 0; x < this.dungeonSize; x++) {
            for (let z = 0; z < this.dungeonSize; z++) {
                // Skip start and exit rooms
                if ((x === 0 && z === 0) || 
                    (x === this.dungeonSize - 1 && z === this.dungeonSize - 1)) {
                    continue;
                }
                
                roomPositions.push({ x, z });
            }
        }
        
        // Shuffle room positions
        roomPositions.sort(() => Math.random() - 0.5);
        
        // Place each item in a random room
        items.forEach((item, index) => {
            if (index < roomPositions.length) {
                const room = roomPositions[index];
                const roomCenter = this.getRoomCenter(room.x, room.z);
                
                // Add random offset from center
                item.position.set(
                    roomCenter.x + Utils.randomFloat(-2, 2),
                    item.position.y,
                    roomCenter.z + Utils.randomFloat(-2, 2)
                );
                
                // Store initial Y position for floating animation
                item.userData.floatAnimation.initialY = item.position.y;
                
                dungeon.add(item);
            }
        });
    },
    
    // Place enemies in the dungeon
    placeEnemies: function(dungeon, enemies) {
        // Create a list of all room positions except start and exit rooms
        const roomPositions = [];
        for (let x = 0; x < this.dungeonSize; x++) {
            for (let z = 0; z < this.dungeonSize; z++) {
                // Skip start and exit rooms
                if ((x === 0 && z === 0) || 
                    (x === this.dungeonSize - 1 && z === this.dungeonSize - 1)) {
                    continue;
                }
                
                roomPositions.push({ x, z });
            }
        }
        
        // Shuffle room positions
        roomPositions.sort(() => Math.random() - 0.5);
        
        // Place each enemy in a random room
        enemies.forEach((enemy, index) => {
            if (index < roomPositions.length) {
                const room = roomPositions[index];
                const roomCenter = this.getRoomCenter(room.x, room.z);
                
                // Add random offset from center
                enemy.position.set(
                    roomCenter.x + Utils.randomFloat(-2, 2),
                    0,
                    roomCenter.z + Utils.randomFloat(-2, 2)
                );
                
                dungeon.add(enemy);
            }
        });
    },
    
    // Update animated elements in the dungeon
    updateAnimations: function(dungeon, deltaTime) {
        dungeon.traverse((object) => {
            // Update floating items
            if (object.userData.floatAnimation) {
                const anim = object.userData.floatAnimation;
                anim.time += deltaTime * anim.speed;
                
                object.position.y = anim.initialY + Math.sin(anim.time) * anim.amplitude;
            }
            
            // Update rotating items
            if (object.userData.rotateAnimation) {
                const anim = object.userData.rotateAnimation;
                object.rotation.y += deltaTime * anim.speed;
            }
            
            // Update torch flames
            if (object.userData.flameAnimation) {
                const anim = object.userData.flameAnimation;
                anim.time += deltaTime * anim.speed;
                
                // Find the flame mesh (assumes it's the first mesh with 'material.color.r' > 0.9)
                object.traverse((child) => {
                    if (child.isMesh && 
                        child.material.color && 
                        child.material.color.r > 0.9) {
                        
                        const scale = anim.baseScale + Math.sin(anim.time) * anim.scaleVariation;
                        child.scale.set(scale, scale, scale);
                    }
                });
            }
        });
    }
};