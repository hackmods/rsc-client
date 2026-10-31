const GameData = require('../game-data');
const clientOpcodes = require('../opcodes/client');
const colours = require('./_colours');
const WIDTH = 408;
const HEIGHT = 334;
const ITEMS_PER_PAGE = 48;
const MAGIC_DEPOSIT = 0x87654321;
const MAGIC_WITHDRAW = 0x12345678;

// Keep filtered positions separate from the server's compacting bank slots.
function bankView(client) {
    const query = (client.bankSearch || '').trim().toLowerCase();
    const prefixes = [];
    const slots = [];
    client.bankSelectedItemSlot = -1;
    for (let i = 0; i < client.bankItemCount; i++) {
        const id = client.bankItems[i];
        if (id < 0) continue;
        if (id === client.bankSelectedItem) client.bankSelectedItemSlot = i;
        const name = (GameData.itemName[id] || '').toLowerCase();
        if (query && name.startsWith(query)) prefixes.push(i);
        else if (!query || name.includes(query)) slots.push(i);
    }
    if (client.bankSelectedItemSlot < 0) client.bankSelectedItem = -2;
    client.bankActivePage = Math.max(0, Math.min(client.bankActivePage || 0, Math.max(0, Math.ceil((prefixes.length + slots.length) / ITEMS_PER_PAGE) - 1)));
    return prefixes.concat(slots);
}

function available(client, id, withdraw) {
    if (!withdraw) return Math.min(65535, client.getInventoryCount(id));
    for (let i = 0; i < client.bankItemCount; i++) {
        if (client.bankItems[i] === id) {
            return Math.min(GameData.itemStackable[id] === 1 ? 1 : 65535, client.bankItemsCount[i]);
        }
    }
    return 0;
}

function transact(client, id, amount, withdraw) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 65535 || amount > available(client, id, withdraw)) return false;
    client.packetStream.newPacket(withdraw ? clientOpcodes.BANK_WITHDRAW : clientOpcodes.BANK_DEPOSIT);
    client.packetStream.putShort(id);
    client.packetStream.putShort(amount);
    client.packetStream.putInt(withdraw ? MAGIC_WITHDRAW : MAGIC_DEPOSIT);
    client.packetStream.sendPacket();
    return true;
}

function keyboard(client, text, numeric, x, y) {
    if (client.options && client.options.mobile && client.openKeyboard) {
        client.lastMobileInput = text;
        client.openKeyboard(numeric ? 'number' : 'text', text, numeric ? 5 : 40, {
            left: `${x}px`, top: `${y}px`, width: '300px', height: '20px'
        });
    }
}

function closeBankKeyboard(client) {
    if (client.options && client.options.mobile && client.mobileInputEl && client.closeKeyboard) client.closeKeyboard();
}

function resetBankInput() {
    this.bankSearch = '';
    this.bankSearchFocus = false;
    this.bankAmountInput = null;
    this.bankActivePage = 0;
    closeBankKeyboard(this);
}

function bankKeyPress(keyCode) {
    if (!this.showDialogBank || (!this.bankAmountInput && !this.bankSearchFocus)) return false;
    const input = this.bankAmountInput;
    if (keyCode === 27) {
        if (input) this.bankAmountInput = null;
        else this.bankSearchFocus = false;
        closeBankKeyboard(this);
    } else if (keyCode === 13 || keyCode === 10) {
        if (input) {
            const amount = /^\d+$/.test(input.text) ? Number(input.text) : NaN;
            if (transact(this, input.id, amount, input.withdraw)) {
                this[input.withdraw ? 'bankLastWithdrawX' : 'bankLastDepositX'] = amount;
                this.bankAmountInput = null;
            } else input.error = 'Enter an available amount from 1 to 65535';
        } else this.bankSearchFocus = false;
        if (!this.bankAmountInput) closeBankKeyboard(this);
    } else if (keyCode === 8) {
        if (input) { input.text = input.text.slice(0, -1); input.error = ''; }
        else { this.bankSearch = (this.bankSearch || '').slice(0, -1); this.bankActivePage = 0; }
    } else if (input) {
        if (keyCode >= 48 && keyCode <= 57 && input.text.length < 5) { input.text += String.fromCharCode(keyCode); input.error = ''; }
    } else if (keyCode >= 32 && keyCode <= 126 && (this.bankSearch || '').length < 40) {
        this.bankSearch = (this.bankSearch || '') + String.fromCharCode(keyCode);
        this.bankActivePage = 0;
    }
    return true;
}

