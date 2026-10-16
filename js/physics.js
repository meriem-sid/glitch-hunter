// Movement, collisions, scoring and particle simulation. No drawing happens here.
import { TRAIL_LENGTH, makeEntity } from "./state.js";
import { BUG_TYPES, BOMB_COLOR, chooseBugType } from "./enemies.js";
import { shatterBug, updateDebris } from "./debris.js";
import { QUALITY } from "./perf.js";
import { getLevel, getGridSpeed } from "./theme.js";
import { smoothFinger } from "./smoothing.js";

const ARMOR_HIT_COOLDOWN = 15; // ~0.25 s before a cracked armored bug can be hit again
const COMBO_STEP = 5;
const MAX_MULTIPLIER = 5;
const SLOW_TIME_SCALE = 0.4;
const BUGS_EVERY = 8;     // one more bug on screen every 8 slices...
const MAX_BUGS = 4;       // ...up to 4
const BOMBS_EVERY = 30;   // one more bomb every 30 slices...
const MAX_BOMBS = 3;      // ...up to 3
const SPEED_PER_SLICE = 0.1; // everything falls this much faster (px per frame) for each bug sliced...
const MAX_EXTRA_SPEED = 6;   // ...up to this much faster than at the start
const SPAWN_SPREAD = 250; // respawns start up to this many pixels above the screen, so arrivals are staggered
const PLAY_MARGIN = 0.18; // nothing drops in the outer 18% on each side: the play area is the middle 64%
const CENTER_BIAS = 0.5;  // share of drops that favour the middle; the rest spread evenly across the play area
const MAX_SWIPE_FRACTION = 0.5; // a fingertip jump wider than half the screen in one frame is a tracking glitch
const SHOCKWAVE_RADIUS = 180;  // a bomb hit throws bugs this close away, and sets off other bombs
const SHOCKWAVE_PUSH = 14;     // knockback speed right next to the blast, fading to 0 at the edge
const KNOCKBACK_DECAY = 0.9;   // knockback keeps 90% of its speed each frame
const VOLATILE_RADIUS = 160;   // a sliced volatile bug destroys everything this close
const MULTI_SLICE_WINDOW = 15; // blade slices less than 0.25 s apart count as one multi-slice
const FEVER_BONUS = 2;         // FEVER doubles bug points
const WIDE_BLADE_MARGIN = 30;  // WIDE BLADE power-up: bugs count as hit from this many pixels further away
const VOLATILE_BOSS_DAMAGE = 3; // a volatile blast that reaches the boss

// `step` is how much time passed this frame, measured in 60fps frames:
// 1 at 60Hz, 0.5 at 120Hz. Every speed and timer is multiplied by it so the game
// runs at the same pace on any screen.

// Background animation and blade trail. Runs on every screen, not just during play.
export function updateAmbient(state, step) {
    smoothFinger(state, step); // the blade follows a smoothed fingertip
    state.gridOffset = state.gridOffset + getGridSpeed(state) * step;
    if (state.gridOffset > 1) {
        state.gridOffset = state.gridOffset - 1;
    }
    state.angle = state.angle + 0.05 * step;

    // the trail covers a fixed span of time (TRAIL_LENGTH frames at 60fps), not a fixed number of points
    for (let i = 0; i < state.trail.length; i = i + 1) {
        state.trail[i].age = state.trail[i].age + step;
    }
    state.trail.push({ x: state.finger.x, y: state.finger.y, age: 0 });
    state.trail = state.trail.filter(point => point.age < TRAIL_LENGTH);
}

