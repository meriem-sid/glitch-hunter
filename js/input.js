// MediaPipe hand tracking: writes the index fingertip position into state.rawFinger
// (smoothing.js turns that into state.finger, which the rest of the game uses).
// Hands and Camera are globals loaded by the <script> tags in index.html.
import { detectPose } from "./poses.js";
import { drawHandView } from "./handview.js";
import { IS_PHONE } from "./device.js";

// Webcams see you the way someone facing you would, so your right hand appears on the left.
// Mirroring makes the game behave like a mirror: move right, the blade moves right.
// Set to false for a camera that already mirrors its image.
const MIRROR = true;

const TRACKING_HISTORY_MS = 1500; // the D-key view shows the last 1.5 s of camera samples

// handCanvas: the overlay on the webcam preview where the tracked hand is drawn.
export function startHandTracking(videoElement, canvas, state, handCanvas) {
    drawHandView(handCanvas, videoElement, null, "none", MIRROR, { message: "STARTING CAMERA..." });

    if (MIRROR) {
        videoElement.style.transform = "scaleX(-1)"; // keep the preview consistent with the controls
    }

    const hands = new Hands({locateFile: (file) => {
        return `vendor/mediapipe/hands/${file}`;
    }});
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: IS_PHONE ? 0 : 1, // phones get the lite model: faster, slightly less precise
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    let lastResult = 0;
    hands.onResults((results) => {
        // how often the camera + tracker actually deliver a result (dim light lowers this a lot)
        let now = performance.now();
        if (lastResult) state.trackingFps = state.trackingFps * 0.9 + (1000 / (now - lastResult)) * 0.1;
        lastResult = now;

        if (results.multiHandLandmarks.length > 0) {
            const hand = results.multiHandLandmarks[0];

            // the index fingertip (landmark 8)
            const tip = hand[8];
            let x = MIRROR ? 1 - tip.x : tip.x;
            state.rawFinger.x = x * canvas.width;
            state.rawFinger.y = tip.y * canvas.height;

            // for the D-key tracking view: the raw fingertip and the index knuckle, as the camera saw them
            const knuckle = hand[5];
            state.trackingSamples.push({
                t: now, x: state.rawFinger.x, y: state.rawFinger.y,
                kx: (MIRROR ? 1 - knuckle.x : knuckle.x) * canvas.width, ky: knuckle.y * canvas.height
            });
            while (state.trackingSamples.length && now - state.trackingSamples[0].t > TRACKING_HISTORY_MS) {
                state.trackingSamples.shift();
            }
            state.handVisible = true;
            state.pose = detectPose(hand);
            drawHandView(handCanvas, videoElement, hand, state.pose, MIRROR);
        } else {
            state.handVisible = false;
            state.pose = "none";
            drawHandView(handCanvas, videoElement, null, "none", MIRROR);
        }
    });

    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({image: videoElement});
        },
        width: 640,
        height: 480
    });

    camera.start();
}
