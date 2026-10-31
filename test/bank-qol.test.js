const test = require('node:test');
const assert = require('node:assert/strict');
const bank = require('../src/ui/bank-dialog');
const data = require('../src/game-data');
const opcodes = require('../src/opcodes/client');
data.itemName = ['Bronze sword', 'Gold coins', 'Iron sword'];
data.itemStackable = [1, 0, 1];
data.itemPicture = [0, 1, 2];
data.itemMask = [0, 0, 0];
function client() {
    const draws = [], packets = [];
    let packet;
    const c = Object.assign({}, bank, {
        gameWidth: 800, gameHeight: 600, showDialogBank: true,
        bankItems: [0, 1, 2], bankItemsCount: [20, 100000, 3], bankItemCount: 3,
        bankSelectedItem: -2, bankSelectedItemSlot: -1,
        mouseX: 0, mouseY: 0, mouseButtonClick: 0, spriteItem: 0,
        getInventoryCount: id => id === 1 ? 100000 : 8,
        surface: new Proxy({}, { get: (_, method) => (...args) => draws.push([method, ...args]) }),
        packetStream: {
            newPacket: op => { packet = [op]; },
            putShort: n => packet.push(n), putInt: n => packet.push(n),
            sendPacket: () => packets.push(packet)
        }
    });
    return { c, draws, packets };
}
function click(c, x, y) {
    c.mouseX = (c.gameWidth / 2 | 0) - 204 + x;
    c.mouseY = (c.gameHeight / 2 | 0) - 167 + y;
    c.mouseButtonClick = 1; c.drawDialogBank();
}
function type(c, text) { for (const char of text) assert.equal(c.bankKeyPress(char.charCodeAt(0)), true); }

