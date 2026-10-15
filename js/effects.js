// Game-feel effects driven by this frame's events: screen shake, hit-stop and floating score popups.
// All amounts are in 60fps frames / pixels, counted with `step` like everything else.
import { BUG_TYPES, BOMB_COLOR } from "./enemies.js";
import { getThemeHue } from "./theme.js";
import { triggerGlitch } from "./glitch.js";
import { QUALITY } from "./perf.js";

const POPUP_LIFE = 45;      // ~0.75 s
const POPUP_RISE = 1.2;     // pixels per frame
const SHAKE_DECAY = 0.85;   // shake keeps 85% of its strength each frame
const BOMB_HIT_STOP = 5;    // ~80 ms freeze when a bomb hits
const BANNER_FRAMES = 90;   // 1.5 s
const RING_LIFE = 24;       // explosion rings expand and fade over 0.4 s
const CONFETTI_LIFE = 220;  // ~3.7 s
const CONFETTI_GRAVITY = 0.18;
const CONFETTI_MAX_FALL = 3.5; // paper flutters down instead of dropping like a stone
const CELEBRATE_FRAMES = 300; // confetti rain on the game over screen for a new #1 (5 s)
const CONFETTI_COLORS = ["#ffd700", "cyan", "magenta", "lime", "white"];

// how hard each event shakes the screen, in pixels
const SHAKE = { bomb: 16, gameOver: 28, purge: 22, chainBomb: 8, volatile: 20, shieldBreak: 10, bossStart: 12, bossHit: 4, bossDefeated: 30 };

// width/height: the screen size, so confetti can be launched from its corners.
export function applyEffects(state, width = 1280, height = 720) {
    for (let i = 0; i < state.events.length; i = i + 1) {
        let event = state.events[i];

        if (event.type === "slice") {
            addPopup(state, event.x, event.y, "+" + event.points, BUG_TYPES[event.kind].color, event.points);
        } else if (event.type === "debris") {
            addPopup(state, event.x, event.y, "+" + event.points, event.color, event.points);
        } else if (event.type === "armor") {
            addPopup(state, event.x, event.y, "CRACK", "white", 10);
        } else if (event.type === "bomb") {
            addPopup(state, event.x, event.y, "-1 LIFE", BOMB_COLOR, 30);
            addRing(state, event.x, event.y, 180, BOMB_COLOR); // the shockwave (see physics.js)
            shake(state, SHAKE.bomb);
            state.hitStop = BOMB_HIT_STOP;
            triggerGlitch(state, 0.8, 18);
        } else if (event.type === "chainBomb") {
            addRing(state, event.x, event.y, 110, BOMB_COLOR);
            shake(state, SHAKE.chainBomb);
        } else if (event.type === "volatile") {
            addRing(state, event.x, event.y, 160, BUG_TYPES.volatile.color);
            shake(state, SHAKE.volatile);
            triggerGlitch(state, 0.4, 10);
        } else if (event.type === "gameOver") {
            shake(state, SHAKE.gameOver);
            triggerGlitch(state, 0.6, 20);
        } else if (event.type === "spell" && event.key === "purge") {
            shake(state, SHAKE.purge);
        } else if (event.type === "powerup") {
            addPopup(state, event.x, event.y, event.name + "!", event.color, 40);
            addRing(state, event.x, event.y, 80, event.color);
        } else if (event.type === "shieldBreak") {
            addPopup(state, event.x, event.y, "SHIELD SAVED YOU", "cyan", 30);
            addRing(state, event.x, event.y, 180, "cyan");
            shake(state, SHAKE.shieldBreak);
            triggerGlitch(state, 0.3, 8);
        } else if (event.type === "bossStart") {
            showBanner(state, "WARNING: VIRUS DETECTED", "#ff3030", 150);
            shake(state, SHAKE.bossStart);
            triggerGlitch(state, 1, 40);
        } else if (event.type === "bossHit") {
            addPopup(state, event.x + (Math.random() - 0.5) * 60, event.y, "-" + event.amount, "magenta", 10 + event.amount * 6);
            shake(state, SHAKE.bossHit);
        } else if (event.type === "bossDefeated") {
            showBanner(state, "VIRUS DESTROYED +" + event.reward, "lime", 150);
            state.flash = 1;
            shake(state, SHAKE.bossDefeated);
            addRing(state, event.x, event.y, 260, "magenta");
            addRing(state, event.x, event.y, 180, "#ff3030");
            addRing(state, event.x, event.y, 110, "white");
            triggerGlitch(state, 0.7, 30);
        } else if (event.type === "multiSlice") {
            addPopup(state, event.x, event.y - 30, event.label + " +" + event.bonus, "white", 40 + event.bonus / 4);
        } else if (event.type === "feverStart") {
            showBanner(state, "FEVER! x2 POINTS", "yellow");
            state.flash = Math.max(state.flash, 0.5);
            triggerGlitch(state, 0.4, 12);
        } else if (event.type === "newRecord") {
            showBanner(state, "NEW RECORD!", "#ffd700", 120);
            launchConfetti(state, width, height, 120);
            state.flash = Math.max(state.flash, 0.3);
        } else if (event.type === "newTopScore") {
            launchConfetti(state, width, height, 160);
            state.celebrateTimer = CELEBRATE_FRAMES;
        } else if (event.type === "levelUp") {
            showBanner(state, "LEVEL " + event.level, "hsl(" + Math.round(getThemeHue(state)) + ", 100%, 65%)");
            triggerGlitch(state, 0.5, 25);
        }
    }
}

