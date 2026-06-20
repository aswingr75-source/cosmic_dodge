// Web Audio API Synthesizer for Retro Space Sounds
class CosmicAudio {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.masterVolume = null;
        this.cachedNoiseBuffer = null;
        
        // Try to initialize on construction (often blocked, but good if allowed)
        this.init();
    }

    init() {
        if (this.ctx) return;
        
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            
            // Create master volume node
            this.masterVolume = this.ctx.createGain();
            this.masterVolume.gain.value = 0.3; // Default level
            this.masterVolume.connect(this.ctx.destination);
            
            console.log("Audio Engine initialized successfully.");
        } catch (e) {
            console.warn("Web Audio API not supported or blocked: ", e);
        }
    }

    resumeContext() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterVolume) {
            this.masterVolume.gain.value = this.muted ? 0 : 0.3;
        }
        return this.muted;
    }

    // Generate procedural white noise buffer for explosions and thrusters
    createNoiseBuffer() {
        if (!this.ctx) return null;
        const bufferSize = this.ctx.sampleRate * 1.5; // 1.5 seconds of noise
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    // Laser shoot: fast frequency sweep downwards
    playShoot() {
        this.resumeContext();
        if (!this.ctx || this.muted) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.type = 'triangle'; // triangle has a nice punchy 80s sound
        
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(880, now); // Start high
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.15); // Sweep down
        
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); // Fade out
        
        osc.start(now);
        osc.stop(now + 0.16);
    }

    // Meteor explosion: low-pass filtered white noise
    playExplosion() {
        this.resumeContext();
        if (!this.ctx || this.muted) return;

        if (!this.cachedNoiseBuffer) {
            this.cachedNoiseBuffer = this.createNoiseBuffer();
        }
        const noiseBuffer = this.cachedNoiseBuffer;
        if (!noiseBuffer) return;

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        
        const gain = this.ctx.createGain();

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolume);

        const now = this.ctx.currentTime;
        
        // Start filter low, open it up slightly, then close it
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.8);

        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

        noiseNode.start(now);
        noiseNode.stop(now + 0.85);
    }

    // Player taking damage: harsh low sweep
    playHurt() {
        this.resumeContext();
        if (!this.ctx || this.muted) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.masterVolume);
        
        osc.type = 'sawtooth';
        
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.3);
        
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        
        osc.start(now);
        osc.stop(now + 0.35);
    }

    // Power-up pick up: futuristic double pitch sweep up
    playPowerup() {
        this.resumeContext();
        if (!this.ctx || this.muted) return;

        const now = this.ctx.currentTime;
        
        // First tone
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(this.masterVolume);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(300, now);
        osc1.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc1.start(now);
        osc1.stop(now + 0.16);

        // Second tone (slightly delayed and higher pitch)
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(this.masterVolume);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(450, now + 0.08);
        osc2.frequency.exponentialRampToValueAtTime(900, now + 0.23);
        gain2.gain.setValueAtTime(0.3, now + 0.08);
        gain2.gain.linearRampToValueAtTime(0.01, now + 0.23);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.24);
    }

    // Game Over sound effect: sad descending sequence
    playGameOver() {
        this.resumeContext();
        if (!this.ctx || this.muted) return;

        const now = this.ctx.currentTime;
        const notes = [330, 294, 261, 196]; // Mi, Re, Do, Sol
        const duration = 0.25;

        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.connect(gain);
            gain.connect(this.masterVolume);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * duration);
            
            gain.gain.setValueAtTime(0.4, now + idx * duration);
            gain.gain.linearRampToValueAtTime(0.01, now + (idx + 1) * duration - 0.02);
            
            osc.start(now + idx * duration);
            osc.stop(now + (idx + 1) * duration);
        });
    }

    // Shield activate sound: retro frequency mod
    playShield() {
        this.resumeContext();
        if (!this.ctx || this.muted) return;

        const osc = this.ctx.createOscillator();
        const mod = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const gain = this.ctx.createGain();

        mod.connect(modGain);
        modGain.connect(osc.frequency); // FM Synthesis!
        
        osc.connect(gain);
        gain.connect(this.masterVolume);

        osc.type = 'sine';
        mod.type = 'sine';

        const now = this.ctx.currentTime;
        
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);

        mod.frequency.setValueAtTime(45, now); // 45 Hz modulation
        modGain.gain.setValueAtTime(100, now);

        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);

        osc.start(now);
        mod.start(now);
        
        osc.stop(now + 0.35);
        mod.stop(now + 0.35);
    }
}

// Global single instance export
const audio = new CosmicAudio();
window.audio = audio;
