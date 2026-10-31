const test = require('node:test');
const assert = require('node:assert/strict');
const minimap = require('../src/ui/minimap-tab');
const combat = require('../src/ui/combat-style');
const Scene = require('../src/scene');
const opcodes = require('../src/opcodes/client');

function client() {
    const walks = [], packets = [];
    let packet;
    const c = Object.assign({}, minimap, combat, {
        options: { compassMenu: true, resetCompass: true },
        gameWidth: 512, gameHeight: 346, spriteMedia: 0,
        cameraRotation: 17, minimapRandom1: 0, minimapRandom2: 0,
        localPlayer: { currentX: 6040, currentY: 6040 },
        objectCount: 0, groundItemCount: 0, npcCount: 0, playerCount: 0,
        localRegionX: 48, localRegionY: 48,
        mouseX: 512 - 159 + 19, mouseY: 36 + 19, mouseButtonClick: 0,
        menuItemsCount: 0, menuType: new Int32Array(250), menuIndex: new Int32Array(250),
        menuItemText1: [], menuItemText2: [],
        surface: new Proxy({}, { get: () => () => {} }),
        _walkToActionSource_from5: (...args) => walks.push(args),
        packetStream: { newPacket: op => { packet = [op]; }, putByte: n => packet.push(n), sendPacket: () => packets.push(packet) }
    });
    return { c, walks, packets };
}
// Minimap uses the same lookup table initialized by Scene at browser startup.
for (let i = 0; i < 1024; i++) {
    Scene.sinCosCache[i] = (Math.sin(i * Math.PI * 2 / 1024) * 32768) | 0;
    Scene.sinCosCache[i + 1024] = (Math.cos(i * Math.PI * 2 / 1024) * 32768) | 0;
}

test('compass context offers C cardinal directions and selection changes orientation without walking or packets', () => {
    const { c, walks, packets } = client();
    c.mouseButtonClick = 2; c.drawUiTabMinimap(true);
    assert.deepEqual(c.menuItemText2, ['North', 'East', 'South', 'West']);
    assert.equal(c.mouseButtonClick, 2);
    for (const [i, rotation] of [[0, 128], [1, 192], [2, 0], [3, 64]]) {
        assert.equal(c.compassMenuItemClick(i), true); assert.equal(c.cameraRotation, rotation);
    }
    assert.equal(c.compassMenuItemClick(4), false);
    assert.equal(walks.length, 0); assert.equal(packets.length, 0);
});
test('normal map clicks still walk; disabled context preserves north-reset behavior', () => {
    const { c, walks } = client();
    c.mouseX = c.gameWidth - 159 + 78; c.mouseY = 36 + 76; c.mouseButtonClick = 1;
    c.drawUiTabMinimap(true);
    assert.equal(walks.length, 1); assert.equal(c.mouseButtonClick, 0);
    c.options.compassMenu = false; c.mouseX = c.gameWidth - 159 + 19; c.mouseY = 55; c.mouseButtonClick = 1;
    c.drawUiTabMinimap(true);
    assert.equal(c.cameraRotation, 128); assert.equal(c.menuItemsCount, 0); assert.equal(walks.length, 1);
});
test('blocked menus add no actions; menu capacity and malformed orientation are safe', () => {
    const { c } = client(); c.drawUiTabMinimap(false); assert.equal(c.menuItemsCount, 0);
    c.menuItemsCount = 249; c.drawUiTabMinimap(true); assert.equal(c.menuItemsCount, 250);
    c.menuIndex[249] = 255; c.compassMenuItemClick(249); assert.equal(c.cameraRotation, 17);
});
test('existing combat dialog selects a style and sends its unchanged opcode outside combat', () => {
    const { c, packets } = client(); c.mouseX = 20; c.mouseY = 60; c.mouseButtonClick = 1;
    c.drawDialogCombatStyle();
    assert.equal(c.combatStyle, 1); assert.equal(c.mouseButtonClick, 0);
    assert.deepEqual(packets, [[opcodes.COMBAT_STYLE, 1]]);
});
