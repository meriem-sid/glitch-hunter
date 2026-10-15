// Everything that draws to the canvas. Reads state, never changes it.
import { BUTTON_HOLD_FRAMES } from "./ui.js";
import { BUG_TYPES, BOMB_COLOR, getBugAngle } from "./enemies.js";
import { QUALITY, getParticleSprite } from "./perf.js";
import { getMultiplier } from "./physics.js";
import { SPELLS } from "./spells.js";
import { ROUND_TIMEOUT, GAME_OVER_TIMEOUT, NAME_TIMEOUT, HAND_LOST_WARNING } from "./idle.js";
import { getThemeHue, getPulse } from "./theme.js";
import { POWERUP_TYPES } from "./powerups.js";
import { drawRunner } from "./runner.js";
import { getRank } from "./leaderboard.js";
import { IS_PHONE } from "./device.js";
import { BLADE_FEELS } from "./smoothing.js";

const GOLD = "#ffd700";
const HEART_COLOR = "#ff5aa5";
const BUG_LEGS = true; // false: plain squares, as before (legs and antennae make them read as bugs)
const BOMB_WARNING_DISTANCE = 140; // a bomb this close above the screen shows a warning sign at the top edge

// QR code to the online version (made by tools/make_qr.py), shown on the stand's menus.
const PLAY_URL_TEXT = "meriem-sid.github.io/glitch-hunter";
let qrImage = null;
if (typeof Image !== "undefined" && !IS_PHONE) { // no point showing it on a phone that's already playing
    let image = new Image();
    image.onload = () => { qrImage = image; };
    image.src = "assets/qr-play.png";
}

// Bottom-left corner of the menus: "PLAY ON YOUR PHONE" above the QR code, the address below.
function drawPhoneQr(ctx) {
    if (!qrImage) return;
    const canvas = ctx.canvas;
    let size = Math.round(Math.min(170, canvas.height * 0.22));
    let x = 24;
    let y = canvas.height - size - 40;

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = "cyan";
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
    ctx.shadowBlur = 0;
    ctx.imageSmoothingEnabled = false; // keep the squares sharp so phones can read it
    ctx.drawImage(qrImage, x, y, size, size);

    ctx.textAlign = "center";
    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "cyan";
    ctx.fillText("PLAY ON YOUR PHONE", x + size / 2, y - 14);
    ctx.font = "13px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText(PLAY_URL_TEXT, x + size / 2, y + size + 22);
    ctx.restore();
}


export function renderWorld(ctx, state) {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // the world shakes; the blade doesn't, so it always stays exactly on the fingertip
    beginShake(ctx, state);
    drawGrid(ctx, state);
    drawRunner(ctx, state);
    drawBug(ctx, state);
    drawDebris(ctx, state);
    drawBomb(ctx, state);
    drawBoss(ctx, state);
    drawPowerups(ctx, state);
    drawParticles(ctx, state);
    drawRings(ctx, state);
    drawPopups(ctx, state);
    ctx.restore();

    drawTrail(ctx, state);
    drawShield(ctx, state);
    drawSpellEffects(ctx, state);
    drawHud(ctx, state);
    drawBossHealth(ctx, state);
    drawSpellPanel(ctx, state);
    drawHandLostWarning(ctx, state);
    drawSoundStatus(ctx, state);
    drawConfetti(ctx, state);
}

// Offsets everything drawn until the matching ctx.restore() by a random jolt.
function beginShake(ctx, state) {
    ctx.save();
    if (state.shake > 0) {
        ctx.translate((Math.random() - 0.5) * 2 * state.shake, (Math.random() - 0.5) * 2 * state.shake);
    }
}

// The VIRUS boss: two counter-rotating octagons with its name upright in the middle.
// It flashes white for a moment each time it's hit.
function drawBoss(ctx, state) {
    let boss = state.boss;
    if (!boss) return;
    let half = boss.size / 2;
    let hit = boss.hitCooldown > 0;

    ctx.save();
    ctx.translate(boss.x + half, boss.y + half);
    ctx.lineWidth = 5;
    ctx.shadowBlur = 30;
    let rings = [[half, boss.age * 0.02, hit ? "white" : "magenta"], [half * 0.62, -boss.age * 0.035, hit ? "white" : "#ff3030"]];
    for (let r = 0; r < rings.length; r = r + 1) {
        let [radius, rotation, color] = rings[r];
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        for (let corner = 0; corner < 8; corner = corner + 1) {
            let a = rotation + corner * Math.PI / 4;
            ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        }
        ctx.closePath();
        ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 22px Arial";
    ctx.fillStyle = hit ? "white" : "#ff3030";
    ctx.fillText("VIRUS", 0, 0);
    ctx.restore();
}

// Health bar across the top while a boss is on screen.
function drawBossHealth(ctx, state) {
    let boss = state.boss;
    if (!boss) return;
    const canvas = ctx.canvas;
    let width = Math.min(500, canvas.width * 0.4);
    let x = canvas.width / 2 - width / 2;
    let y = 95;

    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#ff3030";
    ctx.fillStyle = "#ff3030";
    ctx.fillRect(x, y, width * Math.max(0, boss.hp) / boss.maxHp, 14);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, 14);
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.font = "bold 18px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("VIRUS  " + Math.max(0, boss.hp) + " / " + boss.maxHp, canvas.width / 2, y - 8);
    ctx.restore();
}

