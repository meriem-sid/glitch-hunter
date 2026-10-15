// Bug types. Each respawn picks one; the rarer ones only unlock after a few slices
// so a first-time player starts with plain bugs.
//
// Visual rule for players: square things are bugs (slice them), round spiky red things are
// bombs (don't touch). Red is kept for danger only, which is why no bug type is red.
export const BOMB_COLOR = "#ff2a2a";

export const BUG_TYPES = {
    normal:  { size: 40, speed: 1.0, hp: 1, points: 10,  color: "lime",    spinRate: 1 },
    fast:    { size: 26, speed: 1.6, hp: 1, points: 20,  color: "cyan",    spinRate: 2.5 },
    armored: { size: 50, speed: 0.7, hp: 2, points: 30,  color: "lime",    spinRate: 0.6 },
    gold:    { size: 44, speed: 1.2, hp: 1, points: 100, color: "#ffd700", spinRate: 1.5 }, // the ITC bug
    volatile:{ size: 40, speed: 0.9, hp: 1, points: 15,  color: "#ff8c1a", spinRate: 0.8 }  // explodes, taking its neighbours with it (good to slice)
};

// chance of each special type per respawn, and how many slices into the round it unlocks
const SPAWN_RULES = [
    { type: "gold",    chance: 0.04, unlocksAt: 3 },
    { type: "volatile",chance: 0.08, unlocksAt: 10 },
    { type: "armored", chance: 0.15, unlocksAt: 15 },
    { type: "fast",    chance: 0.20, unlocksAt: 5 }
];

// The rotation a bug is drawn at right now. Shared by the renderer and the slicing code
// so the pieces split off exactly the shape the player saw.
export function getBugAngle(state, bug) {
    return (state.angle + bug.spin) * BUG_TYPES[bug.type].spinRate;
}

export function chooseBugType(slices) {
    let roll = Math.random();
    for (let i = 0; i < SPAWN_RULES.length; i = i + 1) {
        let rule = SPAWN_RULES[i];
        if (slices < rule.unlocksAt) continue;
        if (roll < rule.chance) return rule.type;
        roll = roll - rule.chance;
    }
    return "normal";
}
