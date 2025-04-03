// Utility functions for Fox Adventure game

// Math utilities
const Utils = {
    // Generate a random integer between min and max (inclusive)
    randomInt: function(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    // Generate a random float between min and max
    randomFloat: function(min, max) {
        return Math.random() * (max - min) + min;
    },
    
    // Check if two objects are colliding (AABB collision)
    checkCollision: function(obj1, obj2, tolerance = 0) {
        if (!obj1.boundingBox) obj1.boundingBox = new THREE.Box3().setFromObject(obj1);
        if (!obj2.boundingBox) obj2.boundingBox = new THREE.Box3().setFromObject(obj2);
        
        // Update bounding boxes
        obj1.boundingBox.setFromObject(obj1);
        obj2.boundingBox.setFromObject(obj2);
        
        // Expand the bounding box by tolerance
        const box1 = obj1.boundingBox.clone();
        const box2 = obj2.boundingBox.clone();
        
        if (tolerance !== 0) {
            box1.expandByScalar(tolerance);
            box2.expandByScalar(tolerance);
        }
        
        return box1.intersectsBox(box2);
    },
    
    // Calculate distance between two 3D points
    distance: function(point1, point2) {
        return Math.sqrt(
            Math.pow(point2.x - point1.x, 2) +
            Math.pow(point2.y - point1.y, 2) +
            Math.pow(point2.z - point1.z, 2)
        );
    },
    
    // Limit a value between min and max
    clamp: function(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },
    
    // Lerp (Linear interpolation)
    lerp: function(start, end, amt) {
        return (1 - amt) * start + amt * end;
    },
    
    // Create a simple colored material
    createColorMaterial: function(color) {
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.7,
            metalness: 0.1
        });
    }
};

// Asset manager for loading and caching 3D models, textures, etc.
const AssetManager = {
    models: {},
    textures: {},
    sounds: {},
    totalAssets: 0,
    loadedAssets: 0,
    
    // Load a GLTF model
    loadModel: async function(id, path) {
        this.totalAssets++;
        
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            
            loader.load(
                path,
                (gltf) => {
                    this.models[id] = gltf;
                    this.loadedAssets++;
                    this.updateLoadingProgress();
                    resolve(gltf);
                },
                (xhr) => {
                    console.log(`${id}: ${Math.round(xhr.loaded / xhr.total * 100)}% loaded`);
                },
                (error) => {
                    console.error(`Error loading model ${id}:`, error);
                    this.loadedAssets++;
                    this.updateLoadingProgress();
                    reject(error);
                }
            );
        });
    },
    
    // Load a texture
    loadTexture: function(id, path) {
        this.totalAssets++;
        
        return new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            
            loader.load(
                path,
                (texture) => {
                    this.textures[id] = texture;
                    this.loadedAssets++;
                    this.updateLoadingProgress();
                    resolve(texture);
                },
                undefined,
                (error) => {
                    console.error(`Error loading texture ${id}:`, error);
                    this.loadedAssets++;
                    this.updateLoadingProgress();
                    reject(error);
                }
            );
        });
    },
    
    // Get a previously loaded model
    getModel: function(id) {
        if (!this.models[id]) {
            console.warn(`Model ${id} not found in asset manager`);
            return null;
        }
        
        // Clone the model to avoid modifying the original
        const original = this.models[id].scene;
        return THREE.SkeletonUtils.clone(original);
    },
    
    // Get a previously loaded texture
    getTexture: function(id) {
        if (!this.textures[id]) {
            console.warn(`Texture ${id} not found in asset manager`);
            return null;
        }
        
        return this.textures[id].clone();
    },
    
    // Update loading progress UI
    updateLoadingProgress: function() {
        const progress = this.totalAssets === 0 ? 100 : (this.loadedAssets / this.totalAssets) * 100;
        const loadingBarFill = document.getElementById('loading-bar-fill');
        
        if (loadingBarFill) {
            loadingBarFill.style.width = `${progress}%`;
        }
        
        if (progress >= 100) {
            this.hideLoadingScreen();
        }
    },
    
    // Hide the loading screen
    hideLoadingScreen: function() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.transition = 'opacity 0.5s';
            
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    }
};

// Input manager to handle keyboard and mouse inputs
const InputManager = {
    keys: {},
    mousePosition: { x: 0, y: 0 },
    mouseDown: false,
    
    init: function() {
        // Keyboard event listeners
        window.addEventListener('keydown', (event) => {
            this.keys[event.code] = true;
        });
        
        window.addEventListener('keyup', (event) => {
            this.keys[event.code] = false;
        });
        
        // Mouse event listeners
        window.addEventListener('mousemove', (event) => {
            this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });
        
        window.addEventListener('mousedown', () => {
            this.mouseDown = true;
        });
        
        window.addEventListener('mouseup', () => {
            this.mouseDown = false;
        });
    },
    
    // Check if a key is currently pressed
    isKeyPressed: function(keyCode) {
        return this.keys[keyCode] === true;
    },
    
    // Reset all input states
    reset: function() {
        this.keys = {};
        this.mouseDown = false;
    }
};