// Grand Exchange: pure packet parsing and helpers (no browser or game-data
// dependencies, so node tests can require this file on its own). The panel is
// src/ui/exchange-dialog.js and the packet handlers are
// src/packet-handlers/exchange.js. Contract: Autonomous-RSC
// docs/GRAND_EXCHANGE.md, "Opcodes".

const SLOT_COUNT = 8;
const COLLECT_MAX = 16;

const FLAG_OPEN = 1;
const FLAG_BARRED = 2;
const FLAG_IN_RANGE = 4;

const SLOT_EMPTY = 0;
const SLOT_BUY = 1;
const SLOT_SELL = 2;

const COINS_ID = 10;

function readByte(data, offset) {
    return data[offset] & 0xff;
}

function readShort(data, offset) {
    return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff);
}

function readInt(data, offset) {
    return (
        ((data[offset] & 0xff) << 24) |
        ((data[offset + 1] & 0xff) << 16) |
        ((data[offset + 2] & 0xff) << 8) |
        (data[offset + 3] & 0xff)
    );
}

function emptySlot(slot) {
    return {
        slot,
        state: SLOT_EMPTY,
        side: null,
        itemId: 0,
        qty: 0,
        filled: 0,
        price: 0
    };
}

function emptyState() {
    const slots = [];

    for (let i = 0; i < SLOT_COUNT; i++) {
        slots.push(emptySlot(i));
    }

    return {
        flags: 0,
        open: false,
        barred: false,
        inRange: false,
        coins: 0,
        slots,
        collect: []
    };
}

// 140 EXCHANGE_STATE. `offset` is where the body starts: the client's packet
// buffers hold the opcode at index 0, so the handlers pass 1.
function parseExchangeState(data, offset = 0) {
    const state = emptyState();

    state.flags = readByte(data, offset);
    offset += 1;
    state.open = (state.flags & FLAG_OPEN) !== 0;
    state.barred = (state.flags & FLAG_BARRED) !== 0;
    state.inRange = (state.flags & FLAG_IN_RANGE) !== 0;

    state.coins = readInt(data, offset);
    offset += 4;

    const slotCount = readByte(data, offset);
    offset += 1;

    for (let i = 0; i < slotCount; i++) {
        const slotState = readByte(data, offset);
        const itemId = readShort(data, offset + 1);
        const qty = readInt(data, offset + 3);
        const filled = readInt(data, offset + 7);
        const price = readInt(data, offset + 11);
        offset += 15;

        if (i >= SLOT_COUNT) {
            continue;
        }

        if (slotState === SLOT_BUY || slotState === SLOT_SELL) {
            state.slots[i] = {
                slot: i,
                state: slotState,
                side: slotState === SLOT_BUY ? 'buy' : 'sell',
                itemId,
                qty,
                filled,
                price
            };
        }
    }

    const collectCount = readByte(data, offset);
    offset += 1;

    for (let i = 0; i < collectCount; i++) {
        const itemId = readShort(data, offset);
        const amount = readInt(data, offset + 2);
        offset += 6;

        if (state.collect.length < COLLECT_MAX) {
            state.collect.push({ itemId, amount });
        }
    }

    return state;
}

// 141 EXCHANGE_QUOTE
function parseExchangeQuote(data, offset = 0) {
    return {
        itemId: readShort(data, offset),
        guide: readInt(data, offset + 2),
        bid: readInt(data, offset + 6),
        ask: readInt(data, offset + 10),
        vol24: readInt(data, offset + 14),
        buyLimitLeft: readInt(data, offset + 18)
    };
}

function formatQuote(quote) {
    if (!quote) {
        return '';
    }

    const bid = quote.bid > 0 ? quote.bid : '-';
    const ask = quote.ask > 0 ? quote.ask : '-';

    return (
        `Guide ${quote.guide}  Bid ${bid}  Ask ${ask}  ` + `24h ${quote.vol24}`
    );
}

// 1234 -> "1234", 123456 -> "123k", 12345678 -> "12m" (RuneScape style).
// kFrom lowers the switches (thousands at kFrom, millions at 100 * kFrom)
// for narrow boxes.
function formatAmount(amount, kFrom = 100000) {
    if (amount < kFrom) {
        return String(amount);
    }

    if (amount < kFrom * 100) {
        return `${Math.floor(amount / 1000)}k`;
    }

    return `${Math.floor(amount / 1000000)}m`;
}

// Whether an item may be listed: not coins, not untradeable (`itemSpecial` 1,
// the flag the duel screen refuses), not hidden as a members object.
function isListable(itemId, names, special) {
    if (itemId === COINS_ID || itemId < 0 || itemId >= names.length) {
        return false;
    }

    if (special && special[itemId] === 1) {
        return false;
    }

    const name = names[itemId];

    return !!name && name !== 'Members object';
}

// Up to `limit` listable item ids whose names contain `query` (case
// insensitive). Names that start with the query come first; one id per name.
function searchItems(query, names, special, limit = 8) {
    const needle = String(query || '')
        .trim()
        .toLowerCase();

    if (!needle) {
        return [];
    }

    const prefix = [];
    const contains = [];
    const seen = new Set();

    for (let id = 0; id < names.length; id++) {
        if (!isListable(id, names, special)) {
            continue;
        }

        const name = names[id].toLowerCase();
        const at = name.indexOf(needle);

        if (at < 0 || seen.has(name)) {
            continue;
        }

        seen.add(name);

        if (at === 0) {
            prefix.push(id);

            if (prefix.length >= limit) {
                break;
            }
        } else if (contains.length < limit) {
            contains.push(id);
        }
    }

    return prefix.concat(contains).slice(0, limit);
}

// Price after a percentage step, never below 1: -5% rounds down, +5% up, so a
// step always moves a price above 20.
function stepPrice(price, percent) {
    const base = Math.max(1, price | 0);
    const next = (base * (100 + percent)) / 100;
    const rounded = percent < 0 ? Math.floor(next) : Math.ceil(next);

    return Math.max(1, Math.min(0x7fffffff, rounded));
}

// The `::ge` command strings the panel sends, without the leading "::"
// (sendCommandString adds the COMMAND opcode, like the chat box does).
const commands = {
    price: (itemId) => `ge price ${itemId}`,
    offer: (side, itemId, qty, price) => `ge ${side} ${itemId} ${qty} ${price}`,
    cancel: (slot) => `ge cancel ${slot + 1}`,
    collect: (toBank) => (toBank ? 'ge collect bank' : 'ge collect'),
    close: () => 'ge close'
};

module.exports = {
    SLOT_COUNT,
    COLLECT_MAX,
    FLAG_OPEN,
    FLAG_BARRED,
    FLAG_IN_RANGE,
    SLOT_EMPTY,
    SLOT_BUY,
    SLOT_SELL,
    COINS_ID,
    emptyState,
    parseExchangeState,
    parseExchangeQuote,
    formatQuote,
    formatAmount,
    isListable,
    searchItems,
    stepPrice,
    commands
};
