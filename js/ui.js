// UI Manager for Fox Adventure game

const UIManager = {
    // Initialize the UI
    init: function() {
        this.setupEventListeners();
        this.showStartScreen();
    },
    
    // Set up event listeners for UI interactions
    setupEventListeners: function() {
        // Start button event listener
        const startButton = document.getElementById('start-button');
        if (startButton) {
            startButton.addEventListener('click', () => {
                this.hideStartScreen();
                Game.start();
            });
        }
        
        // Retry button event listener (on game over screen)
        const retryButton = document.getElementById('retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', () => {
                this.hideGameOverScreen();
                Game.restart();
            });
        }
    },
    
    // Show the start screen
    showStartScreen: function() {
        // Create start screen if it doesn't exist
        if (!document.getElementById('start-screen')) {
            const startScreen = document.createElement('div');
            startScreen.id = 'start-screen';
            startScreen.style.position = 'absolute';
            startScreen.style.width = '100%';
            startScreen.style.height = '100%';
            startScreen.style.display = 'flex';
            startScreen.style.flexDirection = 'column';
            startScreen.style.justifyContent = 'center';
            startScreen.style.alignItems = 'center';
            startScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            startScreen.style.color = 'white';
            startScreen.style.zIndex = '1000';
            
            // Title
            const title = document.createElement('h1');
            title.textContent = 'Fox Adventure';
            title.style.fontSize = '48px';
            title.style.marginBottom = '20px';
            startScreen.appendChild(title);
            
            // Subtitle
            const subtitle = document.createElement('p');
            subtitle.textContent = 'A 3D Dungeon Crawler';
            subtitle.style.fontSize = '24px';
            subtitle.style.marginBottom = '40px';
            startScreen.appendChild(subtitle);
            
            // Instructions
            const instructions = document.createElement('div');
            instructions.style.marginBottom = '40px';
            instructions.style.textAlign = 'center';
            instructions.innerHTML = `
                <p>Controls:</p>
                <p>WASD - Move</p>
                <p>Mouse - Look around</p>
                <p>Click - Attack</p>
                <p>Space - Jump</p>
                <p>E - Use bomb</p>
            `;
            startScreen.appendChild(instructions);
            
            // Start button
            const startButton = document.createElement('button');
            startButton.id = 'start-button';
            startButton.textContent = 'Start Game';
            startButton.style.padding = '15px 30px';
            startButton.style.fontSize = '20px';
            startButton.style.backgroundColor = '#ff7700';
            startButton.style.color = 'white';
            startButton.style.border = 'none';
            startButton.style.borderRadius = '5px';
            startButton.style.cursor = 'pointer';
            startScreen.appendChild(startButton);
            
            document.body.appendChild(startScreen);
        } else {
            document.getElementById('start-screen').style.display = 'flex';
        }
    },
    
    // Hide the start screen
    hideStartScreen: function() {
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.style.display = 'none';
        }
    },
    
    // Show the game over screen
    showGameOverScreen: function() {
        // Create game over screen if it doesn't exist
        if (!document.getElementById('game-over-screen')) {
            const gameOverScreen = document.createElement('div');
            gameOverScreen.id = 'game-over-screen';
            gameOverScreen.style.position = 'absolute';
            gameOverScreen.style.width = '100%';
            gameOverScreen.style.height = '100%';
            gameOverScreen.style.display = 'flex';
            gameOverScreen.style.flexDirection = 'column';
            gameOverScreen.style.justifyContent = 'center';
            gameOverScreen.style.alignItems = 'center';
            gameOverScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            gameOverScreen.style.color = 'white';
            gameOverScreen.style.zIndex = '1000';
            
            // Title
            const title = document.createElement('h1');
            title.textContent = 'Game Over';
            title.style.fontSize = '48px';
            title.style.marginBottom = '20px';
            gameOverScreen.appendChild(title);
            
            // Score display
            const scoreDisplay = document.createElement('p');
            scoreDisplay.id = 'final-score';
            scoreDisplay.textContent = 'Gems collected: 0';
            scoreDisplay.style.fontSize = '24px';
            scoreDisplay.style.marginBottom = '40px';
            gameOverScreen.appendChild(scoreDisplay);
            
            // Retry button
            const retryButton = document.createElement('button');
            retryButton.id = 'retry-button';
            retryButton.textContent = 'Try Again';
            retryButton.style.padding = '15px 30px';
            retryButton.style.fontSize = '20px';
            retryButton.style.backgroundColor = '#ff7700';
            retryButton.style.color = 'white';
            retryButton.style.border = 'none';
            retryButton.style.borderRadius = '5px';
            retryButton.style.cursor = 'pointer';
            gameOverScreen.appendChild(retryButton);
            
            document.body.appendChild(gameOverScreen);
        } else {
            document.getElementById('game-over-screen').style.display = 'flex';
            document.getElementById('final-score').textContent = `Gems collected: ${Game.player.gems}`;
        }
    },
    
    // Hide the game over screen
    hideGameOverScreen: function() {
        const gameOverScreen = document.getElementById('game-over-screen');
        if (gameOverScreen) {
            gameOverScreen.style.display = 'none';
        }
    },
    
    // Show the win screen
    showWinScreen: function() {
        // Create win screen if it doesn't exist
        if (!document.getElementById('win-screen')) {
            const winScreen = document.createElement('div');
            winScreen.id = 'win-screen';
            winScreen.style.position = 'absolute';
            winScreen.style.width = '100%';
            winScreen.style.height = '100%';
            winScreen.style.display = 'flex';
            winScreen.style.flexDirection = 'column';
            winScreen.style.justifyContent = 'center';
            winScreen.style.alignItems = 'center';
            winScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            winScreen.style.color = 'white';
            winScreen.style.zIndex = '1000';
            
            // Title
            const title = document.createElement('h1');
            title.textContent = 'You Win!';
            title.style.fontSize = '48px';
            title.style.marginBottom = '20px';
            winScreen.appendChild(title);
            
            // Score display
            const scoreDisplay = document.createElement('p');
            scoreDisplay.id = 'win-score';
            scoreDisplay.textContent = 'Gems collected: 0';
            scoreDisplay.style.fontSize = '24px';
            scoreDisplay.style.marginBottom = '40px';
            winScreen.appendChild(scoreDisplay);
            
            // Play again button
            const playAgainButton = document.createElement('button');
            playAgainButton.id = 'play-again-button';
            playAgainButton.textContent = 'Play Again';
            playAgainButton.style.padding = '15px 30px';
            playAgainButton.style.fontSize = '20px';
            playAgainButton.style.backgroundColor = '#ff7700';
            playAgainButton.style.color = 'white';
            playAgainButton.style.border = 'none';
            playAgainButton.style.borderRadius = '5px';
            playAgainButton.style.cursor = 'pointer';
            playAgainButton.addEventListener('click', () => {
                this.hideWinScreen();
                Game.restart();
            });
            winScreen.appendChild(playAgainButton);
            
            document.body.appendChild(winScreen);
        } else {
            document.getElementById('win-screen').style.display = 'flex';
            document.getElementById('win-score').textContent = `Gems collected: ${Game.player.gems}`;
        }
    },
    
    // Hide the win screen
    hideWinScreen: function() {
        const winScreen = document.getElementById('win-screen');
        if (winScreen) {
            winScreen.style.display = 'none';
        }
    },
    
    // Show notification message
    showNotification: function(message, duration = 3000) {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('notification');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.position = 'absolute';
            notification.style.top = '20%';
            notification.style.left = '50%';
            notification.style.transform = 'translateX(-50%)';
            notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            notification.style.color = 'white';
            notification.style.padding = '15px 25px';
            notification.style.borderRadius = '5px';
            notification.style.fontSize = '18px';
            notification.style.textAlign = 'center';
            notification.style.zIndex = '900';
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            
            document.body.appendChild(notification);
        }
        
        // Clear any existing timeout
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        // Update and show the notification
        notification.textContent = message;
        notification.style.opacity = '1';
        
        // Hide after duration
        this.notificationTimeout = setTimeout(() => {
            notification.style.opacity = '0';
        }, duration);
    }
};