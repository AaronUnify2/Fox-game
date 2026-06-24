// ============================================
// Echoes — Chiptune Studio (editor logic)
// Vanilla JS. Shares the playback engine with the game.
// ============================================

import {
    ChiptunePlayer, normalizeSong, blankSong, emptyPattern,
    midiToName, isBlackKey, DRUMS
} from './chiptune-player.js';

// ---------- Constants ----------
const STORAGE_KEY = 'echoes_songs_v1';
const PITCH_LOW = 24;    // C1 (lowest selectable)
const PITCH_HIGH = 96;   // C7 (highest selectable)
const WINDOW_NOTES = 24; // show two octaves at a time

// Channel instruments and which tuning controls each one shows.
const INSTRUMENT_PARAM_GROUPS = {
    pulse:    ['dutyGroup'],
    triangle: [],
    bell:     ['bellDecayGroup'],
    strings:  ['strAttackGroup', 'strReleaseGroup', 'strDetuneGroup'],
    choir:    ['choVowelGroup', 'choAttackGroup', 'choReleaseGroup'],
    noise:    []
};
const ALL_PARAM_GROUPS = [
    'dutyGroup', 'bellDecayGroup',
    'strAttackGroup', 'strReleaseGroup', 'strDetuneGroup',
    'choVowelGroup', 'choAttackGroup', 'choReleaseGroup'
];

// Starter song so the very first launch makes sound.
const STARTER = {
    version: 1, title: 'Town Theme', tempo: 120, stepsPerBeat: 4, patternLength: 16,
    loop: true, loopStart: 0,
    channels: [
        { id: 'pulse1', name: 'Melody', type: 'pulse', duty: 0.5, volume: 0.85, muted: false },
        { id: 'pulse2', name: 'Harmony', type: 'pulse', duty: 0.25, volume: 0.55, muted: false },
        { id: 'triangle', name: 'Bass', type: 'triangle', volume: 0.9, muted: false },
        { id: 'noise', name: 'Drums', type: 'noise', volume: 0.6, muted: false }
    ],
    patterns: [
        { id: 'p0', name: 'A', cells: {
            pulse1: [72, null, null, 71, 69, null, 67, null, 69, null, 71, null, 72, null, null, null],
            pulse2: [64, null, null, 62, 60, null, 59, null, 60, null, 62, null, 64, null, null, null],
            triangle: [36, null, null, null, 43, null, null, null, 45, null, null, null, 41, null, null, null],
            noise: [0, null, 2, null, 1, null, 2, null, 0, null, 2, null, 1, null, 2, null]
        }},
        { id: 'p1', name: 'B', cells: {
            pulse1: [67, null, 69, null, 71, null, 72, null, 71, null, 69, null, 67, null, null, null],
            pulse2: [60, null, 62, null, 64, null, 65, null, 64, null, 62, null, 60, null, null, null],
            triangle: [43, null, null, null, 41, null, null, null, 45, null, null, null, 36, null, null, null],
            noise: [0, null, 2, null, 1, null, 2, null, 0, null, 2, null, 1, null, 2, null]
        }}
    ],
    order: ['p0', 'p0', 'p1', 'p0']
};

// ---------- State ----------
let songs = {};
let currentName = '';
let song = null;             // normalized working copy
let editChannelId = 'pulse1';
let editPatternId = 'p0';
let loopPatternMode = false;
let octaveBase = 48;         // lowest visible MIDI for the pitched grid
let modalChannelId = null;

const player = new ChiptunePlayer();

const $ = (id) => document.getElementById(id);

