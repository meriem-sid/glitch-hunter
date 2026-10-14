// Menu button logic: press by holding your fingertip over it, or with Space/Enter/click as a fallback.
// Also handles typing a name for the leaderboard.
import { addScore, NAME_MAX_LENGTH } from "./leaderboard.js";
import { QUALITY_LOCKS } from "./perf.js";

export const BUTTON_HOLD_FRAMES = 90; // ~1.5 s at 60fps

const BUTTON_WIDTH = 300;
const BUTTON_HEIGHT = 90;

let keyPressed = false;

export function listenForKeys(canvas, state) {
    window.addEventListener("keydown", (event) => {
        if (state.enteringName) {
            handleNameKey(state, event);
            return;
        }
        if (event.code === "Space" || event.code === "Enter") {
            keyPressed = true;
        }
        // volunteer keys: F shows the FPS overlay, Q cycles auto / high / medium / low quality
        if (event.code === "KeyF") {
            state.showPerf = !state.showPerf;
        }
        if (event.code === "KeyQ") {
            let next = (QUALITY_LOCKS.indexOf(state.qualityLock) + 1) % QUALITY_LOCKS.length;
            state.qualityLock = QUALITY_LOCKS[next];
        }
    });
    canvas.addEventListener("click", () => {
        if (!state.enteringName) keyPressed = true;
    });
}

// Save the typed name (or "HUNTER" if blank) and close the name box. Also used by the idle timeout.
export function submitName(state) {
    addScore(state, state.playerName.trim() || "HUNTER");
    state.enteringName = false;
    state.events.push({ type: "saved" });
}

function handleNameKey(state, event) {
    event.preventDefault();
    state.nameIdle = 0; // any key counts as activity

    if (event.key === "Enter") {
        submitName(state);
    } else if (event.key === "Escape") {
        state.enteringName = false; // skip without saving
    } else if (event.key === "Backspace") {
        state.playerName = state.playerName.slice(0, -1);
    } else if (/^[a-zA-Z0-9 _-]$/.test(event.key) && state.playerName.length < NAME_MAX_LENGTH) {
        state.playerName = state.playerName + event.key.toUpperCase();
    }
}

// Returns true once per key press/click, then clears it.
export function consumeKeyPress() {
    let pressed = keyPressed;
    keyPressed = false;
    return pressed;
}

export function getButtonRect(canvas) {
    return {
        x: canvas.width / 2 - BUTTON_WIDTH / 2,
        y: canvas.height - BUTTON_HEIGHT - 50, // bottom of the screen, leaving room for the leaderboard
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT
    };
}

// Returns true on the frame the hold completes. `step` is time passed in 60fps frames.
export function updateButton(state, rect, step) {
    let inside = state.handVisible &&
        state.finger.x > rect.x && state.finger.x < rect.x + rect.width &&
        state.finger.y > rect.y && state.finger.y < rect.y + rect.height;

    if (!inside) {
        state.buttonHold = 0;
        state.buttonArmed = true;
        return false;
    }
    if (!state.buttonArmed) return false;

    state.buttonHold = state.buttonHold + step;
    if (state.buttonHold >= BUTTON_HOLD_FRAMES) {
        state.buttonHold = 0;
        return true;
    }
    return false;
}
