// Smooths the tracked fingertip before the game uses it.
//
// The camera reports the finger about 30 times a second, with a few pixels of jitter, so the
// raw position shakes while your hand is still and jumps in steps while it moves. A "One Euro
// filter" fixes both: when the finger moves slowly it smooths heavily (no shaking), and the
// faster it moves the less it smooths (so fast slashes don't lag behind your hand).
// It runs every game frame, so between camera updates the blade glides instead of stepping.

const MIN_CUTOFF = 3;    // Hz: smoothing when still. Lower = steadier, but laggier on slow moves
const BETA = 0.015;      // how quickly smoothing backs off as speed rises. Higher = less lag on fast moves
const SPEED_CUTOFF = 1;  // Hz: how smoothly the speed estimate itself changes

export function createFingerFilter() {
    return { ready: false, x: 0, y: 0, rawX: 0, rawY: 0, speed: 0 };
}

// Move state.finger towards state.rawFinger (written by input.js). `step` is in 60fps frames.
export function smoothFinger(state, step) {
    let f = state.fingerFilter;
    let raw = state.rawFinger;

    // a hand that just (re)appeared starts exactly where it is, instead of gliding in from where it was lost
    if (!f.ready || !state.handVisible) {
        f.ready = state.handVisible;
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

    let amount = blend(MIN_CUTOFF + BETA * f.speed, dt);
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