// ---------- Cell helpers (polyphony) ----------
// A cell may be a single value, an array of values, or null.
function cellHas(val, x) {
    if (val === null || val === undefined) return false;
    return Array.isArray(val) ? val.includes(x) : val === x;
}
// Add/remove a value from a cell. Singles stay bare numbers; chords become
// sorted arrays; empty becomes null.
function toggleInCell(cell, x) {
    let notes = (cell === null || cell === undefined)
        ? [] : (Array.isArray(cell) ? cell.slice() : [cell]);
    const i = notes.indexOf(x);
    if (i >= 0) notes.splice(i, 1);
    else notes.push(x);
    if (notes.length === 0) return null;
    if (notes.length === 1) return notes[0];
    notes.sort((a, b) => a - b);
    return notes;
}
function cloneCell(v) { return Array.isArray(v) ? v.slice() : v; }

// Fill in sensible defaults for whatever instrument a channel is set to.
function ensureTypeDefaults(ch) {
    if (ch.type === 'pulse' && ch.duty == null) ch.duty = 0.5;
    if (ch.type === 'bell' && ch.decay == null) ch.decay = 1.3;
    if (ch.type === 'strings') {
        if (ch.attack == null) ch.attack = 0.06;
        if (ch.release == null) ch.release = 0.4;
        if (ch.detune == null) ch.detune = 8;
    }
    if (ch.type === 'choir') {
        if (ch.vowel == null) ch.vowel = 'ah';
        if (ch.attack == null) ch.attack = 0.07;
        if (ch.release == null) ch.release = 0.5;
    }
}

// ---------- Persistence ----------
function loadSongs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        songs = raw ? JSON.parse(raw) : {};
    } catch { songs = {}; }
    if (!songs || Object.keys(songs).length === 0) {
        songs = { 'Town Theme': JSON.parse(JSON.stringify(STARTER)) };
    }
    currentName = Object.keys(songs)[0];
}

function saveSongs() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(songs)); }
    catch (e) { console.warn('save failed', e); }
}

// Per-instrument params that should be written out for a channel.
function channelParams(c) {
    const out = {};
    if (c.type === 'pulse') out.duty = c.duty;
    if (c.type === 'bell') out.decay = c.decay;
    if (c.type === 'strings') { out.attack = c.attack; out.release = c.release; out.detune = c.detune; }
    if (c.type === 'choir') { out.vowel = c.vowel; out.attack = c.attack; out.release = c.release; }
    return out;
}

function serializeSong(s) {
    return {
        version: s.version || 1,
        title: s.title,
        tempo: s.tempo,
        stepsPerBeat: s.stepsPerBeat,
        patternLength: s.patternLength,
        loop: s.loop,
        loopStart: s.loopStart || 0,
        channels: s.channels.map(c => ({
            id: c.id, name: c.name, type: c.type,
            ...channelParams(c),
            volume: c.volume, muted: !!c.muted
        })),
        patterns: s.patterns.map(p => ({
            id: p.id, name: p.name,
            // map(cloneCell) deep-copies chord arrays so saves don't alias
            cells: Object.fromEntries(s.channels.map(c => [c.id, p.cells[c.id].map(cloneCell)]))
        })),
        order: s.order.slice()
    };
}

function persist() {
    songs[currentName] = serializeSong(song);
    saveSongs();
    // Keep the engine's copy current for previews and the next play,
    // but don't disturb an active playback.
    if (!player.isPlaying) player.load(songs[currentName]);
}

// ---------- Song selection ----------
function selectSong(name) {
    if (!songs[name]) return;
    if (player.isPlaying) stopPlayback();
    currentName = name;
    song = normalizeSong(songs[name]);
    for (const ch of song.channels) ensureTypeDefaults(ch);
    editPatternId = song.order[0] || song.patterns[0].id;
    if (!song.patternsById[editPatternId]) editPatternId = song.patterns[0].id;
    editChannelId = 'pulse1';
    if (!song.channels.find(c => c.id === editChannelId)) editChannelId = song.channels[0].id;
    octaveBase = 48;

    $('songTitle').textContent = song.title;
    $('tempoInput').value = song.tempo;
    $('loopSongChk').checked = song.loop !== false;

    player.load(serializeSong(song));

    buildSongSelect();
    renderAll();
}

