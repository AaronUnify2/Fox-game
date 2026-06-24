// ============================================
// ECHOES OF THE OBELISK - Chiptune Player
// Shared engine used by BOTH the song editor and the game.
//
// Channel instruments:
//   pulse    (square w/ variable duty)      -> melody / harmony
//   triangle                                -> bass
//   noise    (filtered) + kick synth        -> drums/beat
//   bell     (inharmonic additive)          -> church / tubular bell
//   strings  (detuned saws + vibrato)       -> sustained strings
//   choir    (formant-filtered "aah")       -> synth choir pad
//
// Polyphony: a cell may be a single value (MIDI note, or drum index for
// the noise channel), an ARRAY of such values (a chord / simultaneous
// hits), or null. Bare values stay valid, so older songs load unchanged.
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

// Instrument types that are pitched (everything except 'noise')
export const PITCHED_TYPES = ['pulse', 'triangle', 'bell', 'strings', 'choir'];

// --- Cell helpers (polyphony) --------------------------------------

// Normalize any cell value into an array of notes, or null if empty.
// Accepts: number | number[] | null | undefined | [].
export function cellNotes(cell) {
    if (cell === null || cell === undefined) return null;
    if (Array.isArray(cell)) {
        const out = [];
        for (const v of cell) {
            if (v === null || v === undefined) continue;
            if (!out.includes(v)) out.push(v); // de-dupe
        }
        return out.length ? out : null;
    }
    return [cell];
}

// Equal-power-ish gain compensation so a chord isn't N times louder.
function chordGain(n) {
    return n <= 1 ? 1 : Math.pow(n, -0.4);
}

const MAX_VOICES_PER_CELL = 8;

// --- Song normalization --------------------------------------------

