// The ITC runner: the club mascot at the bottom of the screen, facing the player.
// He shows how hard the game has got: standing calmly at level 1, walking, then jogging, then
// running faster every level and sprinting from the boss. During play he drifts left and right
// following the blade. He reacts to the game with short speech bubbles, raises an ITC flag on
// big moments (and waves it on the start screen to call people over), glances back once things
// get dangerous, stumbles on bomb hits, cheers, and collapses on game over.
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
const HEIGHT_SHARE = 0.24;   // drawn about this share of the screen's shorter side (rounded to whole pixels)
const OPACITY = 1;
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
const WALK_FPS = 6;          // when he steps aside while otherwise standing still
const CYCLE_FRAMES = 8;      // frames in one run/walk cycle (used to time the faked run)
const LOOK_EVERY = 360;      // at high levels: glance back every 6 s...
const LOOK_EVERY_BOSS = 180; // ...every 3 s while the boss is chasing him
const LOOK_FRAMES = 60;      // ...for 1 s
const MOOD_FRAMES = { stumble: 30, cheer: 45, flag: 150, look: LOOK_FRAMES };
const CHAMPION_FRAMES = 60 * 60; // keeps waving the flag on the game over screen after a new #1

// Following the blade during play
const FOLLOW_RANGE = 0.25;   // drifts up to this share of the screen width either side of the centre
const FOLLOW_EASE = 0.03;    // share of the remaining distance he covers each frame (lower = lazier)

// Speech bubbles
const BUBBLE_FRAMES = 80;    // ~1.3 s on screen
const BUBBLE_COOLDOWN = 150; // small remarks at most every 2.5 s; big moments always get through
const TRY_AGAIN_AT = 70;     // after falling over at game over, a beat before "TRY AGAIN!"

// Start screen: wave the flag and call people over
const ATTRACT_EVERY = 480;   // every 8 s
const ATTRACT_LINES = ["JOIN ITC!", "COME PLAY!", "CAN YOU BEAT #1?"];

// What he says (and does) when things happen. `big` moments interrupt a recent remark.
const REACTIONS = {
    start:        { lines: ["LET'S GO!", "HUNT THOSE BUGS!"] },
    comboUp:      { lines: ["NICE!", "KEEP GOING!", "COMBO!"] },
    multiSlice:   { lines: ["WOW!", "SLICED!", "TWO AT ONCE!"], mood: "cheer" },
    goldSlice:    { lines: ["ITC BUG!", "GOLDEN!"], mood: "cheer" },
    bomb:         { lines: ["OUCH!", "CAREFUL!"], mood: "stumble", big: true },
    shieldBreak:  { lines: ["PHEW!", "CLOSE ONE!"], mood: "stumble", big: true },
    levelUp:      { lines: ["LEVEL UP!", "FASTER!"], mood: "flag", big: true },
    feverStart:   { lines: ["FEVER!!", "ON FIRE!"], mood: "cheer", big: true },
    bossStart:    { lines: ["UH OH...", "RUN!!"], mood: "look", big: true },
    bossDefeated: { lines: ["WE WON!", "VIRUS DOWN!"], mood: "flag", big: true },
    newRecord:    { lines: ["NEW RECORD!", "LEGEND!"], mood: "flag", big: true }
};

// Rows and columns of the single standing frame (44 x 43 canvas), used to fake the run.
const HEAD_BOTTOM = 16;      // rows 0-16: hair, face, neck
const ARMS_TOP = 23;         // rows 23-32: the bare arms beside the shirt
const LEGS_TOP = 33;         // rows 33-42: legs and shoes
const LEFT_ARM = [14, 17];   // columns [from, to)
const RIGHT_ARM = [26, 29];
const LEG_SPLIT = 21;        // the gap between the legs
const STRIDE = 3;            // pixels a knee lifts (and an arm pumps) at the top of each step

// The ITC flag, in art pixels. The pole sits in his raised fist: where that fist is depends on
// whether the cheer comes from the cheer strip (frame 1) or is faked from the standing frame.
const FLAG_FIST = { strip: { x: 28, y: 11 }, fake: { x: 27, y: 14 } };
const POLE_LENGTH = 19;
const CLOTH_WIDTH = 14;
const CLOTH_HEIGHT = 8;
const FLAG_LOGO = ["R.WWW.WWW",
                   "R..W..W..",
                   "R..W..WWW"]; // red I, white T and C, like his shirt

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
    return {
        clock: 0, mood: "run", moodTimer: 0, lookClock: 0, fallTime: 0,
        offset: 0, moving: false,              // sideways drift, as a share of the screen width
        wave: 0,                               // flag-wave clock
        bubble: null, bubbleCooldown: 0,       // { text, timer }
        attractClock: ATTRACT_EVERY - 90, attractLine: 0
    };
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