function buildSongSelect() {
    const sel = $('songSelect');
    sel.innerHTML = '';
    for (const name of Object.keys(songs)) {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        if (name === currentName) opt.selected = true;
        sel.appendChild(opt);
    }
}

// ---------- Rendering ----------
function renderAll() {
    renderChannels();
    renderPatterns();
    renderOrder();
    renderCanvasBar();
    renderGrid();
}

function channelColorVar(type) {
    return { pulse1: '--ch-pulse1' }[type] || null;
}

function renderChannels() {
    const list = $('channelList');
    list.innerHTML = '';
    const colorById = {
        pulse1: 'var(--ch-pulse1)', pulse2: 'var(--ch-pulse2)',
        triangle: 'var(--ch-triangle)', noise: 'var(--ch-noise)'
    };
    for (const ch of song.channels) {
        const row = document.createElement('div');
        row.className = 'channel-row' + (ch.id === editChannelId ? ' selected' : '') + (ch.muted ? ' muted' : '');
        const typeLabel = ch.type === 'noise' ? 'drums' : ch.type;
        row.innerHTML = `
            <span class="channel-dot" style="background:${colorById[ch.id] || '#888'}"></span>
            <span class="channel-name">${ch.name}</span>
            <span class="channel-type">${typeLabel}</span>
            <button class="mini-btn ${ch.muted ? '' : 'on'}" data-act="mute">${ch.muted ? 'muted' : 'on'}</button>
            <button class="mini-btn" data-act="cfg">⚙</button>
        `;
        row.addEventListener('click', (e) => {
            const act = e.target.getAttribute && e.target.getAttribute('data-act');
            if (act === 'mute') {
                ch.muted = !ch.muted;
                persist(); renderChannels();
                return;
            }
            if (act === 'cfg') { openChannelModal(ch.id); return; }
            editChannelId = ch.id;
            renderChannels(); renderCanvasBar(); renderGrid();
        });
        list.appendChild(row);
    }
}

function renderPatterns() {
    const wrap = $('patternList');
    wrap.innerHTML = '';
    for (const p of song.patterns) {
        const chip = document.createElement('div');
        chip.className = 'chip' + (p.id === editPatternId ? ' selected' : '');
        chip.textContent = p.name;
        chip.addEventListener('click', () => {
            editPatternId = p.id;
            renderPatterns(); renderCanvasBar(); renderGrid();
        });
        wrap.appendChild(chip);
    }
}

function renderOrder() {
    const wrap = $('orderList');
    wrap.innerHTML = '';
    song.order.forEach((pid, i) => {
        const p = song.patternsById[pid];
        const chip = document.createElement('div');
        chip.className = 'chip order-chip';
        chip.textContent = (i + 1) + ':' + (p ? p.name : '?');
        chip.addEventListener('click', () => {
            if (p) { editPatternId = pid; renderPatterns(); renderCanvasBar(); renderGrid(); }
        });
        wrap.appendChild(chip);
    });
}

function renderCanvasBar() {
    const ch = song.channels.find(c => c.id === editChannelId);
    const p = song.patternsById[editPatternId];
    $('editingChannel').textContent = ch ? ch.name : '';
    $('editingPattern').textContent = p ? p.name : '';
    $('octaveCtrl').classList.toggle('hidden', ch && ch.type === 'noise');
}

