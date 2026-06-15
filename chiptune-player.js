// ============================================
// ECHOES OF THE OBELISK - Chiptune Player
// Shared engine used by BOTH the song editor and the game.
//
// Authentic-ish NES channel set:
//   pulse  (square w/ variable duty)  -> melody / harmony
//   triangle                          -> bass
//   noise  (filtered) + kick synth    -> drums/beat
//
// Pure Web Audio. No dependencies. ES module.
// ============================================

// --- Note helpers --------------------------------------------------

// MIDI note number -> frequency (A4 = 69 = 440Hz)
export function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// MIDI note number -> label like "C4"
export function midiToName(m) {
    const name = NOTE_NAMES[((m % 12) + 12) % 12];
    const octave = Math.floor(m / 12) - 1;
    return name + octave;
}

export function isBlackKey(m) {
    return NOTE_NAMES[((m % 12) + 12) % 12].includes('#');
}

// Drum kit (noise channel cell values are indices into this list)
export const DRUMS = ['Kick', 'Snare', 'Hat'];

// --- Song normalization --------------------------------------------

// Returns a deep, fully-populated copy of a song with all defaults filled
// and a patternsById lookup. Cell arrays are guaranteed length patternLength.
export function normalizeSong(song) {
    const s = JSON.parse(JSON.stringify(song || {}));
    s.version = s.version || 1;
    s.title = s.title || 'Untitled';
    s.tempo = s.tempo || 120;
    s.stepsPerBeat = s.stepsPerBeat || 4;
    s.patternLength = s.patternLength || 16;
    s.loop = s.loop !== false;          // default true
    s.loopStart = s.loopStart || 0;

    if (!Array.isArray(s.channels) || s.channels.length === 0) {
        s.channels = defaultChannels();
    }
    if (!Array.isArray(s.patterns) || s.patterns.length === 0) {
        s.patterns = [emptyPattern('p0', 'A', s.channels, s.patternLength)];
    }
    if (!Array.isArray(s.order) || s.order.length === 0) {
        s.order = [s.patterns[0].id];
    }

    s.patternsById = {};
    for (const p of s.patterns) {
        p.cells = p.cells || {};
        for (const ch of s.channels) {
            const src = Array.isArray(p.cells[ch.id]) ? p.cells[ch.id] : [];
            const norm = new Array(s.patternLength).fill(null);
            for (let i = 0; i < s.patternLength; i++) {
                norm[i] = (i < src.length && src[i] !== undefined) ? src[i] : null;
            }
            p.cells[ch.id] = norm;
        }
        s.patternsById[p.id] = p;
    }
    return s;
}

export function defaultChannels() {
    return [
        { id: 'pulse1',   name: 'Melody',  type: 'pulse',    duty: 0.5,  volume: 0.85, muted: false },
        { id: 'pulse2',   name: 'Harmony', type: 'pulse',    duty: 0.25, volume: 0.6,  muted: false },
        { id: 'triangle', name: 'Bass',    type: 'triangle',             volume: 0.9,  muted: false },
        { id: 'noise',    name: 'Drums',   type: 'noise',                volume: 0.7,  muted: false }
    ];
}

export function emptyPattern(id, name, channels, patternLength) {
    const cells = {};
    for (const ch of channels) cells[ch.id] = new Array(patternLength).fill(null);
    return { id, name, cells };
}

export function blankSong(title = 'Untitled') {
    const channels = defaultChannels();
    return normalizeSong({
        title, tempo: 120, stepsPerBeat: 4, patternLength: 16,
        channels,
        patterns: [emptyPattern('p0', 'A', channels, 16)],
        order: ['p0'], loop: true, loopStart: 0
    });
}

// --- Player --------------------------------------------------------

export class ChiptunePlayer {
    constructor(audioContext = null) {
        this.ctx = audioContext;
        this.master = null;
        this.song = null;

        this.isPlaying = false;
        this.lookahead = 25;        // ms between scheduler ticks
        this.scheduleAhead = 0.12;  // s of audio scheduled ahead

        this._timer = null;
        this._orderIndex = 0;
        this._stepInPattern = 0;
        this._nextNoteTime = 0;
        this._overrideOrder = null; // when looping a single pattern in the editor

        this.stepCallbacks = [];
        this._pulseWaves = {};
        this._noiseBuf = null;
    }