export function update(state, width, height, step) {
    updateAmbient(state, step);

    // the path the fingertip swept since last frame, so fast slashes can't skip over a bug
    let swipe = getSwipe(state, width);
    state.swipe = swipe; // shared with power-ups and the boss this frame
    state.prevFinger = { x: state.finger.x, y: state.finger.y };
    state.prevHandVisible = state.handVisible;

    // speed ramps up with the number of bugs sliced (not score, which grows faster with combos)
    // TIME WARP spell slows everything down
    let timeScale = state.spells.slow.active > 0 ? SLOW_TIME_SCALE : 1;
    let extraSpeed = Math.min(state.slices * SPEED_PER_SLICE, MAX_EXTRA_SPEED);
    let bugSpeed = (state.baseBugSpeed + extraSpeed) * timeScale * step;
    let bombSpeed = (state.baseBombSpeed + extraSpeed) * timeScale * step;

    // more bugs and bombs join as the player gets better
    addUntil(state.bugs, getBugCount(state), bug => respawnBug(state, bug, width));
    addUntil(state.bombs, getBombCount(state), bomb => respawn(bomb, width));

    // === BUGS ===
    for (let i = 0; i < state.bugs.length; i = i + 1) {
        let bug = state.bugs[i];
        bug.y = bug.y + bugSpeed * bug.speed;
        applyKnockback(bug, width, step);
        bug.hitCooldown = Math.max(0, bug.hitCooldown - step);

        // a missed bug costs no life, it just breaks the combo
        if (bug.y > height) {
            breakCombo(state);
            respawnBug(state, bug, width);
        } else if (bug.hitCooldown === 0 && swipe && segmentHitsBox(swipe, bug, state.powers.wide > 0 ? WIDE_BLADE_MARGIN : 0)) {
            hitBug(state, bug, width, swipe);
        }
    }

    // when a boss arrives, extra bugs leave once they're off screen (the ones on screen finish falling)
    if (state.boss) {
        while (state.bugs.length > 1) {
            let offScreen = state.bugs.findIndex(b => !isOnScreen(b));
            if (offScreen === -1) break;
            state.bugs.splice(offScreen, 1);
        }
    }

    // pieces of sliced bugs: fall, fade, and can be cut again
    updateDebris(state, swipe, step, height);

    updateSwipeChain(state, step);

    // a new level every few slices (see theme.js)
    let level = getLevel(state.slices);
    if (level > state.level && !state.boss) { // frozen while a boss is on screen
        state.level = level;
        state.events.push({ type: "levelUp", level: level });
    }

    // === BOMBS ===
    for (let i = 0; i < state.bombs.length; i = i + 1) {
        let bomb = state.bombs[i];
        bomb.y = bomb.y + bombSpeed * bomb.speed;
        applyKnockback(bomb, width, step);
        if (bomb.y > height) {
            respawn(bomb, width);
        }

        // bombs only check where the fingertip is now, not the whole swipe: on a fast slash
        // the player gets the benefit of the doubt (and a tracking glitch can't cost a life).
        // A hand that left the camera can't be hit either, even though its last position is remembered.
        else if (state.handVisible && isTouching(state.finger, bomb)) {
            // SHIELD power-up: the bomb still goes off, but the shield takes the hit instead of a life
            if (state.powers.shield) {
                state.powers.shield = false;
                spawnParticles(state, bomb, BOMB_COLOR);
                state.events.push({ type: "shieldBreak", x: bomb.x + bomb.size / 2, y: bomb.y + bomb.size / 2 });
                shockwave(state, bomb, width);
                respawn(bomb, width);
                continue;
            }
            breakCombo(state);
            spawnParticles(state, bomb, BOMB_COLOR);
            state.events.push({ type: "bomb", x: bomb.x + bomb.size / 2, y: bomb.y + bomb.size / 2 });
            shockwave(state, bomb, width);
            loseLife(state);
            if (state.screen !== "playing") return;
            respawn(bomb, width);
        }
    }

    // bombs dropped by the boss go away once they've left the screen or been destroyed (respawned above it)
    state.bombs = state.bombs.filter(b => !(b.temporary && b.y < 0));

    // === PARTICLES ===
    // dead particles are removed before moving so each one is drawn on its final frame
    state.particles = state.particles.filter(p => p.life > 0);
    for (let i = 0; i < state.particles.length; i = i + 1) {
        let p = state.particles[i];
        p.x = p.x + p.vx * step;
        p.y = p.y + p.vy * step;
        p.life = p.life - step;
    }
}

// x1 for the first 4 slices in a row, x2 from 5, x3 from 10... capped at x5
export function getMultiplier(state) {
    return Math.min(1 + Math.floor(state.combo / COMBO_STEP), MAX_MULTIPLIER);
}