function renderGrid() {
    const grid = $('grid');
    const ch = song.channels.find(c => c.id === editChannelId);
    const pattern = song.patternsById[editPatternId];
    if (!ch || !pattern) { grid.innerHTML = ''; return; }

    const steps = song.patternLength;
    const spb = song.stepsPerBeat;
    grid.style.setProperty('--steps', steps);
    grid.dataset.ch = ch.id;

    const frag = document.createDocumentFragment();

    // Header row: corner + step numbers
    const corner = cellDiv('gcell hcell corner', '');
    frag.appendChild(corner);
    for (let s = 0; s < steps; s++) {
        const h = cellDiv('gcell hcell' + (s % spb === 0 ? ' beat' : ''), String(s + 1));
        frag.appendChild(h);
    }

    if (ch.type === 'noise') {
        // Drum rows, displayed Hat (top) -> Kick (bottom)
        const order = [2, 1, 0]; // indices into DRUMS
        for (const drumIdx of order) {
            frag.appendChild(cellDiv('gcell lcell', DRUMS[drumIdx]));
            for (let s = 0; s < steps; s++) {
                const active = cellHas(pattern.cells.noise[s], drumIdx);
                const c = cellDiv('gcell cell' + (s % spb === 0 ? ' beat' : '') + (active ? ' active' : ''), '');
                c.dataset.step = s; c.dataset.drum = drumIdx;
                frag.appendChild(c);
            }
        }
    } else {
        // Pitched rows: high (top) -> low (bottom), windowed to two octaves
        const top = Math.min(octaveBase + WINDOW_NOTES, PITCH_HIGH);
        for (let m = top; m >= octaveBase; m--) {
            const black = isBlackKey(m);
            frag.appendChild(cellDiv('gcell lcell' + (black ? ' black' : ''), midiToName(m)));
            for (let s = 0; s < steps; s++) {
                const active = cellHas(pattern.cells[ch.id][s], m);
                const c = cellDiv('gcell cell' + (black ? ' black' : '') + (s % spb === 0 ? ' beat' : '') + (active ? ' active' : ''), '');
                c.dataset.step = s; c.dataset.midi = m;
                frag.appendChild(c);
            }
        }
    }

    grid.innerHTML = '';
    grid.appendChild(frag);
}

function cellDiv(cls, text) {
    const d = document.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    return d;
}

// Update only the active states in one column (after a tap) without a full rebuild
function refreshColumn(step) {
    const ch = song.channels.find(c => c.id === editChannelId);
    const pattern = song.patternsById[editPatternId];
    const cells = $('grid').querySelectorAll(`.cell[data-step="${step}"]`);
    cells.forEach(c => {
        let active;
        if (ch.type === 'noise') active = cellHas(pattern.cells.noise[step], Number(c.dataset.drum));
        else active = cellHas(pattern.cells[ch.id][step], Number(c.dataset.midi));
        c.classList.toggle('active', active);
    });
}

// ---------- Grid interaction ----------
function onGridTap(e) {
    const cell = e.target.closest && e.target.closest('.cell');
    if (!cell) return;
    const ch = song.channels.find(c => c.id === editChannelId);
    const pattern = song.patternsById[editPatternId];
    const step = Number(cell.dataset.step);

    if (ch.type === 'noise') {
        const drum = Number(cell.dataset.drum);
        const after = toggleInCell(pattern.cells.noise[step], drum);
        pattern.cells.noise[step] = after;
        if (cellHas(after, drum)) player.preview('noise', drum);
    } else {
        const midi = Number(cell.dataset.midi);
        const arr = pattern.cells[ch.id];
        const after = toggleInCell(arr[step], midi);
        arr[step] = after;
        if (cellHas(after, midi)) player.preview(ch.id, midi);
    }
    refreshColumn(step);
    persist();
}

// ---------- Transport ----------
function startPlayback() {
    player.load(serializeSong(song));
    player.setMasterVolume(0.28);
    if (loopPatternMode) player.playPattern(editPatternId);
    else player.play();
    $('playBtn').textContent = '■';
    $('playBtn').classList.add('playing');
}

function stopPlayback() {
    player.stop();
    $('playBtn').textContent = '▶';
    $('playBtn').classList.remove('playing');
    clearPlayhead();
}

function togglePlayback() {
    if (player.isPlaying) stopPlayback();
    else startPlayback();
}