function amountButtons(client, withdraw, count) {
    const last = client[withdraw ? 'bankLastWithdrawX' : 'bankLastDepositX'];
    return [
        { x: 220, width: 27, label: 'One', amount: 1 },
        { x: 247, width: 27, label: 'Five', amount: 5 },
        { x: 274, width: 23, label: '10', amount: 10 },
        { x: 297, width: 23, label: '50', amount: 50 },
        { x: 320, width: 20, label: 'X', amount: 'x' },
        { x: 340, width: 36, label: last ? String(last) : '-', amount: last || Infinity },
        { x: 376, width: 31, label: 'All', amount: count }
    ];
}

function drawDialogBank() {
    const slots = bankView(this);
    const x = ((this.gameWidth / 2) | 0) - WIDTH / 2;
    const y = ((this.gameHeight / 2) | 0) - HEIGHT / 2;
    const mx = this.mouseX - x;
    const my = this.mouseY - y;
    const pages = Math.ceil(slots.length / ITEMS_PER_PAGE);
    if (this.mouseScrollDelta && mx >= 0 && mx < WIDTH && my >= 0 && my < 324) {
        if (!this.bankAmountInput) this.bankActivePage = Math.max(0, Math.min(Math.max(0, pages - 1), this.bankActivePage + Math.sign(this.mouseScrollDelta)));
        this.mouseScrollDelta = 0;
    }
    if (this.mouseButtonClick) {
        this.mouseButtonClick = 0;
        if (this.bankAmountInput) {
            // A touch-accessible cancel area; consume the click without passing
            // it through to the bank controls underneath the modal.
            if (mx < 24 || mx >= 384 || my < 102 || my >= 186 || my >= 158) {
                this.bankAmountInput = null;
                closeBankKeyboard(this);
            } else {
                keyboard(this, this.bankAmountInput.text, true, x + 54, y + 145);
            }
        } else if (mx >= 0 && mx < WIDTH && my >= 280 && my < 300) {
            this.bankSearchFocus = true;
            keyboard(this, this.bankSearch || '', false, x + 48, y + 280);
        } else if (mx < 0 || mx >= WIDTH || my < 0 || my >= 324 || (my < 12 && mx >= 320)) {
            this.packetStream.newPacket(clientOpcodes.BANK_CLOSE);
            this.packetStream.sendPacket();
            this.showDialogBank = false;
            resetBankInput.call(this);
            return;
        } else {
            if (this.bankSearchFocus) closeBankKeyboard(this);
            this.bankSearchFocus = false;
            if (my < 12 && mx >= 50 && mx < 310) {
                if (mx < 115 && this.bankActivePage > 0) this.bankActivePage--;
                else if (mx >= 245 && this.bankActivePage + 1 < pages) this.bankActivePage++;
            } else if (mx >= 7 && mx < 399 && my >= 28 && my < 232) {
                const pos = this.bankActivePage * ITEMS_PER_PAGE + Math.floor((my - 28) / 34) * 8 + Math.floor((mx - 7) / 49);
                if (pos < slots.length) {
                    this.bankSelectedItemSlot = slots[pos];
                    this.bankSelectedItem = this.bankItems[slots[pos]];
                }
            } else if (this.bankSelectedItemSlot >= 0) {
                for (const withdraw of [true, false]) {
                    const rowY = withdraw ? 238 : 263;
                    const count = available(this, this.bankSelectedItem, withdraw);
                    if (count < 1 || my < rowY || my > rowY + 11) continue;
                    for (const button of amountButtons(this, withdraw, count)) {
                        if (mx < button.x || mx >= button.x + button.width) continue;
                        if (button.amount === 'x') {
                            this.bankAmountInput = { id: this.bankSelectedItem, withdraw, text: '', error: '' };
                            keyboard(this, '', true, x + 54, y + 145);
                        } else transact(this, this.bankSelectedItem, button.amount, withdraw);
                    }
                }
            }
        }
    }
    const s = this.surface;
    s.drawBox(x, y, WIDTH, 12, 192);
    s.drawBoxAlpha(x, y + 12, WIDTH, 312, colours.grey, 160);
    s.drawString('Bank', x + 1, y + 10, 1, colours.white);
    if (pages > 1) {
        if (this.bankActivePage > 0) s.drawString('<prev>', x + 50, y + 10, 1, colours.white);
        s.drawStringCenter(`Page ${this.bankActivePage + 1}/${pages}`, x + 180, y + 10, 1, colours.white);
        if (this.bankActivePage + 1 < pages) s.drawString('<next>', x + 245, y + 10, 1, colours.white);
    }
    s.drawStringRight('Close window', x + 406, y + 10, 1, colours.white);
    s.drawString('Number in bank in green', x + 7, y + 24, 1, colours.green);
    s.drawString('Number held in blue', x + 289, y + 24, 1, colours.cyan);
    for (let pos = 0; pos < ITEMS_PER_PAGE; pos++) {
        const slot = slots[this.bankActivePage * ITEMS_PER_PAGE + pos];
        const sx = x + 7 + (pos % 8) * 49;
        const sy = y + 28 + Math.floor(pos / 8) * 34;
        s.drawBoxAlpha(sx, sy, 49, 34, slot !== undefined && slot === this.bankSelectedItemSlot ? colours.red : colours.lightGrey2, 160);
        s.drawBoxEdge(sx, sy, 50, 35, 0);
        if (slot === undefined) continue;
        const id = this.bankItems[slot];
        s._spriteClipping_from9(sx, sy, 48, 32, this.spriteItem + GameData.itemPicture[id], GameData.itemMask[id], 0, 0, false);
        s.drawString(String(this.bankItemsCount[slot]), sx + 1, sy + 10, 1, colours.green);
        s.drawStringRight(String(this.getInventoryCount(id)), sx + 47, sy + 29, 1, colours.cyan);
    }
    if (!slots.length) s.drawStringCenter('No matching bank items', x + 204, y + 130, 3, colours.yellow);
    s.drawLineHoriz(x + 5, y + 256, 398, 0);
    s.drawLineHoriz(x + 5, y + 280, 398, 0);
    let visibleSearch = this.bankSearch || '';
    const cursor = this.bankSearchFocus ? '*' : '';
    const widthOf = text => {
        const measured = s.textWidth ? s.textWidth(text, 1) : NaN;
        return Number.isFinite(measured) ? measured : text.length * 8;
    };
    while (visibleSearch.length && widthOf(`Search: ${visibleSearch}${cursor}`) > WIDTH - 4) visibleSearch = visibleSearch.slice(1);
    s.drawString(`Search: ${visibleSearch}${cursor}`, x + 2, y + 295, 1, colours.white);
    // updateBankItems appends zero-count inventory choices; only the server's
    // authoritative prefix consumes bank capacity and contributes bank value.
    const used = Number.isInteger(this.newBankItemCount) ? this.newBankItemCount : 0;
    const maximum = Number.isInteger(this.bankItemsMax) ? this.bankItemsMax : '?';
    s.drawString(`Bank slots: ${used}/${maximum}`, x + 2, y + 316, 1, colours.white);
    if (this.options && this.options.bankValue && GameData.itemBasePrice) {
        let total = 0;
        let safe = true;
        for (let i = 0; i < used; i++) {
            const value = GameData.itemBasePrice[this.bankItems[i]] * this.bankItemsCount[i];
            if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total + value)) { safe = false; break; }
            total += value;
        }
        s.drawStringRight(`Base value: ${safe ? total : 'very large'}`, x + 406, y + 316, 1, colours.yellow);
    }
    if (this.bankSelectedItemSlot < 0) {
        s.drawStringCenter('Select an object to withdraw or deposit', x + 204, y + 248, 3, colours.yellow);
    } else {
        for (const withdraw of [true, false]) {
            const count = available(this, this.bankSelectedItem, withdraw);
            if (count < 1) continue;
            const rowY = withdraw ? 238 : 263;
            // Item name is shown in the grid; leave room for all quantity controls.
            s.drawString(`${withdraw ? 'Withdraw' : 'Deposit'} ${(GameData.itemName[this.bankSelectedItem] || '').slice(0, 22)}`, x + 2, y + rowY + 10, 1, colours.white);
            for (const button of amountButtons(this, withdraw, count)) {
                if (button.amount !== 'x' && button.amount > count) continue;
                const hover = mx >= button.x && mx < button.x + button.width && my >= rowY && my <= rowY + 11;
                s.drawString(button.label, x + button.x + 1, y + rowY + 10, 1, hover ? colours.red : colours.white);
            }
        }
    }
    if (this.bankAmountInput) {
        const input = this.bankAmountInput;
        s.drawBox(x + 24, y + 102, 360, 84, 0);
        s.drawBoxEdge(x + 24, y + 102, 360, 84, colours.white);
        s.drawStringCenter(`${input.withdraw ? 'Withdraw' : 'Deposit'} how many? (1-${available(this, input.id, input.withdraw)})`, x + 204, y + 122, 1, colours.white);
        s.drawStringCenter(`${input.text}*`, x + 204, y + 143, 3, colours.cyan);
        s.drawStringCenter(input.error || 'Enter to confirm', x + 204, y + 155, 1, colours.yellow);
        s.drawStringCenter('Cancel (Escape)', x + 204, y + 177, 1, colours.white);
    }
}

module.exports = { bankActivePage: 0, drawDialogBank, bankKeyPress, resetBankInput };
