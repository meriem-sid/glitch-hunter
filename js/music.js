// Synthwave background music, generated live with the Web Audio API (no files, works offline).
// A 4-bar loop of kick, snare, hi-hat, bass and an arpeggio lead. It speeds up with the level,
// adds the lead from level 3, gets louder in FEVER, and drops a key for the boss.
//
// Notes are scheduled slightly ahead on the audio clock (the standard "lookahead" technique),
// so the beat stays steady even when a frame takes longer.
import { getAudio, getMaster, getNoiseBuffer } from "./audio.js";

const LOOKAHEAD_MS = 25;      // how often the scheduler wakes up
const SCHEDULE_AHEAD = 0.1;   // seconds of music scheduled in advance
const STEPS_PER_BAR = 16;
const BARS = 4;

// bass roots for the 4 bars: A, F, C, G (Hz)
const BASS_ROOTS = [55, 43.65, 65.41, 49.0];
// arpeggio pattern in semitones above the root: a minor chord up and down
const ARPEGGIO = [0, 3, 7, 12, 15, 12, 7, 3];
const BOSS_SHIFT = Math.pow(2, -1 / 12); // one semitone lower: darker

const VOLUME = { start: 0.25, playing: 0.5, gameover: 0 };

let musicGain = null;
let timer = null;
let nextNoteTime = 0;
let stepIndex = 0;
let mood = { screen: "start", level: 1, fever: false, boss: false };

// Start the loop once audio is unlocked. Safe to call every frame.
export function startMusic() {
    let audio = getAudio();
    if (!audio || audio.state !== "running" || timer) return;

    musicGain = audio.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(getMaster());
    nextNoteTime = audio.currentTime + 0.1;
    timer = setInterval(scheduler, LOOKAHEAD_MS);
    applyVolume();
}

// Tell the music what's happening; called every frame from main.js.
export function setMusicMood(next) {
    let volumeChanged = next.screen !== mood.screen || next.fever !== mood.fever;
    mood = next;
    if (volumeChanged) applyVolume();
}

export function getTempo(m = mood) {
    if (m.screen !== "playing") return 96;
    if (m.boss) return 150;
    return Math.min(104 + 6 * (m.level - 1), 150);
}

function applyVolume() {
    if (!musicGain) return;
    let target = VOLUME[mood.screen] * (mood.fever ? 1.3 : 1);
    musicGain.gain.setTargetAtTime(target, getAudio().currentTime, 0.4); // smooth fade, no clicks
}

function scheduler() {
    let audio = getAudio();
    // the tab was in the background and the timer slept: skip ahead instead of firing a burst of notes
    if (nextNoteTime < audio.currentTime - 0.2) {
        nextNoteTime = audio.currentTime + 0.05;
    }
    while (nextNoteTime < audio.currentTime + SCHEDULE_AHEAD) {
        playStep(stepIndex, nextNoteTime);
        nextNoteTime = nextNoteTime + 60 / getTempo() / 4; // 16th notes
        stepIndex = (stepIndex + 1) % (STEPS_PER_BAR * BARS);
    }
}

function playStep(index, time) {
    let bar = Math.floor(index / STEPS_PER_BAR);
    let step = index % STEPS_PER_BAR;
    let root = BASS_ROOTS[bar] * (mood.boss ? BOSS_SHIFT : 1);
    let full = mood.screen === "playing"; // the menus get a calmer bass-and-hats version
    let stepLength = 60 / getTempo() / 4;

    if (full && step % 4 === 0) kick(time);
    if (full && (step === 4 || step === 12)) snare(time);
    if (step % 2 === 1) hat(time, full ? 0.06 : 0.03);
    if (step % 2 === 0) {
        let octave = step % 8 === 6 ? 2 : 1; // a little jump up for movement
        synth("sawtooth", root * octave, time, stepLength * 1.8, 0.16, 600);
    }
    if (full && (mood.level >= 3 || mood.fever)) {
        let note = root * 4 * Math.pow(2, ARPEGGIO[step % ARPEGGIO.length] / 12);
        synth("square", note, time, stepLength * 0.9, mood.fever ? 0.07 : 0.035, 3000);
    }
}

// One note through a low-pass filter (the filter takes the harsh edge off saw and square waves).
function synth(type, freq, time, duration, volume, cutoff) {
    let audio = getAudio();
    let osc = audio.createOscillator();
    let filter = audio.createBiquadFilter();
    let gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoff, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    osc.start(time);
    osc.stop(time + duration + 0.02);
}

function kick(time) {
    let audio = getAudio();
    let osc = audio.createOscillator();
    let gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(time);
    osc.stop(time + 0.27);
}

function snare(time) {
    noiseHit(time, 0.18, 0.25, "bandpass", 1800);
}

function hat(time, volume) {
    noiseHit(time, 0.04, volume, "highpass", 7000);
}

function noiseHit(time, duration, volume, filterType, frequency) {
    let audio = getAudio();
    let source = audio.createBufferSource();
    let filter = audio.createBiquadFilter();
    let gain = audio.createGain();
    source.buffer = getNoiseBuffer();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    source.start(time);
    source.stop(time + duration);
}