// A blade hit. Armored bugs lose their shell on the first hit; everything else is sliced.
function hitBug(state, bug, width, swipe) {
    bug.hp = bug.hp - 1;
    if (bug.hp > 0) {
        spawnParticles(state, bug, "white", 8);
        state.events.push({ type: "armor", x: bug.x + bug.size / 2, y: bug.y + bug.size / 2 });
        // the same slash is still inside the box next frame: don't let it count as the second hit
        bug.hitCooldown = ARMOR_HIT_COOLDOWN;
        return;
    }
    // blade slices close together build a multi-slice (blasts and SYSTEM PURGE don't count)
    state.swipeChain.count = state.swipeChain.count + 1;
    state.swipeChain.timer = MULTI_SLICE_WINDOW;
    state.swipeChain.x = bug.x + bug.size / 2;
    state.swipeChain.y = bug.y + bug.size / 2;
    sliceBug(state, bug, width, 10, swipe);
}

// When no blade slice has followed for a moment, pay out the multi-slice bonus, if any.
function updateSwipeChain(state, step) {
    let chain = state.swipeChain;
    if (chain.timer <= 0) return;
    chain.timer = chain.timer - step;
    if (chain.timer > 0) return;

    if (chain.count >= 2) {
        let bonus, label;
        if (chain.count === 2) {
            bonus = 20;
            label = "DOUBLE SLICE";
        } else if (chain.count === 3) {
            bonus = 50;
            label = "TRIPLE SLICE";
        } else {
            bonus = 50 + 100 * (chain.count - 3);
            label = "MEGA SLICE x" + chain.count;
        }
        state.score = state.score + bonus;
        state.events.push({ type: "multiSlice", count: chain.count, bonus: bonus, label: label, x: chain.x, y: chain.y });
    }
    chain.count = 0;
}

// A missed bug or a bomb hit resets the combo, and ends FEVER.
function breakCombo(state) {
    state.combo = 0;
    if (state.fever) {
        state.fever = false;
        state.events.push({ type: "feverEnd" });
    }
}

// Score the bug, split it along the swipe and send it back to the top.
// Also used by the SYSTEM PURGE spell, which has no swipe, so the cut angle is random.
export function sliceBug(state, bug, width, particleCount, swipe = null) {
    let bugType = BUG_TYPES[bug.type];
    let multiplierBefore = getMultiplier(state);
    state.slices = state.slices + 1;
    state.combo = state.combo + 1;
    // reaching the top multiplier starts FEVER, which lasts until the combo breaks
    if (!state.fever && getMultiplier(state) >= MAX_MULTIPLIER) {
        state.fever = true;
        state.events.push({ type: "feverStart" });
    }
    let spellBonus = state.spells.double.active > 0 ? 2 : 1; // DOUBLE DATA spell
    let feverBonus = state.fever ? FEVER_BONUS : 1;
    let points = bugType.points * getMultiplier(state) * spellBonus * feverBonus;
    state.score = state.score + points;

    state.events.push({
        type: "slice", kind: bug.type, combo: state.combo, points: points,
        x: bug.x + bug.size / 2, y: bug.y + bug.size / 2
    });
    if (getMultiplier(state) > multiplierBefore) {
        state.events.push({ type: "comboUp" });
    }
    spawnParticles(state, bug, bugType.color, bug.type === "gold" ? particleCount * 3 : particleCount);
    shatterBug(state, bug, swipe);

    let wasVolatile = bug.type === "volatile";
    let cx = bug.x + bug.size / 2;
    let cy = bug.y + bug.size / 2;
    respawnBug(state, bug, width); // first, so the blast can't catch this same bug again
    if (wasVolatile) {
        explodeVolatile(state, cx, cy, width);
    }
}

