// All mutable game data lives here. Physics mutates it, the renderer only reads it.
import { createRunner } from "./runner.js";
import { createFingerFilter, loadBladeFeel } from "./smoothing.js";

export const ENTITY_SIZE = 40;
export const TRAIL_LENGTH = 10;
export const STARTING_LIVES = 3;

export function createState() {
    return {
        finger: { x: 0, y: 0 },      // smoothed fingertip: where the blade is (see smoothing.js)
        rawFinger: { x: 0, y: 0 },   // fingertip exactly as the camera last reported it
        fingerFilter: createFingerFilter(),
        bladeFeel: loadBladeFeel(), // which smoothing preset (see smoothing.js), cycled with B
        notice: { text: "", timer: 0 }, // short message at the top of the screen (e.g. after pressing B)
        prevFinger: { x: 0, y: 0 }, // fingertip last frame, for swipe hits
        prevHandVisible: false,
        bugs: [],   // falling bugs; the first ones are dropped in as the round starts (see physics.js)
        bombs: [],
        score: 0,
        combo: 0,  // bugs sliced in a row; drives the score multiplier
        slices: 0, // total bugs sliced this round; drives the speed
        level: 1,  // goes up every few slices (see theme.js)
        fever: false, // FEVER mode: on at the top combo multiplier, off when the combo breaks
        swipeChain: { count: 0, timer: 0, x: 0, y: 0 }, // blade slices in quick succession (multi-slice bonus)
        swipe: null,          // this frame's fingertip path, shared by physics, power-ups and the boss
        powerups: [],         // falling power-ups (see powerups.js)
        powerupTimer: 900,    // frames of play until the next power-up drops
        powers: { shield: false, wide: 0, magnet: 0 }, // collected power-ups: shield on/off, frames left for the others
        boss: null,           // the VIRUS boss while one is on screen (see boss.js)
        runner: createRunner(), // the ITC mascot (see runner.js)
        recordBroken: false,  // this round has passed the leaderboard's #1 (see leaderboard.js)
        newTop: false,        // the round that just ended took the #1 spot
        celebrateTimer: 0,    // frames of confetti rain left on the game over screen
        confetti: [],         // celebration confetti (see effects.js)
        bossesBeaten: 0,
        lives: STARTING_LIVES,
        baseBugSpeed: 5,
        baseBombSpeed: 6,
        particles: [],
        debris: [],          // pieces of sliced bugs (see debris.js)
        trail: [],
        gridOffset: 0,
        angle: 0,
        screen: "start", // "start" | "playing" | "gameover"
        handVisible: false,
        handIdle: 0,         // frames without a hand in view (see idle.js)
        nameIdle: 0,         // frames without a key press during name entry
        buttonHold: 0,
        buttonArmed: true,
        leaderboard: [],     // [{ name, score }], best first
        enteringName: false, // true while a high scorer types their name
        playerName: "",
        lastSavedIndex: -1,  // leaderboard row to highlight, -1 for none
        pose: "none",        // current hand pose from poses.js
        heldPose: "none",
        poseFrames: 0,       // how long heldPose has been held
        spells: createSpellTimers(),
        flash: 0,            // white screen flash, 1 fading to 0
        banner: { text: "", color: "white", timer: 0 },
        popups: [],          // floating "+20" texts (see effects.js)
        rings: [],           // expanding explosion rings (see effects.js)
        glitch: { strength: 0, frames: 0 }, // screen glitch currently showing (see glitch.js)
        shake: 0,            // screen shake strength in pixels
        hitStop: 0,          // frames the game stays frozen after a bomb hit
        events: [],          // things that happened this frame ({ type: "slice" }, ...), for sound; cleared every frame
        soundStatus: "locked", // "locked" until the first key/click, then "on" or "muted"
        quality: "high",     // current visual quality, lowered automatically if the frame rate drops (see perf.js)
        qualityLock: "auto", // "auto", or a level locked with the Q key
        fps: 60,
        showPerf: false,     // F key: show the FPS overlay
        showTracking: false, // D key: show raw camera tracking behind the blade (for diagnosing it)
        trackingFps: 0,      // results per second from the camera + hand tracker
        trackingSamples: []  // recent raw fingertip/knuckle positions, for the D-key view
    };
}

// A falling bug or bomb. speed varies a little per entity; spin offsets its rotation.
// type, hp and hitCooldown only matter for bugs (see enemies.js).
export function makeEntity(x, y) {
    // kx/ky: knockback from a nearby explosion, fading out over a few frames
    return { x: x, y: y, speed: 1, spin: 0, size: ENTITY_SIZE, type: "normal", hp: 1, hitCooldown: 0, kx: 0, ky: 0 };
}

// Stretch every on-screen position after the canvas changes size.
export function scaleWorld(state, scaleX, scaleY) {
    state.fingerFilter.ready = false; // restart the smoothing at the new scale
    let points = [state.finger, state.rawFinger, state.prevFinger]
        .concat(state.bugs, state.bombs, state.trail, state.particles, state.popups, state.debris, state.rings, state.confetti);
    for (let i = 0; i < points.length; i = i + 1) {
        points[i].x = points[i].x * scaleX;
        points[i].y = points[i].y * scaleY;
    }
    if (state.boss) {
        state.boss.y = state.boss.y * scaleY; // x follows the screen width on its own
    }
    // power-ups wobble around a centre line that has to move with them
    for (let i = 0; i < state.powerups.length; i = i + 1) {
        state.powerups[i].baseX = state.powerups[i].baseX * scaleX;
        state.powerups[i].y = state.powerups[i].y * scaleY;
    }
}

// Frames left on each ITC power (see spells.js)
function createSpellTimers() {
    return {
        slow:   { active: 0, cooldown: 0 },
        double: { active: 0, cooldown: 0 },
        purge:  { active: 0, cooldown: 0 }
    };
}

// Start a fresh round. Finger, trail and background animation are kept so nothing jumps.
export function resetRound(state) {
    state.bugs = [];  // filled in on the first frame, at random spots inside the play area
    state.bombs = [];
    state.score = 0;
    state.combo = 0;
    state.slices = 0;
    state.level = 1;
    state.fever = false;
    state.swipeChain = { count: 0, timer: 0, x: 0, y: 0 };
    state.swipe = null;
    state.powerups = [];
    state.powerupTimer = 900;
    state.powers = { shield: false, wide: 0, magnet: 0 };
    state.boss = null;
    state.bossesBeaten = 0;
    state.recordBroken = false;
    state.newTop = false;
    state.celebrateTimer = 0;
    state.confetti = [];
    state.lives = STARTING_LIVES;
    state.particles = [];
    state.debris = [];
    state.popups = [];
    state.rings = [];
    state.glitch = { strength: 0, frames: 0 };
    state.shake = 0;
    state.hitStop = 0;
    state.prevHandVisible = false; // first frame of a round checks only the fingertip, not a swipe
    state.buttonHold = 0;
    state.handIdle = 0;
    state.nameIdle = 0;
    state.enteringName = false;
    state.playerName = "";
    state.lastSavedIndex = -1;
    state.spells = createSpellTimers();
    state.flash = 0;
    state.banner = { text: "", color: "white", timer: 0 };
    state.screen = "playing";
    state.events.push({ type: "start" });
}
