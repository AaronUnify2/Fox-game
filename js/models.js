// Model generation for Fox Adventure game
// Since we're building models from scratch, we'll create basic geometries

const ModelGenerator = {
    // Create a basic fox player model
    createFoxPlayer: function() {
        const group = new THREE.Group();
        
        // Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.6, 1.2),
            Utils.createColorMaterial(0xff7700) // Orange
        );
        body.position.y = 0.6;
        group.add(body);
        
        // Head
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            Utils.createColorMaterial(0xff7700) // Orange
        );
        head.position.set(0, 1.2, 0.4);
        group.add(head);
        
        // Ears
        const earL = new THREE.Mesh(
            new THREE.ConeGeometry(0.15, 0.4, 4),
            Utils.createColorMaterial(0xff7700) // Orange
        );
        earL.position.set(0.25, 1.6, 0.4);
        earL.rotation.x = -0.2;
        group.add(earL);
        
        const earR = earL.clone();
        earR.position.x = -0.25;
        group.add(earR);
        
        // Snout
        const snout = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.25, 0.4),
            Utils.createColorMaterial(0xff9900) // Lighter orange
        );
        snout.position.set(0, 1.05, 0.8);
        group.add(snout);
        
        // Nose
        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            Utils.createColorMaterial(0x000000) // Black
        );
        nose.position.set(0, 1.1, 1.05);
        group.add(nose);
        
        // Eyes
        const eyeL = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            Utils.createColorMaterial(0x000000) // Black
        );
        eyeL.position.set(0.2, 1.3, 0.7);
        group.add(eyeL);
        
        const eyeR = eyeL.clone();
        eyeR.position.x = -0.2;
        group.add(eyeR);
        
        // Legs
        const legFL = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.5, 0.2),
            Utils.createColorMaterial(0xff7700) // Orange
        );
        legFL.position.set(0.3, 0.25, 0.4);
        group.add(legFL);
        
        const legFR = legFL.clone();
        legFR.position.x = -0.3;
        group.add(legFR);
        
        const legBL = legFL.clone();
        legBL.position.z = -0.4;
        group.add(legBL);
        
        const legBR = legBL.clone();
        legBR.position.x = -0.3;
        group.add(legBR);
        
        // Tail
        const tail = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.2, 0.8, 8),
            Utils.createColorMaterial(0xff7700) // Orange
        );
        tail.rotation.x = Math.PI / 2;
        tail.position.set(0, 0.7, -0.7);
        group.add(tail);
        
        // Staff
        const staff = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8),
            Utils.createColorMaterial(0x8B4513) // Brown
        );
        staff.position.set(0.5, 0.9, 0);
        staff.rotation.z = -0.2;
        group.add(staff);
        
        // Staff orb
        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 0.5
            })
        );
        orb.position.set(0.5, 1.8, 0);
        group.add(orb);
        
        // Add a point light to the orb
        const orbLight = new THREE.PointLight(0x00ffff, 1, 3);
        orbLight.position.copy(orb.position);
        group.add(orbLight);
        
        // Set shadow casting for all meshes
        group.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        
        return group;
    },
    
    // Create an evil fox enemy model
    createEvilFox: function() {
        const group = new THREE.Group();
        
        // Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.6, 1.2),
            Utils.createColorMaterial(0x8B0000) // Dark red
        );
        body.position.y = 0.6;
        group.add(body);
        
        // Head
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            Utils.createColorMaterial(0x8B0000) // Dark red
        );
        head.position.set(0, 1.2, 0.4);
        group.add(head);
        
        // Ears
        const earL = new THREE.Mesh(
            new THREE.ConeGeometry(0.15, 0.4, 4),
            Utils.createColorMaterial(0x8B0000) // Dark red
        );
        earL.position.set(0.25, 1.6, 0.4);
        earL.rotation.x = -0.2;
        group.add(earL);
        
        const earR = earL.clone();
        earR.position.x = -0.25;
        group.add(earR);
        
        // Snout
        const snout = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.25, 0.4),
            Utils.createColorMaterial(0xA52A2A) // Brown
        );
        snout.position.set(0, 1.05, 0.8);
        group.add(snout);
        
        // Nose
        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            Utils.createColorMaterial(0x000000) // Black
        );
        nose.position.set(0, 1.1, 1.05);
        group.add(nose);
        
        // Eyes (glowing red)
        const eyeL = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 0.8
            })
        );
        eyeL.position.set(0.2, 1.3, 0.7);
        group.add(eyeL);
        
        const eyeR = eyeL.clone();
        eyeR.position.x = -0.2;
        group.add(eyeR);
        
        // Legs
        const legFL = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.5, 0.2),
            Utils.createColorMaterial(0x8B0000) // Dark red
        );
        legFL.position.set(0.3, 0.25, 0.4);
        group.add(legFL);
        
        const legFR = legFL.clone();
        legFR.position.x = -0.3;
        group.add(legFR);
        
        const legBL = legFL.clone();
        legBL.position.z = -0.4;
        group.add(legBL);
        
        const legBR = legBL.clone();
        legBR.position.x = -0.3;
        group.add(legBR);
        
        // Set shadow casting for all meshes
        group.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        
        return group;
    },
    
    // Create an evil rabbit enemy model
    createEvilRabbit: function() {
        const group = new THREE.Group();
        
        // Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 1),
            Utils.createColorMaterial(0x663399) // Purple
        );
        body.position.y = 0.5;
        group.add(body);
        
        // Head
        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.6, 0.6),
            Utils.createColorMaterial(0x663399) // Purple
        );
        head.position.set(0, 1.15, 0.3);
        group.add(head);
        
        // Ears (long)
        const earL = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.6, 0.1),
            Utils.createColorMaterial(0x663399) // Purple
        );
        earL.position.set(0.2, 1.7, 0.3);
        group.add(earL);
        
        const earR = earL.clone();
        earR.position.x = -0.2;
        group.add(earR);
        
        // Snout
        const snout = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.2, 0.3),
            Utils.createColorMaterial(0x9370DB) // Medium purple
        );
        snout.position.set(0, 1, 0.6);
        group.add(snout);
        
        // Nose
        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 8, 8),
            Utils.createColorMaterial(0x000000) // Black
        );
        nose.position.set(0, 1.05, 0.8);
        group.add(nose);
        
        // Eyes (glowing red)
        const eyeL = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 0.8
            })
        );
        eyeL.position.set(0.15, 1.2, 0.6);
        group.add(eyeL);
        
        const eyeR = eyeL.clone();
        eyeR.position.x = -0.15;
        group.add(eyeR);
        
        // Legs
        const legFL = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.4, 0.15),
            Utils.createColorMaterial(0x663399) // Purple
        );
        legFL.position.set(0.25, 0.2, 0.3);
        group.add(legFL);
        
        const legFR = legFL.clone();
        legFR.position.x = -0.25;
        group.add(legFR);
        
        // Larger back legs
        const legBL = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.5, 0.2),
            Utils.createColorMaterial(0x663399) // Purple
        );
        legBL.position.set(0.25, 0.25, -0.3);
        group.add(legBL);
        
        const legBR = legBL.clone();
        legBR.position.x = -0.25;
        group.add(legBR);
        
        // Small tail
        const tail = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 8, 8),
            Utils.createColorMaterial(0xFFFFFF) // White
        );
        tail.position.set(0, 0.5, -0.6);
        group.add(tail);
        
        // Set shadow casting for all meshes
        group.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        
        return group;
    },
    
    // Create a key item model
    createKey: function() {
        const group = new THREE.Group();
        
        // Key head
        const keyHead = new THREE.Mesh(
            new THREE.TorusGeometry(0.15, 0.05, 8, 16),
            Utils.createColorMaterial(0xFFD700) // Gold
        );
        keyHead.position.y = 0.15;
        group.add(keyHead);
        
        // Key stem
        const keyStem = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.3, 0.05),
            Utils.createColorMaterial(0xFFD700) // Gold
        );
        keyStem.position.set(0, -0.07, 0);
        group.add(keyStem);
        
        // Key teeth
        const keyTooth1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.07, 0.05),
            Utils.createColorMaterial(0xFFD700) // Gold
        );
        keyTooth1.position.set(0.06, -0.2, 0);
        group.add(keyTooth1);
        
        const keyTooth2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, 0.07, 0.05),
            Utils.createColorMaterial(0xFFD700) // Gold
        );
        keyTooth2.position.set(0.06, -0.15, 0);
        group.add(keyTooth2);
        
        // Add a point light
        const keyLight = new THREE.PointLight(0xFFD700, 0.5, 1);
        keyLight.position.set(0, 0, 0);
        group.add(keyLight);
        
        // Set shadow casting for all meshes
        group.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        
        // Add floating animation
        group.userData.floatAnimation = {
            initialY: 0,
            time: Math.random() * Math.PI * 2,
            speed: 1.5,
            amplitude: 0.1
        };
        
        // Add rotation animation
        group.userData.rotateAnimation = {
            speed: 1
        };
        
        return group;
    },
    
    // Create a gem item model
    createGem: function() {
        const group = new THREE.Group();
        
        // Diamond shape
        const gem = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.25, 1),
            new THREE.MeshStandardMaterial({
                color: 0x00FFFF,
                metalness: 0.9,
                roughness: 0.1,
                transparent: true,
                opacity: 0.8
            })
        );
        group.add(gem);
        
        // Add a point light
        const gemLight = new THREE.PointLight(0x00FFFF, 0.8, 2);
        gemLight.position.set(0, 0, 0);
        group.add(gemLight);
        
        // Set shadow casting for all meshes
        group.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        
        // Add floating animation
        group.userData.floatAnimation = {
            initialY: 0,
            time: Math.random() * Math.PI * 2,
            speed: 1.5,
            amplitude: 0.1
        };
        
        // Add rotation animation
        group.userData.rotateAnimation = {
            speed: 1.2
        };
        
        return group;
    },
    
    // Create a potion item model
    createPotion: function() {
        const group = new THREE.Group();
        
        // Bottle body
        const bottle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.15, 0.3, 8),
            new THREE.MeshStandardMaterial({
                color: 0xC0C0C0,
                metalness: 0.3,
                roughness: 0.4,
                transparent: true,
                opacity: 0.5
            })
        );
        bottle.position.y = 0.05;
        group.add(bottle);
        
        // Bottle neck
        const neck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.08, 0.1, 8),
            new THREE.MeshStandardMaterial({
                color: 0xC0C0C0,
                metalness: 0.3,
                roughness: 0.4,
                transparent: true,
                opacity: 0.5
            })
        );
        neck.position.y = 0.25;
        group.add(neck);
        
        // Cork
        const cork = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8),
            Utils.createColorMaterial(0x8B4513) // Brown
        );
        cork.position.y = 0.33;
        group.add(cork);
        
        // Liquid inside
        const liquid = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.14, 0.25, 8),
            new THREE.MeshStandardMaterial({
                color: 0xFF0000,
                emissive: 0xFF0000,
                emissiveIntensity: 0.2,
                transparent: true,
                opacity: 0.8
            })
        );
        liquid.position.y = 0.03;
        group.add(liquid);
        
