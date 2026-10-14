// Top scores, saved in this browser's localStorage so they survive page reloads on the event laptop.

export const MAX_ENTRIES = 10;
export const NAME_MAX_LENGTH = 12;

const STORAGE_KEY = "glitchHunter.leaderboard";

export function loadLeaderboard() {
    try {
        let list = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!Array.isArray(list)) return [];
        return list
            .filter(e => e && typeof e.name === "string" && typeof e.score === "number")
            .slice(0, MAX_ENTRIES);
    } catch (error) {
        return []; // storage blocked or corrupted: start with an empty board
    }
}

// Does this score earn a spot on the board?
export function qualifies(list, score) {
    if (score <= 0) return false;
    return list.length < MAX_ENTRIES || score > list[list.length - 1].score;
}

// The moment this round's score passes the current #1: fires once per round, and only when
// there's a record to beat (the very first player of the day gets the game over celebration instead).
export function checkNewRecord(state) {
    if (state.recordBroken || state.leaderboard.length === 0) return;
    if (state.score > state.leaderboard[0].score) {
        state.recordBroken = true;
        state.events.push({ type: "newRecord", score: state.score });
    }
}

// Does a finished round's score take the top spot?
export function isNewTop(list, score) {
    return score > 0 && (list.length === 0 || score > list[0].score);
}

// The place (1 = top) this score would take on the board. Ties go below older scores.
export function getRank(list, score) {
    let index = list.findIndex(e => e.score < score);
    return (index === -1 ? list.length : index) + 1;
}

// Insert the current score under `name`, keep the top 10, save, and remember where it landed.
export function addScore(state, name) {
    let list = state.leaderboard;
    let index = getRank(list, state.score) - 1;

    list.splice(index, 0, { name: name, score: state.score });
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
    state.lastSavedIndex = index < MAX_ENTRIES ? index : -1;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (error) {
        // storage unavailable: the score still shows until the page reloads
    }
}