// Advance his animation, movement and reactions. Call after this frame's events are produced.
// `width`: the screen width, for following the blade.
export function updateRunner(state, step, width = 1280) {
    let runner = state.runner;
    react(state, runner);

    runner.wave = runner.wave + step;
    if (runner.bubble) {
        runner.bubble.timer = runner.bubble.timer - step;
        if (runner.bubble.timer <= 0) runner.bubble = null;
    }
    runner.bubbleCooldown = Math.max(0, runner.bubbleCooldown - step);

    if (runner.mood === "fall") {
        // he stays down until the next round starts, then encourages another go
        let before = runner.fallTime;
        runner.fallTime = runner.fallTime + step;
        if (before < TRY_AGAIN_AT && runner.fallTime >= TRY_AGAIN_AT) say(runner, "TRY AGAIN!", true);
        return;
    }

    let playing = state.screen === "playing";
    let gait = getGait(state);
    followBlade(state, runner, gait, step, width);
    let fps = gait.anim === "idle" && runner.moving ? WALK_FPS : gait.fps;
    runner.clock = runner.clock + fps * step / 60;

    // start screen: every few seconds, wave the ITC flag and call people over
    if (state.screen === "start") {
        runner.attractClock = runner.attractClock + step;
        if (runner.attractClock >= ATTRACT_EVERY) {
            runner.attractClock = 0;
            setMood(runner, "flag", MOOD_FRAMES.flag);
            say(runner, ATTRACT_LINES[runner.attractLine % ATTRACT_LINES.length], true);
            runner.attractLine = runner.attractLine + 1;
        }
    }

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

// React to this frame's game events with a mood and a remark.
function react(state, runner) {
    for (let i = 0; i < state.events.length; i = i + 1) {
        let event = state.events[i];
        let type = event.type;
        if (type === "start") {
            Object.assign(runner, createRunner(), { attractLine: runner.attractLine });
            say(runner, pick(REACTIONS.start.lines), true);
            continue;
        }
        if (type === "gameOver") {
            setMood(runner, "fall", Infinity);
            runner.bubble = null;
            continue;
        }
        if (type === "newTopScore") {
            // a new #1: he gets up and waves the flag instead of lying there
            setMood(runner, "flag", CHAMPION_FRAMES);
            say(runner, pick(["CHAMPION!", "NUMBER ONE!"]), true);
            continue;
        }
        if (runner.mood === "fall") continue; // lying down: no more reactions

        let key = type;
        if (type === "slice") key = event.kind === "gold" ? "goldSlice" : null;
        let reaction = key && REACTIONS[key];
        if (!reaction) continue;
        // small cheers don't cut a flag wave short, but a bomb hit always makes him stumble
        let keepFlag = runner.mood === "flag" && !reaction.big;
        if (reaction.mood && !keepFlag) {
            setMood(runner, reaction.mood, MOOD_FRAMES[reaction.mood]);
        }
        say(runner, pick(reaction.lines), reaction.big);
    }
}

// During play he drifts towards the blade (never too far from the centre), and back to the
// centre otherwise. While drifting from a standstill he walks rather than sliding.
function followBlade(state, runner, gait, step, width) {
    let target = 0;
    if (state.screen === "playing" && state.handVisible) {
        target = Math.max(-FOLLOW_RANGE, Math.min(FOLLOW_RANGE, state.finger.x / width - 0.5));
    }
    let before = runner.offset;
    runner.offset = runner.offset + (target - runner.offset) * (1 - Math.pow(1 - FOLLOW_EASE, step));
    runner.moving = Math.abs(runner.offset - before) > 0.0006 * step;
}

function say(runner, text, big = false) {
    if (!big && runner.bubbleCooldown > 0) return;
    runner.bubble = { text: text, timer: BUBBLE_FRAMES };
    runner.bubbleCooldown = BUBBLE_COOLDOWN;
}

function pick(lines) {
    return lines[Math.floor(Math.random() * lines.length)];
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
    let lift = 22; // spare rows above the art for hops and the flag

    if (!frameCanvas) frameCanvas = document.createElement("canvas");
    if (frameCanvas.width !== width || frameCanvas.height !== height + lift) {
        frameCanvas.width = width;
        frameCanvas.height = height + lift;
    }
    let fctx = frameCanvas.getContext("2d");
    fctx.imageSmoothingEnabled = false;
    fctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);

    // what to show: a mood (look, stumble, cheer, flag, fall), or otherwise the current gait
    let gait = getGait(state);
    let key = runner.mood === "run" ? gait.anim : runner.mood;
    if (key === "idle" && runner.moving) key = "walk";
    if (key === "flag") {
        // fist up holding the flag: frame 1 of the cheer strip, or the faked cheer
        let fist = images.cheer ? FLAG_FIST.strip : FLAG_FIST.fake;
        drawFlag(fctx, fist, lift, runner.wave);
        if (images.cheer) {
            drawStripFrame(fctx, images.cheer, "cheer", runner, lift, 0);
        } else {
            drawFakeRun(fctx, base, runner, lift);
        }
    } else if (key === "idle") {
        drawIdle(fctx, base, runner, lift);
    } else if (images[key]) {
        drawStripFrame(fctx, images[key], key, runner, lift);
    } else if ((key === "walk" || key === "look") && images.run) {
        drawStripFrame(fctx, images.run, "run", runner, lift); // no strip of its own: use the run
    } else {
        drawFakeRun(fctx, base, runner, lift, key === "walk" ? 1 : STRIDE);
    }

    // place: bottom centre in play (drifting with the blade), off to the right on the menus
    const canvas = ctx.canvas;
    // sized by the screen's shorter side, so he isn't huge on a phone held upright
    let scale = Math.max(2, Math.floor(Math.min(canvas.width, canvas.height) * HEIGHT_SHARE / height));
    let centerX = placement === "side" ? canvas.width * 0.85 : canvas.width * (0.5 + runner.offset);
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

    if (runner.bubble) {
        // above his head; off to the left while the flag is up on his right
        let lying = runner.mood === "fall";
        let headY = feetY - (lying ? 14 : height + (runner.mood === "flag" ? 4 : 0)) * scale;
        let x = centerX - (runner.mood === "flag" ? 10 * scale : 0);
        drawBubble(ctx, runner.bubble, x, headY, scale);
    }
}

