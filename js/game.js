// Game manager for Fox Adventure game

const Game = {
    // Game properties
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    player: null,
    dungeon: null,
    clock: null,
    isRunning: false,
    
    // Initialize the game
    init: function() {
        // Initialize Three.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        
        // Initialize camera
        this.camera = new THREE.PerspectiveCamera(
            75, // FOV
            window.innerWidth / window.innerHeight, // Aspect ratio
            0.1, // Near clipping plane
            1000 // Far clipping plane
        );
        this.camera.position.set(0, 1.7, 0); // Initial camera position
        
        // Initialize renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);
        
        // Initialize pointer lock controls
        this.controls = new THREE.PointerLockControls(this.camera, document.body);
        
        // Initialize clock for animation
        this.clock = new THREE.Clock();
        
        // Initialize input manager
        InputManager.init();
        
        // Initialize UI manager
        UIManager.init();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Setup keypress for using bombs
        window.addEventListener('keydown', (event) => {
            if (event.code === 'KeyE' && this.player) {
                this.player.useBomb();
            }
        });
        
        // Handle pointer lock
        document.addEventListener('click', () => {
            if (this.isRunning && !this.controls.isLocked) {
                this.controls.lock();
            }
        });
        
        // Handle pointer lock change
        this.controls.addEventListener('lock', () => {
            // Hide any UI elements that should be hidden when the game is running
        });
        
        this.controls.addEventListener('unlock', () => {
            // Show UI elements when the game is paused
        });
    },
    
    // Start the game
    start: function() {
        this.isRunning = true;
        
        // Lock pointer
        this.controls.lock();
        
        // Generate the dungeon
        this.createDungeon();
        
        // Create the player
        this.createPlayer();
        
        // Create items
        this.items = ItemManager.createItems(this.scene, this.dungeon);
        
        // Create enemies
        this.enemies = EnemyManager.createEnemies(this.scene, this.dungeon, 10);
        
        // Add lighting
        this.createLighting();
        
        // Start animation loop
        this.animate();
        
        // Show welcome message
        UIManager.showNotification('Welcome to Fox Adventure! Find the exit key and reach the green exit marker.');
    },
    
    // Restart the game
    restart: function() {
        // Clear the scene
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
        
        // Start a new game
        this.start();
    },
    
    // Create the dungeon
    createDungeon: function() {
        this.dungeon = DungeonGenerator.generateDungeon();
        this.scene.add(this.dungeon);
        
        // Get all wall and obstacle meshes for collision detection
        this.colliders = [];
        this.dungeon.traverse((child) => {
            if (child.isMesh && !child.userData.isItem && !child.userData.isEnemy) {
                this.colliders.push(child);
            }
        });
    },
    
    // Create the player
    createPlayer: function() {
        // Create player at dungeon start position
        this.player = new Player(this.scene, this.camera, this.controls);
        
        if (this.dungeon.userData.startPosition) {
            this.player.position.copy(this.dungeon.userData.startPosition);
            this.player.position.y = 0;
        }
    },
    
    // Create lighting
    createLighting: function() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);
        
        // Directional light (like sunlight coming from above)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 10, 0);
        directionalLight.castShadow = true;
        
        // Shadow settings
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -20;
        directionalLight.shadow.camera.right = 20;
        directionalLight.shadow.camera.top = 20;
        directionalLight.shadow.camera.bottom = -20;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        
        this.scene.add(directionalLight);
    },
    
    // Animation loop
    animate: function() {
        if (!this.isRunning) return;
        
        requestAnimationFrame(() => this.animate());
        
        // Calculate delta time
        const deltaTime = this.clock.getDelta();
        
        // Update player
        if (this.player) {
            this.player.update(deltaTime, InputManager, this.colliders, this.enemies, this.items);
        }
        
        // Update enemies
        EnemyManager.updateEnemies(deltaTime, this.player, this.colliders);
        
        // Update items
        ItemManager.updateItems(deltaTime);
        
        // Update dungeon animations
        DungeonGenerator.updateAnimations(this.dungeon, deltaTime);
        
        // Check for win condition
        this.checkWinCondition();
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
    },
    
    // Check if the player has reached the exit with the key
    checkWinCondition: function() {
        if (!this.player || !this.dungeon.userData.exitPosition) return;
        
        const distance = Utils.distance(this.player.position, this.dungeon.userData.exitPosition);
        
        if (distance < 1.5 && this.player.keys > 0) {
            // Player has reached the exit with the key
            this.win();
        }
    },
    
    // Game over
    gameOver: function() {
        this.isRunning = false;
        this.controls.unlock();
        UIManager.showGameOverScreen();
    },
    
    // Win the game
    win: function() {
        this.isRunning = false;
        this.controls.unlock();
        UIManager.showWinScreen();
    }
};