    // Lazily create the AudioContext (must follow a user gesture on mobile).
    _ensureContext() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
        }
        if (!this.master) {
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.25;
            this.master.connect(this.ctx.destination);
        }
        return this.ctx;
    }

    async resume() {
        this._ensureContext();
        if (this.ctx.state === 'suspended') await this.ctx.resume();
    }

    load(song) {
        this.song = normalizeSong(song);
    }

    setMasterVolume(v) {
        this._ensureContext();
        this.master.gain.value = v;
    }

    onStep(cb) { this.stepCallbacks.push(cb); }
    clearStepCallbacks() { this.stepCallbacks = []; }

    // Play the full song (follows the order list).
    play() {
        this._overrideOrder = null;
        this._start();
    }

    // Loop a single pattern repeatedly (used by the editor while composing).
    playPattern(patternId) {
        this._overrideOrder = [patternId];
        this._start();
    }

    _start() {
        if (!this.song) return;
        this._ensureContext();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.isPlaying) this.stop();
        this.isPlaying = true;
        this._orderIndex = 0;
        this._stepInPattern = 0;
        this._nextNoteTime = this.ctx.currentTime + 0.06;
        this._scheduler();
    }

    stop() {
        this.isPlaying = false;
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    }

    toggle() { this.isPlaying ? this.stop() : this.play(); }

    // Play a single cell immediately (editor tap feedback). value is a MIDI
    // note for pitched channels, or a drum index for the noise channel.
    preview(channelId, value) {
        if (!this.song) return;
        this._ensureContext();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const ch = this.song.channels.find(c => c.id === channelId);
        if (!ch) return;
        const t = this.ctx.currentTime + 0.01;
        if (ch.type === 'noise') this._playNoise(ch, value, t);
        else this._playTone(ch, value, t);
    }

    _order() { return this._overrideOrder || this.song.order; }

    _secondsPerStep() {
        const stepsPerSec = (this.song.tempo / 60) * this.song.stepsPerBeat;
        return 1 / stepsPerSec;
    }

    _scheduler() {
        if (!this.isPlaying) return;
        while (this._nextNoteTime < this.ctx.currentTime + this.scheduleAhead) {
            this._scheduleStep(this._orderIndex, this._stepInPattern, this._nextNoteTime);
            this._advance();
            if (!this.isPlaying) return;
        }
        this._timer = setTimeout(() => this._scheduler(), this.lookahead);
    }

    _advance() {
        this._nextNoteTime += this._secondsPerStep();
        this._stepInPattern++;
        if (this._stepInPattern >= this.song.patternLength) {
            this._stepInPattern = 0;
            this._orderIndex++;
            const order = this._order();
            if (this._orderIndex >= order.length) {
                if (this.song.loop) {
                    this._orderIndex = this._overrideOrder ? 0 : (this.song.loopStart || 0);
                } else {
                    this.stop();
                }
            }
        }
    }

    _scheduleStep(orderIndex, stepInPattern, time) {
        const order = this._order();
        const patternId = order[orderIndex];
        const pattern = this.song.patternsById[patternId];
        if (pattern) {
            for (const ch of this.song.channels) {
                if (ch.muted) continue;
                const cell = pattern.cells[ch.id] ? pattern.cells[ch.id][stepInPattern] : null;
                if (cell === null || cell === undefined) continue;
                if (ch.type === 'noise') this._playNoise(ch, cell, time);
                else this._playTone(ch, cell, time);
            }
        }
        // UI playhead callback, fired at the right wall-clock moment
        if (this.stepCallbacks.length) {
            const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
            const payload = { orderIndex, step: stepInPattern, patternId };
            setTimeout(() => {
                if (!this.isPlaying) return;
                for (const cb of this.stepCallbacks) cb(payload);
            }, delayMs);
        }
    }

    // Square wave of a given duty cycle, built from its Fourier series.
    _pulseWave(duty) {
        const key = duty.toFixed(3);
        if (this._pulseWaves[key]) return this._pulseWaves[key];
        const n = 32;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);
        for (let k = 1; k < n; k++) {
            // kth harmonic amplitude of a pulse with duty d
            imag[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty);
        }
        const wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
        this._pulseWaves[key] = wave;
        return wave;
    }

    _playTone(ch, midi, time) {
        const ctx = this.ctx;
        const dur = this._secondsPerStep() * 0.92;
        const osc = ctx.createOscillator();
        if (ch.type === 'pulse') osc.setPeriodicWave(this._pulseWave(ch.duty || 0.5));
        else osc.type = 'triangle';
        osc.frequency.value = midiToFreq(midi);

        const g = ctx.createGain();
        const vol = (ch.volume ?? 0.8);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(vol, time + 0.006);
        g.gain.setValueAtTime(vol, time + dur * 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

        osc.connect(g);
        g.connect(this.master);
        osc.start(time);
        osc.stop(time + dur + 0.02);
    }

    _noiseBuffer() {
        if (this._noiseBuf) return this._noiseBuf;
        const ctx = this.ctx;
        const len = Math.floor(ctx.sampleRate * 0.5);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this._noiseBuf = buf;
        return buf;
    }

    _playNoise(ch, drumIndex, time) {
        const ctx = this.ctx;
        const vol = (ch.volume ?? 0.7);

        if (drumIndex === 0) {
            // Kick: pitch-swept sine for punch
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(160, time);
            osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
            const g = ctx.createGain();
            g.gain.setValueAtTime(vol, time);
            g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
            osc.connect(g); g.connect(this.master);
            osc.start(time); osc.stop(time + 0.2);
            return;
        }

        // Snare (1) and Hat (2): filtered noise burst
        const src = ctx.createBufferSource();
        src.buffer = this._noiseBuffer();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        let dur;
        if (drumIndex === 1) {       // Snare
            filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = 0.8;
            dur = 0.16;
        } else {                     // Hat
            filter.type = 'highpass'; filter.frequency.value = 7000;
            dur = 0.05;
        }
        g.gain.setValueAtTime(vol, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        src.connect(filter); filter.connect(g); g.connect(this.master);
        src.start(time); src.stop(time + dur + 0.02);
    }
}
