// The ITC runner: the club mascot at the bottom of the screen, facing the player.
// He shows how hard the game has got: standing calmly at level 1, walking, then jogging, then
// running faster every level and sprinting from the boss. He glances back once things get
// dangerous, stumbles on bomb hits, cheers on big moments and collapses on game over.
//
// Art lives in assets/. With only the single standing frame (runner.png), the run is faked by
// moving his legs and arms separately. Drop in real Piskel strips (one horizontal row of
// frames per file, same frame size) and they're used automatically (see STRIPS below).
import { getThemeHue } from "./theme.js";

const STRIPS = {
    run:     { file: "assets/runner-run.png",     frames: 8 },
    walk:    { file: "assets/runner-walk.png",    frames: 8 },
    look:    { file: "assets/runner-look.png",    frames: 2 },
    stumble: { file: "assets/runner-stumble.png", frames: 2 },
    cheer:   { file: "assets/runner-cheer.png",   frames: 2 },
    fall:    { file: "assets/runner-fall.png",    frames: 3 }
};
// ^ set `frames` to how many frames each exported strip has

const BASE_FILE = "assets/runner.png";
const HEIGHT_SHARE = 0.2;    // drawn about this share of the screen's shorter side (rounded to whole pixels)
const OPACITY = 0.9;
// How he moves at each level (the last row that applies wins). fps: animation frames per second.
const GAITS = [
    { level: 1, anim: "idle", fps: 2 },   // standing, breathing
    { level: 2, anim: "walk", fps: 6 },
    { level: 3, anim: "run",  fps: 9 },   // jogging
    { level: 4, anim: "run",  fps: 12 }   // running...
];
const FPS_PER_LEVEL = 1.5;   // ...a little faster every level after that...
const MAX_FPS = 20;
const SPRINT_FPS = 18;       // ...and flat out while the boss or FEVER is on
const CYCLE_FRAMES = 8;      // frames in one run/walk cycle (used to time the faked run)
const LOOK_EVERY = 360;      // at high levels: glance back every 6 s...
const LOOK_EVERY_BOSS = 180; // ...every 3 s while the boss is chasing him
const LOOK_FRAMES = 60;      // ...for 1 s
const MOOD_FRAMES = { stumble: 30, cheer: 45 };
const CHAMPION_FRAMES = 60 * 60; // keeps cheering on the game over screen after a new #1

// Rows and columns of the single standing frame (44 x 43 canvas), used to fake the run.
const HEAD_BOTTOM = 16;      // rows 0-16: hair, face, neck
const ARMS_TOP = 23;         // rows 23-32: the bare arms beside the shirt
const LEGS_TOP = 33;         // rows 33-42: legs and shoes
const LEFT_ARM = [14, 17];   // columns [from, to)
const RIGHT_ARM = [26, 29];
const LEG_SPLIT = 21;        // the gap between the legs
const STRIDE = 3;            // pixels a knee lifts (and an arm pumps) at the top of each step

// ---------- loading ----------
const images = {};
function load(key, file) {
    if (typeof Image === "undefined") return; // not in a browser (tests)
    let image = new Image();
    image.onload = () => { images[key] = image; };
    image.src = file; // a missing strip just fails quietly and the fallback is used
}
load("base", BASE_FILE);
for (let key in STRIPS) load(key, STRIPS[key].file);

// ---------- behaviour ----------
export function createRunner() {
    return { clock: 0, mood: "run", moodTimer: 0, lookClock: 0, fallTime: 0 };
}

// How he's moving right now: which animation, and how fast.
export function getGait(state) {
    if (state.screen !== "playing") return GAITS[0]; // calm on the menus
    let gait = GAITS[0];
    for (let i = 0; i < GAITS.length; i = i + 1) {
        if (state.level >= GAITS[i].level) gait = GAITS[i];
    }
    let fps = gait.fps;
    let last = GAITS[GAITS.length - 1];
    if (state.level > last.level) {
        fps = Math.min(fps + (state.level - last.level) * FPS_PER_LEVEL, MAX_FPS);
    }
    if (state.boss || state.fever) {
        return { anim: "run", fps: Math.max(fps, SPRINT_FPS) };
    }
    return { anim: gait.anim, fps: fps };
}