let lastPlayStep = -1;
function onPlayStep({ step, patternId }) {
    // Only light the playhead when the playing pattern is the one on screen
    if (patternId !== editPatternId) { clearPlayhead(); return; }
    if (step === lastPlayStep) return;
    clearPlayhead();
    $('grid').querySelectorAll(`.cell[data-step="${step}"]`).forEach(c => c.classList.add('playcol'));
    lastPlayStep = step;
}
function clearPlayhead() {
    $('grid').querySelectorAll('.cell.playcol').forEach(c => c.classList.remove('playcol'));
    lastPlayStep = -1;
}

// ---------- Pattern / order ops ----------
function nextPatternId() {
    let n = 0;
    while (song.patternsById['p' + n]) n++;
    return 'p' + n;
}
function nextPatternName() {
    // A, B, C ... then P{n}
    const used = new Set(song.patterns.map(p => p.name));
    for (let i = 0; i < 26; i++) {
        const ch = String.fromCharCode(65 + i);
        if (!used.has(ch)) return ch;
    }
    return 'P' + song.patterns.length;
}

function addPattern(copyFromId = null) {
    const id = nextPatternId();
    const name = nextPatternName();
    let pat;
    if (copyFromId && song.patternsById[copyFromId]) {
        const src = song.patternsById[copyFromId];
        pat = { id, name, cells: {} };
        for (const ch of song.channels) pat.cells[ch.id] = src.cells[ch.id].map(cloneCell);
    } else {
        pat = emptyPattern(id, name, song.channels, song.patternLength);
    }
    song.patterns.push(pat);
    song.patternsById[id] = pat;
    editPatternId = id;
    persist();
    renderPatterns(); renderCanvasBar(); renderGrid();
}

function deletePattern(id) {
    if (song.patterns.length <= 1) { toast('Need at least one pattern'); return; }
    song.patterns = song.patterns.filter(p => p.id !== id);
    delete song.patternsById[id];
    song.order = song.order.filter(pid => pid !== id);
    if (song.order.length === 0) song.order = [song.patterns[0].id];
    if (editPatternId === id) editPatternId = song.patterns[0].id;
    persist();
    renderPatterns(); renderOrder(); renderCanvasBar(); renderGrid();
}

// ---------- Channel settings modal ----------
function openChannelModal(id) {
    modalChannelId = id;
    const ch = song.channels.find(c => c.id === id);
    ensureTypeDefaults(ch);
    $('channelModalTitle').textContent = ch.name + ' settings';

    // Instrument selector
    document.querySelectorAll('#instrumentSeg button').forEach(b => {
        b.classList.toggle('active', b.dataset.type === ch.type);
    });

    // Show only the param groups relevant to this instrument
    ALL_PARAM_GROUPS.forEach(gid => $(gid).classList.add('hidden'));
    (INSTRUMENT_PARAM_GROUPS[ch.type] || []).forEach(gid => $(gid).classList.remove('hidden'));

    // Populate control values
    if (ch.type === 'pulse') {
        document.querySelectorAll('#dutySeg button').forEach(b => {
            b.classList.toggle('active', Math.abs(Number(b.dataset.duty) - ch.duty) < 0.001);
        });
    }
    if (ch.type === 'bell') {
        $('bellDecayRange').value = ch.decay;
        $('bellDecayVal').textContent = Number(ch.decay).toFixed(1);
    }
    if (ch.type === 'strings') {
        $('strAttackRange').value = ch.attack;   $('strAttackVal').textContent = Number(ch.attack).toFixed(2);
        $('strReleaseRange').value = ch.release;  $('strReleaseVal').textContent = Number(ch.release).toFixed(2);
        $('strDetuneRange').value = ch.detune;    $('strDetuneVal').textContent = String(Math.round(ch.detune));
    }
    if (ch.type === 'choir') {
        document.querySelectorAll('#vowelSeg button').forEach(b => {
            b.classList.toggle('active', b.dataset.vowel === ch.vowel);
        });
        $('choAttackRange').value = ch.attack;   $('choAttackVal').textContent = Number(ch.attack).toFixed(2);
        $('choReleaseRange').value = ch.release;  $('choReleaseVal').textContent = Number(ch.release).toFixed(2);
    }

    $('volRange').value = ch.volume;
    $('volVal').textContent = Number(ch.volume).toFixed(2);
    $('channelModal').classList.add('open');
}

