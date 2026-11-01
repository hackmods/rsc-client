const test = require('node:test');
const assert = require('node:assert/strict');
const { compactAmount, formatWithCommas } = require('../src/lib/format-amount');
const { addOfferMenus, handleOfferMenuClick } = require('../src/ui/offer-menus');
const bank = require('../src/ui/bank-dialog');

test('compactAmount truncates K and M boundaries', () => {
    assert.equal(compactAmount(999), '999');
    assert.equal(compactAmount(1000), '1K');
    assert.equal(compactAmount(1999), '1.9K');
    assert.equal(compactAmount(1000000), '1M');
});

test('formatWithCommas groups thousands', () => {
    assert.equal(formatWithCommas(1000), '1,000');
});

test('addOfferMenus respects offerX and lastX', () => {
    const c = {
        options: { offerX: true, lastOfferX: true },
        menuItemsCount: 0,
        menuItemText1: new Array(250),
        menuItemText2: new Array(250),
        menuType: new Array(250),
        menuIndex: new Array(250),
        menuTargetIndex: new Array(250)
    };
    addOfferMenus(c, 'Withdraw', 601, 3, 100, '@lre@Coins', 42);
    const labels = c.menuItemText1.slice(0, c.menuItemsCount);
    assert.ok(labels.includes('Withdraw-42'));
    assert.ok(labels.includes('Withdraw-X'));
    const xIndex = labels.indexOf('Withdraw-X');
    assert.equal(c.menuTargetIndex[xIndex], -100);
});

test('handleOfferMenuClick opens bank amount prompt for X', () => {
    const opened = [];
    const c = {
        menuType: [601],
        menuIndex: [5],
        menuTargetIndex: [-20],
        bankAmountInput: null,
        gameWidth: 512,
        gameHeight: 346,
        options: { mobile: true },
        openKeyboard: (...args) => opened.push(args)
    };
    assert.equal(handleOfferMenuClick(c, 0), true);
    assert.deepEqual(c.bankAmountInput, { id: 5, withdraw: true, text: '', error: '' });
    assert.equal(opened[0][0], 'number');
});

test('handleOfferMenuClick performs bank transact', () => {
    const packets = [];
    let packet;
    const c = {
        menuType: [602],
        menuIndex: [1],
        menuTargetIndex: [10],
        bankItems: [1],
        bankItemsCount: [50],
        bankItemCount: 1,
        options: {},
        getInventoryCount: () => 100,
        packetStream: {
            newPacket: op => { packet = [op]; },
            putShort: n => packet.push(n),
            putInt: n => packet.push(n),
            sendPacket: () => packets.push(packet)
        }
    };
    assert.equal(handleOfferMenuClick(c, 0), true);
    assert.equal(packets.length, 1);
    assert.equal(c.bankLastDepositX, 10);
});
