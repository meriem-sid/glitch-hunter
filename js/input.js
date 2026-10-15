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

// handCanvas: the overlay on the webcam preview where the tracked hand is drawn.
export function startHandTracking(videoElement, canvas, state, handCanvas) {
    drawHandView(handCanvas, videoElement, null, "none", MIRROR, "STARTING CAMERA...");

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

    hands.onResults((results) => {
        if (results.multiHandLandmarks.length > 0) {
            const hand = results.multiHandLandmarks[0];

            // Target index finger tip (landmark 8)
            const indexFinger = hand[8];

            let x = MIRROR ? 1 - indexFinger.x : indexFinger.x;
            state.rawFinger.x = x * canvas.width;
            state.rawFinger.y = indexFinger.y * canvas.height;
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
