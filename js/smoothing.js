// Smooths the tracked fingertip before the game uses it.
//
// The camera reports the finger about 30 times a second, with a few pixels of jitter, so the
// raw position shakes while your hand is still and jumps in steps while it moves. A "One Euro
// filter" calms both: it smooths heavily when the finger moves slowly, and a little less the
// faster it moves, so slashes don't trail far behind your hand. It runs every game frame, so
// between camera updates the blade glides instead of stepping.
//
// How it feels is a matter of taste and of the camera, so there are three presets, cycled
// with the B key and remembered on this computer.

export const BLADE_FEELS = [
    { name: "SMOOTH",   minCutoff: 1.2, beta: 0.004 }, // calm and steady, slightly heavier (default)
    { name: "BALANCED", minCutoff: 1.8, beta: 0.007 }, // in between
    { name: "RAW",      minCutoff: null, beta: 0 }     // no smoothing at all, exactly what the camera reports
];
// minCutoff: smoothing when still, in Hz (lower = steadier but more lag).
// beta: how much the smoothing backs off as the finger speeds up (higher = less lag on fast moves).
const SPEED_CUTOFF = 1;  // Hz: how smoothly the speed estimate itself changes
const STORAGE_KEY = "glitchHunter.bladeFeel";

export function createFingerFilter() {
    return { ready: false, x: 0, y: 0, rawX: 0, rawY: 0, speed: 0 };
}

export function loadBladeFeel() {
    try {
        let saved = BLADE_FEELS.findIndex(f => f.name === localStorage.getItem(STORAGE_KEY));
        return saved === -1 ? 0 : saved;
    } catch (error) {
        return 0;
    }
}

// Next preset (B key). Returns its name, to show on screen.
export function cycleBladeFeel(state) {
    state.bladeFeel = (state.bladeFeel + 1) % BLADE_FEELS.length;
    state.fingerFilter.ready = false; // start the new setting fresh, from where the finger is
    try {
        localStorage.setItem(STORAGE_KEY, BLADE_FEELS[state.bladeFeel].name);
    } catch (error) {
        // storage blocked: the setting just won't be remembered
    }
    return BLADE_FEELS[state.bladeFeel].name;
}

// Move state.finger towards state.rawFinger (written by input.js). `step` is in 60fps frames.
export function smoothFinger(state, step) {
    let feel = BLADE_FEELS[state.bladeFeel];
    let f = state.fingerFilter;
    let raw = state.rawFinger;

    // RAW, or a hand that just (re)appeared: the blade is exactly where the camera says
    // (a returning hand starts where it is, instead of gliding in from where it was lost)
    if (feel.minCutoff === null || !f.ready || !state.handVisible) {
        f.ready = state.handVisible && feel.minCutoff !== null;
        f.x = f.rawX = raw.x;
        f.y = f.rawY = raw.y;
        f.speed = 0;
        state.finger.x = raw.x;
        state.finger.y = raw.y;
        return;
    }

    let dt = Math.max(step, 0.01) / 60; // seconds
    let rawSpeed = Math.hypot(raw.x - f.rawX, raw.y - f.rawY) / dt;
    f.rawX = raw.x;
    f.rawY = raw.y;
    f.speed = f.speed + blend(SPEED_CUTOFF, dt) * (rawSpeed - f.speed);

    let amount = blend(feel.minCutoff + feel.beta * f.speed, dt);
    f.x = f.x + amount * (raw.x - f.x);
    f.y = f.y + amount * (raw.y - f.y);
    state.finger.x = f.x;
    state.finger.y = f.y;
}

// How far to move towards the new value this frame, for a low-pass filter at `cutoff` Hz.
function blend(cutoff, dt) {
    let tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
}