// A sliced volatile bug blows up: every bug in range is sliced for points (counting towards the
// combo), every bomb in range is destroyed harmlessly. A volatile bug caught in the blast sets off
// its own blast. That can't loop forever: sliced bugs respawn above the screen, out of reach.
function explodeVolatile(state, x, y, width) {
    state.events.push({ type: "volatile", x: x, y: y });

    for (let i = 0; i < state.bugs.length; i = i + 1) {
        let bug = state.bugs[i];
        if (isOnScreen(bug) && distanceTo(bug, x, y) < VOLATILE_RADIUS) {
            sliceBug(state, bug, width, 10);
        }
    }
    for (let i = 0; i < state.bombs.length; i = i + 1) {
        let bomb = state.bombs[i];
        if (isOnScreen(bomb) && distanceTo(bomb, x, y) < VOLATILE_RADIUS) {
            destroyBomb(state, bomb, width);
        }
    }
    if (state.boss && distanceTo(state.boss, x, y) < VOLATILE_RADIUS + state.boss.size / 2) {
        state.boss.queuedDamage = state.boss.queuedDamage + VOLATILE_BOSS_DAMAGE;
    }
}

// A bomb hit sends out a shockwave: nearby bugs are thrown away from it, spinning, and other
// bombs nearby go off too, without costing extra lives.
function shockwave(state, hitBomb, width) {
    let x = hitBomb.x + hitBomb.size / 2;
    let y = hitBomb.y + hitBomb.size / 2;

    for (let i = 0; i < state.bugs.length; i = i + 1) {
        let bug = state.bugs[i];
        let distance = distanceTo(bug, x, y);
        if (!isOnScreen(bug) || distance >= SHOCKWAVE_RADIUS) continue;

        let strength = SHOCKWAVE_PUSH * (1 - distance / SHOCKWAVE_RADIUS);
        let dx = (bug.x + bug.size / 2 - x) / Math.max(distance, 1);
        let dy = (bug.y + bug.size / 2 - y) / Math.max(distance, 1);
        bug.kx = bug.kx + dx * strength;
        bug.ky = bug.ky + dy * strength * 0.6 - 2; // thrown a little upwards as well
        bug.spin = bug.spin + (Math.random() - 0.5) * 3;
    }
    for (let i = 0; i < state.bombs.length; i = i + 1) {
        let bomb = state.bombs[i];
        if (bomb !== hitBomb && isOnScreen(bomb) && distanceTo(bomb, x, y) < SHOCKWAVE_RADIUS) {
            destroyBomb(state, bomb, width);
        }
    }
}

// A bomb blown up by something other than the player: no life lost.
function destroyBomb(state, bomb, width) {
    spawnParticles(state, bomb, BOMB_COLOR, 15);
    state.events.push({ type: "chainBomb", x: bomb.x + bomb.size / 2, y: bomb.y + bomb.size / 2 });
    respawn(bomb, width);
}

// Move an entity by its knockback, which fades out; keep it on screen sideways.
function applyKnockback(entity, width, step) {
    if (entity.kx === 0 && entity.ky === 0) return;
    entity.x = Math.max(0, Math.min(width - entity.size, entity.x + entity.kx * step));
    entity.y = entity.y + entity.ky * step;
    let decay = Math.pow(KNOCKBACK_DECAY, step);
    entity.kx = Math.abs(entity.kx * decay) < 0.05 ? 0 : entity.kx * decay;
    entity.ky = Math.abs(entity.ky * decay) < 0.05 ? 0 : entity.ky * decay;
}

function distanceTo(entity, x, y) {
    return Math.hypot(entity.x + entity.size / 2 - x, entity.y + entity.size / 2 - y);
}

// Respawn as a freshly chosen type (see enemies.js).
function respawnBug(state, bug, width) {
    let type = chooseBugType(state.slices);
    let bugType = BUG_TYPES[type];
    bug.type = type;
    bug.size = bugType.size;
    bug.hp = bugType.hp;
    bug.hitCooldown = 0;
    respawn(bug, width);
    bug.speed = bug.speed * bugType.speed;
}

// 1 bug at the start, +1 every BUGS_EVERY slices; 1 bomb, +1 every BOMBS_EVERY slices.
// During a boss fight, just 1 bug.
function getBugCount(state) {
    if (state.boss) return 1;
    return Math.min(1 + Math.floor(state.slices / BUGS_EVERY), MAX_BUGS);
}

function getBombCount(state) {
    return Math.min(1 + Math.floor(state.slices / BOMBS_EVERY), MAX_BOMBS);
}

