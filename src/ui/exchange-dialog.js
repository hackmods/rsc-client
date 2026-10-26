// Grand Exchange panel. Opened by EXCHANGE_STATE (140) with flags bit0, closed
// by EXCHANGE_CLOSE (142) or the close button. Every action is a `::ge`
// command sent by item id (Autonomous-RSC docs/GRAND_EXCHANGE.md, "Clients").
const GameData = require('../game-data');
const colours = require('./_colours');
const {
    SLOT_COUNT,
    COLLECT_MAX,
    COINS_ID,
    emptyState,
    formatQuote,
    formatAmount,
    isListable,
    searchItems,
    stepPrice,
    commands
} = require('../lib/exchange');

const WIDTH = 470;
const HEIGHT = 300;
const X0 = 256 - WIDTH / 2;
const Y0 = 17;

const SLOT_Y = Y0 + 30;
const SLOT_W = 56;
const SLOT_H = 63;
const COLLECT_Y = Y0 + 96;
const BOTTOM_Y = Y0 + 146;

const MAX_INT = 0x7fffffff;
const SEARCH_MAX = 24;
const SEARCH_CHARS = /^[a-zA-Z0-9 '\-().]$/;

const TITLE_BLUE = 192;
const DIM = 0x606060;

function freshUi() {
    return {
        mode: 'slots', // slots | choose | cancel | sell | buy | offer
        slot: -1,
        side: 'buy',
        itemId: -1,
        qty: '',
        price: '',
        priceTouched: false,
        focus: '',
        search: '',
        matches: [],
        error: '',
        notice: ''
    };
}

function openDialogExchange() {
    this.showDialogExchange = true;
    this.exchangeUi = freshUi();

    if (!this.exchangeState) {
        this.exchangeState = emptyState();
    }
}

function closeDialogExchange(tellServer) {
    if (tellServer) {
        this.sendCommandString(commands.close());
    }

    this.showDialogExchange = false;
}

function exchangeQuoteArrived(quote) {
    const ui = this.exchangeUi;

    if (
        ui &&
        ui.mode === 'offer' &&
        ui.itemId === quote.itemId &&
        !ui.priceTouched &&
        quote.guide > 0
    ) {
        ui.price = String(quote.guide);
    }
}

function exchangeSellable(id) {
    // equipped items are worn, not for sale
    let count = 0;

    for (let i = 0; i < this.inventoryItemsCount; i++) {
        if (this.inventoryItemId[i] !== id || this.inventoryEquipped[i] === 1) {
            continue;
        }

        count +=
            GameData.itemStackable[id] === 1
                ? 1
                : this.inventoryItemStackCount[i];
    }

    return count;
}

function exchangeChooseItem(side, itemId) {
    const ui = this.exchangeUi;
    const quote = this.exchangeQuotes && this.exchangeQuotes[itemId];
    const base = Math.max(1, GameData.itemBasePrice[itemId] | 0);

    ui.mode = 'offer';
    ui.side = side;
    ui.itemId = itemId;
    ui.qty = String(side === 'sell' ? this.exchangeSellable(itemId) : 1);
    ui.price = String(quote && quote.guide > 0 ? quote.guide : base);
    ui.priceTouched = false;
    ui.focus = 'qty';
    ui.error = '';

    this.sendCommandString(commands.price(itemId));
}

function exchangeConfirm() {
    const ui = this.exchangeUi;
    const state = this.exchangeState;
    const qty = parseInt(ui.qty, 10) || 0;
    const price = parseInt(ui.price, 10) || 0;

    if (state.barred) {
        ui.error = 'The Exchange does not deal with conjured goods.';
        return;
    }

    if (qty < 1 || price < 1) {
        ui.error = 'Enter a quantity and a price of at least 1.';
        return;
    }

    if (ui.side === 'sell') {
        const have = this.exchangeSellable(ui.itemId);

        if (qty > have) {
            ui.error = `You only have ${have} to sell.`;
            return;
        }
    } else if (qty * price > this.getInventoryCount(COINS_ID)) {
        ui.error = 'You do not have enough coins for that offer.';
        return;
    }

    this.sendCommandString(commands.offer(ui.side, ui.itemId, qty, price));

    const name = GameData.itemName[ui.itemId];

    this.exchangeUi = freshUi();
    this.exchangeUi.notice =
        `Offer sent: ${ui.side} ${qty} ${name} at ${price}gp each.`;
}

function exchangeKeyPress(key) {
    const ui = this.exchangeUi;

    if (!ui) {
        return;
    }

    const isEnter = key === 13 || key === 10;
    const isBackspace = key === 8;
    const char = key > 0 && key < 65535 ? String.fromCharCode(key) : '';

    if (ui.mode === 'buy') {
        if (isEnter) {
            if (ui.matches.length > 0) {
                this.exchangeChooseItem('buy', ui.matches[0]);
            }

            return;
        }

        let search = ui.search;

        if (isBackspace) {
            search = search.slice(0, -1);
        } else if (SEARCH_CHARS.test(char) && search.length < SEARCH_MAX) {
            search += char;
        }

        if (search !== ui.search) {
            ui.search = search;
            ui.matches = searchItems(
                search,
                GameData.itemName,
                GameData.itemSpecial,
                8
            );
        }

        return;
    }

    if (ui.mode !== 'offer') {
        return;
    }

    if (isEnter) {
        this.exchangeConfirm();
        return;
    }

    if (key === 9) {
        ui.focus = ui.focus === 'qty' ? 'price' : 'qty';
        return;
    }

    const field = ui.focus === 'price' ? 'price' : 'qty';
    let value = ui[field];

    if (isBackspace) {
        value = value.slice(0, -1);
    } else if (/^[0-9]$/.test(char)) {
        value = value === '0' ? char : value + char;
    } else if (/^[kKmM]$/.test(char) && value.length > 0) {
        // 5k = 5000, 2m = 2000000
        value += /[kK]/.test(char) ? '000' : '000000';
    } else {
        return;
    }

    if (value.length > 0 && parseInt(value, 10) > MAX_INT) {
        value = String(MAX_INT);
    }

    ui[field] = value;
    ui.error = '';

    if (field === 'price') {
        ui.priceTouched = true;
    }
}

function drawDialogExchange() {
    const ui = this.exchangeUi || (this.exchangeUi = freshUi());
    const state = this.exchangeState || (this.exchangeState = emptyState());
    const surface = this.surface;

    // one click per frame, consumed by the first control that takes it
    const input = { click: this.mouseButtonClick !== 0 };
    this.mouseButtonClick = 0;

    const over = (x, y, w, h) =>
        this.mouseX >= x &&
        this.mouseX < x + w &&
        this.mouseY >= y &&
        this.mouseY < y + h;

    const take = (x, y, w, h) => {
        if (input.click && over(x, y, w, h)) {
            input.click = false;
            return true;
        }

        return false;
    };

    const button = (x, y, w, label, enabled = true) => {
        const h = 16;
        const hovered = enabled && over(x, y, w, h);

        surface.drawBoxAlpha(x, y, w, h, hovered ? colours.lightGrey : colours.grey, 160);
        surface.drawBoxEdge(x, y, w, h, colours.black);
        surface.drawStringCenter(
            label,
            x + ((w / 2) | 0),
            y + 12,
            1,
            !enabled ? DIM : hovered ? colours.red : colours.white
        );

        return enabled && take(x, y, w, h);
    };

    const textBox = (x, y, w, value, focused) => {
        const h = 16;

        surface.drawBox(x, y, w, h, colours.black);
        surface.drawBoxEdge(x, y, w, h, focused ? colours.yellow : colours.grey);

        const caret = focused && ((Date.now() / 500) | 0) % 2 === 0 ? '*' : '';

        surface.drawString(value + caret, x + 4, y + 12, 1, colours.white);

        return take(x, y, w, h);
    };

    const drawItem = (x, y, w, h, id) => {
        surface._spriteClipping_from9(
            x,
            y,
            w,
            h,
            this.spriteItem + GameData.itemPicture[id],
            GameData.itemMask[id],
            0,
            0,
            false
        );
    };

    // a click outside the panel closes it, like the shop
    if (input.click && !over(X0, Y0, WIDTH, HEIGHT)) {
        this.closeDialogExchange(true);
        return;
    }

    // title bar
    surface.drawBox(X0, Y0, WIDTH, 12, TITLE_BLUE);
    surface.drawString('Grand Exchange', X0 + 2, Y0 + 10, 1, colours.white);

    const overClose = over(X0 + WIDTH - 90, Y0, 90, 12);

    surface.drawStringRight(
        'Close window',
        X0 + WIDTH - 2,
        Y0 + 10,
        1,
        overClose ? colours.red : colours.white
    );

    if (take(X0 + WIDTH - 90, Y0, 90, 12)) {
        this.closeDialogExchange(true);
        return;
    }

    // status strip
    surface.drawBoxAlpha(X0, Y0 + 12, WIDTH, HEIGHT - 12, colours.grey, 160);

    surface.drawString(
        `Your money: ${this.getInventoryCount(COINS_ID)}gp`,
        X0 + 4,
        Y0 + 25,
        1,
        colours.yellow
    );

    if (state.barred) {
        surface.drawStringRight(
            'The Exchange does not deal with conjured goods.',
            X0 + WIDTH - 4,
            Y0 + 25,
            1,
            colours.red
        );
    } else if (!state.inRange) {
        surface.drawStringRight(
            'Stand near a general store clerk to trade',
            X0 + WIDTH - 4,
            Y0 + 25,
            1,
            colours.orange
        );
    } else {
        surface.drawStringRight(
            'Offers fill at the resting price. 2% tax on sales.',
            X0 + WIDTH - 4,
            Y0 + 25,
            1,
            colours.cyan
        );
    }

    // offer slots
    for (let i = 0; i < SLOT_COUNT; i++) {
        const offer = state.slots[i];
        const x = X0 + 7 + i * 57;
        const y = SLOT_Y;
        const selected =
            ui.slot === i && (ui.mode === 'choose' || ui.mode === 'cancel');

        surface.drawBoxAlpha(
            x,
            y,
            SLOT_W,
            SLOT_H,
            selected
                ? colours.red
                : over(x, y, SLOT_W, SLOT_H)
                    ? colours.lightGrey
                    : colours.lightGrey2,
            160
        );

        surface.drawBoxEdge(x, y, SLOT_W, SLOT_H, colours.black);
        surface.drawStringRight(`${i + 1}`, x + SLOT_W - 2, y + 10, 0, colours.white);

        if (!offer || !offer.side) {
            surface.drawStringCenter('Empty', x + SLOT_W / 2, y + 36, 1, DIM);
        } else {
            const isBuy = offer.side === 'buy';

            surface.drawString(
                isBuy ? 'Buy' : 'Sell',
                x + 2,
                y + 10,
                0,
                isBuy ? colours.green : colours.orange
            );

            drawItem(x + 4, y + 11, 48, 32, offer.itemId);

            const qty = Math.max(1, offer.qty);
            const done = offer.filled >= offer.qty;
            const fill = Math.min(48, ((48 * offer.filled) / qty) | 0);

            surface.drawBox(x + 4, y + 45, 48, 5, colours.black);

            if (fill > 0) {
                surface.drawBox(x + 4, y + 45, fill, 5, done ? 0x00c000 : 0xff8000);
            }

            surface.drawStringCenter(
                `${formatAmount(offer.price)}gp`,
                x + SLOT_W / 2,
                y + 60,
                0,
                colours.yellow
            );
        }

        if (take(x, y, SLOT_W, SLOT_H)) {
            ui.slot = i;
            ui.error = '';
            ui.notice = '';
            ui.mode = offer && offer.side ? 'cancel' : 'choose';
        }
    }

    // collection box
    surface.drawBoxAlpha(X0 + 4, COLLECT_Y, WIDTH - 8, 16, colours.black, 96);
    surface.drawString('Collection box', X0 + 8, COLLECT_Y + 12, 1, colours.white);

    const hasCollect = state.collect.length > 0;

    if (button(X0 + WIDTH - 178, COLLECT_Y, 64, 'Collect', hasCollect)) {
        this.sendCommandString(commands.collect(false));
    }

    if (button(X0 + WIDTH - 110, COLLECT_Y, 106, 'Collect to bank', hasCollect)) {
        this.sendCommandString(commands.collect(true));
    }

    if (!hasCollect) {
        surface.drawStringCenter(
            'Nothing waiting: proceeds and refunds come here',
            X0 + WIDTH / 2,
            COLLECT_Y + 36,
            1,
            DIM
        );
    }

    for (let i = 0; i < state.collect.length && i < COLLECT_MAX; i++) {
        const entry = state.collect[i];
        const x = X0 + 11 + i * 28;
        const y = COLLECT_Y + 18;

        surface.drawBoxAlpha(x, y, 28, 28, colours.lightGrey2, 160);
        surface.drawBoxEdge(x, y, 28, 28, colours.black);
        drawItem(x + 1, y + 1, 26, 18, entry.itemId);
        surface.drawStringCenter(
            formatAmount(entry.amount, 10000),
            x + 14,
            y + 27,
            0,
            colours.yellow
        );
    }

    surface.drawLineHoriz(X0 + 5, BOTTOM_Y - 2, WIDTH - 10, colours.black);

    const centre = X0 + WIDTH / 2;
    const by = BOTTOM_Y;

    if (ui.mode === 'slots') {
        surface.drawStringCenter(
            'Click an empty slot to buy or sell, a full slot to cancel it',
            centre,
            by + 40,
            1,
            colours.yellow
        );

        if (ui.notice) {
            surface.drawStringCenter(ui.notice, centre, by + 64, 1, colours.green);
        }
    } else if (ui.mode === 'choose') {
        surface.drawStringCenter(
            `Slot ${ui.slot + 1} is free. What would you like to do?`,
            centre,
            by + 30,
            1,
            colours.yellow
        );

        const enabled = !state.barred;

        if (button(centre - 150, by + 46, 90, 'Buy', enabled)) {
            ui.mode = 'buy';
            ui.side = 'buy';
            ui.search = '';
            ui.matches = [];
        }

        if (button(centre - 45, by + 46, 90, 'Sell', enabled)) {
            ui.mode = 'sell';
            ui.side = 'sell';
        }

        if (button(centre + 60, by + 46, 90, 'Back')) {
            ui.mode = 'slots';
        }

        if (!enabled) {
            surface.drawStringCenter(
                'The Exchange does not deal with conjured goods.',
                centre,
                by + 84,
                1,
                colours.red
            );
        }
    } else if (ui.mode === 'cancel') {
        const offer = state.slots[ui.slot];

        if (!offer || !offer.side) {
            ui.mode = 'slots';
        } else {
            const name = GameData.itemName[offer.itemId];
            const verb = offer.side === 'buy' ? 'Buying' : 'Selling';

            drawItem(X0 + 8, by + 8, 48, 32, offer.itemId);

            surface.drawString(
                `${verb} ${offer.qty} ${name} at ${offer.price}gp each`,
                X0 + 64,
                by + 20,
                1,
                colours.yellow
            );

            surface.drawString(
                `Filled ${offer.filled}/${offer.qty}`,
                X0 + 64,
                by + 36,
                1,
                colours.white
            );

            if (button(centre - 110, by + 60, 110, 'Cancel offer')) {
                this.sendCommandString(commands.cancel(ui.slot));
                ui.mode = 'slots';
                ui.notice =
                    `Cancelling slot ${ui.slot + 1}: the rest goes to ` +
                    'the collection box.';
            }

            if (button(centre + 10, by + 60, 90, 'Back')) {
                ui.mode = 'slots';
            }
        }
    } else if (ui.mode === 'sell') {
        surface.drawStringCenter(
            'Click an item in your inventory to sell',
            centre,
            by + 12,
            1,
            colours.yellow
        );

        for (let i = 0; i < 30; i++) {
            const x = X0 + 5 + (i % 10) * 46;
            const y = by + 16 + ((i / 10) | 0) * 34;

            surface.drawBoxAlpha(x, y, 46, 34, colours.lightGrey2, 160);
            surface.drawBoxEdge(x, y, 47, 35, colours.black);

            if (i >= this.inventoryItemsCount) {
                continue;
            }

            const id = this.inventoryItemId[i];
            const listable =
                isListable(id, GameData.itemName, GameData.itemSpecial) &&
                this.inventoryEquipped[i] !== 1;

            if (listable && over(x, y, 46, 34)) {
                surface.drawBoxAlpha(x, y, 46, 34, colours.yellow, 96);
            }

            drawItem(x, y, 48, 32, id);

            if (GameData.itemStackable[id] === 0) {
                surface.drawString(
                    formatAmount(this.inventoryItemStackCount[i]),
                    x + 1,
                    y + 10,
                    1,
                    colours.yellow
                );
            }

            if (!listable) {
                surface.drawBoxAlpha(x, y, 46, 34, colours.black, 128);
            }

            if (take(x, y, 46, 34)) {
                if (listable) {
                    this.exchangeChooseItem('sell', id);
                } else {
                    ui.error =
                        this.inventoryEquipped[i] === 1
                            ? 'Take it off before you sell it.'
                            : 'The Exchange cannot list that item.';
                }
            }
        }

        if (ui.mode === 'sell') {
            if (ui.error) {
                surface.drawString(ui.error, X0 + 8, by + 132, 1, colours.red);
            }

            if (button(X0 + WIDTH - 98, by + 120, 90, 'Back')) {
                ui.mode = 'slots';
                ui.error = '';
            }
        }
    } else if (ui.mode === 'buy') {
        surface.drawString('Item name:', X0 + 8, by + 18, 1, colours.yellow);
        textBox(X0 + 80, by + 6, 260, ui.search, true);

        if (!ui.search) {
            surface.drawString(
                'Type part of a name',
                X0 + 350,
                by + 18,
                1,
                colours.white
            );
        } else if (ui.matches.length === 0) {
            surface.drawString(
                'No tradeable item matches',
                X0 + 350,
                by + 18,
                1,
                colours.orange
            );
        }

        for (let i = 0; i < ui.matches.length; i++) {
            const id = ui.matches[i];
            const x = X0 + 8 + (i % 2) * 228;
            const y = by + 28 + ((i / 2) | 0) * 23;
            const hovered = over(x, y, 224, 22);

            surface.drawBoxAlpha(
                x,
                y,
                224,
                22,
                hovered ? colours.lightGrey : colours.lightGrey2,
                128
            );

            surface.drawBoxEdge(x, y, 224, 22, colours.black);
            drawItem(x + 2, y + 1, 30, 20, id);
            surface.drawString(
                GameData.itemName[id],
                x + 38,
                y + 15,
                1,
                hovered ? colours.red : colours.white
            );

            if (take(x, y, 224, 22)) {
                this.exchangeChooseItem('buy', id);
                break;
            }
        }

        if (ui.mode === 'buy' && button(X0 + WIDTH - 98, by + 124, 90, 'Back')) {
            ui.mode = 'slots';
        }
    } else if (ui.mode === 'offer') {
        const id = ui.itemId;
        const isBuy = ui.side === 'buy';
        const quote = this.exchangeQuotes && this.exchangeQuotes[id];

        drawItem(X0 + 8, by + 4, 48, 32, id);

        surface.drawString(
            `${isBuy ? 'Buy' : 'Sell'}: ${GameData.itemName[id]}`,
            X0 + 64,
            by + 16,
            1,
            isBuy ? colours.green : colours.orange
        );

        surface.drawString(
            quote ? formatQuote(quote) : 'Asking the Exchange for a price...',
            X0 + 64,
            by + 32,
            1,
            colours.cyan
        );

        // quantity row
        surface.drawString('Quantity:', X0 + 8, by + 56, 1, colours.yellow);

        if (textBox(X0 + 80, by + 44, 110, ui.qty, ui.focus === 'qty')) {
            ui.focus = 'qty';
        }

        const addQty = (n) => {
            const next = (parseInt(ui.qty, 10) || 0) + n;
            ui.qty = String(Math.min(MAX_INT, next));
            ui.focus = 'qty';
            ui.error = '';
        };

        if (button(X0 + 198, by + 44, 36, '+1')) {
            addQty(1);
        }

        if (button(X0 + 238, by + 44, 36, '+10')) {
            addQty(10);
        }

        if (button(X0 + 278, by + 44, 44, '+100')) {
            addQty(100);
        }

        if (!isBuy && button(X0 + 326, by + 44, 36, 'All')) {
            ui.qty = String(this.exchangeSellable(id));
            ui.focus = 'qty';
        }

        if (isBuy && quote) {
            surface.drawStringRight(
                `Limit left: ${quote.buyLimitLeft}`,
                X0 + WIDTH - 8,
                by + 56,
                1,
                colours.white
            );
        } else if (!isBuy) {
            surface.drawStringRight(
                `You have ${this.exchangeSellable(id)}`,
                X0 + WIDTH - 8,
                by + 56,
                1,
                colours.white
            );
        }

        // price row
        surface.drawString('Price each:', X0 + 8, by + 78, 1, colours.yellow);

        if (textBox(X0 + 80, by + 66, 110, ui.price, ui.focus === 'price')) {
            ui.focus = 'price';
        }

        const setPrice = (price) => {
            ui.price = String(price);
            ui.priceTouched = true;
            ui.focus = 'price';
            ui.error = '';
        };

        const current = parseInt(ui.price, 10) || 1;
        const guide =
            quote && quote.guide > 0
                ? quote.guide
                : Math.max(1, GameData.itemBasePrice[id] | 0);

        if (button(X0 + 198, by + 66, 52, 'Guide')) {
            setPrice(guide);
        }

        if (button(X0 + 254, by + 66, 40, '-5%')) {
            setPrice(stepPrice(current, -5));
        }

        if (button(X0 + 298, by + 66, 40, '+5%')) {
            setPrice(stepPrice(current, 5));
        }

        const qty = parseInt(ui.qty, 10) || 0;
        const total = qty * (parseInt(ui.price, 10) || 0);

        surface.drawString(
            `Total: ${total}gp` +
                (isBuy ? '' : ' before the 2% tax (sales of 50gp each or more)'),
            X0 + 8,
            by + 100,
            1,
            colours.white
        );

        if (ui.error) {
            surface.drawString(ui.error, X0 + 8, by + 116, 1, colours.red);
        } else {
            surface.drawString(
                'Type numbers (k = thousand, m = million), Tab switches box',
                X0 + 8,
                by + 116,
                0,
                colours.lightGrey
            );
        }

        if (
            button(
                centre - 130,
                by + 126,
                150,
                isBuy ? 'Place buy offer' : 'Place sell offer',
                !state.barred
            )
        ) {
            this.exchangeConfirm();
        }

        if (button(centre + 40, by + 126, 90, 'Back')) {
            ui.mode = isBuy ? 'buy' : 'sell';
            ui.error = '';
        }
    }
}

module.exports = {
    showDialogExchange: false,
    exchangeState: null,
    exchangeQuotes: null,
    exchangeUi: null,
    openDialogExchange,
    closeDialogExchange,
    exchangeQuoteArrived,
    exchangeSellable,
    exchangeChooseItem,
    exchangeConfirm,
    exchangeKeyPress,
    drawDialogExchange
};
