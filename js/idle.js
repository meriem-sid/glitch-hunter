// Keeps the stand running unattended: when a player walks away, the game goes back to the start screen.
// All timeouts are in 60fps frames (60 = 1 second), counted with `step` like everything else.
import { submitName } from "./ui.js";

export const ROUND_TIMEOUT = 600;     // 10 s with no hand during a round: abandon it
export const GAME_OVER_TIMEOUT = 1200; // 20 s with no hand on the game over screen
export const NAME_TIMEOUT = 1800;     // 30 s with no key pressed while typing a name: save it
export const HAND_LOST_WARNING = 60;  // show "SHOW YOUR HAND" after 1 s without a hand

export function updateIdle(state, step) {
    if (state.enteringName) {
        state.nameIdle = state.nameIdle + step;
        if (state.nameIdle >= NAME_TIMEOUT) {
            submitName(state); // the score was earned, so keep it rather than throw it away
            state.handIdle = 0;
        }
        return;
    }

    if (state.screen === "start" || state.handVisible) {
        state.handIdle = 0;
        return;
    }

    state.handIdle = state.handIdle + step;
    let timeout = state.screen === "playing" ? ROUND_TIMEOUT : GAME_OVER_TIMEOUT;
    if (state.handIdle >= timeout) {
        goToStartScreen(state);
    }
}

function goToStartScreen(state) {
    state.screen = "start";
    state.handIdle = 0;
    state.buttonHold = 0;
    state.buttonArmed = true;
    state.lastSavedIndex = -1;
}
