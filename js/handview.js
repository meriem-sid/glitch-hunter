// Draws the tracked hand over the webcam preview, so players can see what the game sees:
// a dim skeleton of the whole hand, the index finger lit up in cyan, and its tip marked
// as the BLADE. With no hand in view it asks for one.

// MediaPipe's 21 hand points, joined into fingers (0 is the wrist, 8 the index fingertip)
const BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
    [0, 5], [5, 6], [6, 7], [7, 8],          // index
    [5, 9], [9, 10], [10, 11], [11, 12],     // middle
    [9, 13], [13, 14], [14, 15], [15, 16],   // ring
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // little finger and palm
];
const INDEX_FINGER = [5, 6, 7, 8];
const FINGERTIP = 8;

// `hand`: the 21 landmarks (0-1 coordinates), or null when no hand is seen.
// options.message: shown instead of "SHOW YOUR HAND" (e.g. while the camera is still starting).
export function drawHandView(canvas, video, hand, pose, mirror, options = {}) {
    let message = options.message || "SHOW YOUR HAND";
    // match the preview's shape (some webcams are 4:3, others 16:9)
    if (video.videoWidth > 0) {
        let height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
        if (canvas.height !== height) {
            canvas.height = height; // its on-screen size follows the CSS width, keeping this shape
        }
    }
    let ctx = canvas.getContext("2d");
    let w = canvas.width;
    let h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // neon frame, so the preview looks like part of the game
    ctx.strokeStyle = hand ? "cyan" : "magenta";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);

    if (!hand) {
        label(ctx, message, w / 2, h / 2, "magenta", 20, "center");
        return;
    }

    let at = i => ({ x: (mirror ? 1 - hand[i].x : hand[i].x) * w, y: hand[i].y * h });

    // the whole hand, faint
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < BONES.length; i = i + 1) {
        let a = at(BONES[i][0]);
        let b = at(BONES[i][1]);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // the index finger: this is the one that controls the blade
    ctx.strokeStyle = "cyan";
    ctx.shadowColor = "cyan";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < INDEX_FINGER.length; i = i + 1) {
        let p = at(INDEX_FINGER[i]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // the fingertip: a dot with a pulsing ring, and a label
    let tip = at(FINGERTIP);
    let pulse = 9 + 3 * Math.sin(performance.now() / 150);
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    let labelOnLeft = tip.x > w - 70;
    label(ctx, "BLADE", tip.x + (labelOnLeft ? -16 : 16), tip.y - 10, "cyan", 14, labelOnLeft ? "right" : "left");

    // the pose the game currently sees (powers are cast by holding one)
    if (pose && pose !== "none" && pose !== "point") {
        label(ctx, pose.toUpperCase(), 10, h - 10, "yellow", 16, "left");
    }
}

function label(ctx, text, x, y, color, size, align) {
    ctx.save();
    ctx.font = "bold " + size + "px Arial";
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "black"; // dark outline keeps the text readable over any camera picture
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
}
