// Levels and the background colour theme. The grid, sky and sun take their colour from here,
// and shift more (and faster) as the level rises, so the screen itself shows the game heating up.

export const SLICES_PER_LEVEL = 10;

// base colour of each level, in hue degrees: cyan, purple, magenta, red, gold, then round again
const LEVEL_HUES = [180, 275, 310, 350, 45];

export function getLevel(slices) {
    return 1 + Math.floor(slices / SLICES_PER_LEVEL);
}

// The menus always show level 1's calm colours; play and game over show the round's level.
function displayLevel(state) {
    return state.screen === "start" ? 1 : state.level;
}

// Hue of the grid, sky and sun right now.
export function getThemeHue(state) {
    if (state.fever) {
        return (state.angle * 60) % 360; // FEVER: the full rainbow, about every 2 seconds
    }
    let level = displayLevel(state);
    let base = LEVEL_HUES[(level - 1) % LEVEL_HUES.length];
    let drift = Math.min(10 + level * 6, 45);  // how far the colour swings either side, in degrees
    let speed = 0.3 + level * 0.12;            // and how fast
    return (base + Math.sin(state.angle * speed) * drift + 360) % 360;
}

// A 0–1 beat for the grid's brightness. Barely there at level 1, strong at high levels.
export function getPulse(state) {
    let level = displayLevel(state);
    let strength = Math.min(0.1 + level * 0.06, 0.5);
    let beat = 0.5 + 0.5 * Math.sin(state.angle * (2 + level * 0.3));
    return 1 - strength + strength * beat;
}

// The grid scrolls faster as the level rises.
export function getGridSpeed(state) {
    return 0.05 * (1 + 0.12 * (displayLevel(state) - 1));
}
