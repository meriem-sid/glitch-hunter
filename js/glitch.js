// Screen glitches: short bursts of torn, colour-split frames on big moments (bomb hits, level ups,
// the boss), plus small random ones at high levels. They only cost anything while a glitch is
// actually on screen (a few frames at a time), and only HIGH quality does the expensive colour split.
import { QUALITY } from "./perf.js";

const AMBIENT_FROM_LEVEL = 4;     // random glitches start at this level...
const AMBIENT_CHANCE_PER_LEVEL = 0.04; // ...with this extra chance per second for each level above 3...
const AMBIENT_MAX_CHANCE = 0.3;   // ...up to 30% per second
const MAX_TEAR = 40;              // pixels a torn strip can shift at full strength

export function triggerGlitch(state, strength, frames) {
    // a stronger glitch replaces a weaker one; a weaker one never cuts a strong one short
    if (strength >= state.glitch.strength || state.glitch.frames <= 0) {
        state.glitch = { strength: strength, frames: frames };
    }
}

export function updateGlitch(state, step) {
    state.glitch.frames = Math.max(0, state.glitch.frames - step);
    if (state.glitch.frames === 0) state.glitch.strength = 0;

    if (state.screen === "playing" && state.level >= AMBIENT_FROM_LEVEL && state.glitch.frames === 0) {
        let perSecond = Math.min((state.level - 3) * AMBIENT_CHANCE_PER_LEVEL, AMBIENT_MAX_CHANCE);
        if (Math.random() < perSecond / 60 * step) {
            triggerGlitch(state, 0.25 + Math.random() * 0.2, 6 + Math.random() * 4);
        }
    }
}

// Offscreen canvases, created once and reused: a copy of the frame, and two tinted copies.
let frameCopy = null;
let redCopy = null;
let cyanCopy = null;

function sizedCanvas(existing, width, height) {
    let canvas = existing || document.createElement("canvas");
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return canvas;
}

// Tint `source` into `target`: keep only one colour's light, so offset copies give a colour fringe.
function tint(target, source, color) {
    let tctx = target.getContext("2d");
    tctx.globalCompositeOperation = "copy";
    tctx.drawImage(source, 0, 0);
    tctx.globalCompositeOperation = "multiply";
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, target.width, target.height);
    // multiply paints transparent areas solid; cut the copy back to the frame's own shape
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(source, 0, 0);
    tctx.globalCompositeOperation = "source-over";
}

// Post-process the finished frame. Call after everything is drawn.
export function applyGlitch(ctx, state) {
    if (state.glitch.frames <= 0) return;
    const canvas = ctx.canvas;
    let width = canvas.width;
    let height = canvas.height;
    let strength = state.glitch.strength;

    frameCopy = sizedCanvas(frameCopy, width, height);
    let copyCtx = frameCopy.getContext("2d");
    copyCtx.clearRect(0, 0, width, height);
    copyCtx.drawImage(canvas, 0, 0);

    ctx.save();
    ctx.shadowBlur = 0;

    // colour split: a red copy nudged one way and a cyan copy the other, added on top
    if (QUALITY[state.quality].glitchSplit) {
        redCopy = sizedCanvas(redCopy, width, height);
        cyanCopy = sizedCanvas(cyanCopy, width, height);
        tint(redCopy, frameCopy, "rgb(255, 0, 60)");
        tint(cyanCopy, frameCopy, "rgb(0, 255, 255)");
        let offset = (4 + 6 * strength) * (Math.random() < 0.5 ? -1 : 1);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.35 * strength;
        ctx.drawImage(redCopy, offset, 0);
        ctx.drawImage(cyanCopy, -offset, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
    }

    // tearing: a few horizontal strips of the frame slid sideways
    let strips = 3 + Math.floor(Math.random() * 5 * strength);
    for (let i = 0; i < strips; i = i + 1) {
        let y = Math.random() * height;
        let stripHeight = 6 + Math.random() * 40 * strength;
        let shift = (Math.random() - 0.5) * 2 * MAX_TEAR * strength;
        ctx.drawImage(frameCopy, 0, y, width, stripHeight, shift, y, width, stripHeight);
    }

    // a few blocks of digital noise
    let blocks = Math.ceil(4 * strength);
    for (let i = 0; i < blocks; i = i + 1) {
        ctx.fillStyle = Math.random() < 0.5 ? "rgba(255, 0, 255, 0.6)" : "rgba(0, 255, 255, 0.6)";
        ctx.fillRect(Math.random() * width, Math.random() * height, 20 + Math.random() * 80, 3 + Math.random() * 10);
    }
    ctx.restore();
}