// Add a point light
        const potionLight = new THREE.PointLight(0xFF0000, 0.5, 1);
        potionLight.position.set(0, 0.1, 0);
        group.add(potionLight);
        
        // Set shadow casting for all meshes
        group.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        
        // Add floating animation
        group.userData.floatAnimation = {
            initialY: 0,
            time: Math.random() * Math.PI * 2,
            speed: 1.5,
            amplitude: 0.1
        };
        
        // Add rotation animation
        group.userData.rotateAnimation = {
            speed: 0.8
        };
        
        return group;
    },
    
    // Create a bomb item model
    createBomb: function() {
        const group = new THREE.Group();
        
        // Bomb body
        const body = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 16, 16),
            Utils.createColorMaterial(0x000000) // Black
        );
        group.add(body);
        
        // Bomb fuse
        const fuse = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8),
            Utils.createColorMaterial(0x8B4513) // Brown
        );
        fuse.position.set(0, 0.2, 0);
        fuse.rotation.x = 0.3;
        group.add(fuse);
        
        // Fuse spark
        const spark = new THREE.Mesh(
            new THREE.SphereGeometry(0.03, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xFF4500,
                emissive: 0xFF4500,
                emissiveIntensity: 1
            })
        );
        spark.position.set(0, 0.3, 0.05);
        group.add(spark);
        
        // Add a point light
        const sparkLight = new THREE.PointLight(0xFF4500, 0.8, 1);
        sparkLight.position.copy(spark.position);
        group.add(sparkLight);
        
        // Set shadow casting for all meshes
        group.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
        
        // Add floating animation
        group.userData.floatAnimation = {
            initialY: 0,
            time: Math.random() * Math.PI * 2,
            speed: 1.5,
            amplitude: 0.1
        };
        
        // Add rotation animation
        group.userData.rotateAnimation = {
            speed: 0.5
        };
        
        return group;
    },
    
    // Create a crate model
    createCrate: function() {
        const texture = new THREE.TextureLoader().load('textures/crate.jpg');
        
        // Use a default texture if loading fails
        texture.onError = function() {
            this.image = document.createElement('canvas');
            this.image.width = 128;
            this.image.height = 128;
            const context = this.image.getContext('2d');
            
            // Draw a simple wooden texture
            context.fillStyle = '#8B4513';
            context.fillRect(0, 0, 128, 128);
            
            // Draw wood grain lines
            context.strokeStyle = '#A0522D';
            context.lineWidth = 3;
            for (let i = 0; i < 128; i += 16) {
                context.beginPath();
                context.moveTo(0, i);
                context.lineTo(128, i);
                context.stroke();
            }
            
            this.needsUpdate = true;
        };
        
        const group = new THREE.Group();
        
        // Crate box
        const crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.8, 0.8),
            new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.8,
                metalness: 0.1
            })
        );
        group.add(crate);
        
        // Set shadow casting
        crate.castShadow = true;
        crate.receiveShadow = true;
        
        return group;
    },
    
    // Create dungeon wall section
    createWall: function(width = 1, height = 2, depth = 1) {
        const texture = new THREE.TextureLoader().load('textures/stone_wall.jpg');
        
        // Use a default texture if loading fails
        texture.onError = function() {
            this.image = document.createElement('canvas');
            this.image.width = 128;
            this.image.height = 128;
            const context = this.image.getContext('2d');
            
            // Draw a simple stone texture
            context.fillStyle = '#555555';
            context.fillRect(0, 0, 128, 128);
            
            // Draw stone pattern
            for (let y = 0; y < 128; y += 32) {
                for (let x = 0; x < 128; x += 64) {
                    const offsetX = y % 64 === 0 ? 0 : 32;
                    context.fillStyle = '#666666';
                    context.fillRect(x + offsetX, y, 30, 30);
                }
            }
            
            this.needsUpdate = true;
        };
        
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(width, height);
        
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.9,
                metalness: 0.1
            })
        );
        
        wall.castShadow = true;
        wall.receiveShadow = true;
        
        return wall;
    },
    
    // Create dungeon floor section
    createFloor: function(width = 1, depth = 1) {
        const texture = new THREE.TextureLoader().load('textures/stone_floor.jpg');
        
        // Use a default texture if loading fails
        texture.onError = function() {
            this.image = document.createElement('canvas');
            this.image.width = 128;
            this.image.height = 128;
            const context = this.image.getContext('2d');
            
            // Draw a simple stone texture
            context.fillStyle = '#444444';
            context.fillRect(0, 0, 128, 128);
            
            // Draw floor pattern
            for (let y = 0; y < 128; y += 32) {
                for (let x = 0; x < 128; x += 32) {
                    if ((x + y) % 64 === 0) {
                        context.fillStyle = '#333333';
                        context.fillRect(x, y, 32, 32);
                    }
                }
            }
            
            this.needsUpdate = true;
        };
        
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(width, depth);
        
        const floor = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.2, depth),
            new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.8,
                metalness: 0.1
            })
        );
        
        floor.position.y = -0.1; // Half of the height to align the top at y=0
        floor.receiveShadow = true;
        
        return floor;
    }
};