function closeChannelModal() {
    $('channelModal').classList.remove('open');
    modalChannelId = null;
}

// Change a channel's instrument. Crossing the pitched <-> drums boundary
// clears the channel (note values and drum indices aren't interchangeable).
function applyInstrumentChange(newType) {
    if (!modalChannelId) return;
    const ch = song.channels.find(c => c.id === modalChannelId);
    if (!ch || ch.type === newType) return;

    const crossing = (ch.type === 'noise') !== (newType === 'noise');
    if (crossing) {
        const ok = confirm('Switching between Drums and a pitched instrument clears this channel\u2019s steps. Continue?');
        if (!ok) {
            // revert the segment highlight to the current type
            document.querySelectorAll('#instrumentSeg button').forEach(b =>
                b.classList.toggle('active', b.dataset.type === ch.type));
            return;
        }
        for (const p of song.patterns) {
            p.cells[ch.id] = new Array(song.patternLength).fill(null);
        }
    }

    ch.type = newType;
    ensureTypeDefaults(ch);
    persist();
    openChannelModal(ch.id); // rebuild the modal for the new instrument
    renderChannels();
    if (ch.id === editChannelId) { renderCanvasBar(); renderGrid(); }
}

// Set a numeric instrument parameter and update its inline readout.
function setParam(key, val, labelId, fmt) {
    if (!modalChannelId) return;
    const ch = song.channels.find(c => c.id === modalChannelId);
    ch[key] = val;
    if (labelId) $(labelId).textContent = fmt ? fmt(val) : String(val);
    persist();
}

