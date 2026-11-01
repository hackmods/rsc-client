// Independent UI scale (J21): enlarges bank, inventory, and options tab layout only.
// Canvas resolution and world rendering stay at game pixels; full chrome scale is follow-on.
function uiScale(client) {
    const value = client && client.options && client.options.uiScale;
    if (value === 2) {
        return 2;
    }
    if (value === 1.5) {
        return 1.5;
    }
    return 1;
}

module.exports = { uiScale };
