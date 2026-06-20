// Spaceship Asteroid Dodger Game Logic

// Game States
const STATE = {
    START: 'START',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER'
};

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.state = STATE.START;
        
        // Base dimensions (virtual resolution)
        this.width = 800;
        this.height = 600;
        
        // High Score Persistence (Safe from local file system SecurityError)
        let savedHighScore = 0;
        try {
            savedHighScore = parseInt(localStorage.getItem('cosmic_dodge_highscore')) || 0;
        } catch (e) {
            console.warn("localStorage is not accessible in this context:", e);
        }
        this.highscore = savedHighScore;
        document.getElementById('hud-highscore').textContent = this.pad(this.highscore, 6);

        // Core Game Entities
        this.spaceship = null;
        this.meteors = [];
        this.lasers = [];
        this.powerups = [];
        this.particles = [];
        this.stars = [];
        
        // Timers & Spawning parameters
        this.score = 0;
        this.level = 1;
        this.meteorSpawnTimer = 0;
        this.meteorSpawnInterval = 90; // Frames between spawns
        this.powerupSpawnTimer = 0;
        this.powerupSpawnInterval = 600; // Frames between powerups (~10s)
        this.levelTimer = 0;
        this.levelDuration = 1800; // Level up every 30 seconds (60fps * 30)
        this.survivalScoreCarry = 0; // accumulate smooth score increments
        this.handX = this.width / 2;
        this.useFingerControl = true;

        window.tmLoader.onPredictionCallback = (predictions, topPrediction) => {
           this.handlePredictions(predictions, topPrediction);
     };

        // Performance tuning
        this.maxParticles = 300; // hard cap for particle effects
        this.hudUpdateCounter = 0;
        this.hudUpdateInterval = 6; // update HUD DOM every 6 frames
        
        // Screenshake
        this.shakeIntensity = 0;
        this.shakeDecay = 0.9;

        // Controller Mapping Config
        this.gestureMappings = {}; // { 'Class Name': 'action' }
        this.confidenceThreshold = 0.85;
        this.activeActions = {
            left: false,
            right: false,
            shoot: false,
            shield: false
        };
        
        // Keyboard controls status
        this.keyboardActive = true;
        this.keys = {};

        // Setup event handlers
        this.initEventListeners();
        this.initStars();
        
        // Auto-load user model
        this.autofire = true;
        this.autoLoadModel('https://teachablemachine.withgoogle.com/models/WvHZP_S56/');

        // Setup responsive canvas to fill the viewport
        this.handleResize = this.handleResize.bind(this);
        this.handleResize();
        window.addEventListener('resize', this.handleResize);

        // Start rendering immediately for the start screen background
        this.tick();
    }

    // Zero padding helper
    pad(num, size) {
        let s = num + "";
        while (s.length < size) s = "0" + s;
        return s;
    }

    // Resize handler to make canvas fill the window
    handleResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Update canvas DOM size and backing store size
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.canvas.width = w;
        this.canvas.height = h;

        // Update virtual resolution used by game logic
        this.width = w;
        this.height = h;
    }

    initStars() {
        this.stars = [];
        // Fewer background stars to reduce draw cost
        for (let i = 0; i < 100; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 1.5 + 0.2,
                color: `hsla(${200 + Math.random() * 60}, 100%, 85%, ${Math.random() * 0.4 + 0.3})`
            });
        }
    }

    updateStars() {
        this.stars.forEach(star => {
            star.y += star.speed;
            // Warp to top when reaching bottom
            if (star.y > this.height) {
                star.y = 0;
                star.x = Math.random() * this.width;
            }
        });
    }

    drawStars() {
        this.stars.forEach(star => {
            this.ctx.fillStyle = star.color;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    initEventListeners() {
        // UI Button clicks
        // Start game immediately; webcam may be enabled separately via the panel button
        document.getElementById('play-btn').addEventListener('click', () => {
            this.startGame();
        });
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());
        document.getElementById('resume-btn').addEventListener('click', () => this.resumeGame());
        
        // Help modal toggles
        const helpModal = document.getElementById('help-modal');
        document.getElementById('help-btn').addEventListener('click', () => helpModal.classList.remove('hidden'));
        document.getElementById('close-help-btn').addEventListener('click', () => helpModal.classList.add('hidden'));
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) helpModal.classList.add('hidden');
        });
        
        // Sound toggler
        document.getElementById('sound-btn').addEventListener('click', () => {
            const isMuted = window.audio.toggleMute();
            const icon = document.getElementById('sound-icon');
            if (isMuted) {
                // Sound Off Icon Path
                icon.innerHTML = `<path fill="var(--color-secondary)" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
            } else {
                // Sound On Icon Path
                icon.innerHTML = `<path fill="var(--color-primary)" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
            }
        });

        // Keyboard inputs
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // Toggle pause screen
            if (e.code === 'KeyP') {
                if (this.state === STATE.PLAYING) {
                    this.pauseGame();
                } else if (this.state === STATE.PAUSED) {
                    this.resumeGame();
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });



        // Setup Webcam button
        document.getElementById('init-webcam-btn').addEventListener('click', async () => {
            const btn = document.getElementById('init-webcam-btn');
            btn.disabled = true;
            btn.textContent = "INITIALIZING...";

            try {
                await window.tmLoader.setupWebcam('webcam-container');
                
                // Update status UI
                document.getElementById('webcam-status-indicator').classList.add('active');
                document.getElementById('webcam-status-text').textContent = "CONNECTED";
                document.querySelector('.webcam-ring').classList.add('connected');
                
                btn.textContent = "WEBCAM ACTIVE";

                if (!this.handIntervalId) {
               this.handIntervalId = setInterval(() => {
                if (
                   window.tmLoader.isWebcamActive &&
                   window.tmLoader.handDetected
                ) {
            this.handX =
                window.tmLoader.indexFinger.x * this.width;
               }
              }, 16);
}
            } catch (e) {
                alert(e.message);
                btn.disabled = false;
                btn.textContent = "ENABLE WEBCAM";
            }
        });


    }

    async autoLoadModel(url) {
        try {
            console.log("Auto-loading model:", url);
            const classes = await window.tmLoader.loadFromURL(url);
            this.setupMappingUI(classes);
            
            const btn = document.getElementById('init-webcam-btn');
            if (btn) {
                btn.disabled = false;
                btn.textContent = "ENABLE WEBCAM";
            }
        } catch (e) {
            console.error("Failed to load user model:", e);
            const btn = document.getElementById('init-webcam-btn');
            if (btn) {
                btn.textContent = "MODEL LOAD ERROR";
            }
        }
    }

    startGame() {
        window.audio.resumeContext();
        
        // Hide Screens
        document.getElementById('screen-overlay').classList.add('hidden');
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('pause-screen').classList.add('hidden');
        
        // Show HUD
        document.getElementById('hud').classList.remove('hidden');
        
        // Reset Game variables
        this.score = 0;
        this.level = 1;
        this.meteorSpawnInterval = 90;
        this.meteorSpawnTimer = 0;
        this.powerupSpawnTimer = 350; // Spawn first powerup sooner (~4 seconds)
        this.levelTimer = 0;
        this.survivalScoreCarry = 0;
        
        this.spaceship = new Spaceship(this.width / 2, this.height - 80, this);
        this.meteors = [];
        this.lasers = [];
        this.powerups = [];
        this.particles = [];
        
        this.updateHUD();
        this.state = STATE.PLAYING;
    }

    pauseGame() {
        if (this.state !== STATE.PLAYING) return;
        this.state = STATE.PAUSED;
        document.getElementById('screen-overlay').classList.remove('hidden');
        document.getElementById('pause-screen').classList.remove('hidden');
    }

    resumeGame() {
        if (this.state !== STATE.PAUSED) return;
        document.getElementById('screen-overlay').classList.add('hidden');
        document.getElementById('pause-screen').classList.add('hidden');
        this.state = STATE.PLAYING;
    }

    triggerPlayerBlast() {
        if (this.state === STATE.GAMEOVER) return; // Prevent multiple blast triggers
        
        this.state = STATE.GAMEOVER;
        
        const shipX = this.spaceship.x;
        const shipY = this.spaceship.y;
        
        // Spawn massive blast particles (fire and neon shockwaves)
        this.createSparks(shipX, shipY, '#ff007f', 40); // Magenta blast
        this.createSparks(shipX, shipY, '#00f0ff', 40); // Cyan blast
        this.createSparks(shipX, shipY, '#ffffff', 20); // White core blast
        
        this.createRippleWave(shipX, shipY, '#ff007f'); // Magenta shockwave
        setTimeout(() => this.createRippleWave(shipX, shipY, '#00f0ff'), 150); // Cyan shockwave
        
        // Violent screenshake
        this.shakeIntensity = 24;
        
        // Play crash explosion sfx
        window.audio.playExplosion();
        setTimeout(() => window.audio.playExplosion(), 120);
        
        // Delay showing the UI and play game over tune
        setTimeout(() => {
            this.showGameOverUI();
        }, 1500);
    }

    showGameOverUI() {
        window.audio.playGameOver();

        // Update High Score
        if (this.score > this.highscore) {
            this.highscore = this.score;
            try {
                localStorage.setItem('cosmic_dodge_highscore', this.highscore);
            } catch (e) {
                console.warn("Could not save high score to localStorage:", e);
            }
            document.getElementById('hud-highscore').textContent = this.pad(this.highscore, 6);
        }

        // Show game over screens
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('final-level').textContent = this.level;
        document.getElementById('hud').classList.add('hidden');
        
        document.getElementById('screen-overlay').classList.remove('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
    }

    // Dynamic configuration UI based on model classes
    setupMappingUI(classes) {
        this.gestureMappings = {};

        classes.forEach(cls => {
            // Smart auto-mapping in memory
            const lowerCls = cls.toLowerCase();
            if (lowerCls.includes('left')) {
                this.gestureMappings[cls] = 'left';
            } else if (lowerCls.includes('right')) {
                this.gestureMappings[cls] = 'right';
            } else if (lowerCls.includes('shoot') || lowerCls.includes('fire') || lowerCls.includes('fist')) {
                this.gestureMappings[cls] = 'shoot';
            } else if (lowerCls.includes('shield') || lowerCls.includes('open')) {
                this.gestureMappings[cls] = 'shield';
            } else {
                this.gestureMappings[cls] = 'none';
            }
        });

        // Initialize prediction list UI container
        const labelContainer = document.getElementById('label-container');
        if (labelContainer) {
            labelContainer.innerHTML = '';
            classes.forEach(cls => {
                const predItem = document.createElement('div');
                predItem.className = 'prediction-item';
                predItem.id = `pred-item-${cls.replace(/\s+/g, '_')}`;

                predItem.innerHTML = `
                    <div class="prediction-info">
                        <span class="prediction-name">${cls}</span>
                        <span class="prediction-value" id="pred-val-${cls.replace(/\s+/g, '_')}">0%</span>
                    </div>
                    <div class="prediction-meter-bg">
                        <div class="prediction-meter-fill" id="pred-fill-${cls.replace(/\s+/g, '_')}"></div>
                    </div>
                `;
                labelContainer.appendChild(predItem);
            });
        }
    }

    // Capture classifications from model loop
    handlePredictions(predictions, topPrediction) {
        if (this.state === STATE.GAMEOVER) return;

        // Reset continuous actions (pulsed inputs like shoot will handle cooldown inside game loop)
        this.activeActions.left = false;
        this.activeActions.right = false;
        this.activeActions.shield = false;
        this.activeActions.shoot = false;

        predictions.forEach(p => {
            const pct = Math.round(p.probability * 100);
            const classId = p.className.replace(/\s+/g, '_');
            
            // Update UI list meters
            const valSpan = document.getElementById(`pred-val-${classId}`);
            const fillDiv = document.getElementById(`pred-fill-${classId}`);
            
            if (valSpan && fillDiv) {
                valSpan.textContent = pct + '%';
                fillDiv.style.width = pct + '%';
                
                // If top active, add neon glow
                if (p.className === topPrediction.className && p.probability >= this.confidenceThreshold) {
                    valSpan.classList.add('active');
                    fillDiv.classList.add('triggered');
                } else {
                    valSpan.classList.remove('active');
                    fillDiv.classList.remove('triggered');
                }
            }

            // Map gesture to action
            const action = this.gestureMappings[p.className];
            if (action && action !== 'none' && p.probability >= this.confidenceThreshold) {
                this.activeActions[action] = true;
            }
        });
    }

    // Keyboard Fallback Input polling
    pollKeyboard() {
        // Only run if keys mapping is present
        this.activeActions.left = this.keys['ArrowLeft'] || this.keys['KeyA'];
        this.activeActions.right = this.keys['ArrowRight'] || this.keys['KeyD'];
        this.activeActions.shoot = this.keys['Space'];
        this.activeActions.shield = this.keys['KeyS'];
    }

    // Main animation frame loop
    tick() {
        this.update();
        this.draw();
        window.requestAnimationFrame(() => this.tick());
    }

    update() {
        this.updateStars();
        
        if (this.state !== STATE.PLAYING) {
            // Background still animates particles
            this.particles.forEach(p => p.update());
            this.particles = this.particles.filter(p => p.life > 0);
            return;
        }

        // 1. Gather Inputs
        if (!window.tmLoader.isWebcamActive) {
            this.pollKeyboard();
        } else {
            // Even if model is loaded, allow keyboard as backup override
            if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.activeActions.left = true;
            if (this.keys['ArrowRight'] || this.keys['KeyD']) this.activeActions.right = true;
            if (this.keys['Space']) this.activeActions.shoot = true;
            if (this.keys['KeyS']) this.activeActions.shield = true;
        }

        // Apply auto-fire override if active
        if (this.autofire) {
            this.activeActions.shoot = true;
        }

        // 2. Update Spaceship
       const fingerPosition =
       window.tmLoader.isWebcamActive &&
       window.tmLoader.handDetected &&
       this.useFingerControl
        ? this.handX
        : null;

    this.spaceship.update(
    this.activeActions,
    fingerPosition
    );

        // 3. Spawners
        this.meteorSpawnTimer++;
        if (this.meteorSpawnTimer >= this.meteorSpawnInterval) {
            this.spawnMeteor();
            this.meteorSpawnTimer = 0;
        }

        this.powerupSpawnTimer++;
        if (this.powerupSpawnTimer >= this.powerupSpawnInterval) {
            this.spawnPowerup();
            this.powerupSpawnTimer = 0;
        }

        // 4. Game level difficulty scaling
        this.levelTimer++;
        if (this.levelTimer >= this.levelDuration) {
            this.level++;
            this.levelTimer = 0;
            // Shorten interval, cap at 20 frames (meteors spawn more frequently)
            this.meteorSpawnInterval = Math.max(20, 90 - (this.level * 10));
            
            // Create nice shield powerup when levelling up!
            this.spawnPowerup('repair');
            
            // Level up particle wave
            this.createLevelUpWave();
            this.updateHUD();
        }

        // 4a. Survival score grows smoothly while the ship remains alive
        this.survivalScoreCarry += 0.4 + this.level * 0.03;
        if (this.survivalScoreCarry >= 1) {
            const addPoints = Math.floor(this.survivalScoreCarry);
            this.score += addPoints;
            this.survivalScoreCarry -= addPoints;
            this.updateHUD();
        }

        // 5. Update Entity arrays
        this.lasers.forEach(laser => laser.update());
        this.meteors.forEach(meteor => meteor.update());
        this.powerups.forEach(pu => pu.update());
        this.particles.forEach(p => p.update());

        // Filter out out-of-bounds/dead entities
        this.lasers = this.lasers.filter(l => l.y > -20);
        this.meteors = this.meteors.filter(m => m.y < this.height + 50);
        this.powerups = this.powerups.filter(pu => pu.y < this.height + 50);
        this.particles = this.particles.filter(p => p.life > 0);

        // 6. Handle Collisions
        this.checkCollisions();

        // 7. Update screen shake decay
        if (this.shakeIntensity > 0.1) {
            this.shakeIntensity *= this.shakeDecay;
        } else {
            this.shakeIntensity = 0;
        }

        // 8. Sync indicators in HUD
        // Throttle DOM updates for HUD to reduce main-thread work
        this.hudUpdateCounter = (this.hudUpdateCounter + 1) % this.hudUpdateInterval;
        if (this.hudUpdateCounter === 0) {
            this.updateHUDBars();
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Screenshake translation matrix
        this.ctx.save();
        if (this.shakeIntensity > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
        }

        // Draw stars background
        this.drawStars();

        // Draw powerups
        this.powerups.forEach(pu => pu.draw(this.ctx));

        // Draw lasers
        this.lasers.forEach(laser => laser.draw(this.ctx));

        // Draw player spaceship
        if (this.state === STATE.PLAYING && this.spaceship) {
            this.spaceship.draw(this.ctx);
        }

        // Draw Weapon status warning on canvas
        if (this.state === STATE.PLAYING && this.spaceship) {
            this.ctx.save();
            this.ctx.font = "bold 12px Orbitron";
            this.ctx.textAlign = "center";
            
            if (this.spaceship.doubleShotTime > 0) {
                const secLeft = (this.spaceship.doubleShotTime / 60).toFixed(1);
                this.ctx.fillStyle = "#ff007f";
                this.ctx.shadowColor = "#ff007f";
                this.ctx.shadowBlur = 8;
                this.ctx.fillText(`CANNONS ONLINE: ${secLeft}s`, this.width / 2, 28);
            } else {
                this.ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
                this.ctx.fillText("WEAPONS OFFLINE - COLLECT [W] POWERUP", this.width / 2, 28);
            }
            this.ctx.restore();
        }

        // Draw meteors
        this.meteors.forEach(meteor => meteor.draw(this.ctx));

        // Draw particles
        this.particles.forEach(p => p.draw(this.ctx));

        this.ctx.restore();
    }

    spawnMeteor() {
        // Number of meteors spawned at once scales with level
        const maxMeteorsAtOnce = 2 + Math.floor((this.level - 1) * 0.55); // Level 1: 2, Level 3: 3-4, Level 5: 4-5
        const count = Math.min(6, Math.max(2, Math.floor(Math.random() * maxMeteorsAtOnce) + 1));
        
        for (let i = 0; i < count; i++) {
            this.createSingleMeteor();
        }
    }

    createSingleMeteor() {
        // Vary size and distribution based on level
        const sizeRand = Math.random();
        let type = 'small';
        let radius = 12 + Math.random() * 6;
        let hp = 1;

        if (sizeRand > 0.75) {
            type = 'large';
            radius = 35 + Math.random() * 10;
            hp = 3;
        } else if (sizeRand > 0.4) {
            type = 'medium';
            radius = 22 + Math.random() * 6;
            hp = 2;
        }

        // Speed increases more aggressively with level
        const speedMultiplier = 1 + (this.level - 1) * 0.35;
        const vy = (Math.random() * 2.2 + 2.0) * speedMultiplier;
        const vx = (Math.random() * 1.5 - 0.75) * speedMultiplier;
        const rx = Math.random() * (this.width - 60) + 30;

        this.meteors.push(new Meteor(rx, -radius - 10, radius, vx, vy, hp, type));
    }

    spawnPowerup(forcedType = null) {
        const types = ['shield_charge', 'double_shot', 'repair'];
        const type = forcedType || types[Math.floor(Math.random() * types.length)];
        const rx = Math.random() * (this.width - 80) + 40;
        this.powerups.push(new Powerup(rx, -30, type));
    }

    checkCollisions() {
        if (!this.spaceship) return;

        // 1. Lasers vs Meteors
        for (let lIdx = this.lasers.length - 1; lIdx >= 0; lIdx--) {
            const laser = this.lasers[lIdx];
            for (let mIdx = this.meteors.length - 1; mIdx >= 0; mIdx--) {
                const meteor = this.meteors[mIdx];
                
                // Circle-AABB approximation (simple circle vs circle is faster and good enough here)
                const dist = Math.hypot(laser.x - meteor.x, laser.y - meteor.y);
                if (dist < meteor.radius + 6) {
                    // Hit!
                    meteor.health--;
                    this.lasers.splice(lIdx, 1);
                    
                    // Create direct impact sparks
                    this.createSparks(laser.x, laser.y, '#00f0ff', 6);
                    
                    if (meteor.health <= 0) {
                        this.destroyMeteor(meteor, mIdx);
                    } else {
                        // Flashes orange on hit
                        meteor.hitTimer = 5;
                        window.audio.playHurt();
                    }
                    break; // break to next laser
                }
            }
        }

        // 2. Spaceship vs Meteors
        const ship = this.spaceship;
        for (let mIdx = this.meteors.length - 1; mIdx >= 0; mIdx--) {
            const meteor = this.meteors[mIdx];
            const dist = Math.hypot(ship.x - meteor.x, ship.y - meteor.y);
            
            // Check bounding circle collision
            if (dist < meteor.radius + ship.hitRadius) {
                const damage = meteor.radius * 0.8;
                
                if (ship.shield > 0) {
                    // Shield absorbs the entire hit (no bleed-through to hull health)
                    ship.shield = Math.max(0, ship.shield - damage);
                    this.shakeIntensity = Math.max(this.shakeIntensity, meteor.radius * 0.4);
                    
                    // Shield impact effect
                    this.createSparks(meteor.x, meteor.y, '#00f0ff', 20);
                    window.audio.playShield();
                    
                    // Remove meteor
                    this.meteors.splice(mIdx, 1);
                    this.score += 50;
                    this.updateHUD();
                } else {
                    // Shield is fully depleted (0%). Hull integrity decreases!
                    const dmg = Math.round(damage);
                    ship.health = Math.max(0, ship.health - dmg);
                    ship.damageFlashTime = 12; // Flash ship red
                    this.shakeIntensity = Math.max(this.shakeIntensity, meteor.radius * 0.8);
                    
                    // Metal debris particles
                    this.createSparks(ship.x, ship.y, '#ff007f', 25);
                    this.createSparks(meteor.x, meteor.y, '#d88', 15);
                    window.audio.playHurt();
                    
                    // Remove meteor
                    this.meteors.splice(mIdx, 1);
                    
                    if (ship.health <= 0) {
                        this.triggerPlayerBlast();
                        break;
                    }
                    this.updateHUD();
                }
            }
        }

        // 3. Spaceship vs Powerups
        for (let pIdx = this.powerups.length - 1; pIdx >= 0; pIdx--) {
            const pu = this.powerups[pIdx];
            const dist = Math.hypot(ship.x - pu.x, ship.y - pu.y);
            
            if (dist < pu.radius + ship.hitRadius) {
                // Collect powerup!
                this.applyPowerup(pu.type);
                this.powerups.splice(pIdx, 1);
                
                // Ring ripple effect
                this.createRippleWave(pu.x, pu.y, pu.color);
            }
        }
    }

    destroyMeteor(meteor, index) {
        this.meteors.splice(index, 1);
        window.audio.playExplosion();
        
        // Large explosion particles
        const color = meteor.type === 'large' ? '#ff6b35' : (meteor.type === 'medium' ? '#ffb703' : '#a0a0a0');
        this.createSparks(meteor.x, meteor.y, color, meteor.radius * 0.6);
        
        // Split mechanics
        if (meteor.type === 'large') {
            this.splitMeteor(meteor, 'medium');
            this.score += 150;
            this.score += 20; // small bonus for destroying a meteor
        } else if (meteor.type === 'medium') {
            this.splitMeteor(meteor, 'small');
            this.score += 100;
            this.score += 15; // small bonus for destroying a meteor
        } else {
            this.score += 50;
            this.score += 10; // small bonus for destroying a meteor
        }
        
        this.updateHUD();
    }

    splitMeteor(parent, childType) {
        const rad = childType === 'medium' ? 22 : 12;
        const hp = childType === 'medium' ? 2 : 1;
        
        // Shoot two fragments outwards
        this.meteors.push(new Meteor(parent.x - 10, parent.y, rad, parent.vx - 1.2, parent.vy + 0.5, hp, childType));
        this.meteors.push(new Meteor(parent.x + 10, parent.y, rad, parent.vx + 1.2, parent.vy + 0.5, hp, childType));
    }

    applyPowerup(type) {
        window.audio.playPowerup();
        const ship = this.spaceship;
        
        if (type === 'shield_charge') {
            ship.shield = Math.min(100, ship.shield + 50);
        } else if (type === 'double_shot') {
            ship.doubleShotTime = 480; // 8 seconds of double shot (60fps * 8)
        } else if (type === 'repair') {
            ship.health = Math.min(100, ship.health + 25);
        }
        
        this.score += 200;
        this.updateHUD();
    }

    // Effect Creators
    createSparks(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 1.5;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                color,
                Math.random() * 3 + 1,
                1.0,
                0.015 + Math.random() * 0.02
            ));
        }
        // Enforce particle cap
        if (this.particles.length > this.maxParticles) {
            this.particles.splice(0, this.particles.length - this.maxParticles);
        }
    }

    createRippleWave(x, y, color) {
        for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * Math.PI * 2;
            const speed = 3.5;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                color,
                3,
                1.0,
                0.025
            ));
        }
        if (this.particles.length > this.maxParticles) {
            this.particles.splice(0, this.particles.length - this.maxParticles);
        }
    }

    createLevelUpWave() {
        for (let i = 0; i < 60; i++) {
            const angle = (i / 60) * Math.PI * 2;
            const speed = 5;
            this.particles.push(new Particle(
                this.width / 2, this.height / 2,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                '#00f0ff',
                4,
                1.0,
                0.015
            ));
        }
        if (this.particles.length > this.maxParticles) {
            this.particles.splice(0, this.particles.length - this.maxParticles);
        }
    }

    // Sync HUD Text
    updateHUD() {
        document.getElementById('hud-score').textContent = this.pad(this.score, 6);
        document.getElementById('hud-level').textContent = this.level;
    }

    // Sync HUD gauges smoothly
    updateHUDBars() {
        if (!this.spaceship) return;
        
        const ship = this.spaceship;
        
        // Hull bar sync
        const hullBar = document.getElementById('hull-bar');
        const hullPct = document.getElementById('hull-pct');
        hullBar.style.width = ship.health + '%';
        hullPct.textContent = Math.round(ship.health) + '%';
        
        // Colors warning levels
        hullBar.className = 'hud-gauge-bar-fill';
        if (ship.health > 50) {
            hullBar.classList.add('green-glow');
        } else if (ship.health > 25) {
            hullBar.classList.add('orange-glow');
        } else {
            hullBar.classList.add('red-glow');
        }

        // Shield bar sync
        const shieldBar = document.getElementById('shield-bar');
        const shieldPct = document.getElementById('shield-pct');
        shieldBar.style.width = ship.shield + '%';
        shieldPct.textContent = Math.round(ship.shield) + '%';
    }
}

