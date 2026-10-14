// Synthesized sound effects with the Web Audio API: no audio files, works offline.
// Browsers keep audio blocked until the page gets a click or key press, so the
// sound starts on the first one (a volunteer pressing any key is enough).

const MASTER_VOLUME = 0.5;

let audio = null;
let master = null;
let noiseBuffer = null;
let muted = false;

export function listenForAudioUnlock() {
    window.addEventListener("keydown", (event) => {
        unlockAudio();
        if (event.code === "KeyM") toggleMute(); // M mutes/unmutes, handy at a loud stand
    });
    window.addEventListener("pointerdown", unlockAudio);
}

function unlockAudio() {
    if (!audio) {
        audio = new AudioContext();
        master = audio.createGain();
        master.gain.value = MASTER_VOLUME;
        master.connect(audio.destination);

        // one second of white noise, reused for every explosion
        noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
        let data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i = i + 1) {
            data[i] = Math.random() * 2 - 1;
        }
    }
    if (audio.state === "suspended") audio.resume();
}

function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
}

// Shared with music.js, which plays through the same context and master volume (so M mutes both).
export function getAudio() {
    return audio;
}

export function getMaster() {
    return master;
}

export function getNoiseBuffer() {
    return noiseBuffer;
}

// "locked" until the first key/click, then "on" or "muted"
export function getSoundStatus() {
    if (!audio || audio.state !== "running") return "locked";
    return muted ? "muted" : "on";
}

// Play the sound for one game event (see state.events).
export function playSound(event) {
    if (getSoundStatus() !== "on") return;

    switch (event.type) {
        case "slice": {
            // pitch climbs with the combo so a streak sounds like it's building
            let pitch = 1 + Math.min(event.combo, 20) * 0.04;
            tone(600 * pitch, 1400 * pitch, 0.09, "sawtooth", 0.12);
            noise(0.06, 0.12, 6000, 2000);
            if (event.kind === "gold") {
                arpeggio([1047, 1319, 1568, 2093], 0.05, "triangle", 0.2); // jackpot sparkle
            }
            break;
        }
        case "debris":
            tone(2400, 1600, 0.04, "triangle", 0.08); // tiny tick for cutting a piece again
            break;
        case "armor":
            // metallic clank: the shell cracked but the bug is still alive
            tone(1800, 1100, 0.07, "square", 0.12);
            noise(0.08, 0.2, 9000, 3000);
            break;
        case "comboUp":
            arpeggio([660, 880, 1320], 0.06, "triangle", 0.18);
            break;
        case "bomb":
            noise(0.45, 0.5, 2000, 80);
            tone(160, 40, 0.4, "sawtooth", 0.3);
            break;
        case "chainBomb":
            noise(0.3, 0.35, 1500, 80);
            tone(120, 40, 0.3, "sawtooth", 0.2);
            break;
        case "volatile":
            noise(0.6, 0.55, 4000, 60);
            tone(220, 40, 0.5, "square", 0.22);
            break;
        case "gameOver":
            if (!event.celebrate) { // a new #1 gets a fanfare instead (newTopScore)
                arpeggio([440, 330, 220, 110], 0.16, "square", 0.12, 0.3);
            }
            break;
        case "newRecord":
            arpeggio([523, 659, 784, 1047], 0.09, "square", 0.13);
            tone(1047, 1047, 0.5, "triangle", 0.15, 0.36);
            break;
        case "newTopScore":
            // a little victory fanfare: da-da-da-DAAA, then a high chord
            arpeggio([523, 523, 523, 659], 0.13, "square", 0.13);
            tone(784, 784, 0.7, "square", 0.12, 0.52);
            tone(1047, 1047, 0.9, "triangle", 0.14, 0.52);
            tone(1319, 1319, 0.9, "triangle", 0.1, 0.52);
            break;
        case "spell":
            if (event.key === "slow") {
                tone(900, 150, 0.7, "sine", 0.3);
            } else if (event.key === "double") {
                arpeggio([523, 659, 784, 1047, 1319], 0.05, "triangle", 0.2);
            } else if (event.key === "purge") {
                noise(0.9, 0.6, 5000, 60);
                tone(90, 30, 0.9, "sine", 0.6);
            }
            break;
        case "multiSlice": {
            // one more rising note for every extra bug in the swipe
            let notes = [784, 988, 1175, 1568, 1976, 2349].slice(0, Math.min(event.count + 1, 6));
            arpeggio(notes, 0.05, "square", 0.12);
            break;
        }
        case "feverStart":
            arpeggio([523, 659, 784, 1047, 1319, 1568, 2093], 0.04, "sawtooth", 0.12);
            break;
        case "feverEnd":
            tone(800, 200, 0.4, "triangle", 0.15);
            break;
        case "powerup":
            arpeggio([1047, 1568, 2093], 0.06, "sine", 0.22);
            break;
        case "shieldBreak":
            tone(2000, 400, 0.3, "triangle", 0.2);
            noise(0.25, 0.3, 8000, 1000);
            break;
        case "bossStart":
            arpeggio([440, 330, 440, 330, 440, 330], 0.15, "sawtooth", 0.14, 0.15); // siren
            break;
        case "bossHit":
            tone(320, 120, 0.1, "square", 0.14);
            noise(0.08, 0.15, 3000, 500);
            break;
        case "bossDefeated":
            noise(1.2, 0.7, 6000, 50);
            tone(160, 30, 1.2, "sine", 0.6);
            arpeggio([523, 659, 784, 1047, 1319, 1568], 0.08, "triangle", 0.18);
            break;
        case "levelUp":
            arpeggio([523, 659, 784, 1047], 0.07, "square", 0.1);
            break;
        case "start":
            arpeggio([440, 880], 0.08, "square", 0.1);
            break;
        case "saved":
            arpeggio([880, 1320], 0.08, "triangle", 0.18);
            break;
    }
}

// A single note sliding from freqStart to freqEnd, with a quick fade in and a decay out.
function tone(freqStart, freqEnd, duration, type, volume, delay = 0) {
    let start = audio.currentTime + delay;
    let osc = audio.createOscillator();
    let gain = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, start);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, start + duration);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
}

// Quick run of notes, `gap` seconds apart.
function arpeggio(freqs, gap, type, volume, noteLength = gap * 1.6) {
    for (let i = 0; i < freqs.length; i = i + 1) {
        tone(freqs[i], freqs[i], noteLength, type, volume, i * gap);
    }
}

// Burst of filtered noise; the filter sweeping down makes it sound like an explosion.
function noise(duration, volume, filterStart, filterEnd) {
    let start = audio.currentTime;
    let source = audio.createBufferSource();
    let filter = audio.createBiquadFilter();
    let gain = audio.createGain();

    source.buffer = noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterStart, start);
    filter.frequency.exponentialRampToValueAtTime(filterEnd, start + duration);

    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration);
}