// Returns a deep, fully-populated copy of a song with all defaults filled
// and a patternsById lookup. Cell arrays are guaranteed length patternLength.
// Cell *values* may be a number, an array of numbers, or null (polyphony).
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
        this._chanNodes = {};   // per-channel output buses (with optional echo)
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
        this._resetChannelNodes();
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

    // Play a single cell immediately (editor tap feedback). `value` may be a
    // MIDI note, a drum index, or an array of either (a chord / multi-hit).
    preview(channelId, value) {
        if (!this.song) return;
        this._ensureContext();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const ch = this.song.channels.find(c => c.id === channelId);
        if (!ch) return;
        const notes = cellNotes(value);
        if (!notes) return;
        const t = this.ctx.currentTime + 0.01;
        const voices = notes.slice(0, MAX_VOICES_PER_CELL);
        if (ch.type === 'noise') {
            for (const d of voices) this._playNoise(ch, d, t);
        } else {
            const gs = chordGain(voices.length);
            for (const m of voices) this._playTone(ch, m, t, gs);
        }
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
                const raw = pattern.cells[ch.id] ? pattern.cells[ch.id][stepInPattern] : null;
                const notes = cellNotes(raw);
                if (!notes) continue;
                const voices = notes.slice(0, MAX_VOICES_PER_CELL);
                if (ch.type === 'noise') {
                    for (const d of voices) this._playNoise(ch, d, time);
                } else {
                    const gs = chordGain(voices.length);
                    for (const m of voices) this._playTone(ch, m, time, gs);
                }
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

    // --- Instrument dispatch ---------------------------------------
    _playTone(ch, midi, time, gainScale = 1) {
        switch (ch.type) {
            case 'bell':    return this._playBell(ch, midi, time, gainScale);
            case 'strings': return this._playStrings(ch, midi, time, gainScale);
            case 'choir':   return this._playChoir(ch, midi, time, gainScale);
            case 'pulse':
            case 'triangle':
            default:        return this._playClassic(ch, midi, time, gainScale);
        }
    }

    // Per-channel output bus. Voices connect here instead of straight to the
    // master, so each channel can have its own echo (a beat-synced delay line
    // with feedback). Built lazily and cached per channel id.
    _channelOut(ch) {
        const cached = this._chanNodes[ch.id];
        if (cached) return cached.input;

        const ctx = this.ctx;
        const input = ctx.createGain();
        input.gain.value = 1;
        input.connect(this.master);              // dry path (always full)
        const rec = { input };

        const beats = ch.echoBeats ?? 0.5;
        const fb = Math.min(0.92, Math.max(0, ch.echoFeedback ?? 0.4));
        const mix = Math.min(1, Math.max(0, ch.echoMix ?? 0.35));
        if (ch.echo && beats > 0 && mix > 0) {
            const secPerBeat = 60 / (this.song?.tempo || 120);
            const dt = Math.min(4.9, Math.max(0.02, beats * secPerBeat));
            const delay = ctx.createDelay(5.0);
            delay.delayTime.value = dt;
            const feedback = ctx.createGain();
            feedback.gain.value = fb;
            const damp = ctx.createBiquadFilter();    // darken each repeat
            damp.type = 'lowpass';
            damp.frequency.value = 3200;
            const wet = ctx.createGain();
            wet.gain.value = mix;

            input.connect(delay);
            delay.connect(damp);
            damp.connect(feedback);
            feedback.connect(delay);                  // feedback loop -> repeats
            delay.connect(wet);
            wet.connect(this.master);
            Object.assign(rec, { delay, feedback, damp, wet });
        }

        this._chanNodes[ch.id] = rec;
        return input;
    }

    _resetChannelNodes() {
        if (this._chanNodes) {
            for (const id in this._chanNodes) {
                const r = this._chanNodes[id];
                try {
                    r.input && r.input.disconnect();
                    r.delay && r.delay.disconnect();
                    r.damp && r.damp.disconnect();
                    r.feedback && r.feedback.disconnect();
                    r.wet && r.wet.disconnect();
                } catch (e) { /* ignore */ }
            }
        }
        this._chanNodes = {};
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

    // Classic NES voices: plucky pulse / triangle (clipped to the step).
    _playClassic(ch, midi, time, gainScale) {
        const ctx = this.ctx;
        const dur = this._secondsPerStep() * 0.92;
        const osc = ctx.createOscillator();
        if (ch.type === 'pulse') osc.setPeriodicWave(this._pulseWave(ch.duty || 0.5));
        else osc.type = 'triangle';
        osc.frequency.value = midiToFreq(midi);

        const g = ctx.createGain();
        const vol = (ch.volume ?? 0.8) * gainScale;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(vol, time + 0.006);
        g.gain.setValueAtTime(vol, time + dur * 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

        osc.connect(g);
        g.connect(this._channelOut(ch));
        osc.start(time);
        osc.stop(time + dur + 0.02);
    }

    // Church / tubular bell: inharmonic sine partials, sharp attack, long
    // resonant decay that rings out past the step. `ch.decay` scales length.
    _playBell(ch, midi, time, gainScale) {
        const ctx = this.ctx;
        const f0 = midiToFreq(midi);
        const vol = (ch.volume ?? 0.8) * gainScale;
        const decayMul = ch.decay ?? 1;

        // (ratio, amplitude, decay seconds) — hum + prime + minor-third tierce
        // are what give a bell its bittersweet character.
        const partials = [
            { r: 0.5,  a: 0.40, d: 2.6 },  // hum tone (octave below)
            { r: 1.0,  a: 1.00, d: 2.2 },  // prime / strike
            { r: 1.2,  a: 0.55, d: 1.8 },  // tierce (minor third)
            { r: 1.5,  a: 0.45, d: 1.5 },  // quint
            { r: 2.0,  a: 0.45, d: 1.2 },  // nominal
            { r: 3.01, a: 0.20, d: 0.7 }   // upper shimmer (slightly detuned)
        ];
        const ampSum = partials.reduce((s, p) => s + p.a, 0);

        const out = ctx.createGain();
        out.gain.value = vol / ampSum;   // keep the summed partials in range
        out.connect(this._channelOut(ch));

        for (const p of partials) {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = f0 * p.r;
            const g = ctx.createGain();
            const d = Math.max(0.05, p.d * decayMul);
            g.gain.setValueAtTime(0.0001, time);
            g.gain.linearRampToValueAtTime(p.a, time + 0.002);
            g.gain.exponentialRampToValueAtTime(0.0001, time + 0.002 + d);
            o.connect(g); g.connect(out);
            o.start(time);
            o.stop(time + 0.002 + d + 0.05);
        }
    }

    // Strings: two detuned sawtooths through a gentle lowpass, slow attack,
    // sustain across the step, soft release tail, subtle vibrato.
    _playStrings(ch, midi, time, gainScale) {
        const ctx = this.ctx;
        const f = midiToFreq(midi);
        const vol = (ch.volume ?? 0.8) * gainScale;
        const dur = this._secondsPerStep();
        const attack = ch.attack ?? 0.08;
        const release = ch.release ?? 0.25;
        const spread = ch.detune ?? 8;     // static ensemble detune (cents)

        const out = ctx.createGain();
        out.connect(this._channelOut(ch));
        const mix = ctx.createGain();
        mix.gain.value = 0.5;              // sum of two saws -> ~unity
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = Math.min(8000, f * 6 + 1400);
        lp.Q.value = 0.4;
        mix.connect(lp); lp.connect(out);

        // shared vibrato LFO
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 5.2;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 6;            // vibrato depth (cents)
        lfo.connect(lfoGain);

        const oscs = [];
        for (const dt of [-spread, spread]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.detune.value = dt;
            lfoGain.connect(o.detune);
            o.connect(mix);
            oscs.push(o);
        }

        const holdEnd = time + Math.max(dur, attack + 0.02);
        out.gain.setValueAtTime(0.0001, time);
        out.gain.linearRampToValueAtTime(vol, time + attack);
        out.gain.setValueAtTime(vol, holdEnd);
        out.gain.exponentialRampToValueAtTime(0.0001, holdEnd + release);

        const end = holdEnd + release + 0.05;
        lfo.start(time); lfo.stop(end);
        oscs.forEach(o => { o.start(time); o.stop(end); });
    }

    // Choir "aah": detuned saws shaped by vocal-formant bandpass filters,
    // slow attack, sustain + release tail, gentle vibrato.
    _playChoir(ch, midi, time, gainScale) {
        const ctx = this.ctx;
        const f = midiToFreq(midi);
        const vol = (ch.volume ?? 0.8) * gainScale;
        const dur = this._secondsPerStep();
        const attack = ch.attack ?? 0.06;
        const release = ch.release ?? 0.30;

        // formant tables (freq, amp, Q) for a few vowels
        const VOWELS = {
            ah: [[800, 0.50, 8], [1150, 0.35, 9], [2900, 0.20, 10]],
            oo: [[300, 0.50, 8], [870, 0.28, 9],  [2250, 0.12, 11]],
            ee: [[350, 0.50, 8], [2000, 0.30, 10], [2800, 0.18, 11]]
        };
        const formants = VOWELS[ch.vowel] || VOWELS.ah;

        const out = ctx.createGain();
        out.connect(this._channelOut(ch));

        const pre = ctx.createGain();
        pre.gain.value = 0.45;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.3;
        pre.connect(lp);

        for (const [freq, amp, q] of formants) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
            const fg = ctx.createGain(); fg.gain.value = amp;
            lp.connect(bp); bp.connect(fg); fg.connect(out);
        }
        // a touch of dry source for body
        const dry = ctx.createGain(); dry.gain.value = 0.10;
        lp.connect(dry); dry.connect(out);

        // gentle vibrato (swells in)
        const lfo = ctx.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = 5.0;
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0, time);
        lfoGain.gain.linearRampToValueAtTime(7, time + Math.min(0.4, dur));
        lfo.connect(lfoGain);

        const oscs = [];
        for (const dt of [-6, 6]) {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.detune.value = dt;
            lfoGain.connect(o.detune);
            o.connect(pre);
            oscs.push(o);
        }

        const holdEnd = time + Math.max(dur, attack + 0.02);
        out.gain.setValueAtTime(0.0001, time);
        out.gain.linearRampToValueAtTime(vol, time + attack);
        out.gain.setValueAtTime(vol, holdEnd);
        out.gain.exponentialRampToValueAtTime(0.0001, holdEnd + release);

        const end = holdEnd + release + 0.05;
        lfo.start(time); lfo.stop(end);
        oscs.forEach(o => { o.start(time); o.stop(end); });
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
            osc.connect(g); g.connect(this._channelOut(ch));
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
        src.connect(filter); filter.connect(g); g.connect(this._channelOut(ch));
        src.start(time); src.stop(time + dur + 0.02);
    }
}
