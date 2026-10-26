// npm test  (no browser needed: the parse module and the packet
// handlers are pure)
const test = require('node:test');
const assert = require('node:assert');

const serverOpcodes = require('../src/opcodes/server.json');
const exchange = require('../src/lib/exchange');
const handlers = require('../src/packet-handlers/exchange');

// Byte writers matching the contract (big-endian, like the server encoders).
function writer() {
    const bytes = [];

    return {
        byte(v) {
            bytes.push(v & 0xff);
            return this;
        },
        short(v) {
            bytes.push((v >> 8) & 0xff, v & 0xff);
            return this;
        },
        int(v) {
            bytes.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
            return this;
        },
        // the client's buffers are Int8Array with the opcode at index 0
        packet(opcode) {
            const out = new Int8Array(bytes.length + 1);
            out[0] = opcode;
            out.set(Int8Array.from(bytes.map((b) => (b << 24) >> 24)), 1);
            return out;
        }
    };
}

function statePacket({ flags, coins, slots, collect }) {
    const w = writer().byte(flags).int(coins).byte(slots.length);

    for (const s of slots) {
        w.byte(s.state).short(s.itemId).int(s.qty).int(s.filled).int(s.price);
    }

    w.byte(collect.length);

    for (const c of collect) {
        w.short(c.itemId).int(c.amount);
    }

    return w.packet(serverOpcodes.EXCHANGE_STATE);
}

const EMPTY = { state: 0, itemId: 0, qty: 0, filled: 0, price: 0 };

function eightSlots(overrides) {
    const slots = [];

    for (let i = 0; i < 8; i++) {
        slots.push(overrides[i] || EMPTY);
    }

    return slots;
}

function fakeClient() {
    const sent = [];

    return {
        sent,
        showDialogExchange: false,
        exchangeState: null,
        exchangeQuotes: null,
        opened: 0,
        quoteSeen: null,
        openDialogExchange() {
            this.opened++;
            this.showDialogExchange = true;
        },
        exchangeQuoteArrived(q) {
            this.quoteSeen = q;
        },
        sendCommandString(c) {
            sent.push(c);
        }
    };
}

function run(client, packet) {
    const opcode = packet[0] & 0xff;
    handlers[opcode].call(client, packet, packet.length);
}

test('opcodes 140-142 are registered', () => {
    assert.strictEqual(serverOpcodes.EXCHANGE_STATE, 140);
    assert.strictEqual(serverOpcodes.EXCHANGE_QUOTE, 141);
    assert.strictEqual(serverOpcodes.EXCHANGE_CLOSE, 142);
    assert.deepStrictEqual(Object.keys(handlers).sort(), ['140', '141', '142']);
});

test('parseExchangeState reads flags, coins, slots and the collection box', () => {
    const packet = statePacket({
        flags: 0b101, // open + clerk in range
        coins: 123456,
        slots: eightSlots({
            0: { state: 1, itemId: 155, qty: 100, filled: 30, price: 45 },
            3: { state: 2, itemId: 373, qty: 2000000, filled: 2000000, price: 300000 }
        }),
        collect: [
            { itemId: 10, amount: 1470 },
            { itemId: 155, amount: 30 }
        ]
    });

    const state = exchange.parseExchangeState(packet, 1);

    assert.strictEqual(state.open, true);
    assert.strictEqual(state.barred, false);
    assert.strictEqual(state.inRange, true);
    assert.strictEqual(state.coins, 123456);
    assert.strictEqual(state.slots.length, 8);
    assert.deepStrictEqual(state.slots[0], {
        slot: 0,
        state: 1,
        side: 'buy',
        itemId: 155,
        qty: 100,
        filled: 30,
        price: 45
    });
    assert.strictEqual(state.slots[3].side, 'sell');
    assert.strictEqual(state.slots[3].qty, 2000000);
    assert.strictEqual(state.slots[3].price, 300000);
    assert.strictEqual(state.slots[1].side, null);
    assert.strictEqual(state.slots[1].state, 0);
    assert.deepStrictEqual(state.collect, [
        { itemId: 10, amount: 1470 },
        { itemId: 155, amount: 30 }
    ]);
});

test('parseExchangeState reads the barred bit and an empty book', () => {
    const state = exchange.parseExchangeState(
        statePacket({ flags: 0b010, coins: 0, slots: eightSlots({}), collect: [] }),
        1
    );

    assert.strictEqual(state.open, false);
    assert.strictEqual(state.barred, true);
    assert.strictEqual(state.inRange, false);
    assert.ok(state.slots.every((s) => s.side === null));
    assert.deepStrictEqual(state.collect, []);
});

test('parseExchangeQuote reads every field', () => {
    const packet = writer()
        .short(155)
        .int(47)
        .int(45)
        .int(0)
        .int(1820)
        .int(880)
        .packet(serverOpcodes.EXCHANGE_QUOTE);

    const quote = exchange.parseExchangeQuote(packet, 1);

    assert.deepStrictEqual(quote, {
        itemId: 155,
        guide: 47,
        bid: 45,
        ask: 0,
        vol24: 1820,
        buyLimitLeft: 880
    });
    assert.strictEqual(exchange.formatQuote(quote), 'Guide 47  Bid 45  Ask -  24h 1820');
});

