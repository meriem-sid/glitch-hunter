// Entry point: wires state, input, physics and rendering together and runs the loop.
import { createState, resetRound, scaleWorld } from "./state.js";
import { startHandTracking } from "./input.js";
import { update, updateAmbient } from "./physics.js";
import { renderWorld, renderStartScreen, renderGameOverScreen, drawPerfOverlay, drawTrackingDebug, drawNotice } from "./renderer.js";
import { getButtonRect, updateButton, listenForKeys, consumeKeyPress } from "./ui.js";
import { loadLeaderboard, qualifies, checkNewRecord, isNewTop } from "./leaderboard.js";
import { updateSpells } from "./spells.js";
import { updateIdle } from "./idle.js";
import { listenForAudioUnlock, getSoundStatus, playSound } from "./audio.js";
import { applyEffects, updateEffects } from "./effects.js";
import { QUALITY, createPerfMonitor, updatePerf, installGlowScaling } from "./perf.js";
import { updateGlitch, applyGlitch } from "./glitch.js";
import { startMusic, setMusicMood } from "./music.js";
import { updatePowerups } from "./powerups.js";
import { updateBoss } from "./boss.js";
import { updateRunner } from "./runner.js";
import { IS_PHONE, fitCanvas } from "./device.js";
import { addScore } from "./leaderboard.js";

const canvas = document.getElementById("gameCanvas");
fitCanvas(canvas);
const ctx = canvas.getContext("2d");

const videoElement = document.getElementById("webcam");

const state = createState();

// every glow drawn on this canvas is scaled by the current quality level (see perf.js)
installGlowScaling(ctx, () => QUALITY[state.quality].glow);
const perfMonitor = createPerfMonitor();

// Follow the window (F11 fullscreen, a resized window, a projector plugged in mid-event).
// Everything on screen is scaled with it so bugs and bombs keep their place instead of
// ending up off-screen or falling past the new bottom edge.
// On phones this also fires when the phone is turned sideways.
window.addEventListener("resize", () => {
    if (window.innerWidth === 0 || window.innerHeight === 0) return; // minimized: keep the old size
    let change = fitCanvas(canvas);
    scaleWorld(state, change.x, change.y);
});
state.leaderboard = loadLeaderboard();
startHandTracking(videoElement, canvas, state, document.getElementById("handView"));
listenForKeys(canvas, state);
listenForAudioUnlock();

const FRAME_MS = 1000 / 60;
const MAX_STEP = 3; // after a stall or a switched tab, don't jump more than 3 frames ahead
let lastTime = performance.now();

function gameLoop(now = performance.now()) {
    // time since the last frame, in 60fps frames (1 at 60Hz, 0.5 at 120Hz)
    const frameMs = now - lastTime;
    const step = Math.max(0, Math.min(frameMs / FRAME_MS, MAX_STEP));
    lastTime = now;
    updatePerf(state, perfMonitor, frameMs);

    const buttonRect = getButtonRect(canvas);
    // read every frame so a key pressed mid-round can't restart the next game over screen
    const keyPressed = consumeKeyPress();
    updateIdle(state, step);

    if (state.screen === "playing" && state.hitStop > 0) {
        // brief freeze after a bomb hit; the blade keeps moving so the game doesn't feel stuck
        state.hitStop = Math.max(0, state.hitStop - step);
        updateAmbient(state, step);
        renderWorld(ctx, state);
    } else if (state.screen === "playing") {
        updateSpells(state, canvas.width, canvas.height, step);
        update(state, canvas.width, canvas.height, step);
        if (state.screen === "playing") {
            updatePowerups(state, canvas.width, canvas.height, step);
            updateBoss(state, canvas.width, canvas.height, step);
            checkNewRecord(state);
        }
        if (state.screen === "gameover") {
            // the round just ended: ask for a name if the score made the top 10
            state.enteringName = qualifies(state.leaderboard, state.score);
            if (state.enteringName && IS_PHONE) {
                // a phone's leaderboard is just its owner's, and a canvas can't open the phone keyboard
                state.enteringName = false;
                addScore(state, "YOU");
            }
            state.nameIdle = 0;
            state.handIdle = 0;
            // ...and celebrate a new #1 instead of the usual sad game over
            state.newTop = isNewTop(state.leaderboard, state.score);
            if (state.newTop) {
                state.events.forEach(e => { if (e.type === "gameOver") e.celebrate = true; });
                state.events.push({ type: "newTopScore", score: state.score });
            }
        }
        renderWorld(ctx, state);
    } else {
        updateAmbient(state, step);
        if (!state.enteringName && (updateButton(state, buttonRect, step) || keyPressed)) {
            resetRound(state);
        }

        if (state.screen === "start") {
            renderStartScreen(ctx, state, buttonRect);
        } else if (state.screen === "gameover") {
            renderGameOverScreen(ctx, state, buttonRect);
        } else {
            renderWorld(ctx, state); // round just started this frame
        }
    }

    updateGlitch(state, step);
    applyGlitch(ctx, state);
    drawPerfOverlay(ctx, state);
    drawTrackingDebug(ctx, state);
    drawNotice(ctx, state);
    state.notice.timer = Math.max(0, state.notice.timer - step);

    // shake, popups and sounds for everything that happened this frame
    applyEffects(state, canvas.width, canvas.height);
    updateEffects(state, step, canvas.width);
    updateRunner(state, step, canvas.width);
    state.soundStatus = getSoundStatus();
    startMusic(); // does nothing until sound is unlocked, or once it's already playing
    setMusicMood({ screen: state.screen, level: state.level, fever: !!state.fever, boss: !!state.boss });
    for (let i = 0; i < state.events.length; i = i + 1) {
        playSound(state.events[i]);
    }
    state.events.length = 0;

    requestAnimationFrame(gameLoop);
}

gameLoop();