// The ITC flag on its pole, drawn into the frame at art resolution so it stays pixel art.
// The whole cloth bobs gently and its free end flutters; the part with the logo stays rigid
// so the letters never break apart.
const FLUTTER_FROM = 11; // cloth columns from here on (past the logo) flutter

function drawFlag(fctx, fist, lift, wave) {
    let poleTop = lift + fist.y - POLE_LENGTH;
    fctx.fillStyle = "#cfcfcf";
    fctx.fillRect(fist.x, poleTop, 1, POLE_LENGTH + 2);
    fctx.fillStyle = "#ffd700";
    fctx.fillRect(fist.x, poleTop - 1, 1, 1); // little gold tip

    let bob = Math.round(Math.sin(wave * 0.12));
    for (let c = 0; c < CLOTH_WIDTH; c = c + 1) {
        let flutter = c < FLUTTER_FROM ? 0 : Math.round(Math.sin(wave * 0.3 - c * 0.9) * (c - FLUTTER_FROM + 1) * 0.6);
        let ripple = bob + flutter;
        let x = fist.x + 1 + c;
        let top = poleTop + 1 + ripple;
        fctx.fillStyle = "#141414";
        fctx.fillRect(x, top, 1, CLOTH_HEIGHT);
        // logo pixels, 2 columns in from the pole and 2 rows down, moving with the cloth
        let logoColumn = c - 2;
        for (let r = 0; r < FLAG_LOGO.length; r = r + 1) {
            let ch = logoColumn >= 0 && logoColumn < FLAG_LOGO[r].length ? FLAG_LOGO[r][logoColumn] : ".";
            if (ch === ".") continue;
            fctx.fillStyle = ch === "R" ? "#ff1e28" : "#ffffff";
            fctx.fillRect(x, top + 2 + r, 1, 1);
        }
    }
}

// White speech bubble with a little tail pointing down at him; fades out at the end.
function drawBubble(ctx, bubble, x, headY, scale) {
    const canvas = ctx.canvas;
    let fontSize = Math.max(14, Math.round(scale * 4.2));
    ctx.save();
    ctx.font = "bold " + fontSize + "px Arial";
    let textWidth = ctx.measureText(bubble.text).width;
    let w = textWidth + fontSize * 1.2;
    let h = fontSize * 1.7;
    let left = Math.max(8, Math.min(canvas.width - w - 8, x - w / 2)); // keep it on screen
    let top = headY - h - fontSize * 0.8;
    let tailX = Math.max(left + 12, Math.min(left + w - 12, x));

    ctx.globalAlpha = Math.min(1, bubble.timer / 12);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(left, top, w, h, h / 3) : ctx.rect(left, top, w, h);
    ctx.moveTo(tailX - 7, top + h - 1);
    ctx.lineTo(tailX, top + h + fontSize * 0.6);
    ctx.lineTo(tailX + 7, top + h - 1);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(bubble.text, left + w / 2, top + h / 2 + 1);
    ctx.restore();
}

// Real Piskel strip: pick the frame from the animation clock (or a fixed `index`);
// falls play once and stay down.
function drawStripFrame(fctx, strip, key, runner, lift, index = null) {
    let frames = STRIPS[key].frames;
    let frameWidth = strip.width / frames;
    if (index === null) {
        if (key === "fall") {
            index = Math.min(frames - 1, Math.floor(runner.fallTime / 8));
        } else {
            index = Math.floor(runner.clock) % frames;
        }
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

    if (runner.mood === "cheer" || runner.mood === "flag") {
        // a hop with both arms thrown up
        let t = runner.moodTimer / MOOD_FRAMES.cheer;
        // (no hop while holding the flag, or the pole would slide out of his fist)
        bob = runner.mood === "flag" ? 0 : Math.round(Math.abs(Math.sin(t * Math.PI)) * 6);
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
