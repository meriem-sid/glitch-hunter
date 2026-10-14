// Turns MediaPipe's 21 hand landmarks into a named pose.
// A finger counts as extended when its tip is clearly farther from the wrist than its middle joint,
// which works whatever angle the hand is held at.

const WRIST = 0;
// [middle joint (PIP), tip] for index, middle, ring, pinky
const FINGERS = [[6, 8], [10, 12], [14, 16], [18, 20]];

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function isExtended(hand, pip, tip) {
    return distance(hand[WRIST], hand[tip]) > distance(hand[WRIST], hand[pip]) * 1.1;
}

// Returns "palm", "peace", "fist", "point" or "none".
export function detectPose(hand) {
    let [index, middle, ring, pinky] = FINGERS.map(([pip, tip]) => isExtended(hand, pip, tip));

    if (index && middle && ring && pinky) return "palm";
    if (index && middle && !ring && !pinky) return "peace";
    if (!index && !middle && !ring && !pinky) return "fist";
    if (index && !middle && !ring && !pinky) return "point";
    return "none";
}