export function updateEffects(state, step, width = 1280) {
    state.shake = state.shake * Math.pow(SHAKE_DECAY, step);
    if (state.shake < 0.5) state.shake = 0;

    for (let i = 0; i < state.popups.length; i = i + 1) {
        let popup = state.popups[i];
        popup.y = popup.y - POPUP_RISE * step;
        popup.life = popup.life - step;
    }
    state.popups = state.popups.filter(p => p.life > 0);

    for (let i = 0; i < state.rings.length; i = i + 1) {
        let ring = state.rings[i];
        ring.life = ring.life - step;
        let progress = 1 - Math.max(0, ring.life) / ring.maxLife;
        ring.radius = ring.maxRadius * (1 - (1 - progress) * (1 - progress)); // fast at first, then easing out
    }
    state.rings = state.rings.filter(r => r.life > 0);

    // a new #1 on the game over screen: confetti keeps raining for a while
    if (state.celebrateTimer > 0 && state.screen === "gameover") {
        state.celebrateTimer = Math.max(0, state.celebrateTimer - step);
        if (Math.random() < 0.6 * step) dropConfetti(state, width);
    }
    for (let i = 0; i < state.confetti.length; i = i + 1) {
        let c = state.confetti[i];
        c.vy = Math.min(c.vy + CONFETTI_GRAVITY * step, CONFETTI_MAX_FALL);
        c.vx = c.vx * Math.pow(0.98, step);
        c.x = c.x + (c.vx + Math.sin(c.life * 0.15 + c.seed) * 0.8) * step; // side-to-side flutter
        c.y = c.y + c.vy * step;
        c.rot = c.rot + c.vrot * step;
        c.flip = c.flip + 0.2 * step;
        c.life = c.life - step;
    }
    state.confetti = state.confetti.filter(c => c.life > 0);
    let maxConfetti = QUALITY[state.quality].maxConfetti;
    if (state.confetti.length > maxConfetti) {
        state.confetti.splice(0, state.confetti.length - maxConfetti);
    }
}

// Two confetti cannons firing up from the bottom corners.
function launchConfetti(state, width, height, count) {
    for (let i = 0; i < count; i = i + 1) {
        let fromLeft = i % 2 === 0;
        addConfetti(state, fromLeft ? 0 : width, height,
            (fromLeft ? 1 : -1) * (3 + Math.random() * 7), -(10 + Math.random() * 9));
    }
}

// One piece falling from a random spot along the top.
function dropConfetti(state, width) {
    addConfetti(state, Math.random() * width, -10, (Math.random() - 0.5) * 2, 1 + Math.random() * 2);
}

function addConfetti(state, x, y, vx, vy) {
    state.confetti.push({
        x: x, y: y, vx: vx, vy: vy,
        rot: Math.random() * Math.PI, vrot: (Math.random() - 0.5) * 0.3,
        flip: Math.random() * Math.PI, seed: Math.random() * 10,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 4,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        life: CONFETTI_LIFE
    });
}

export function addRing(state, x, y, maxRadius, color) {
    state.rings.push({ x: x, y: y, radius: 0, maxRadius: maxRadius, life: RING_LIFE, maxLife: RING_LIFE, color: color });
}

// Bigger rewards get bigger text: +10 is small, +100 is large.
function addPopup(state, x, y, text, color, points) {
    let size = Math.min(24 + points / 2, 64); // +10 → 29px, +20 → 34px, +50 → 49px, +100 → 64px
    state.popups.push({ x: x, y: y, text: text, color: color, size: size, life: POPUP_LIFE, maxLife: POPUP_LIFE });
}

// Big centred message (drawn by drawSpellEffects, counted down in spells.js).
export function showBanner(state, text, color, frames = BANNER_FRAMES) {
    state.banner = { text: text, color: color, timer: frames };
}

function shake(state, amount) {
    state.shake = Math.max(state.shake, amount);
}