// Advance the run cycle and react to this frame's events. Call after the events are produced.
export function updateRunner(state, step) {
    let runner = state.runner;

    for (let i = 0; i < state.events.length; i = i + 1) {
        let type = state.events[i].type;
        if (type === "start") {
            Object.assign(runner, createRunner());
        } else if (type === "gameOver") {
            setMood(runner, "fall", Infinity);
        } else if (type === "newTopScore") {
            setMood(runner, "cheer", CHAMPION_FRAMES); // a new #1: he celebrates instead of collapsing
        } else if (type === "newRecord") {
            setMood(runner, "cheer", MOOD_FRAMES.cheer);
        } else if ((type === "bomb" || type === "shieldBreak") && runner.mood !== "fall") {
            setMood(runner, "stumble", MOOD_FRAMES.stumble);
        } else if ((type === "feverStart" || type === "bossDefeated" ||
                   (type === "multiSlice" && state.events[i].count >= 3)) && runner.mood !== "fall") {
            setMood(runner, "cheer", MOOD_FRAMES.cheer);
        }
    }

    if (runner.mood === "fall") {
        runner.fallTime = runner.fallTime + step; // he stays down until the next round starts
        return;
    }

    // the animation clock runs at the current gait's speed (see GAITS)
    let playing = state.screen === "playing";
    runner.clock = runner.clock + getGait(state).fps * step / 60;

    if (runner.moodTimer > 0) {
        runner.moodTimer = Math.max(0, runner.moodTimer - step);
        if (runner.moodTimer === 0) runner.mood = "run";
        return;
    }

    // glance back over his shoulder now and then once things get dangerous
    if (playing && (state.level >= 4 || state.boss)) {
        runner.lookClock = runner.lookClock + step;
        if (runner.lookClock >= (state.boss ? LOOK_EVERY_BOSS : LOOK_EVERY)) {
            runner.lookClock = 0;
            setMood(runner, "look", LOOK_FRAMES);
        }
    }
}

function setMood(runner, mood, frames) {
    runner.mood = mood;
    runner.moodTimer = frames;
    runner.fallTime = 0;
}

// ---------- drawing ----------
let frameCanvas = null; // one frame of the runner is assembled here at art resolution, then scaled up

export function drawRunner(ctx, state, placement = "center") {
    let base = images.base;
    if (!base) return; // still loading, or not found
    let runner = state.runner;
    let width = base.width;
    let height = base.height;
    let lift = 10; // spare rows above the art so jumps aren't cut off

    if (!frameCanvas) frameCanvas = document.createElement("canvas");
    if (frameCanvas.width !== width || frameCanvas.height !== height + lift) {
        frameCanvas.width = width;
        frameCanvas.height = height + lift;
    }
    let fctx = frameCanvas.getContext("2d");
    fctx.imageSmoothingEnabled = false;
    fctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);

    // what to show: a mood (look, stumble, cheer, fall), or otherwise the current gait
    let gait = getGait(state);
    let key = runner.mood === "run" ? gait.anim : runner.mood;
    if (key === "idle") {
        drawIdle(fctx, base, runner, lift);
    } else if (images[key]) {
        drawStripFrame(fctx, images[key], key, runner, lift);
    } else if ((key === "walk" || key === "look") && images.run) {
        drawStripFrame(fctx, images.run, "run", runner, lift); // no strip of its own: use the run
    } else {
        drawFakeRun(fctx, base, runner, lift, key === "walk" ? 1 : STRIDE);
    }

    // place: bottom centre in play, off to the right on the start screen (the START button is in the middle)
    const canvas = ctx.canvas;
    // sized by the screen's shorter side, so he isn't huge on a phone held upright
    let scale = Math.max(2, Math.floor(Math.min(canvas.width, canvas.height) * HEIGHT_SHARE / height));
    let centerX = placement === "side" ? canvas.width * 0.85 : canvas.width / 2;
    let feetY = canvas.height - 12;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = OPACITY;
    ctx.translate(centerX, feetY);

    // whole-body moves that work for both the faked run and real strips
    if (runner.mood === "stumble" && !images.stumble) {
        let t = runner.moodTimer / MOOD_FRAMES.stumble;
        ctx.rotate(Math.sin(t * Math.PI) * 0.25);
    } else if (runner.mood === "fall" && !images.fall) {
        let t = Math.min(1, runner.fallTime / 25);
        // tips over onto his side, rising a little so his body lies on the ground instead of half under it
        ctx.translate(0, -t * t * width * 0.2 * scale);
        ctx.rotate(t * t * Math.PI / 2);
    }

    // neon outline in the level's colour, so his dark clothes stand out on the dark grid
    ctx.shadowBlur = 14;
    ctx.shadowColor = "hsl(" + Math.round(getThemeHue(state)) + ", 100%, 60%)";
    ctx.drawImage(frameCanvas, -width * scale / 2, -(height + lift) * scale, width * scale, (height + lift) * scale);
    ctx.restore();
}

