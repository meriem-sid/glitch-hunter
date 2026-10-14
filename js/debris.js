// Sliced bugs split into two pieces along the line of the swipe. The pieces fly apart,
// fall and fade, and can be sliced again into smaller pieces for a small bonus.
// Amounts are in pixels and 60fps frames, counted with `step` like everything else.
import { BUG_TYPES, getBugAngle } from "./enemies.js";
import { QUALITY } from "./perf.js";

const GRAVITY = 0.35;          // pixels per frame per frame
const SPLIT_SPEED = 3.5;       // how hard the two halves push apart
const PIECE_LIFE = 90;         // 1.5 s
const FADE_FRAMES = 30;        // fade out over the last 0.5 s
const RECUT_DELAY = 8;         // a piece can't be cut by the same slash that made it
const MIN_CUT_RADIUS = 8;      // pieces smaller than this can't be cut again
const MIN_RECUT_SWIPE = 4;     // the finger has to be moving to cut a piece, not just resting on it
export const DEBRIS_POINTS = 2;

// Split a just-sliced bug along the swipe. With no swipe (SYSTEM PURGE), cut at a random angle.
export function shatterBug(state, bug, swipe) {
    let half = bug.size / 2;
    let center = { x: bug.x + half, y: bug.y + half };
    shatterSquare(state, center, half, getBugAngle(state, bug), BUG_TYPES[bug.type].color, swipe);
}

// Split a square (centre, half its width, rotation) along the swipe. Also used for the boss.
export function shatterSquare(state, center, half, angle, color, swipe) {
    let corners = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([cx, cy]) => ({
        x: center.x + cx * Math.cos(angle) - cy * Math.sin(angle),
        y: center.y + cx * Math.sin(angle) + cy * Math.cos(angle)
    }));

    let cut = getCutLine(center, half, swipe);
    addPieces(state, splitPolygon(corners, cut), cut, color, { x: 0, y: 0 });
}

// Move, fade and re-cut pieces. Returns nothing; re-cuts push "debris" events for score popups and sound.
export function updateDebris(state, swipe, step, height) {
    for (let i = 0; i < state.debris.length; i = i + 1) {
        let piece = state.debris[i];
        piece.vy = piece.vy + GRAVITY * step;
        piece.x = piece.x + piece.vx * step;
        piece.y = piece.y + piece.vy * step;
        piece.rot = piece.rot + piece.vrot * step;
        piece.age = piece.age + step;
        piece.life = piece.life - step;
    }
    state.debris = state.debris.filter(p => p.life > 0 && p.y < height + 60);

    let moving = swipe && Math.hypot(swipe.x2 - swipe.x1, swipe.y2 - swipe.y1) >= MIN_RECUT_SWIPE;
    if (moving) {
        let survivors = [];
        let pieces = state.debris;
        state.debris = [];
        for (let i = 0; i < pieces.length; i = i + 1) {
            let piece = pieces[i];
            let canCut = piece.age >= RECUT_DELAY && piece.radius >= MIN_CUT_RADIUS;
            if (canCut && distanceToSegment(piece, swipe) < piece.radius) {
                recutPiece(state, piece, swipe);
            } else {
                survivors.push(piece);
            }
        }
        state.debris = survivors.concat(state.debris);
    }

    // over the cap (lower on weaker laptops, see perf.js): drop the oldest pieces first
    let maxPieces = QUALITY[state.quality].maxDebris;
    if (state.debris.length > maxPieces) {
        state.debris.sort((a, b) => b.life - a.life);
        state.debris.length = maxPieces;
    }
}

function recutPiece(state, piece, swipe) {
    let cos = Math.cos(piece.rot);
    let sin = Math.sin(piece.rot);
    let worldPoints = piece.points.map(p => ({
        x: piece.x + p.x * cos - p.y * sin,
        y: piece.y + p.x * sin + p.y * cos
    }));

    let cut = getCutLine({ x: piece.x, y: piece.y }, piece.radius, swipe);
    // the smaller pieces keep the parent's momentum on top of the new push
    addPieces(state, splitPolygon(worldPoints, cut), cut, piece.color, { x: piece.vx, y: piece.vy });

    state.score = state.score + DEBRIS_POINTS;
    state.events.push({ type: "debris", x: piece.x, y: piece.y, points: DEBRIS_POINTS, color: piece.color });
}

// The line to cut along: the swipe's direction, through the point of the swipe closest to the
// shape's centre. That offset is limited so neither piece ends up as a sliver.
function getCutLine(center, radius, swipe) {
    let dx = swipe ? swipe.x2 - swipe.x1 : 0;
    let dy = swipe ? swipe.y2 - swipe.y1 : 0;
    let length = Math.hypot(dx, dy);
    if (length < 0.001) {
        let randomAngle = Math.random() * Math.PI;
        return { point: center, dir: { x: Math.cos(randomAngle), y: Math.sin(randomAngle) },
                 normal: { x: -Math.sin(randomAngle), y: Math.cos(randomAngle) } };
    }

    let dir = { x: dx / length, y: dy / length };
    let normal = { x: -dir.y, y: dir.x };
    let offset = (center.x - swipe.x1) * normal.x + (center.y - swipe.y1) * normal.y;
    let limit = radius * 0.35;
    offset = Math.max(-limit, Math.min(limit, offset));
    return { point: { x: center.x - normal.x * offset, y: center.y - normal.y * offset }, dir: dir, normal: normal };
}

// Cut a convex polygon in two along a line. Returns [front, back]; either may be empty.
function splitPolygon(points, cut) {
    let front = [];
    let back = [];
    let side = p => (p.x - cut.point.x) * cut.normal.x + (p.y - cut.point.y) * cut.normal.y;

    for (let i = 0; i < points.length; i = i + 1) {
        let a = points[i];
        let b = points[(i + 1) % points.length];
        let sa = side(a);
        let sb = side(b);

        if (sa >= 0) front.push(a);
        if (sa <= 0) back.push(a);
        if (sa * sb < 0) {
            // the edge crosses the cut: both pieces get the crossing point
            let t = sa / (sa - sb);
            let crossing = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            front.push(crossing);
            back.push(crossing);
        }
    }
    return [front, back];
}

// Turn the two halves of a cut into flying pieces, pushed apart along the cut's normal.
function addPieces(state, halves, cut, color, inherited) {
    for (let h = 0; h < halves.length; h = h + 1) {
        let polygon = halves[h];
        if (polygon.length < 3) continue;

        let cx = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
        let cy = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;
        let local = polygon.map(p => ({ x: p.x - cx, y: p.y - cy }));
        let radius = Math.max.apply(null, local.map(p => Math.hypot(p.x, p.y)));
        let away = h === 0 ? 1 : -1;

        state.debris.push({
            x: cx,
            y: cy,
            points: local,
            radius: radius,
            vx: inherited.x + cut.normal.x * SPLIT_SPEED * away + cut.dir.x * 2,
            vy: inherited.y + cut.normal.y * SPLIT_SPEED * away + cut.dir.y * 2 - 2, // small upward pop
            rot: 0,
            vrot: (0.08 + Math.random() * 0.12) * away,
            age: 0,
            life: PIECE_LIFE,
            maxLife: PIECE_LIFE,
            fade: FADE_FRAMES,
            color: color
        });
    }
}

function distanceToSegment(p, seg) {
    let dx = seg.x2 - seg.x1;
    let dy = seg.y2 - seg.y1;
    let t = ((p.x - seg.x1) * dx + (p.y - seg.y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (seg.x1 + dx * t), p.y - (seg.y1 + dy * t));
}
