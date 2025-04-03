// Item management for Fox Adventure game

const ItemManager = {
    items: [],
    
    // Create items and add them to the scene
    createItems: function(scene, dungeon) {
        this.items = [];
        
        // Create key items
        const exitKey = ModelGenerator.createKey();
        exitKey.position.y = 0.5;
        exitKey.userData.isItem = true;
        exitKey.userData.type = 'key';
        exitKey.userData.isActive = true;
        exitKey.collect = this.createCollectFunction(exitKey);
        this.items.push(exitKey);
        
        // Create gem items
        for (let i = 0; i < 5; i++) {
            const gem = ModelGenerator.createGem();
            gem.position.y = 0.5;
            gem.userData.isItem = true;
            gem.userData.type = 'gem';
            gem.userData.isActive = true;
            gem.collect = this.createCollectFunction(gem);
            this.items.push(gem);
        }
        
        // Create potion items
        for (let i = 0; i < 3; i++) {
            const potion = ModelGenerator.createPotion();
            potion.position.y = 0.5;
            potion.userData.isItem = true;
            potion.userData.type = 'potion';
            potion.userData.isActive = true;
            potion.collect = this.createCollectFunction(potion);
            this.items.push(potion);
        }
        
        // Create bomb items
        for (let i = 0; i < 3; i++) {
            const bomb = ModelGenerator.createBomb();
            bomb.position.y = 0.5;
            bomb.userData.isItem = true;
            bomb.userData.type = 'bomb';
            bomb.userData.isActive = true;
            bomb.collect = this.createCollectFunction(bomb);
            this.items.push(bomb);
        }
        
        // Place items in dungeon rooms
        DungeonGenerator.placeItems(dungeon, this.items);
        
        return this.items;
    },
    
    // Create a collection function for an item
    createCollectFunction: function(item) {
        return function() {
            item.userData.isActive = false;
            
            // Play collection animation
            const startScale = item.scale.clone();
            const startY = item.position.y;
            
            // Animation duration
            const duration = 500; // ms
            const startTime = Date.now();
            
            // Animate collection
            const animate = function() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Scale down
                const scale = 1 - progress;
                item.scale.set(scale * startScale.x, scale * startScale.y, scale * startScale.z);
                
                // Move up
                item.position.y = startY + progress * 1;
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Remove from scene
                    if (item.parent) {
                        item.parent.remove(item);
                    }
                }
            };
            
            animate();
        };
    },
    
    // Update all items (animations, etc.)
    updateItems: function(deltaTime) {
        for (const item of this.items) {
            // Update floating animation
            if (item.userData.floatAnimation) {
                const anim = item.userData.floatAnimation;
                anim.time += deltaTime * anim.speed;
                
                item.position.y = anim.initialY + Math.sin(anim.time) * anim.amplitude;
            }
            
            // Update rotation animation
            if (item.userData.rotateAnimation) {
                const anim = item.userData.rotateAnimation;
                item.rotation.y += deltaTime * anim.speed;
            }
        }
    }
};