// Real Piskel strip: pick the frame from the animation clock; falls play once and stay down.
function drawStripFrame(fctx, strip, key, runner, lift) {
    let frames = STRIPS[key].frames;
    let frameWidth = strip.width / frames;
    let index;
    if (key === "fall") {
        index = Math.min(frames - 1, Math.floor(runner.fallTime / 8));
    } else {
        index = Math.floor(runner.clock) % frames;
    }
    fctx.drawImage(strip, index * frameWidth, 0, frameWidth, strip.height, 0, lift, frameWidth, strip.height);
}

// Standing still at the start: the upper body rises a pixel and settles, like breathing.
function drawIdle(fctx, base, runner, lift) {
    let breath = Math.floor(runner.clock) % 2;
    let y = lift;
    part(fctx, base, 0, LEGS_TOP, base.width, base.height - LEGS_TOP, 0, y + LEGS_TOP);
    part(fctx, base, 0, 0, base.width, LEGS_TOP, 0, y - breath);
    if (breath) {
        // repeat the hip row where it was, so rising doesn't open a gap above the legs
        part(fctx, base, 0, LEGS_TOP - 1, base.width, 1, 0, y + LEGS_TOP - 1);
    }
}

// One standing frame, made to run: legs lift in turn, arms pump the other way, the body bobs.
// `stride` is how many pixels a knee lifts: small for walking, bigger for running.
function drawFakeRun(fctx, base, runner, lift, stride = STRIDE) {
    let w = base.width;
    let h = base.height;
    let phase = runner.clock * 2 * Math.PI / CYCLE_FRAMES;
    let swing = runner.mood === "fall" ? 0 : Math.sin(phase);
    let bob = stride > 1 ? Math.round(Math.abs(swing)) : 0; // up 1 pixel on each running stride
    let leftLeg = Math.round(Math.max(0, swing) * stride);  // knee lift
    let rightLeg = Math.round(Math.max(0, -swing) * stride);
    let leftArm = rightLeg;                                 // arms pump opposite to the legs
    let rightArm = leftLeg;

    if (runner.mood === "cheer") {
        // a hop with both arms thrown up
        let t = runner.moodTimer / MOOD_FRAMES.cheer;
        bob = Math.round(Math.sin(t * Math.PI) * 6);
        leftArm = rightArm = 9;
        leftLeg = rightLeg = 0;
    }

    let y = lift - bob;
    // legs first, so a lifted leg slides up behind the hips
    part(fctx, base, 0, LEGS_TOP, LEG_SPLIT, h - LEGS_TOP, 0, y + LEGS_TOP - leftLeg);
    part(fctx, base, LEG_SPLIT, LEGS_TOP, w - LEG_SPLIT, h - LEGS_TOP, LEG_SPLIT, y + LEGS_TOP - rightLeg);
    // body without the arms
    part(fctx, base, 0, 0, w, ARMS_TOP, 0, y);
    part(fctx, base, LEFT_ARM[1], ARMS_TOP, RIGHT_ARM[0] - LEFT_ARM[1], LEGS_TOP - ARMS_TOP, LEFT_ARM[1], y + ARMS_TOP);
    // arms
    part(fctx, base, LEFT_ARM[0], ARMS_TOP, LEFT_ARM[1] - LEFT_ARM[0], LEGS_TOP - ARMS_TOP, LEFT_ARM[0], y + ARMS_TOP - leftArm);
    part(fctx, base, RIGHT_ARM[0], ARMS_TOP, RIGHT_ARM[1] - RIGHT_ARM[0], LEGS_TOP - ARMS_TOP, RIGHT_ARM[0], y + ARMS_TOP - rightArm);

    // looking back: his head turned (mirrored), so the hair and face point the other way
    if (runner.mood === "look") {
        let headHeight = HEAD_BOTTOM + 1;
        fctx.clearRect(0, y, w, headHeight);
        fctx.save();
        fctx.translate(w, 0);
        fctx.scale(-1, 1);
        part(fctx, base, 0, 0, w, headHeight, 0, y);
        fctx.restore();
    }
}

function part(fctx, image, sx, sy, sw, sh, dx, dy) {
    fctx.drawImage(image, sx, sy, sw, sh, dx, dy, sw, sh);
}
