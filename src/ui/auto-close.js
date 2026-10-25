// Followed bots never click these boxes, so they close themselves. The timer
// restarts on mouse movement, clicks and new content so a person reading is
// never cut off.
function autoCloseExpired(client, key, ms, content) {
    const now = Date.now();
    let state = client[key];

    if (!state) {
        state = client[key] = { last: 0, at: 0, x: -1, y: -1, content: '' };
    }

    const fresh = now - state.last > 1000;

    if (
        fresh ||
        state.content !== content ||
        state.x !== client.mouseX ||
        state.y !== client.mouseY ||
        client.mouseButtonClick !== 0
    ) {
        state.at = now;
        state.x = client.mouseX;
        state.y = client.mouseY;
        state.content = content;
    }

    state.last = now;

    return now - state.at >= ms;
}

module.exports = { autoCloseExpired };
