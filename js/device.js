// Phone / tablet detection, for the few places the game behaves differently there.
// A touchscreen as the main pointer is the most reliable sign (laptops with touchscreens
// still report a mouse or trackpad as their main pointer).
export const IS_PHONE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

// The game is laid out for a laptop screen. On anything smaller it's drawn at at least this
// size and scaled down to fit, so the title, leaderboard and buttons never overflow.
const MIN_WIDTH = 820;
const MIN_HEIGHT = 560;

// Size the canvas for the current window. Returns how much its drawing size changed, so
// whatever is on screen can be moved to match.
export function fitCanvas(canvas) {
    let width = window.innerWidth;
    let height = window.innerHeight;
    let zoom = Math.max(1, MIN_WIDTH / width, MIN_HEIGHT / height);
    let newWidth = Math.round(width * zoom);
    let newHeight = Math.round(height * zoom);
    let change = { x: newWidth / (canvas.width || newWidth), y: newHeight / (canvas.height || newHeight) };

    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    return change;
}