// New arrivals start above the screen, so they drop in rather than pop up.
function addUntil(list, count, respawnNew) {
    while (list.length < count) {
        let entity = makeEntity(0, 0);
        respawnNew(entity);
        list.push(entity);
    }
}

// Is any part of the entity on screen? (used by SYSTEM PURGE)
export function isOnScreen(entity) {
    return entity.y > -entity.size;
}

function isTouching(point, entity) {
    return point.x > entity.x && point.x < entity.x + entity.size &&
           point.y > entity.y && point.y < entity.y + entity.size;
}

// Line from last frame's fingertip to this frame's, or null when there's no trustworthy swipe:
// the hand wasn't seen on both frames, or it jumped further than a real slash could
// (MediaPipe sometimes loses the hand and finds it again somewhere else).
function getSwipe(state, width) {
    if (!state.handVisible) return null;
    let from = state.prevFinger;
    let to = state.finger;
    let jumpedTooFar = Math.hypot(to.x - from.x, to.y - from.y) > width * MAX_SWIPE_FRACTION;
    if (!state.prevHandVisible || jumpedTooFar) {
        return { x1: to.x, y1: to.y, x2: to.x, y2: to.y }; // just the current point
    }
    return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
}

// Does the line segment pass through the entity's box, grown by `margin` on every side?
// (Liang-Barsky clipping)
export function segmentHitsBox(seg, entity, margin = 0) {
    let left = entity.x - margin;
    let top = entity.y - margin;
    let size = entity.size + margin * 2;
    let dx = seg.x2 - seg.x1;
    let dy = seg.y2 - seg.y1;
    let p = [-dx, dx, -dy, dy];
    let q = [seg.x1 - left, left + size - seg.x1,
             seg.y1 - top, top + size - seg.y1];
    let tEnter = 0;
    let tExit = 1;

    for (let i = 0; i < 4; i = i + 1) {
        if (p[i] === 0) {
            if (q[i] <= 0) return false; // parallel to this edge and outside it
        } else {
            let t = q[i] / p[i];
            if (p[i] < 0) {
                if (t > tExit) return false;
                if (t > tEnter) tEnter = t;
            } else {
                if (t < tEnter) return false;
                if (t < tExit) tExit = t;
            }
        }
    }
    return true;
}

// A random x for something `size` wide to drop at, inside the middle of the screen: far edges are
// awkward to reach with an arm, and the webcam preview and side panels cover parts of them.
// Most things land near the middle (easy to follow for someone standing back from the screen),
// some still reach the sides of the play area.
export function spawnX(width, size) {
    let left = width * PLAY_MARGIN;
    let right = width * (1 - PLAY_MARGIN) - size;
    let spot = Math.random() < CENTER_BIAS
        ? (Math.random() + Math.random()) / 2  // averaging two rolls favours the middle
        : Math.random();                       // anywhere in the play area
    return left + spot * Math.max(0, right - left);
}

// Send an entity back above the top of the screen. The random height, speed and spin
// keep several of them from falling in step with each other.
export function respawn(entity, width) {
    entity.x = spawnX(width, entity.size);
    entity.y = -entity.size - Math.random() * SPAWN_SPREAD;
    entity.speed = 0.85 + Math.random() * 0.3;
    entity.spin = Math.random() * Math.PI * 2;
    entity.kx = 0;
    entity.ky = 0;
}

function loseLife(state) {
    state.lives = state.lives - 1;
    if (state.lives <= 0) {
        state.screen = "gameover";
        state.events.push({ type: "gameOver" });
        // the finger must leave the button before it can be pressed, so it can't fire by accident
        state.buttonHold = 0;
        state.buttonArmed = false;
    }
}

export function spawnParticles(state, entity, color, count = 10) {
    for (let i = 0; i < count; i = i + 1) {
        state.particles.push({
            x: entity.x + entity.size / 2,
            y: entity.y + entity.size / 2,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 20,
            color: color
        });
    }
    // over the cap (lower on weaker laptops, see perf.js): drop the oldest particles first
    let maxParticles = QUALITY[state.quality].maxParticles;
    if (state.particles.length > maxParticles) {
        state.particles.splice(0, state.particles.length - maxParticles);
    }
}
