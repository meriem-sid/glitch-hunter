// Falling power-ups: slice one to collect it.
//   SHIELD     blocks the next bomb hit (physics.js uses it up instead of a life)
//   WIDE BLADE bugs count as hit from further away (physics.js widens the hit box)
//   MAGNET     nearby bugs drift towards your finger
// Times are in 60fps frames, counted with `step` like everything else.
import { segmentHitsBox, isOnScreen } from "./physics.js";

export const POWERUP_TYPES = {
    shield: { name: "SHIELD",     letter: "S", color: "cyan",    duration: 0 },
    wide:   { name: "WIDE BLADE", letter: "W", color: "white",   duration: 600 }, // 10 s
    magnet: { name: "MAGNET",     letter: "M", color: "#ff9900", duration: 480 }  // 8 s
};

export const POWERUP_SIZE = 46;
const UNLOCK_LEVEL = 2;          // none at level 1, so beginners learn the basics first
const SPAWN_MIN = 900;           // a new one every 15...
const SPAWN_MAX = 1500;          // ...to 25 s of play
const FALL_SPEED = 2.5;          // slower than bugs, so there's time to go for it
const WOBBLE = 30;               // drifts this many pixels side to side as it falls
const MAGNET_RANGE = 260;
const MAGNET_PULL = 0.03;        // share of the distance to the finger a bug moves each frame

export function updatePowerups(state, width, height, step) {
    state.powers.wide = Math.max(0, state.powers.wide - step);
    state.powers.magnet = Math.max(0, state.powers.magnet - step);

    // one at a time, from level 2
    if (state.level >= UNLOCK_LEVEL && state.powerups.length === 0) {
        state.powerupTimer = state.powerupTimer - step;
        if (state.powerupTimer <= 0) {
            spawnPowerup(state, width);
            state.powerupTimer = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
        }
    }

    let swipe = state.swipe;
    let kept = [];
    for (let i = 0; i < state.powerups.length; i = i + 1) {
        let powerup = state.powerups[i];
        powerup.age = powerup.age + step;
        powerup.y = powerup.y + FALL_SPEED * step;
        powerup.x = powerup.baseX + Math.sin(powerup.age * 0.05) * WOBBLE;

        if (swipe && segmentHitsBox(swipe, powerup)) {
            collect(state, powerup);
        } else if (powerup.y < height) {
            kept.push(powerup);
        }
    }
    state.powerups = kept;

    // MAGNET: bugs near the finger drift sideways towards it
    if (state.powers.magnet > 0 && state.handVisible) {
        for (let i = 0; i < state.bugs.length; i = i + 1) {
            let bug = state.bugs[i];
            if (!isOnScreen(bug)) continue;
            let dx = state.finger.x - (bug.x + bug.size / 2);
            let dy = state.finger.y - (bug.y + bug.size / 2);
            if (Math.hypot(dx, dy) < MAGNET_RANGE) {
                bug.x = bug.x + dx * MAGNET_PULL * step;
            }
        }
    }
}

function spawnPowerup(state, width) {
    let kinds = Object.keys(POWERUP_TYPES);
    let kind = kinds[Math.floor(Math.random() * kinds.length)];
    let baseX = WOBBLE + Math.random() * (width - POWERUP_SIZE - WOBBLE * 2);
    state.powerups.push({ kind: kind, x: baseX, baseX: baseX, y: -POWERUP_SIZE, size: POWERUP_SIZE, age: 0 });
}

function collect(state, powerup) {
    let type = POWERUP_TYPES[powerup.kind];
    if (powerup.kind === "shield") {
        state.powers.shield = true;
    } else {
        state.powers[powerup.kind] = type.duration;
    }
    state.events.push({
        type: "powerup", kind: powerup.kind, name: type.name, color: type.color,
        x: powerup.x + powerup.size / 2, y: powerup.y + powerup.size / 2
    });
}