// ==========================================================================
// GAME CLASSES
// ==========================================================================

class Spaceship {
    constructor(x, y, game) {
        this.x = x;
        this.y = y;
        this.game = game;
        
        this.width = 54;
        this.height = 64;
        this.hitRadius = 20;

        // Physics movement
        this.vx = 0;
        this.ax = 0.95; // Acceleration force
        this.friction = 0.88;
        this.maxSpeed = 8.5;

        // State parameters
        this.health = 100;
        this.shield = 100;
        this.shieldActive = false;
        
        // Weapon cool downs
        this.fireCooldown = 0;
        this.fireRate = 10; // Frames between auto fires (6 shots per sec)
        
        // Powerup timers
        this.doubleShotTime = 0;
        this.damageFlashTime = 0;
    }

    update(actions, handX = null) {
        // Friction dampening
        this.vx *= this.friction;

        // Apply movement forces
        if (actions.left) {
            this.vx = Math.max(-this.maxSpeed, this.vx - this.ax);
        }
        if (actions.right) {
            this.vx = Math.min(this.maxSpeed, this.vx + this.ax);
        }

        // Move spaceship
        this.x += this.vx;

        if (handX !== null) {

            this.x =
                this.x * 0.8 +
                handX * 0.2;

            this.x = Math.max(
                this.width / 2,
                Math.min(
                    this.game.width - this.width / 2,
                    this.x
                )
            );
        }

        // Keep inside bounds
        const halfW = this.width / 2;
        if (this.x < halfW) {
            this.x = halfW;
            this.vx = 0;
        }
        if (this.x > this.game.width - halfW) {
            this.x = this.game.width - halfW;
            this.vx = 0;
        }

        // Handle shield state
        if (actions.shield) {
            if (this.shield > 0) {
                if (!this.shieldActive) {
                    window.audio.playShield();
                }
                this.shieldActive = true;
                this.shield = Math.max(0, this.shield - 0.55); // Shield drainage per frame
            } else {
                // Shield is depleted! If they keep holding, hull integrity starts draining!
                this.shieldActive = false;
                this.health = Math.max(0, this.health - 0.25); // Decrease hull integrity
                this.damageFlashTime = 2; // Subtle red damage flash warning!
                if (Math.random() > 0.95) {
                    window.audio.playHurt(); // Play subtle warning glitch sound
                }
                if (this.health <= 0) {
                    this.game.triggerPlayerBlast();
                }
            }
        } else {
            this.shieldActive = false;
        }

        // Handle firing weapon (Only allowed if weapons powerup is active!)
        if (this.fireCooldown > 0) this.fireCooldown--;
        
        if (this.doubleShotTime > 0 && actions.shoot && this.fireCooldown === 0) {
            this.fireWeapon();
        }

        // Timers
        if (this.doubleShotTime > 0) this.doubleShotTime--;
        if (this.damageFlashTime > 0) this.damageFlashTime--;

        // Thruster sparks
        if (Math.random() > 0.3) {
            const fireX = this.x + (Math.random() - 0.5) * 8;
            this.game.particles.push(new Particle(
                fireX, this.y + 28,
                this.vx * 0.4 + (Math.random() - 0.5) * 0.5,
                Math.random() * 3 + 2, // going down
                '#ff5000',
                Math.random() * 2 + 1,
                1.0,
                0.04
            ));
        }
    }