test('140 with bit0 opens the panel; without it only an open panel updates', () => {
    const client = fakeClient();
    const closedUpdate = statePacket({
        flags: 0b100,
        coins: 5,
        slots: eightSlots({}),
        collect: []
    });

    run(client, closedUpdate);
    assert.strictEqual(client.showDialogExchange, false);
    assert.strictEqual(client.exchangeState, null, 'ignored while closed');

    const open = statePacket({
        flags: 0b101,
        coins: 9,
        slots: eightSlots({ 2: { state: 1, itemId: 155, qty: 10, filled: 0, price: 50 } }),
        collect: []
    });

    run(client, open);
    assert.strictEqual(client.showDialogExchange, true);
    assert.strictEqual(client.opened, 1);
    assert.strictEqual(client.exchangeState.slots[2].itemId, 155);

    const update = statePacket({
        flags: 0b100,
        coins: 9,
        slots: eightSlots({ 2: { state: 1, itemId: 155, qty: 10, filled: 4, price: 50 } }),
        collect: [{ itemId: 155, amount: 4 }]
    });

    run(client, update);
    assert.strictEqual(client.opened, 1, 'an update does not reopen');
    assert.strictEqual(client.exchangeState.slots[2].filled, 4);
    assert.deepStrictEqual(client.exchangeState.collect, [{ itemId: 155, amount: 4 }]);

    run(client, writer().packet(serverOpcodes.EXCHANGE_CLOSE));
    assert.strictEqual(client.showDialogExchange, false);

    run(client, update);
    assert.strictEqual(client.showDialogExchange, false, 'closed stays closed');
});

test('141 stores the quote and tells an open panel', () => {
    const client = fakeClient();
    const packet = writer()
        .short(373)
        .int(250)
        .int(240)
        .int(260)
        .int(12)
        .int(1000)
        .packet(serverOpcodes.EXCHANGE_QUOTE);

    run(client, packet);
    assert.strictEqual(client.exchangeQuotes[373].guide, 250);
    assert.strictEqual(client.quoteSeen, null, 'panel closed: stored only');

    client.showDialogExchange = true;
    run(client, packet);
    assert.strictEqual(client.quoteSeen.ask, 260);
});

test('searchItems: tradeable names only, prefixes first, at most 8', () => {
    const names = [
        'Iron dagger', // 0
        'Bronze dagger', // 1
        'Iron ore', // 2
        'Coins', // 3
        'Members object', // 4
        'Iron bar', // 5
        'Iron key', // 6 untradeable
        'Pig iron' // 7
    ];
    names[10] = 'Coins';
    const special = new Int32Array(names.length);
    special[6] = 1;

    assert.deepStrictEqual(exchange.searchItems('iron', names, special), [0, 2, 5, 7]);
    assert.deepStrictEqual(exchange.searchItems('dagger', names, special), [0, 1]);
    assert.deepStrictEqual(exchange.searchItems('coin', names, special), [3]);
    assert.deepStrictEqual(exchange.searchItems('members', names, special), []);
    assert.deepStrictEqual(exchange.searchItems('  ', names, special), []);

    const many = Array.from({ length: 40 }, (_, i) => `Rune ${i}`);
    assert.strictEqual(exchange.searchItems('rune', many, null).length, 8);
});

test('price steps, amounts and the ::ge command strings', () => {
    assert.strictEqual(exchange.stepPrice(100, 5), 105);
    assert.strictEqual(exchange.stepPrice(100, -5), 95);
    assert.strictEqual(exchange.stepPrice(10, 5), 11);
    assert.strictEqual(exchange.stepPrice(1, -5), 1);
    assert.strictEqual(exchange.formatAmount(99999), '99999');
    assert.strictEqual(exchange.formatAmount(250000), '250k');
    assert.strictEqual(exchange.formatAmount(12000000), '12m');
    assert.strictEqual(exchange.formatAmount(13720, 10000), '13k');
    assert.strictEqual(exchange.formatAmount(9999, 10000), '9999');
    assert.strictEqual(exchange.formatAmount(3000000, 10000), '3m');

    const c = exchange.commands;
    assert.strictEqual(c.price(155), 'ge price 155');
    assert.strictEqual(c.offer('buy', 155, 100, 45), 'ge buy 155 100 45');
    assert.strictEqual(c.offer('sell', 373, 5, 300), 'ge sell 373 5 300');
    assert.strictEqual(c.cancel(0), 'ge cancel 1');
    assert.strictEqual(c.cancel(7), 'ge cancel 8');
    assert.strictEqual(c.collect(false), 'ge collect');
    assert.strictEqual(c.collect(true), 'ge collect bank');
    assert.strictEqual(c.close(), 'ge close');
});
