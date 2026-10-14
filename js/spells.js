// ITC powers: hold a hand pose to cast. Physics reads the active timers; this file casts and ticks them.
import { sliceBug, respawn, spawnParticles, isOnScreen } from "./physics.js";

// durations and cooldowns are in frames (60 = 1 second)
export const SPELLS = {
    slow:   { pose: "palm",  hint: "OPEN PALM",  name: "TIME WARP",    color: "cyan",    duration: 300, cooldown: 600 },
    double: { pose: "peace", hint: "PEACE SIGN", name: "DOUBLE DATA",  color: "lime",    duration: 480, cooldown: 720 },
    purge:  { pose: "fist",  hint: "FIST",       name: "SYSTEM PURGE", color: "magenta", duration: 0,   cooldown: 900 }
};

const POSE_HOLD_FRAMES = 20; // ~1/3 s, so a pose passing by mid-swipe doesn't cast
const BANNER_FRAMES = 90;
const PURGE_BOSS_DAMAGE = 5; // SYSTEM PURGE hits the boss for this much

// `step` is time passed in 60fps frames (see physics.js)
export function updateSpells(state, width, height, step) {
    // how long the current pose has been held
    let heldBefore = state.poseFrames;
    if (state.pose === state.heldPose) {
        state.poseFrames = state.poseFrames + step;
    } else {
        state.heldPose = state.pose;
        state.poseFrames = 0;
        heldBefore = 0;
    }
    // casts once, on the frame the hold crosses the threshold
    let holdJustCompleted = heldBefore < POSE_HOLD_FRAMES && state.poseFrames >= POSE_HOLD_FRAMES;

    for (let key in SPELLS) {
        let timers = state.spells[key];
        timers.active = Math.max(0, timers.active - step);
        timers.cooldown = Math.max(0, timers.cooldown - step);

        if (state.pose === SPELLS[key].pose && holdJustCompleted && timers.cooldown === 0) {
            cast(state, key, width);
        }
    }

    state.flash = Math.max(0, state.flash - 0.04 * step);
    state.banner.timer = Math.max(0, state.banner.timer - step);
}

function cast(state, key, width) {
    let spell = SPELLS[key];
    state.spells[key].active = spell.duration;
    state.spells[key].cooldown = spell.cooldown;
    state.banner = { text: "ITC POWER: " + spell.name, color: spell.color, timer: BANNER_FRAMES };
    state.events.push({ type: "spell", key: key });

    if (key === "purge") {
        // wipe the screen: every visible bug counts as sliced, every visible bomb is destroyed without costing a life
        for (let i = 0; i < state.bombs.length; i = i + 1) {
            if (!isOnScreen(state.bombs[i])) continue;
            spawnParticles(state, state.bombs[i], "magenta", 30);
            respawn(state.bombs[i], width);
        }
        for (let i = 0; i < state.bugs.length; i = i + 1) {
            if (!isOnScreen(state.bugs[i])) continue;
            sliceBug(state, state.bugs[i], width, 30);
        }
        if (state.boss) {
            state.boss.queuedDamage = state.boss.queuedDamage + PURGE_BOSS_DAMAGE;
        }
        state.flash = 1;
    }
}