    fireWeapon() {
        this.fireCooldown = this.fireRate;
        window.audio.playShoot();

        if (this.doubleShotTime > 0) {
            // Twin shot cannons
            this.game.lasers.push(new Laser(this.x - 16, this.y - 10, '#ff007f'));
            this.game.lasers.push(new Laser(this.x + 16, this.y - 10, '#ff007f'));
        } else {
            // Center single shot
            this.game.lasers.push(new Laser(this.x, this.y - 18, '#00f0ff'));
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Flash ship red on hit
        if (this.damageFlashTime > 0) {
            ctx.shadowColor = '#ff007f';
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 8;
        }

        // 1. Draw Starship wings & body
        const grad = ctx.createLinearGradient(0, -25, 0, 25);
        if (this.damageFlashTime > 0) {
            grad.addColorStop(0, '#ff3366');
            grad.addColorStop(1, '#660000');
        } else {
            grad.addColorStop(0, '#00f0ff');
            grad.addColorStop(1, '#7b2cbf');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        // Nose tip
        ctx.moveTo(0, -28);
        // Right wingtip
        ctx.lineTo(25, 20);
        // Right interior cut
        ctx.lineTo(10, 12);
        // Bottom engine ridge
        ctx.lineTo(-10, 12);
        // Left wingtip
        ctx.lineTo(-25, 20);
        ctx.closePath();
        ctx.fill();

        // 2. Neon highlight stripes
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(0, 8);
        ctx.moveTo(-8, 5);
        ctx.lineTo(8, 5);
        ctx.stroke();

        // 3. Cabin glass cockpit dome
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.ellipse(0, -5, 5, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // 4. Draw deflector shield bubble (Always visible if shield energy > 0)
        if (this.shield > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            
            const pulseSize = this.hitRadius * 1.8 + Math.sin(Date.now() * 0.025) * 2;
            const shieldAlpha = this.shieldActive ? 0.6 : (0.15 + (this.shield / 100) * 0.2); // Brighter if active, fades slightly as energy drops
            
            // Outer glow ring
            const shieldGrad = ctx.createRadialGradient(0, 0, pulseSize * 0.7, 0, 0, pulseSize);
            shieldGrad.addColorStop(0, 'rgba(0, 240, 255, 0.0)');
            shieldGrad.addColorStop(0.85, `rgba(0, 240, 255, ${shieldAlpha * 0.25})`);
            shieldGrad.addColorStop(1, `rgba(0, 240, 255, ${shieldAlpha})`);
            
            ctx.fillStyle = shieldGrad;
            ctx.beginPath();
            ctx.arc(0, 0, pulseSize, 0, Math.PI * 2);
            ctx.fill();

            // Draw vector scanning arcs on shield
            ctx.strokeStyle = `rgba(0, 240, 255, ${shieldAlpha * 0.8})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const startAngle = (Date.now() * 0.003) % (Math.PI * 2);
            ctx.arc(0, 0, pulseSize, startAngle, startAngle + 1);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(0, 0, pulseSize, startAngle + Math.PI, startAngle + Math.PI + 1);
            ctx.stroke();

            ctx.restore();
        }
    }
}

class Meteor {
    constructor(x, y, radius, vx, vy, hp, type) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.vx = vx;
        this.vy = vy;
        this.health = hp;
        this.maxHealth = hp;
        this.type = type;
        
        // Rotational properties
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.03;
        
        this.hitTimer = 0;

        // Generate jagged asteroid shape points on creation
        this.points = [];
        const vertices = 8 + Math.floor(Math.random() * 5); // 8 to 12 segments
        for (let i = 0; i < vertices; i++) {
            const angle = (i / vertices) * Math.PI * 2;
            // Variance in radius creates nice bumpy rock texture
            const variance = 0.75 + Math.random() * 0.4;
            this.points.push({
                x: Math.cos(angle) * this.radius * variance,
                y: Math.sin(angle) * this.radius * variance
            });
        }
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;
        
        if (this.hitTimer > 0) this.hitTimer--;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Flash orange/yellow on hit
        if (this.hitTimer > 0) {
            ctx.fillStyle = '#ffb703';
            ctx.shadowColor = '#ffb703';
            ctx.shadowBlur = 15;
        } else {
            // Visual coloring depending on health size
            const colorGrad = ctx.createRadialGradient(0, 0, this.radius * 0.2, 0, 0, this.radius);
            
            if (this.type === 'large') {
                colorGrad.addColorStop(0, '#2b1b17'); // dark red-brown core
                colorGrad.addColorStop(1, '#151515');
                ctx.shadowColor = 'rgba(255, 80, 0, 0.45)'; // hot volcanic glow
            } else if (this.type === 'medium') {
                colorGrad.addColorStop(0, '#3a3a45'); // cold slate blue core
                colorGrad.addColorStop(1, '#181822');
                ctx.shadowColor = 'rgba(123, 44, 191, 0.4)'; // purple cosmic energy
            } else {
                colorGrad.addColorStop(0, '#4a4a4a'); // gray rock
                colorGrad.addColorStop(1, '#242424');
                ctx.shadowColor = 'rgba(255,255,255,0.15)';
            }
            
            ctx.fillStyle = colorGrad;
            ctx.shadowBlur = 8;
        }

        // Draw the pre-computed jagged rock polygon
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
            ctx.lineTo(this.points[i].x, this.points[i].y);
        }
        ctx.closePath();
        ctx.fill();

        // Overlay a bit of rocky stroke contour
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }
}

class Laser {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 20;
        this.vy = -13; // rapid upward speed
        this.color = color;
    }

    update() {
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.rect(this.x - this.width / 2, this.y, this.width, this.height);
        ctx.fill();
        ctx.restore();
    }
}

class Powerup {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = 16;
        this.vy = 2.0; // Slow descent
        
        // Colors & labels
        if (type === 'shield_charge') {
            this.color = '#00f0ff';
            this.label = 'S';
        } else if (type === 'double_shot') {
            this.color = '#ff007f';
            this.label = 'W';
        } else if (type === 'repair') {
            this.color = '#39ff14';
            this.label = '+';
        }
    }

    update() {
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Circular glow pulsing orb
        const pulse = 1.0 + Math.sin(Date.now() * 0.01) * 0.1;
        const drawRadius = this.radius * pulse;

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 14;
        
        // Inner gradient
        const grad = ctx.createRadialGradient(0, 0, drawRadius * 0.2, 0, 0, drawRadius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.5, this.color);
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = grad;
        
        ctx.beginPath();
        ctx.arc(0, 0, drawRadius, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.label, 0, 0.5);

        ctx.restore();
    }
}

class Particle {
    constructor(x, y, vx, vy, color, size, life, decay) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = life; // starts at 1.0
        this.decay = decay; // subtraction per frame
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        
        // Dynamic blur
        ctx.shadowColor = this.color;
        ctx.shadowBlur = this.size * 2;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Global single instance export
const game = new Game();
window.game = game;