// Falling power-ups: a spinning hexagon with the power's letter kept upright.
function drawPowerups(ctx, state) {
    for (let i = 0; i < state.powerups.length; i = i + 1) {
        let powerup = state.powerups[i];
        let type = POWERUP_TYPES[powerup.kind];
        let half = powerup.size / 2;

        ctx.save();
        ctx.translate(powerup.x + half, powerup.y + half);
        ctx.save();
        ctx.rotate(powerup.age * 0.04);
        ctx.shadowBlur = 25;
        ctx.shadowColor = type.color;
        ctx.strokeStyle = type.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let corner = 0; corner < 6; corner = corner + 1) {
            let a = corner * Math.PI / 3;
            ctx.lineTo(Math.cos(a) * half, Math.sin(a) * half);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 22px Arial";
        ctx.fillStyle = type.color;
        ctx.fillText(type.letter, 0, 1);
        ctx.restore();
    }
}

// SHIELD power-up: a cyan bubble around the fingertip while it's ready.
function drawShield(ctx, state) {
    if (!state.powers.shield || !state.handVisible) return;
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(state.angle * 6);
    ctx.shadowBlur = 15;
    ctx.shadowColor = "cyan";
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(state.finger.x, state.finger.y, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

// Expanding explosion rings (bomb shockwaves, volatile blasts), thinning and fading as they grow.
function drawRings(ctx, state) {
    ctx.save();
    for (let i = 0; i < state.rings.length; i = i + 1) {
        let ring = state.rings[i];
        let left = ring.life / ring.maxLife;
        ctx.globalAlpha = left;
        ctx.lineWidth = 1 + 7 * left;
        ctx.shadowBlur = 20;
        ctx.shadowColor = ring.color;
        ctx.strokeStyle = ring.color;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, Math.max(1, ring.radius), 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

// Floating "+20" / "-1 LIFE" texts that rise and fade out.
function drawPopups(ctx, state) {
    ctx.save();
    ctx.textAlign = "center";
    for (let i = 0; i < state.popups.length; i = i + 1) {
        let popup = state.popups[i];
        ctx.globalAlpha = popup.life / popup.maxLife;
        ctx.font = "bold " + Math.round(popup.size) + "px Arial";
        ctx.shadowBlur = 15;
        ctx.shadowColor = popup.color;
        ctx.fillStyle = popup.color;
        ctx.fillText(popup.text, popup.x, popup.y);
    }
    ctx.restore();
}

// Mid-round, if the hand leaves the camera: tell the player before the round is abandoned.
function drawHandLostWarning(ctx, state) {
    if (state.screen !== "playing" || state.handIdle < HAND_LOST_WARNING) return;
    const canvas = ctx.canvas;
    let secondsLeft = Math.ceil((ROUND_TIMEOUT - state.handIdle) / 60);

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 50px Arial";
    ctx.shadowBlur = 25;
    ctx.shadowColor = "magenta";
    ctx.fillStyle = "white";
    ctx.fillText("SHOW YOUR HAND", canvas.width / 2, canvas.height / 2);
    ctx.font = "24px Arial";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText("Round ends in " + secondsLeft, canvas.width / 2, canvas.height / 2 + 40);
    ctx.restore();
}

// Small "<label> N" line at the bottom of the screen, shown only in the last `showSeconds`.
function drawCountdown(ctx, label, framesLeft, showSeconds) {
    let secondsLeft = Math.ceil(framesLeft / 60);
    if (secondsLeft > showSeconds) return;
    drawFooter(ctx, label + " " + secondsLeft);
}

// Small hint line centred at the bottom of the screen.
function drawFooter(ctx, text) {
    const canvas = ctx.canvas;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "20px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillText(text, canvas.width / 2, canvas.height - 15);
    ctx.restore();
}

// Cyan tint during TIME WARP, white flash after SYSTEM PURGE, and the cast banner.
function drawSpellEffects(ctx, state) {
    const canvas = ctx.canvas;
    ctx.save();

    if (state.spells.slow.active > 0) {
        ctx.fillStyle = "rgba(0, 255, 255, 0.08)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (state.flash > 0) {
        ctx.fillStyle = "rgba(255, 255, 255, " + (state.flash * 0.6) + ")";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (state.banner.timer > 0) {
        ctx.globalAlpha = Math.min(1, state.banner.timer / 30); // fade out over the last half second
        ctx.textAlign = "center";
        ctx.font = "bold 56px Arial";
        ctx.shadowBlur = 30;
        ctx.shadowColor = state.banner.color;
        ctx.fillStyle = state.banner.color;
        ctx.fillText(state.banner.text, canvas.width / 2, canvas.height * 0.3);
    }
    ctx.restore();
}

// Bottom-left list of powers: which pose casts each, and whether it's ready, active or cooling down.
function drawSpellPanel(ctx, state) {
    const canvas = ctx.canvas;
    let x = 20;
    let barWidth = 160;
    let rowHeight = 46;
    let keys = Object.keys(SPELLS);
    let top = canvas.height - 20 - rowHeight * keys.length;

    ctx.save();
    ctx.font = "16px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillText("HAND: " + state.pose.toUpperCase(), x, top - 10);

    for (let i = 0; i < keys.length; i = i + 1) {
        let spell = SPELLS[keys[i]];
        let timers = state.spells[keys[i]];
        let y = top + i * rowHeight;

        let status, fill;
        if (timers.active > 0) {
            status = "ACTIVE";
            fill = timers.active / spell.duration;
        } else if (timers.cooldown > 0) {
            status = Math.ceil(timers.cooldown / 60) + "s";
            fill = 1 - timers.cooldown / spell.cooldown;
        } else {
            status = "READY";
            fill = 1;
        }
        let ready = timers.cooldown === 0 || timers.active > 0;

        ctx.shadowBlur = ready ? 10 : 0;
        ctx.shadowColor = spell.color;
        ctx.fillStyle = ready ? spell.color : "rgba(255, 255, 255, 0.4)";
        ctx.font = "bold 16px Arial";
        ctx.fillText(spell.hint + " · " + spell.name, x, y + 16);

        ctx.fillRect(x, y + 24, barWidth * fill, 8);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y + 24, barWidth, 8);

        ctx.font = "14px Arial";
        ctx.fillText(status, x + barWidth + 10, y + 32);
    }
    ctx.restore();
}

export function renderStartScreen(ctx, state, buttonRect) {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, state);
    drawRunner(ctx, state, "side");

    let titleY = canvas.height * 0.17;
    drawGlitchTitle(ctx, "GLITCH HUNTER", canvas.width / 2, titleY, 80, state);

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "26px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("Slice the bugs. Dodge the red bombs: 3 hits and you're out.", canvas.width / 2, titleY + 55);
    ctx.font = "20px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fillText("ITC powers: hold an OPEN PALM, a PEACE SIGN or a FIST", canvas.width / 2, titleY + 88);
    ctx.restore();

    drawLeaderboard(ctx, state, canvas.width / 2, titleY + 115, buttonRect.y - 25);
    drawButton(ctx, buttonRect, "START", state.buttonHold / BUTTON_HOLD_FRAMES);
    if (state.soundStatus === "locked") {
        drawFooter(ctx, IS_PHONE ? "Tap the screen to turn on sound" : "Press any key to turn on sound");
    }
    drawPhoneQr(ctx);
    drawSoundStatus(ctx, state);
    drawTrail(ctx, state);
}

// Small "MUTED" reminder in the bottom-right corner while sound is muted with M.
function drawSoundStatus(ctx, state) {
    if (state.soundStatus !== "muted") return;
    const canvas = ctx.canvas;
    ctx.save();
    ctx.textAlign = "right";
    ctx.font = "16px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillText("SOUND MUTED (M)", canvas.width - 20, canvas.height - 15);
    ctx.restore();
}

export function renderGameOverScreen(ctx, state, buttonRect) {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    beginShake(ctx, state);
    drawGrid(ctx, state);
    drawBug(ctx, state);
    drawDebris(ctx, state);
    drawBomb(ctx, state);
    drawBoss(ctx, state);
    drawParticles(ctx, state);
    ctx.restore();

    // dim the frozen world
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // the runner, beside the button rather than behind it: fallen, or cheering after a new #1
    drawRunner(ctx, state, "side");

    let titleY = canvas.height * 0.14;

    ctx.save();
    ctx.textAlign = "center";
    if (state.newTop) {
        // a new #1: a pulsing gold title instead of GAME OVER
        let pulse = 1 + 0.05 * Math.sin(state.angle * 6);
        ctx.save();
        ctx.translate(canvas.width / 2, titleY);
        ctx.scale(pulse, pulse);
        ctx.font = "bold 66px Arial";
        ctx.shadowBlur = 30;
        ctx.shadowColor = GOLD;
        ctx.fillStyle = GOLD;
        ctx.fillText("NEW #1 HUNTER!", 0, 0);
        ctx.restore();
    } else {
        ctx.font = "bold 70px Arial";
        ctx.shadowBlur = 25;
        ctx.shadowColor = "magenta";
        ctx.fillStyle = "magenta";
        ctx.fillText("GAME OVER", canvas.width / 2, titleY);
    }

    ctx.font = "bold 44px Arial";
    ctx.shadowColor = "lime";
    ctx.fillStyle = "white";
    ctx.fillText("SCORE: " + state.score, canvas.width / 2, titleY + 60);
    ctx.restore();

    if (state.enteringName) {
        drawNameEntry(ctx, state, canvas.width / 2, titleY + 140);
        drawCountdown(ctx, "Saving automatically in", NAME_TIMEOUT - state.nameIdle, 10);
    } else {
        drawLeaderboard(ctx, state, canvas.width / 2, titleY + 100, buttonRect.y - 25);
        drawButton(ctx, buttonRect, "TRY AGAIN", state.buttonHold / BUTTON_HOLD_FRAMES);
        drawCountdown(ctx, "Back to start in", GAME_OVER_TIMEOUT - state.handIdle, 5);
    }
    drawSoundStatus(ctx, state);
    drawPhoneQr(ctx);
    drawTrail(ctx, state);
    drawConfetti(ctx, state);
}

// Celebration confetti: little paper rectangles that spin and flip as they flutter down.
function drawConfetti(ctx, state) {
    if (state.confetti.length === 0) return;
    ctx.save();
    ctx.shadowBlur = 0;
    for (let i = 0; i < state.confetti.length; i = i + 1) {
        let c = state.confetti[i];
        let cos = Math.cos(c.rot);
        let sin = Math.sin(c.rot);
        ctx.globalAlpha = Math.min(1, c.life / 40); // fade out at the end
        ctx.fillStyle = c.color;
        ctx.setTransform(cos, sin, -sin, cos, c.x, c.y);
        let width = c.w * Math.abs(Math.cos(c.flip)) + 1; // flipping over in 3D: it narrows and widens
        ctx.fillRect(-width / 2, -c.h / 2, width, c.h);
    }
    ctx.restore();
}

// Top 10 table between `top` and `bottom`, centered on x. The just-saved row glows lime (gold for a new #1).
function drawLeaderboard(ctx, state, x, top, bottom) {
    let rowHeight = Math.min(34, (bottom - top - 45) / 10);

    ctx.save();
    // dark panel behind the table, so it stays readable over the bright sun
    let rows = Math.max(1, state.leaderboard.length);
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(x - 210, top - 8, 420, 45 + rowHeight * (rows + 0.6) + 8);
    ctx.textAlign = "center";
    ctx.font = "bold 30px Arial";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "magenta";
    ctx.fillStyle = "magenta";
    ctx.fillText("TOP HUNTERS", x, top + 28);

    ctx.font = Math.round(rowHeight * 0.75) + "px Arial";
    if (state.leaderboard.length === 0) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.fillText("No scores yet. Be the first!", x, top + 45 + rowHeight);
        ctx.restore();
        return;
    }

    for (let i = 0; i < state.leaderboard.length; i = i + 1) {
        let entry = state.leaderboard[i];
        let y = top + 45 + rowHeight * (i + 1);
        let highlight = i === state.lastSavedIndex;
        let color = i === 0 ? GOLD : "lime";

        ctx.shadowBlur = highlight ? 15 : 0;
        ctx.shadowColor = color;
        ctx.fillStyle = highlight ? color : "white";

        ctx.textAlign = "right";
        ctx.fillText((i + 1) + ".", x - 140, y);
        ctx.textAlign = "left";
        ctx.fillText(entry.name, x - 125, y);
        ctx.textAlign = "right";
        ctx.fillText(entry.score, x + 170, y);
    }
    ctx.restore();
}

// Name prompt for a score that made the board, saying where it landed, with a blinking cursor.
function drawNameEntry(ctx, state, x, y) {
    let boxWidth = 440;
    let boxHeight = 70;
    let cursor = Math.floor(Date.now() / 500) % 2 === 0 ? "_" : "";
    let rank = getRank(state.leaderboard, state.score);
    let heading = rank === 1 ? "YOU'RE #1!" : rank <= 3 ? "TOP 3! YOU'RE #" + rank : "YOU'RE #" + rank + " ON THE BOARD";

    ctx.save();
    ctx.textAlign = "center";

    ctx.font = "bold 40px Arial";
    ctx.shadowBlur = 20;
    ctx.shadowColor = rank === 1 ? GOLD : "lime";
    ctx.fillStyle = rank === 1 ? GOLD : "lime";
    ctx.fillText(heading, x, y);

    ctx.shadowBlur = 0;
    ctx.font = "26px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("Type your name", x, y + 50);

    ctx.shadowBlur = 15;
    ctx.shadowColor = "cyan";
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 4;
    ctx.strokeRect(x - boxWidth / 2, y + 75, boxWidth, boxHeight);

    ctx.textBaseline = "middle";
    ctx.font = "bold 40px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(state.playerName + cursor, x, y + 75 + boxHeight / 2);

    ctx.textBaseline = "alphabetic";
    ctx.shadowBlur = 0;
    ctx.font = "22px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillText("ENTER to save   ·   ESC to skip", x, y + 190);
    ctx.restore();
}

// Cyan title with a jittering magenta copy behind it.
function drawGlitchTitle(ctx, text, x, y, size, state) {
    let jitter = Math.sin(state.angle * 7) > 0.9 ? (Math.random() - 0.5) * 12 : 0;

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold " + size + "px Arial";
    ctx.shadowBlur = 25;

    ctx.shadowColor = "magenta";
    ctx.fillStyle = "rgba(255, 0, 255, 0.7)";
    ctx.fillText(text, x + 4 + jitter, y + 2);

    ctx.shadowColor = "cyan";
    ctx.fillStyle = "cyan";
    ctx.fillText(text, x, y);
    ctx.restore();
}

// Wireframe button; the lime bar fills as the finger holds over it.
function drawButton(ctx, rect, label, progress) {
    ctx.save();

    ctx.shadowBlur = 15;
    ctx.shadowColor = "lime";
    ctx.fillStyle = "rgba(0, 255, 0, 0.35)";
    ctx.fillRect(rect.x, rect.y, rect.width * progress, rect.height);

    ctx.shadowColor = "cyan";
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 4;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 36px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);

    ctx.restore();
}

// Sky, synthwave sun and perspective grid. Colours follow the level (see theme.js).
function drawGrid(ctx, state) {
    const canvas = ctx.canvas;

    // define the vanishing point
    let horizon = canvas.height / 2;
    let centerX = canvas.width / 2;
    let hue = Math.round(getThemeHue(state));
    let pulse = getPulse(state);

    // sky: near-black at the top, glowing in the theme colour at the horizon
    let sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "hsl(" + hue + ", 80%, 4%)");
    sky.addColorStop(1, "hsl(" + hue + ", 90%, 16%)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, horizon);

    drawSun(ctx, state, hue, centerX, horizon);

    ctx.strokeStyle = "hsla(" + hue + ", 100%, 60%, " + (0.25 + 0.35 * pulse) + ")";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 15;
    ctx.shadowColor = "hsl(" + hue + ", 100%, 60%)";
    ctx.beginPath();

    //radiating vertical lines
    // We loop from way off the left screen to way off the right screen
    for (let x = -canvas.width; x <= canvas.width * 2; x = x + 100) {
        ctx.moveTo(centerX, horizon);
        ctx.lineTo(x, canvas.height);
    }

    //horizontal lines
    for (let i = 1; i < 20; i = i + 1) {
        let z = i - state.gridOffset;
        let depth = (z * z) * 1.5;
        let yPos = horizon + depth;

        if (yPos > horizon && yPos < canvas.height) {
            ctx.moveTo(0, yPos);
            ctx.lineTo(canvas.width, yPos);
        }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
}

// Striped synthwave sun sitting on the horizon. Gradients, glow and stripe cut-outs are slow to
// redraw every frame, so each version is drawn once into an offscreen canvas and reused:
// one per 5° of hue, per size and per glow level.
const sunCache = new Map();

function drawSun(ctx, state, hue, centerX, horizon) {
    let radius = Math.round(Math.min(ctx.canvas.width, ctx.canvas.height) * 0.16);
    let blur = Math.round(30 * QUALITY[state.quality].glow);
    let bucket = Math.round(hue / 5) * 5 % 360;
    let key = bucket + "|" + radius + "|" + blur;

    let sun = sunCache.get(key);
    if (!sun) {
        if (sunCache.size > 100) sunCache.clear(); // window resized many times: start over
        sun = makeSun(bucket, radius, blur);
        sunCache.set(key, sun);
    }
    ctx.save();
    ctx.shadowBlur = 0; // the glow is already in the picture
    ctx.drawImage(sun.canvas, centerX - radius - sun.pad, horizon - radius - sun.pad);
    ctx.restore();
}

function makeSun(hue, radius, blur) {
    let pad = blur + 4;
    let canvas = document.createElement("canvas");
    canvas.width = radius * 2 + pad * 2;
    canvas.height = radius + pad * 2;
    let sunCtx = canvas.getContext("2d");
    let cx = pad + radius;
    let bottom = pad + radius; // the horizon line inside this canvas

    // top half of a disc, gold at the top fading into the theme colour at the horizon
    let gradient = sunCtx.createLinearGradient(0, pad, 0, bottom);
    gradient.addColorStop(0, "hsl(50, 100%, 65%)");
    gradient.addColorStop(1, "hsl(" + hue + ", 100%, 55%)");
    sunCtx.shadowBlur = blur;
    sunCtx.shadowColor = "hsl(" + hue + ", 100%, 55%)";
    sunCtx.fillStyle = gradient;
    sunCtx.beginPath();
    sunCtx.arc(cx, bottom, radius, Math.PI, Math.PI * 2);
    sunCtx.closePath();
    sunCtx.fill();

    // horizontal gaps across the lower half, thicker towards the horizon
    sunCtx.shadowBlur = 0;
    sunCtx.globalCompositeOperation = "destination-out";
    let stripes = 6;
    for (let i = 0; i < stripes; i = i + 1) {
        let y = bottom - radius * 0.55 + (radius * 0.55) * (i / stripes);
        let thickness = Math.max(1, radius * (0.012 + i * 0.012));
        sunCtx.fillRect(0, y, canvas.width, thickness);
    }
    return { canvas: canvas, pad: pad };
}

// === WIREFRAME BUGS ===
function drawBug(ctx, state) {
    for (let i = 0; i < state.bugs.length; i = i + 1) {
        let bug = state.bugs[i];
        let bugType = BUG_TYPES[bug.type];
        let half = bug.size / 2;
        let angle = getBugAngle(state, bug); // each bug spins out of step with the others

        ctx.save();
        ctx.translate(bug.x + half, bug.y + half);
        ctx.save();
        ctx.rotate(angle);

        ctx.shadowBlur = bug.type === "gold" ? 30 : 15;
        ctx.shadowColor = bugType.color;
        ctx.strokeStyle = bugType.color;
        if (BUG_LEGS) drawLegs(ctx, state, bug, half);
        ctx.lineWidth = bug.type === "fast" ? 3 : 4;
        ctx.strokeRect(-half, -half, bug.size, bug.size);

        // armored bugs wear a white shell until their first hit
        if (bug.type === "armored" && bug.hp > 1) {
            ctx.shadowColor = "white";
            ctx.strokeStyle = "white";
            ctx.strokeRect(-half - 7, -half - 7, bug.size + 14, bug.size + 14);
            ctx.strokeStyle = bugType.color;
        }

        if (bug.type === "volatile") {
            // a pulsing lightning bolt instead of the inner box: slice it and it blows up its neighbours
            ctx.rotate(-angle);
            ctx.globalAlpha = 0.85 + 0.15 * Math.sin(state.angle * 8);
            ctx.shadowBlur = 14;
            ctx.fillStyle = "#fff4d0"; // near white-hot, so the bolt stands out inside the orange outline
            ctx.beginPath();
            let bolt = [[0.18, -0.78], [-0.36, 0.1], [0.02, 0.1], [-0.18, 0.78], [0.38, -0.14], [0.02, -0.14]];
            for (let p = 0; p < bolt.length; p = p + 1) {
                ctx.lineTo(bolt[p][0] * half, bolt[p][1] * half);
            }
            ctx.closePath();
            ctx.fill();
        } else {
            //draw an inner layered box that spins the opposite direction
            ctx.rotate(-angle * 2);
            ctx.strokeRect(-half / 2, -half / 2, half, half);
        }
        ctx.restore();

        // the gold bug carries the club's name, kept upright so it's readable
        if (bug.type === "gold") {
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "bold 14px Arial";
            ctx.fillStyle = bugType.color;
            ctx.fillText("ITC", 0, 0);
        }

        ctx.restore();
    }
}

// Six little legs that wiggle, and two antennae, in the bug's colour (drawn in the bug's own
// rotated frame, so they tumble with it).
function drawLegs(ctx, state, bug, half) {
    ctx.save();
    ctx.lineWidth = Math.max(1.5, half * 0.1);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let side = -1; side <= 1; side = side + 2) {
        for (let k = -1; k <= 1; k = k + 1) {
            let wiggle = Math.sin(state.angle * 10 + k * 2 + side + bug.spin) * half * 0.15;
            let y = k * half * 0.55;
            ctx.moveTo(side * half, y);
            ctx.lineTo(side * half * 1.35, y - half * 0.15 + wiggle);   // knee
            ctx.lineTo(side * half * 1.6, y + half * 0.25 + wiggle);    // foot
        }
        // antenna from the top corner, curling outwards
        ctx.moveTo(side * half * 0.45, -half);
        ctx.quadraticCurveTo(side * half * 0.5, -half * 1.6, side * half * 0.95, -half * 1.7);
    }
    ctx.stroke();
    ctx.restore();
}

// Pieces of sliced bugs: a faint fill and a glowing outline, fading out at the end of their life.
// There can be dozens of pieces, and a real blur on each was the single most expensive thing on
// screen, so the glow is faked: a wide faint outline under a thin bright one.
function drawDebris(ctx, state) {
    let glow = QUALITY[state.quality].glow > 0;
    for (let i = 0; i < state.debris.length; i = i + 1) {
        let piece = state.debris[i];

        ctx.save();
        ctx.globalAlpha = Math.min(1, piece.life / piece.fade);
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rot);

        ctx.beginPath();
        ctx.moveTo(piece.points[0].x, piece.points[0].y);
        for (let j = 1; j < piece.points.length; j = j + 1) {
            ctx.lineTo(piece.points[j].x, piece.points[j].y);
        }
        ctx.closePath();

        let alpha = ctx.globalAlpha;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = piece.color;
        ctx.fillStyle = piece.color;
        if (glow) {
            ctx.globalAlpha = alpha * 0.25;
            ctx.lineWidth = 9;
            ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.2;
        ctx.fill();

        ctx.restore();
    }
}

// === BOMBS ===
// Round, spiky and red, so they can't be mistaken for bugs: a mine with a lit fuse and a core
// that blinks faster the lower it falls.
function drawBomb(ctx, state) {
    const height = ctx.canvas.height;
    for (let i = 0; i < state.bombs.length; i = i + 1) {
        let bomb = state.bombs[i];
        let half = bomb.size / 2;
        let x = bomb.x + half;
        let y = bomb.y + half;

        if (bomb.y < -bomb.size * 0.5) {
            // still above the screen: a warning sign at the top edge, just before it drops in
            if (bomb.y > -bomb.size - BOMB_WARNING_DISTANCE) drawBombWarning(ctx, state, x);
            continue;
        }

        let r = bomb.size * 0.38;
        let depth = Math.max(0, Math.min(1, bomb.y / height));
        let pulse = 0.5 + 0.5 * Math.sin(state.angle * (4 + depth * 14) + bomb.spin);

        ctx.save();
        ctx.translate(x, y);
        ctx.shadowColor = BOMB_COLOR;
        ctx.shadowBlur = 12 + 14 * pulse;
        ctx.strokeStyle = BOMB_COLOR;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";

        // eight spikes, slowly turning
        ctx.save();
        ctx.rotate((state.angle + bomb.spin) * 0.5);
        ctx.beginPath();
        for (let k = 0; k < 8; k = k + 1) {
            let a = k * Math.PI / 4;
            ctx.moveTo(Math.cos(a - 0.22) * r, Math.sin(a - 0.22) * r);
            ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
            ctx.lineTo(Math.cos(a + 0.22) * r, Math.sin(a + 0.22) * r);
        }
        ctx.stroke();
        ctx.restore();

        // round body
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 42, 42, 0.18)";
        ctx.fill();
        ctx.stroke();

        // blinking core
        ctx.fillStyle = "rgba(255, 210, 210, " + (0.35 + 0.65 * pulse) + ")";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
        ctx.fill();

        // fuse with a flickering spark, always on top
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffcc66";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r * 0.45, -r * 0.85);
        ctx.quadraticCurveTo(r * 1.1, -r * 1.1, r * 0.95, -r * 1.75);
        ctx.stroke();
        let spark = 2 + Math.random() * 3;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "orange";
        ctx.fillStyle = "#fff2a0";
        ctx.beginPath();
        ctx.arc(r * 0.95, -r * 1.75, spark, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Blinking red warning triangle at the top edge, above where a bomb is about to drop in.
function drawBombWarning(ctx, state, x) {
    let size = 26;
    let top = 8;
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(state.angle * 6));
    ctx.shadowBlur = 12;
    ctx.shadowColor = BOMB_COLOR;
    ctx.strokeStyle = BOMB_COLOR;
    ctx.fillStyle = BOMB_COLOR;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + size / 2, top + size * 0.9);
    ctx.lineTo(x - size / 2, top + size * 0.9);
    ctx.closePath();
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 16px Arial";
    ctx.fillText("!", x, top + size * 0.58);
    ctx.restore();
}

// === BLADE TRAIL ===
// The trail's points are joined by a smooth curve, then drawn as one tapered ribbon: a wide
// glow with a thin white-hot core, thick at the fingertip and fading to nothing at the tail.
// Two filled shapes per frame (instead of two strokes per segment) is also cheaper to draw.
const TRAIL_CURVE_STEPS = 4; // extra points added between each pair of trail points

function drawTrail(ctx, state) {
    let points = smoothCurve(state.trail, TRAIL_CURVE_STEPS);
    if (points.length < 2) return;
    let width = state.powers.wide > 0 ? 1.8 : 1; // WIDE BLADE power-up
    let tail = points[0];
    let tip = points[points.length - 1];

    ctx.save();
    // outer glow: cyan, or a moving rainbow during FEVER
    let glow;
    if (state.fever) {
        // a rainbow running along the blade, shifting over time
        let hue = Math.round((state.angle * 200) % 360);
        glow = rainbowGradient(ctx, tail, tip, hue, 0.85);
        ctx.shadowColor = "hsl(" + hue + ", 100%, 60%)";
    } else {
        glow = trailGradient(ctx, tail, tip, "rgba(0, 255, 255, ", 0.6);
        ctx.shadowColor = "cyan";
    }
    ctx.shadowBlur = 20;
    fillRibbon(ctx, points, t => (1 + 7 * t) * width, glow);

    // hot white core
    ctx.shadowBlur = 0;
    fillRibbon(ctx, points, t => (0.5 + 2.5 * t) * width, trailGradient(ctx, tail, tip, "rgba(255, 255, 255, ", 1));
    ctx.restore();
}

// Catmull-Rom curve through the points: passes through every one of them, with no corners.
function smoothCurve(points, steps) {
    if (points.length < 3) return points.slice();
    let out = [];
    for (let i = 0; i < points.length - 1; i = i + 1) {
        let p0 = points[Math.max(0, i - 1)];
        let p1 = points[i];
        let p2 = points[i + 1];
        let p3 = points[Math.min(points.length - 1, i + 2)];
        for (let s = 0; s < steps; s = s + 1) {
            let t = s / steps;
            let t2 = t * t;
            let t3 = t2 * t;
            out.push({
                x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
            });
        }
    }
    out.push(points[points.length - 1]);
    return out;
}

// Transparent at the tail, `alpha` at the fingertip. `rgbaStart` is e.g. "rgba(0, 255, 255, ".
function trailGradient(ctx, tail, tip, rgbaStart, alpha) {
    if (Math.hypot(tip.x - tail.x, tip.y - tail.y) < 1) {
        return rgbaStart + alpha + ")"; // finger hasn't moved: a gradient needs some length
    }
    let gradient = ctx.createLinearGradient(tail.x, tail.y, tip.x, tip.y);
    gradient.addColorStop(0, rgbaStart + "0)");
    gradient.addColorStop(1, rgbaStart + alpha + ")");
    return gradient;
}

// FEVER: rainbow from tail to tip, fading in like the normal blade.
function rainbowGradient(ctx, tail, tip, startHue, alpha) {
    if (Math.hypot(tip.x - tail.x, tip.y - tail.y) < 1) {
        return "hsla(" + startHue + ", 100%, 60%, " + alpha + ")";
    }
    let gradient = ctx.createLinearGradient(tail.x, tail.y, tip.x, tip.y);
    for (let i = 0; i <= 4; i = i + 1) {
        let t = i / 4;
        gradient.addColorStop(t, "hsla(" + ((startHue + i * 70) % 360) + ", 100%, 60%, " + (alpha * t) + ")");
    }
    return gradient;
}

// One filled shape along the curve, `halfWidth(t)` wide at each point (t: 0 at the tail, 1 at the tip),
// with a round end at the fingertip.
function fillRibbon(ctx, points, halfWidth, fill) {
    let left = [];
    let right = [];
    for (let i = 0; i < points.length; i = i + 1) {
        let before = points[Math.max(0, i - 1)];
        let after = points[Math.min(points.length - 1, i + 1)];
        let dx = after.x - before.x;
        let dy = after.y - before.y;
        let length = Math.hypot(dx, dy) || 1;
        let w = halfWidth(i / (points.length - 1));
        left.push({ x: points[i].x - dy / length * w, y: points[i].y + dx / length * w });
        right.push({ x: points[i].x + dy / length * w, y: points[i].y - dx / length * w });
    }
    let tip = points[points.length - 1];

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i = i + 1) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i = i - 1) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, halfWidth(1), 0, Math.PI * 2);
    ctx.fill();
}

