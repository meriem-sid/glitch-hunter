// The VIRUS boss: arrives every 5 levels, hovers near the top swaying side to side, drops bombs,
// and takes many slices to destroy. While it's alive the level is frozen and only one bug falls
// at a time, so the fight is the focus. Times are in 60fps frames, counted with `step`.
import { segmentHitsBox, spawnParticles } from "./physics.js";
import { shatterSquare } from "./debris.js";
import { makeEntity } from "./state.js";

export const BOSS_EVERY = 5;       // levels
const SIZE = 140;
const BASE_HP = 20;                // the first boss takes 20 slices...
const HP_PER_BOSS = 10;            // ...each later one 10 more
const ENTER_SPEED = 2;             // pixels per frame while sliding in from the top
const HOVER_HEIGHT = 0.22;         // where it settles, as a share of the screen height
const SWAY_SPEED = 0.02;
const SWAY_WIDTH = 0.3;            // sways this share of the screen width either side of the centre
const HIT_COOLDOWN = 10;           // one slash counts once, not on every frame it's inside the boss
const DROP_EVERY = 120;            // drops a bomb every 2 s at full health...
const DROP_MIN = 50;               // ...faster as it gets weaker, down to every 0.8 s
const REWARD = 500;                // points, times which boss this is

export function updateBoss(state, width, height, step) {
    if (!state.boss) {
        // one boss per BOSS_EVERY levels reached (still right if the level ever skips past a multiple of 5)
        let due = Math.floor(state.level / BOSS_EVERY) > state.bossesBeaten;
        if (due) startBoss(state, width);
        return;
    }

    let boss = state.boss;
    boss.age = boss.age + step;
    boss.hitCooldown = Math.max(0, boss.hitCooldown - step);

    // slide in from above, then sway
    let hoverY = height * HOVER_HEIGHT - boss.size / 2;
    boss.arrived = boss.y >= hoverY;
    if (!boss.arrived) {
        boss.y = Math.min(hoverY, boss.y + ENTER_SPEED * step);
    }
    boss.x = width / 2 - boss.size / 2 + Math.sin(boss.age * SWAY_SPEED) * width * SWAY_WIDTH;

    // damage from SYSTEM PURGE and volatile blasts, queued up by those (see spells.js, physics.js)
    if (boss.queuedDamage > 0) {
        let amount = boss.queuedDamage;
        boss.queuedDamage = 0;
        if (damageBoss(state, amount)) return;
    }

    // blade hits
    let swipe = state.swipe;
    if (swipe && boss.hitCooldown === 0 && boss.y > -boss.size / 2 && segmentHitsBox(swipe, boss)) {
        boss.hitCooldown = HIT_COOLDOWN;
        if (damageBoss(state, 1)) return;
    }

    // bomb drops, faster as it weakens
    if (boss.arrived) {
        boss.dropTimer = boss.dropTimer - step;
        if (boss.dropTimer <= 0) {
            let bomb = makeEntity(boss.x + boss.size / 2 - 20, boss.y + boss.size * 0.75);
            bomb.speed = 0.7;
            bomb.temporary = true; // removed when it leaves the screen, instead of respawning (see physics.js)
            state.bombs.push(bomb);
            boss.dropTimer = Math.max(DROP_MIN, DROP_EVERY * (0.4 + 0.6 * boss.hp / boss.maxHp));
        }
    }
}

function startBoss(state, width) {
    let maxHp = BASE_HP + HP_PER_BOSS * state.bossesBeaten;
    state.boss = {
        x: width / 2 - SIZE / 2, y: -SIZE, size: SIZE,
        hp: maxHp, maxHp: maxHp,
        age: 0, hitCooldown: 0, dropTimer: DROP_EVERY, queuedDamage: 0, arrived: false
    };
    state.events.push({ type: "bossStart", number: state.bossesBeaten + 1 });
}

// Returns true if this destroyed the boss.
function damageBoss(state, amount) {
    let boss = state.boss;
    boss.hp = boss.hp - amount;
    spawnParticles(state, boss, "magenta", 12);
    state.events.push({ type: "bossHit", amount: amount, x: boss.x + boss.size / 2, y: boss.y + boss.size / 2 });
    if (boss.hp > 0) return false;

    let reward = REWARD * (state.bossesBeaten + 1);
    let center = { x: boss.x + boss.size / 2, y: boss.y + boss.size / 2 };
    state.score = state.score + reward;
    state.bossesBeaten = state.bossesBeaten + 1;

    // a huge explosion: two random cuts through its body (four big, re-sliceable pieces) and sparks
    shatterSquare(state, center, boss.size / 2, boss.age * 0.03, "magenta", null);
    shatterSquare(state, center, boss.size / 2.6, -boss.age * 0.05, "#ff3030", null);
    spawnParticles(state, boss, "magenta", 40);
    spawnParticles(state, boss, "#ff3030", 30);
    state.events.push({ type: "bossDefeated", reward: reward, x: center.x, y: center.y });
    state.boss = null;
    return true;
}