test('case-insensitive substring search maps clicked result to server slot and shows empty result', () => {
    const { c, draws } = client();
    click(c, 70, 290); type(c, 'COIN'); c.drawDialogBank();
    click(c, 15, 35);
    assert.equal(c.bankSelectedItem, 1); assert.equal(c.bankSelectedItemSlot, 1);
    click(c, 70, 290); type(c, 'zzz'); c.drawDialogBank();
    assert.ok(draws.some(d => d[1] === 'No matching bank items'));
    assert.equal(c.showDialogBank, true);
});
test('compaction preserves identity and prompt submits captured item, never replacement slot', () => {
    const { c, packets } = client();
    click(c, 65, 35); click(c, 328, 240); type(c, '42');
    c.bankItems = [1, 2]; c.bankItemsCount = [70, 3]; c.bankItemCount = 2;
    c.drawDialogBank(); assert.equal(c.bankSelectedItemSlot, 0);
    c.bankKeyPress(13);
    assert.deepEqual(packets, [[opcodes.BANK_WITHDRAW, 1, 42, 0x12345678]]);
    assert.equal(c.bankLastWithdrawX, 42);
    click(c, 328, 240); type(c, '2');
    c.bankItems = [2]; c.bankItemsCount = [3]; c.bankItemCount = 1;
    c.bankKeyPress(13); assert.equal(packets.length, 1);
});
test('X validates zero, overflow, current availability; last-X and All preserve wire bounds', () => {
    const { c, packets } = client();
    click(c, 65, 35); click(c, 328, 240); type(c, '65536');
    c.bankKeyPress(13); assert.equal(packets.length, 0);
    for (let i = 0; i < 5; i++) c.bankKeyPress(8);
    type(c, '0'); c.bankKeyPress(13); assert.equal(packets.length, 0);
    c.bankKeyPress(8); type(c, '60'); c.bankItemsCount[1] = 50;
    c.bankKeyPress(13); assert.equal(packets.length, 0);
    c.bankKeyPress(27); c.bankItemsCount[1] = 100000;
    click(c, 380, 240); assert.equal(packets[0][2], 65535);
    click(c, 328, 265); type(c, '42'); c.bankKeyPress(13);
    click(c, 345, 265); assert.equal(packets[2][2], 42);
    assert.equal(packets[1][3], 0x87654321);
});
test('nonstackable withdrawals remain one; typing is consumed only while bank input focused', () => {
    const { c, packets } = client();
    assert.equal(c.bankKeyPress(65), false);
    click(c, 15, 35); click(c, 380, 240);
    assert.equal(packets[0][2], 1);
    click(c, 328, 240); type(c, '2'); c.bankKeyPress(13);
    assert.equal(packets.length, 1);
    assert.equal(c.bankKeyPress(65), true);
    c.bankKeyPress(27); click(c, 70, 290); type(c, 'iron');
    c.resetBankInput(); assert.equal(c.bankSearch, ''); assert.equal(c.bankKeyPress(65), false);
});
test('mobile focus uses existing keyboard and cancel/reset clean it up without transactions', () => {
    const { c, packets } = client();
    const opened = [];
    let closed = 0;
    c.options = { mobile: true };
    c.mobileInputEl = {};
    c.openKeyboard = (...args) => opened.push(args);
    c.closeKeyboard = () => closed++;
    click(c, 70, 290); type(c, 'coin');
    assert.equal(opened[0][0], 'text');
    click(c, 15, 35);
    assert.equal(closed, 1);
    click(c, 328, 240);
    assert.equal(opened[1][0], 'number');
    type(c, '42'); click(c, 204, 177);
    assert.equal(c.bankAmountInput, null);
    assert.equal(closed, 2);
    assert.equal(packets.length, 0);
    click(c, 328, 240); type(c, '42'); c.bankKeyPress(13);
    assert.equal(closed, 3);
    assert.equal(packets.length, 1);
    click(c, 70, 290); c.resetBankInput();
    assert.equal(closed, 4);
    assert.equal(c.bankSearchFocus, false);
});
test('search ranks prefixes first and preserves order within prefix and substring groups', () => {
    const { c } = client();
    const names = data.itemName;
    data.itemName = ['Iron sword', 'Swordfish', 'Sword', 'Bronze sword'];
    c.bankItems = [0, 1, 2, 3]; c.bankItemsCount = [1, 1, 1, 1]; c.bankItemCount = 4;
    c.bankSearch = 'sword';
    try {
        for (const [pos, id] of [[0, 1], [1, 2], [2, 0], [3, 3]]) {
            click(c, 15 + pos * 49, 35); assert.equal(c.bankSelectedItem, id);
        }
    } finally { data.itemName = names; }
});
test('bounded paging reaches final item of 256 slots and clamps after compaction', () => {
    const { c, draws } = client();
    c.bankItems = Array.from({ length: 256 }, (_, id) => id);
    c.bankItemsCount = Array(256).fill(1); c.bankItemCount = 256;
    for (let i = 0; i < 5; i++) click(c, 260, 6);
    assert.equal(c.bankActivePage, 5);
    assert.ok(draws.some(d => d[1] === 'Page 6/6'));
    click(c, 15 + 7 * 49, 35 + 34);
    assert.equal(c.bankSelectedItem, 255);
    click(c, 260, 6); assert.equal(c.bankActivePage, 5);
    click(c, 65, 6); assert.equal(c.bankActivePage, 4);
    c.bankItemCount = 3; c.drawDialogBank(); assert.equal(c.bankActivePage, 0);
});
test('long search keeps the cursor and visible tail within bank width without changing query', () => {
    const { c, draws } = client();
    const originalSurface = c.surface;
    c.surface = new Proxy({}, { get: (_, method) => method === 'textWidth' ? text => text.length * 12 : originalSurface[method] });
    c.bankSearch = 'W'.repeat(40); c.bankSearchFocus = true; c.drawDialogBank();
    const search = draws.find(d => d[0] === 'drawString' && d[1].startsWith('Search: '));
    assert.ok(search[1].length * 12 <= 404);
    assert.ok(search[1].endsWith('*')); assert.equal(c.bankSearch.length, 40);
});
test('capacity and optional base value use authoritative server rows, excluding inventory-only choices', () => {
    const { c, draws } = client();
    const prices = data.itemBasePrice;
    data.itemBasePrice = [10, 2, 999];
    c.newBankItemCount = 2; c.bankItemsMax = 192;
    c.bankItemsCount = [20, 50, 0]; c.options = { bankValue: true };
    try {
        c.drawDialogBank();
        assert.ok(draws.some(d => d[1] === 'Bank slots: 2/192'));
        assert.ok(draws.some(d => d[1] === 'Base value: 300'));
        c.bankSearch = 'nothing'; c.drawDialogBank();
        assert.equal(draws.filter(d => d[1] === 'Bank slots: 2/192').length, 2);
        c.bankItemsCount[0] = Number.MAX_SAFE_INTEGER;
        c.drawDialogBank(); assert.ok(draws.some(d => d[1] === 'Base value: very large'));
        const count = draws.filter(d => String(d[1]).startsWith('Base value:')).length;
        c.options.bankValue = false; c.drawDialogBank();
        assert.equal(draws.filter(d => String(d[1]).startsWith('Base value:')).length, count);
    } finally { data.itemBasePrice = prices; }
});
test('wheel pages only under bank, consumes delta, preserves search, and clamps both ends', () => {
    const { c } = client();
    c.bankItems = Array(100).fill(1); c.bankItemsCount = Array(100).fill(1); c.bankItemCount = 100;
    c.bankSearch = 'coin';
    c.mouseX = 0; c.mouseY = 0; c.mouseScrollDelta = 3; c.drawDialogBank();
    assert.equal(c.bankActivePage, 0); assert.equal(c.mouseScrollDelta, 3);
    c.mouseX = c.gameWidth / 2; c.mouseY = c.gameHeight / 2;
    c.drawDialogBank(); assert.equal(c.bankActivePage, 1); assert.equal(c.mouseScrollDelta, 0);
    assert.equal(c.bankSearch, 'coin');
    c.mouseScrollDelta = 9; c.drawDialogBank(); assert.equal(c.bankActivePage, 2);
    c.mouseScrollDelta = 9; c.drawDialogBank(); assert.equal(c.bankActivePage, 2);
    for (let i = 0; i < 3; i++) { c.mouseScrollDelta = -2; c.drawDialogBank(); }
    assert.equal(c.bankActivePage, 0);
    c.bankAmountInput = { id: 1, withdraw: true, text: '', error: '' };
    c.mouseScrollDelta = 1; c.drawDialogBank();
    assert.equal(c.bankActivePage, 0); assert.equal(c.mouseScrollDelta, 0);
});
