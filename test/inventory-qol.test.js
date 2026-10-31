const test = require('node:test');
const assert = require('node:assert/strict');
const GameData = require('../src/game-data');
const { drawUiTabInventory } = require('../src/ui/inventory-tab');

function client(count = 1, amount = 1000) {
    const calls = [];
    const mud = { gameWidth: 512, gameHeight: 334, options: {},
        inventoryMaxItemCount: 30, inventoryItemsCount: count,
        inventoryEquipped: Array(30).fill(0), inventoryItemId: Array(30).fill(0),
        inventoryItemStackCount: Array(30).fill(amount), spriteItem: 0, spriteMedia: 0,
        mouseX: 265, mouseY: 40, selectedSpell: -1, selectedItemInventoryIndex: -1,
        menuItemsCount: 0, menuItemText1: [], menuItemText2: [], menuType: [],
        menuIndex: [], menuSourceIndex: [], surface: {} };
    for (const method of ['_drawSprite_from3', 'drawBoxAlpha', '_spriteClipping_from9',
        'drawString', 'drawStringRight', 'drawLineVert', 'drawLineHoriz']) {
        mud.surface[method] = (...args) => calls.push([method, ...args]);
    }
    return { mud, calls, draw: (menus = true) => drawUiTabInventory.call(mud, menus) };
}

function itemFixture(t) {
    for (const [property, value] of Object.entries({ itemPicture: [0], itemMask: [0],
        itemStackable: [0], itemName: ['Coins'], itemWearable: [0], itemCommand: [''] })) {
        const previous = GameData[property];
        GameData[property] = value;
        t.after(() => { GameData[property] = previous; });
    }
}

test('occupancy counts slots at empty, partial and full boundaries, outside the grid', t => {
    itemFixture(t);
    for (const count of [0, 1, 29, 30]) {
        const { mud, calls, draw } = client(count, 2147483647);
        mud.options.inventoryCount = true;
        draw(false);
        const counter = calls.find(call => call[1] === `${count}/30`);
        assert.ok(counter);
        assert.ok(counter[3] > mud.uiOpenY + mud.uiOpenHeight);
    }
});

test('disabled options preserve exact stack labels and existing menu contracts', t => {
    itemFixture(t);
    const { mud, calls, draw } = client();
    draw();
    assert.ok(calls.some(call => call[1] === '1000'));
    assert.ok(!calls.some(call => call[1] === '1/30' || call[1] === 'Amount: 1,000'));
    assert.deepEqual(mud.menuType, [650, 660, 3600]);
    assert.deepEqual(mud.menuIndex, [0, 0, 0]);
    assert.deepEqual(mud.menuItemText2, ['@lre@Coins', '@lre@Coins', '@lre@Coins']);
});

test('compact boundaries truncate safely and hover retains exact quantities', t => {
    itemFixture(t);
    for (const [amount, label] of [[999, '999'], [1000, '1K'], [1999, '1.9K'],
        [999999, '999.9K'], [1000000, '1M'], [2147483647, '2147.4M']]) {
        const { mud, calls, draw } = client(1, amount);
        mud.options.compactAmounts = true;
        draw();
        assert.ok(calls.some(call => call[0] === 'drawString' && call[1] === label), label);
        const exact = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        assert.equal(calls.some(call => call[1] === `Amount: ${exact}`), amount >= 1000);
        assert.deepEqual(mud.menuType, [650, 660, 3600]);
    }
});

test('exact hover is hidden while menus are suppressed or a context menu is open', t => {
    itemFixture(t);
    for (const contextMenu of [false, true]) {
        const { mud, calls, draw } = client();
        mud.options.compactAmounts = true;
        mud.showRightClickMenu = contextMenu;
        draw(contextMenu);
        assert.ok(!calls.some(call => typeof call[1] === 'string' && call[1].startsWith('Amount:')));
    }
});