// ---------- Import / export ----------
function exportSong() {
    const data = JSON.stringify(serializeSong(song), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (song.title || 'song').replace(/[^a-z0-9-_]+/gi, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Exported ' + a.download);
}

function importSongFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            const name = parsed.title || file.name.replace(/\.json$/i, '');
            let finalName = name; let n = 2;
            while (songs[finalName]) finalName = name + ' ' + (n++);
            parsed.title = finalName;
            songs[finalName] = serializeSong(normalizeSong(parsed));
            saveSongs();
            selectSong(finalName);
            toast('Imported ' + finalName);
        } catch (e) {
            toast('Import failed: invalid JSON');
        }
    };
    reader.readAsText(file);
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- Events ----------
function wireEvents() {
    $('sidebarToggle').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));

    $('songTitle').addEventListener('click', () => {
        const name = prompt('Song name:', song.title);
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed || trimmed === currentName) return;
        if (songs[trimmed]) { toast('Name already exists'); return; }
        delete songs[currentName];
        song.title = trimmed;
        currentName = trimmed;
        songs[trimmed] = serializeSong(song);
        saveSongs();
        $('songTitle').textContent = trimmed;
        buildSongSelect();
    });

    $('songSelect').addEventListener('change', (e) => { persist(); selectSong(e.target.value); });
    $('newSongBtn').addEventListener('click', () => {
        let base = 'New Song'; let name = base; let n = 2;
        while (songs[name]) name = base + ' ' + (n++);
        songs[name] = serializeSong(blankSong(name));
        saveSongs();
        selectSong(name);
    });

    $('playBtn').addEventListener('click', () => { player.resume(); togglePlayback(); });
    $('loopPatternBtn').addEventListener('click', () => {
        loopPatternMode = !loopPatternMode;
        $('loopPatternBtn').classList.toggle('active', loopPatternMode);
        if (player.isPlaying) { stopPlayback(); startPlayback(); }
    });

    $('tempoInput').addEventListener('change', (e) => {
        const v = Math.max(40, Math.min(280, Number(e.target.value) || 120));
        e.target.value = v;
        song.tempo = v;
        if (player.song) player.song.tempo = v;
        persist();
    });

    $('loopSongChk').addEventListener('change', (e) => {
        song.loop = e.target.checked;
        if (player.song) player.song.loop = e.target.checked;
        persist();
    });

    // Grid (event delegation)
    $('grid').addEventListener('click', onGridTap);

    // Octave window
    $('octUp').addEventListener('click', () => {
        octaveBase = Math.min(octaveBase + 12, PITCH_HIGH - WINDOW_NOTES);
        renderGrid();
    });
    $('octDown').addEventListener('click', () => {
        octaveBase = Math.max(octaveBase - 12, PITCH_LOW);
        renderGrid();
    });

    // Patterns
    $('addPatternBtn').addEventListener('click', () => addPattern(null));
    $('dupPatternBtn').addEventListener('click', () => addPattern(editPatternId));
    $('delPatternBtn').addEventListener('click', () => {
        if (confirm('Delete pattern ' + (song.patternsById[editPatternId]?.name) + '?')) deletePattern(editPatternId);
    });

    // Order
    $('orderAddBtn').addEventListener('click', () => {
        song.order.push(editPatternId);
        persist(); renderOrder();
    });
    $('orderRemoveBtn').addEventListener('click', () => {
        if (song.order.length > 1) { song.order.pop(); persist(); renderOrder(); }
    });

    // Channel modal — instrument picker
    $('instrumentSeg').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-type]');
        if (!b) return;
        applyInstrumentChange(b.dataset.type);
    });

    // Channel modal — pulse duty
    $('dutySeg').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-duty]');
        if (!b || !modalChannelId) return;
        const ch = song.channels.find(c => c.id === modalChannelId);
        ch.duty = Number(b.dataset.duty);
        document.querySelectorAll('#dutySeg button').forEach(x => x.classList.toggle('active', x === b));
        persist();
    });

    // Channel modal — bell
    $('bellDecayRange').addEventListener('input', (e) =>
        setParam('decay', Number(e.target.value), 'bellDecayVal', v => v.toFixed(1)));

    // Channel modal — strings
    $('strAttackRange').addEventListener('input', (e) =>
        setParam('attack', Number(e.target.value), 'strAttackVal', v => v.toFixed(2)));
    $('strReleaseRange').addEventListener('input', (e) =>
        setParam('release', Number(e.target.value), 'strReleaseVal', v => v.toFixed(2)));
    $('strDetuneRange').addEventListener('input', (e) =>
        setParam('detune', Number(e.target.value), 'strDetuneVal', v => String(Math.round(v))));

    // Channel modal — choir
    $('vowelSeg').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-vowel]');
        if (!b || !modalChannelId) return;
        const ch = song.channels.find(c => c.id === modalChannelId);
        ch.vowel = b.dataset.vowel;
        document.querySelectorAll('#vowelSeg button').forEach(x => x.classList.toggle('active', x === b));
        persist();
    });
    $('choAttackRange').addEventListener('input', (e) =>
        setParam('attack', Number(e.target.value), 'choAttackVal', v => v.toFixed(2)));
    $('choReleaseRange').addEventListener('input', (e) =>
        setParam('release', Number(e.target.value), 'choReleaseVal', v => v.toFixed(2)));

    // Channel modal — volume + close
    $('volRange').addEventListener('input', (e) => {
        if (!modalChannelId) return;
        const ch = song.channels.find(c => c.id === modalChannelId);
        ch.volume = Number(e.target.value);
        $('volVal').textContent = ch.volume.toFixed(2);
        persist();
    });
    $('channelModalClose').addEventListener('click', closeChannelModal);
    $('channelModal').addEventListener('click', (e) => { if (e.target.id === 'channelModal') closeChannelModal(); });

    // Import / export
    $('exportBtn').addEventListener('click', exportSong);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) importSongFile(e.target.files[0]);
        e.target.value = '';
    });
}

// ---------- Boot ----------
function init() {
    loadSongs();
    selectSong(currentName);
    wireEvents();
    player.onStep(onPlayStep);
}
init();
