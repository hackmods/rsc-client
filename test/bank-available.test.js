const test = require('node:test');
const assert = require('node:assert/strict');
const { available } = require('../src/ui/bank-dialog');
const data = require('../src/game-data');

test('available caps default nonstackable withdraw to one', () => {
    data.itemStackable = [1];
    const c = {
        options: {},
        bankItems: [0],
        bankItemsCount: [10],
        bankItemCount: 1,
        getInventoryCount: () => 0
    };
    assert.equal(available(c, 0, true), 1);
});

test('available honors bankUnstackableWithdraw', () => {
    data.itemStackable = [1];
    const c = {
        options: { bankUnstackableWithdraw: true },
        bankItems: [0],
        bankItemsCount: [10],
        bankItemCount: 1,
        getInventoryCount: () => 0
    };
    assert.equal(available(c, 0, true), 10);
});
