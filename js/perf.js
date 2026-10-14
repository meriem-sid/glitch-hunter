// Performance protection: watches the frame rate and lowers the visual quality before
// the game starts to stutter, then tries the higher quality again once things are smooth.
//
// Glow (canvas shadowBlur) is by far the most expensive thing the game draws, so quality
// mostly means "how much glow", plus how many particles and debris pieces may exist at once.

// glitchSplit: the colour-split part of screen glitches, the most expensive effect while it's showing
export const QUALITY = {
    high:   { glow: 1,   maxParticles: 300, maxDebris: 60, glitchSplit: true,  maxConfetti: 200 },
    medium: { glow: 0.5, maxParticles: 150, maxDebris: 35, glitchSplit: false, maxConfetti: 120 },
    low:    { glow: 0,   maxParticles: 60,  maxDebris: 15, glitchSplit: false, maxConfetti: 60 }
};
const LEVELS = ["high", "medium", "low"];
export const QUALITY_LOCKS = ["auto", "high", "medium", "low"]; // Q cycles through these

const DOWNGRADE_FPS = 48;        // below this...
const DOWNGRADE_AFTER_MS = 2000; // ...for 2 s, drop one quality level
const UPGRADE_FPS = 57;          // above this (a 60Hz screen tops out at 60)...
const UPGRADE_AFTER_MS = 8000;   // ...for 8 s, try one level higher
const STALL_MS = 250;            // longer frames are a stall or a hidden tab, not a slow game: ignore them

export function createPerfMonitor() {
    return {
        averageMs: 1000 / 60,
        slowFor: 0,
        smoothFor: 0,
        upgradeWait: UPGRADE_AFTER_MS // doubles after every drop, so it doesn't keep bouncing between levels
    };
}

// Call once per frame with the real time the frame took.
export function updatePerf(state, monitor, frameMs) {
    if (frameMs <= 0 || frameMs > STALL_MS) return;

    // smoothed frame time: one slow frame doesn't count, a slow second does
    monitor.averageMs = monitor.averageMs * 0.95 + frameMs * 0.05;
    state.fps = 1000 / monitor.averageMs;

    if (state.qualityLock !== "auto") {
        state.quality = state.qualityLock;
        return;
    }

    monitor.slowFor = state.fps < DOWNGRADE_FPS ? monitor.slowFor + frameMs : 0;
    monitor.smoothFor = state.fps > UPGRADE_FPS ? monitor.smoothFor + frameMs : 0;
    let level = LEVELS.indexOf(state.quality);

    if (monitor.slowFor >= DOWNGRADE_AFTER_MS && level < LEVELS.length - 1) {
        state.quality = LEVELS[level + 1];
        monitor.upgradeWait = monitor.upgradeWait * 2;
        monitor.slowFor = 0;
        monitor.smoothFor = 0;
    } else if (monitor.smoothFor >= monitor.upgradeWait && level > 0) {
        state.quality = LEVELS[level - 1];
        monitor.slowFor = 0;
        monitor.smoothFor = 0;
    }
}

// Scale every glow the game draws by the current quality, in one place.
// The renderer sets ctx.shadowBlur in ~25 spots; this wraps that one property on this
// one canvas so each of those values is multiplied by the quality's glow factor
// (and becomes 0, the cheap no-glow path, on LOW).
export function installGlowScaling(ctx, getGlow) {
    let original = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), "shadowBlur");
    Object.defineProperty(ctx, "shadowBlur", {
        configurable: true,
        get() { return original.get.call(ctx); },
        set(value) { original.set.call(ctx, value * getGlow()); }
    });
}

// Pre-drawn glowing squares for particles: blurring once and stamping the result is much
// cheaper than asking the canvas to blur hundreds of tiny squares every frame.
const spriteCache = {};

export function getParticleSprite(color, size, blur) {
    let key = color + "|" + size + "|" + blur;
    if (!spriteCache[key]) {
        let pad = Math.ceil(blur * 1.5);
        let canvas = document.createElement("canvas");
        canvas.width = size + pad * 2;
        canvas.height = size + pad * 2;
        let spriteCtx = canvas.getContext("2d");
        spriteCtx.shadowBlur = blur;
        spriteCtx.shadowColor = color;
        spriteCtx.fillStyle = color;
        spriteCtx.fillRect(pad, pad, size, size);
        spriteCache[key] = { canvas: canvas, pad: pad };
    }
    return spriteCache[key];
}
