const GameData = require('../game-data');

// Labels ground items near the player tile (±8 region); sprite screen
// projection is not exposed on scene sprites in this client.
function drawGroundItemText() {
    if (!this.options || !this.options.groundItemText) {
        return;
    }

    const threshold = 50;
    const px = this.localRegionX;
    const py = this.localRegionY;
    const names = [];

    for (let i = 0; i < this.groundItemCount && names.length < 5; i++) {
        const gx = this.groundItemX[i];
        const gy = this.groundItemY[i];

        if (Math.abs(gx - px) > 8 || Math.abs(gy - py) > 8) {
            continue;
        }

        const id = this.groundItemID[i];

        if (
            GameData.itemBasePrice &&
            GameData.itemBasePrice[id] < threshold
        ) {
            continue;
        }

        const name = GameData.itemName[id];

        if (name && names.indexOf(name) === -1) {
            names.push(name);
        }
    }

    let y = 28;

    for (const name of names) {
        this.surface.drawString(name, 6, y, 1, 0xffff00);
        y += 12;
    }
}

module.exports = { drawGroundItemText };