// Glowing particles are stamped from pre-drawn sprites (see perf.js); on LOW quality they're plain squares.
function drawParticles(ctx, state) {
    let blur = Math.round(10 * QUALITY[state.quality].glow);
    ctx.save();
    ctx.shadowBlur = 0; // the sprite already contains its glow
    for (let i = 0; i < state.particles.length; i = i + 1) {
        let p = state.particles[i];
        if (blur > 0) {
            let sprite = getParticleSprite(p.color, 5, blur);
            ctx.drawImage(sprite.canvas, p.x - sprite.pad, p.y - sprite.pad);
        } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, 5, 5);
        }
    }
    ctx.restore();
}

// Diagnostic view (D key): what the camera tracker reported over the last 1.5 s, behind the blade.
// Red dots: the raw fingertip, one per camera frame. Yellow: the index knuckle. If the red dots
// dip while the yellow ones stay level, the tracker is losing the fingertip (motion blur, or the
// finger bending), not the game.
export function drawTrackingDebug(ctx, state) {
    if (!state.showTracking) return;
    let samples = state.trackingSamples;
    ctx.save();
    ctx.shadowBlur = 0;
    for (let pass = 0; pass < 2; pass = pass + 1) {
        let color = pass === 0 ? "yellow" : "red";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < samples.length; i = i + 1) {
            let x = pass === 0 ? samples[i].kx : samples[i].x;
            let y = pass === 0 ? samples[i].ky : samples[i].y;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (let i = 0; i < samples.length; i = i + 1) {
            ctx.beginPath();
            ctx.arc(pass === 0 ? samples[i].kx : samples[i].x, pass === 0 ? samples[i].ky : samples[i].y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    let fps = Math.round(state.trackingFps);
    let lines = [
        "TRACKING VIEW (D to hide)",
        "camera tracking: " + fps + " fps" + (fps < 20 ? "  - LOW: add light or reduce glare" : ""),
        "red = raw fingertip   yellow = knuckle   cyan = blade",
        "blade feel: " + BLADE_FEELS[state.bladeFeel].name + " (B to change)"
    ];
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(ctx.canvas.width / 2 - 230, 86, 460, 96);
    ctx.textAlign = "center";
    ctx.font = "15px monospace";
    for (let i = 0; i < lines.length; i = i + 1) {
        ctx.fillStyle = i === 1 && fps < 20 ? "orange" : "white";
        ctx.fillText(lines[i], ctx.canvas.width / 2, 106 + i * 22);
    }
    ctx.restore();
}

// Short message at the top centre (e.g. "BLADE: SMOOTH" after pressing B), fading out.
export function drawNotice(ctx, state) {
    if (state.notice.timer <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.notice.timer / 20);
    ctx.shadowBlur = 0;
    ctx.font = "bold 22px Arial";
    let width = ctx.measureText(state.notice.text).width + 30;
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(ctx.canvas.width / 2 - width / 2, 190, width, 40);
    ctx.fillStyle = "cyan";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(state.notice.text, ctx.canvas.width / 2, 210);
    ctx.restore();
}

// Volunteer overlay (F key): frame rate, quality level and how much is on screen.
export function drawPerfOverlay(ctx, state) {
    if (!state.showPerf) return;
    let lock = state.qualityLock === "auto" ? "AUTO" : "LOCKED";
    let lines = [
        "FPS " + Math.round(state.fps),
        "QUALITY " + state.quality.toUpperCase() + " (" + lock + ", Q to change)",
        "PARTICLES " + state.particles.length + "  DEBRIS " + state.debris.length
    ];

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(ctx.canvas.width / 2 - 200, 8, 400, 72);
    ctx.textAlign = "center";
    ctx.font = "16px monospace";
    ctx.fillStyle = state.fps < 48 ? "magenta" : "lime";
    for (let i = 0; i < lines.length; i = i + 1) {
        ctx.fillText(lines[i], ctx.canvas.width / 2, 28 + i * 22);
    }
    ctx.restore();
}

// A filled heart, `size` pixels tall, with its top centre at (x, y).
function drawHeart(ctx, x, y, size) {
    let w = size * 0.55;
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.3);
    ctx.bezierCurveTo(x, y, x - w, y, x - w, y + size * 0.3);
    ctx.bezierCurveTo(x - w, y + size * 0.6, x, y + size * 0.75, x, y + size);
    ctx.bezierCurveTo(x, y + size * 0.75, x + w, y + size * 0.6, x + w, y + size * 0.3);
    ctx.bezierCurveTo(x + w, y, x, y, x, y + size * 0.3);
    ctx.fill();
}

function drawHud(ctx, state) {
    const canvas = ctx.canvas;
    let right = canvas.width - 30;

    ctx.save();
    ctx.textAlign = "right";
    ctx.shadowBlur = 0;
    ctx.font = "30px Arial";
    ctx.fillStyle = "white";
    ctx.fillText("Score: " + state.score, right, 50);

    // one heart per life left
    ctx.shadowBlur = 10;
    ctx.shadowColor = HEART_COLOR;
    ctx.fillStyle = HEART_COLOR;
    for (let i = 0; i < state.lives; i = i + 1) {
        drawHeart(ctx, right - 10 - i * 32, 68, 22);
    }

    // level, to the left of the hearts
    ctx.shadowBlur = 0;
    ctx.font = "bold 20px Arial";
    ctx.fillStyle = "hsl(" + Math.round(getThemeHue(state)) + ", 100%, 70%)";
    ctx.fillText("LEVEL " + state.level, right - 20 - state.lives * 32, 88);

    let multiplier = getMultiplier(state);
    if (multiplier > 1) {
        ctx.shadowColor = "lime";
        ctx.fillStyle = "lime";
        ctx.font = "bold 36px Arial";
        ctx.fillText("x" + multiplier + " COMBO", right, 135);
    }
    if (state.spells.double.active > 0) {
        ctx.shadowColor = "lime";
        ctx.fillStyle = "lime";
        ctx.font = "bold 28px Arial";
        ctx.fillText("x2 DOUBLE DATA", right, 175);
    }
    if (state.fever) {
        let hue = Math.round((state.angle * 120) % 360);
        ctx.shadowColor = "hsl(" + hue + ", 100%, 60%)";
        ctx.fillStyle = "hsl(" + hue + ", 100%, 70%)";
        ctx.font = "bold 30px Arial";
        ctx.fillText("FEVER x2", right, 212);
    }

    // collected power-ups
    let powerLines = [];
    if (state.powers.shield) powerLines.push({ text: "SHIELD", color: POWERUP_TYPES.shield.color });
    if (state.powers.wide > 0) powerLines.push({ text: "WIDE BLADE " + Math.ceil(state.powers.wide / 60) + "s", color: POWERUP_TYPES.wide.color });
    if (state.powers.magnet > 0) powerLines.push({ text: "MAGNET " + Math.ceil(state.powers.magnet / 60) + "s", color: POWERUP_TYPES.magnet.color });
    ctx.font = "bold 22px Arial";
    for (let i = 0; i < powerLines.length; i = i + 1) {
        ctx.shadowColor = powerLines[i].color;
        ctx.fillStyle = powerLines[i].color;
        ctx.fillText(powerLines[i].text, right, 248 + i * 30);
    }
    ctx.restore();
}
