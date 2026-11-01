const GameData = require('../game-data');
const clientOpcodes = require('../opcodes/client');
const colours = require('./_colours');
const { compactAmount } = require('../lib/format-amount');
const { uiScale } = require('../lib/ui-scale');

const BASE_WIDTH = 408;
const VISIBLE_COLUMNS = 8;
const BASE_SLOT_W = 49;
const BASE_SLOT_H = 34;
const VANILLA_ROWS = 6;
const VANILLA_ITEMS_PER_PAGE = 48;
const GRID_TOP = 28;
const FOOTER_TAIL = 106;
const MAGIC_DEPOSIT = 0x87654321;
const MAGIC_WITHDRAW = 0x12345678;

const WIDTH = BASE_WIDTH;
const HEIGHT = 334;
const ITEMS_PER_PAGE = VANILLA_ITEMS_PER_PAGE;

function bankIsCompact(client) {
    return client.gameWidth < 512 || client.gameHeight < 346;
}

function bankVisibleRows(client) {
    const opts = client.options || {};
    if (opts.bankExpand === false) {
        return VANILLA_ROWS;
    }

    const pad = (bankIsCompact(client) ? 100 : 142) + (opts.mobile ? 18 : 0);
    let rows = Math.floor((client.gameHeight - pad) / BASE_SLOT_H);

    if (rows > 12) {
        rows = 12;
    } else if (rows < 6) {
        rows = 6;
    }

    return rows;
}

function bankLayout(client) {
    const scale = uiScale(client);
    const visibleRows = bankVisibleRows(client);
    const slotW = Math.round(BASE_SLOT_W * scale);
    const slotH = Math.round(BASE_SLOT_H * scale);
    const gridTop = Math.round(GRID_TOP * scale);
    const gridHeight = visibleRows * slotH;
    const gridBottom = gridTop + gridHeight;
    const width = Math.round(BASE_WIDTH * scale);
    const height = gridBottom + Math.round(FOOTER_TAIL * scale);
    const gridLeft = Math.round(7 * scale);

    return {
        scale,
        visibleRows,
        visibleColumns: VISIBLE_COLUMNS,
        slotW,
        slotH,
        gridTop,
        gridBottom,
        gridHeight,
        gridLeft,
        width,
        height,
        itemsPerPage: visibleRows * VISIBLE_COLUMNS,
        scrollbarX: gridLeft + VISIBLE_COLUMNS * slotW + Math.round(8 * scale),
        withdrawRowY: gridBottom + Math.round(6 * scale),
        depositRowY: gridBottom + Math.round(31 * scale),
        line1Y: gridBottom + Math.round(24 * scale),
        line2Y: gridBottom + Math.round(48 * scale),
        searchY: gridBottom + Math.round(67 * scale),
        slotsInfoY: gridBottom + Math.round(88 * scale),
        closeHeaderRight: width - Math.round(2 * scale)
    };
}

function bankShowScroll(client, layout, filteredCount) {
    const opts = client.options || {};
    const scrollOption = opts.bankScroll !== false;
    return (bankIsCompact(client) || scrollOption) && filteredCount > layout.itemsPerPage;
}

function clampBankScrollRow(client, layout, totalRows) {
    const maxRow = Math.max(0, totalRows - layout.visibleRows);
    if (!Number.isInteger(client.bankScrollRow)) {
        client.bankScrollRow = 0;
    }
    if (client.bankScrollRow < 0) {
        client.bankScrollRow = 0;
    } else if (client.bankScrollRow > maxRow) {
        client.bankScrollRow = maxRow;
    }
}

function bankView(client) {
    const layout = bankLayout(client);
    const query = (client.bankSearch || '').trim().toLowerCase();
    const prefixes = [];
    const slots = [];
    client.bankSelectedItemSlot = -1;

    for (let i = 0; i < client.bankItemCount; i++) {
        const id = client.bankItems[i];
        if (id < 0) {
            continue;
        }
        if (id === client.bankSelectedItem) {
            client.bankSelectedItemSlot = i;
        }
        const name = (GameData.itemName[id] || '').toLowerCase();
        if (query && name.startsWith(query)) {
            prefixes.push(i);
        } else if (!query || name.includes(query)) {
            slots.push(i);
        }
    }

    if (client.bankSelectedItemSlot < 0) {
        client.bankSelectedItem = -2;
    }

    const filtered = prefixes.concat(slots);
    const showScroll = bankShowScroll(client, layout, filtered.length);
    const totalRows = Math.ceil(filtered.length / layout.visibleColumns) || 0;

    if (showScroll) {
        clampBankScrollRow(client, layout, totalRows);
    } else {
        client.bankScrollRow = 0;
        const pages = Math.max(0, Math.ceil(filtered.length / layout.itemsPerPage) - 1);
        client.bankActivePage = Math.max(
            0,
            Math.min(client.bankActivePage || 0, pages)
        );
    }

    return filtered;
}

function bankItemOffset(client, layout, showScroll) {
    if (showScroll) {
        return client.bankScrollRow * layout.visibleColumns;
    }
    return (client.bankActivePage || 0) * layout.itemsPerPage;
}

function drawBankScrollbar(surface, spriteUtil, x, y, height, scrubY, scrubHeight) {
    const x2 = x;
    surface.drawBoxEdge(x2, y, 12, height, 0);

    if (spriteUtil) {
        surface._drawSprite_from3(x2 + 1, y + 1, spriteUtil);
        surface._drawSprite_from3(x2 + 1, y + height - 12, spriteUtil + 1);
    }

    surface.drawLineHoriz(x2, y + 13, 12, 0);
    surface.drawLineHoriz(x2, y + height - 13, 12, 0);
    surface.drawGradient(x2 + 1, y + 14, 11, height - 27, 0x989898, 0x686868);
    surface.drawBox(x2 + 3, scrubY + y + 14, 7, scrubHeight, 0xc0c0c0);
    surface.drawLineVert(x2 + 2, scrubY + y + 14, scrubHeight, 0x808080);
    surface.drawLineVert(x2 + 2 + 8, scrubY + y + 14, scrubHeight, 0x808080);
}

function available(client, id, withdraw) {
    if (!withdraw) {
        return Math.min(65535, client.getInventoryCount(id));
    }
    for (let i = 0; i < client.bankItemCount; i++) {
        if (client.bankItems[i] === id) {
            let max = client.bankItemsCount[i];
            if (
                !(client.options && client.options.bankUnstackableWithdraw) &&
                GameData.itemStackable[id] === 1
            ) {
                max = Math.min(1, max);
            }
            return Math.min(65535, max);
        }
    }
    return 0;
}

function populateBankOfferMenus(client) {
    if (
        !client.options.bankMenus ||
        client.showRightClickMenu ||
        client.bankAmountInput ||
        client.bankPresetsOpen
    ) {
        return;
    }

    const layout = bankLayout(client);
    const slots = bankView(client);
    const showScroll = bankShowScroll(client, layout, slots.length);
    const x = ((client.gameWidth / 2) | 0) - layout.width / 2;
    const y = ((client.gameHeight / 2) | 0) - layout.height / 2;
    const mx = client.mouseX - x;
    const my = client.mouseY - y;

    if (
        mx < layout.gridLeft ||
        mx >= layout.gridLeft + layout.visibleColumns * layout.slotW ||
        my < layout.gridTop ||
        my >= layout.gridBottom
    ) {
        return;
    }

    const local =
        Math.floor((my - layout.gridTop) / layout.slotH) * layout.visibleColumns +
        Math.floor((mx - layout.gridLeft) / layout.slotW);
    const pos = bankItemOffset(client, layout, showScroll) + local;

    if (pos >= slots.length) {
        return;
    }

    const slot = slots[pos];
    const id = client.bankItems[slot];
    const amount = client.bankItemsCount[slot];
    const itemName = `@lre@${GameData.itemName[id] || ''}`;
    const { addOfferMenus } = require('./offer-menus');

    addOfferMenus(
        client,
        'Withdraw',
        601,
        id,
        amount,
        itemName,
        client.bankLastWithdrawX || 0
    );
}

function transact(client, id, amount, withdraw) {
    if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 65535 ||
        amount > available(client, id, withdraw)
    ) {
        return false;
    }
    client.packetStream.newPacket(
        withdraw ? clientOpcodes.BANK_WITHDRAW : clientOpcodes.BANK_DEPOSIT
    );
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
            left: `${x}px`,
            top: `${y}px`,
            width: '300px',
            height: '20px'
        });
    }
}

function closeBankKeyboard(client) {
    if (
        client.options &&
        client.options.mobile &&
        client.mobileInputEl &&
        client.closeKeyboard
    ) {
        client.closeKeyboard();
    }
}

function openBankAmountKeyboard(client) {
    if (!client || !client.bankAmountInput) {
        return;
    }
    const layout = bankLayout(client);
    const x = ((client.gameWidth / 2) | 0) - layout.width / 2;
    const y = ((client.gameHeight / 2) | 0) - layout.height / 2;
    keyboard(
        client,
        client.bankAmountInput.text || '',
        true,
        x + Math.round(54 * layout.scale),
        y + layout.withdrawRowY + Math.round(7 * layout.scale)
    );
}

function resetBankInput() {
    this.bankSearch = '';
    this.bankSearchFocus = false;
    this.bankAmountInput = null;
    this.bankPresetsOpen = false;
    this.bankPresetConfirm = 0;
    this.bankActivePage = 0;
    this.bankScrollRow = 0;
    closeBankKeyboard(this);
}

function bankKeyPress(keyCode) {
    if (!this.showDialogBank) {
        return false;
    }
    if (this.bankPresetsOpen) {
        if (keyCode === 27) {
            if (this.bankPresetConfirm) {
                this.bankPresetConfirm = 0;
            } else {
                this.bankPresetsOpen = false;
            }
            closeBankKeyboard(this);
        }
        return true;
    }
    if (!this.bankAmountInput && !this.bankSearchFocus) {
        return false;
    }
    const input = this.bankAmountInput;
    if (keyCode === 27) {
        if (input) {
            this.bankAmountInput = null;
        } else {
            this.bankSearchFocus = false;
        }
        closeBankKeyboard(this);
    } else if (keyCode === 13 || keyCode === 10) {
        if (input) {
            const amount = /^\d+$/.test(input.text) ? Number(input.text) : NaN;
            if (transact(this, input.id, amount, input.withdraw)) {
                this[input.withdraw ? 'bankLastWithdrawX' : 'bankLastDepositX'] =
                    amount;
                this.bankAmountInput = null;
            } else {
                input.error = 'Enter an available amount from 1 to 65535';
            }
        } else {
            this.bankSearchFocus = false;
        }
        if (!this.bankAmountInput) {
            closeBankKeyboard(this);
        }
    } else if (keyCode === 8) {
        if (input) {
            input.text = input.text.slice(0, -1);
            input.error = '';
        } else {
            this.bankSearch = (this.bankSearch || '').slice(0, -1);
            this.bankActivePage = 0;
            this.bankScrollRow = 0;
        }
    } else if (input) {
        if (keyCode >= 48 && keyCode <= 57 && input.text.length < 5) {
            input.text += String.fromCharCode(keyCode);
            input.error = '';
        }
    } else if (keyCode >= 32 && keyCode <= 126 && (this.bankSearch || '').length < 40) {
        this.bankSearch = (this.bankSearch || '') + String.fromCharCode(keyCode);
        this.bankActivePage = 0;
        this.bankScrollRow = 0;
    }
    return true;
}

function amountButtons(client, withdraw, count, scale) {
    const s = scale || 1;
    const last = client[withdraw ? 'bankLastWithdrawX' : 'bankLastDepositX'];
    const round = n => Math.round(n * s);
    return [
        { x: round(220), width: round(27), label: 'One', amount: 1 },
        { x: round(247), width: round(27), label: 'Five', amount: 5 },
        { x: round(274), width: round(23), label: '10', amount: 10 },
        { x: round(297), width: round(23), label: '50', amount: 50 },
        { x: round(320), width: round(20), label: 'X', amount: 'x' },
        {
            x: round(340),
            width: round(36),
            label: last ? String(last) : '-',
            amount: last || Infinity
        },
        { x: round(376), width: round(31), label: 'All', amount: count }
    ];
}

function handleBankScrollInput(client, layout, showScroll, mx, my, slots) {
    if (!showScroll || client.bankAmountInput || client.bankPresetsOpen) {
        return;
    }

    const totalRows = Math.ceil(slots.length / layout.visibleColumns) || 0;
    const maxScrollHeight = layout.gridHeight - Math.round(28 * layout.scale);
    const scrubHeight = Math.max(
        8,
        Math.floor(maxScrollHeight / Math.max(1, totalRows / layout.visibleRows))
    );

    if (client.mouseScrollDelta && mx >= 0 && mx < layout.width && my >= layout.gridTop && my < layout.height) {
        client.bankScrollRow -= client.mouseScrollDelta * -1;
        clampBankScrollRow(client, layout, totalRows);
        client.mouseScrollDelta = 0;
    }

    if (!client.mouseButtonClick) {
        return;
    }

    const onScrollbar =
        mx >= layout.scrollbarX &&
        mx < layout.scrollbarX + 21 &&
        my >= layout.gridTop &&
        my < layout.gridBottom + Math.round(30 * layout.scale);

    if (!onScrollbar) {
        return;
    }

    if (
        client.bankScrollRow > 0 &&
        my > layout.gridTop &&
        my < layout.gridTop + 15
    ) {
        client.bankScrollRow -= 1;
    } else if (
        client.bankScrollRow < totalRows - layout.visibleRows &&
        my > layout.gridTop + layout.gridHeight + 15 - layout.scale &&
        my < layout.gridTop + layout.gridHeight + 30 - layout.scale
    ) {
        client.bankScrollRow += 1;
    } else if (my > layout.gridTop + 15 && my < layout.gridTop + layout.gridHeight + 15) {
        const scrubY = my - (layout.gridTop + 15) - Math.floor(scrubHeight / 2);
        client.bankScrollRow = Math.floor(
            (scrubY / Math.max(1, maxScrollHeight)) * totalRows
        );
    }

    clampBankScrollRow(client, layout, totalRows);
    client.mouseButtonClick = 0;
}

function drawDialogBank() {
    const layout = bankLayout(this);
    const slots = bankView(this);
    const showScroll = bankShowScroll(this, layout, slots.length);
    const x = ((this.gameWidth / 2) | 0) - layout.width / 2;
    const y = ((this.gameHeight / 2) | 0) - layout.height / 2;
    const mx = this.mouseX - x;
    const my = this.mouseY - y;
    const pages = Math.max(1, Math.ceil(slots.length / layout.itemsPerPage));
    const offset = bankItemOffset(this, layout, showScroll);

    if (!showScroll && this.mouseScrollDelta && mx >= 0 && mx < layout.width && my >= 0 && my < layout.height) {
        if (!this.bankAmountInput && !this.bankPresetsOpen) {
            this.bankActivePage = Math.max(
                0,
                Math.min(Math.max(0, pages - 1), this.bankActivePage + Math.sign(this.mouseScrollDelta))
            );
        }
        this.mouseScrollDelta = 0;
    } else if (showScroll) {
        handleBankScrollInput(this, layout, showScroll, mx, my, slots);
    }

    if (this.mouseButtonClick) {
        const hadClick = this.mouseButtonClick;
        this.mouseButtonClick = 0;
        const presetTop = Math.round(70 * layout.scale);
        const presetHeight = Math.round(180 * layout.scale);

        if (this.bankPresetsOpen) {
            if (
                mx < Math.round(24 * layout.scale) ||
                mx >= layout.width - Math.round(24 * layout.scale) ||
                my < presetTop ||
                my >= presetTop + presetHeight ||
                (my >= presetTop + presetHeight - Math.round(27 * layout.scale) &&
                    mx < Math.round(204 * layout.scale))
            ) {
                if (this.bankPresetConfirm) {
                    this.bankPresetConfirm = 0;
                } else {
                    this.bankPresetsOpen = false;
                }
                closeBankKeyboard(this);
            } else if (this.bankPresetConfirm) {
                if (
                    my >= presetTop + presetHeight - Math.round(27 * layout.scale) &&
                    mx >= Math.round(204 * layout.scale)
                ) {
                    this.sendCommandString(`bankpreset save ${this.bankPresetConfirm}`);
                    this.bankPresetConfirm = 0;
                    this.bankPresetsOpen = false;
                }
            } else {
                const slot = Math.floor((my - (presetTop + Math.round(55 * layout.scale))) / Math.round(28 * layout.scale)) + 1;
                if (slot >= 1 && slot <= 3 && my < presetTop + Math.round(139 * layout.scale)) {
                    if (mx >= Math.round(180 * layout.scale) && mx < Math.round(260 * layout.scale)) {
                        this.bankPresetConfirm = slot;
                    } else if (mx >= Math.round(270 * layout.scale) && mx < Math.round(370 * layout.scale)) {
                        this.sendCommandString(`bankpreset load ${slot}`);
                        this.bankPresetsOpen = false;
                    }
                }
            }
        } else if (this.bankAmountInput) {
            const modalTop = Math.round(102 * layout.scale);
            const modalHeight = Math.round(84 * layout.scale);
            if (
                mx < Math.round(24 * layout.scale) ||
                mx >= layout.width - Math.round(24 * layout.scale) ||
                my < modalTop ||
                my >= modalTop + modalHeight ||
                my >= modalTop + Math.round(56 * layout.scale)
            ) {
                this.bankAmountInput = null;
                closeBankKeyboard(this);
            } else {
                keyboard(
                    this,
                    this.bankAmountInput.text,
                    true,
                    x + Math.round(54 * layout.scale),
                    y + layout.withdrawRowY + Math.round(7 * layout.scale)
                );
            }
        } else if (
            mx >= Math.round(340 * layout.scale) &&
            mx < layout.width &&
            my >= layout.line2Y &&
            my < layout.line2Y + Math.round(20 * layout.scale)
        ) {
            this.bankSearchFocus = false;
            closeBankKeyboard(this);
            this.bankPresetsOpen = true;
            this.bankPresetConfirm = 0;
        } else if (
            mx >= 0 &&
            mx < layout.width &&
            my >= layout.line2Y &&
            my < layout.line2Y + Math.round(20 * layout.scale)
        ) {
            this.bankSearchFocus = true;
            keyboard(this, this.bankSearch || '', false, x + Math.round(48 * layout.scale), y + layout.searchY);
        } else if (
            mx < 0 ||
            mx >= layout.width ||
            my < 0 ||
            my >= layout.height - Math.round(10 * layout.scale) ||
            (my < Math.round(12 * layout.scale) && mx >= Math.round(320 * layout.scale))
        ) {
            this.packetStream.newPacket(clientOpcodes.BANK_CLOSE);
            this.packetStream.sendPacket();
            this.showDialogBank = false;
            resetBankInput.call(this);
            return;
        } else {
            if (this.bankSearchFocus) {
                closeBankKeyboard(this);
            }
            this.bankSearchFocus = false;
            if (
                !showScroll &&
                pages > 1 &&
                my < Math.round(12 * layout.scale) &&
                mx >= Math.round(50 * layout.scale) &&
                mx < Math.round(310 * layout.scale)
            ) {
                if (mx < Math.round(115 * layout.scale) && this.bankActivePage > 0) {
                    this.bankActivePage--;
                } else if (
                    mx >= Math.round(245 * layout.scale) &&
                    this.bankActivePage + 1 < pages
                ) {
                    this.bankActivePage++;
                }
            } else if (
                mx >= layout.gridLeft &&
                mx < layout.gridLeft + layout.visibleColumns * layout.slotW &&
                my >= layout.gridTop &&
                my < layout.gridBottom
            ) {
                const pos =
                    offset +
                    Math.floor((my - layout.gridTop) / layout.slotH) * layout.visibleColumns +
                    Math.floor((mx - layout.gridLeft) / layout.slotW);
                const clickedSlot =
                    this.options && this.options.bankMenus
                        ? !this.showRightClickMenu && hadClick === 1
                        : hadClick !== 0;
                if (pos < slots.length && clickedSlot && !this.bankAmountInput) {
                    const selectedId = this.bankItems[slots[pos]];
                    if (
                        this.options &&
                        this.options.bankMenus &&
                        this.bankSelectedItem !== selectedId
                    ) {
                        this.mouseButtonClick = 0;
                    }
                    this.bankSelectedItemSlot = slots[pos];
                    this.bankSelectedItem = selectedId;
                }
            } else if (this.bankSelectedItemSlot >= 0) {
                for (const withdraw of [true, false]) {
                    const rowY = withdraw ? layout.withdrawRowY : layout.depositRowY;
                    const count = available(this, this.bankSelectedItem, withdraw);
                    if (count < 1 || my < rowY || my > rowY + Math.round(11 * layout.scale)) {
                        continue;
                    }
                    for (const button of amountButtons(this, withdraw, count, layout.scale)) {
                        if (mx < button.x || mx >= button.x + button.width) {
                            continue;
                        }
                        if (button.amount === 'x') {
                            this.bankAmountInput = {
                                id: this.bankSelectedItem,
                                withdraw,
                                text: '',
                                error: ''
                            };
                            keyboard(
                                this,
                                '',
                                true,
                                x + Math.round(54 * layout.scale),
                                y + layout.withdrawRowY + Math.round(7 * layout.scale)
                            );
                        } else {
                            transact(this, this.bankSelectedItem, button.amount, withdraw);
                        }
                    }
                }
            }
        }
    }

    const s = this.surface;
    s.drawBox(x, y, layout.width, Math.round(12 * layout.scale), 192);
    s.drawBoxAlpha(
        x,
        y + Math.round(12 * layout.scale),
        layout.width,
        layout.height - Math.round(12 * layout.scale),
        colours.grey,
        160
    );
    s.drawString('Bank', x + 1, y + Math.round(10 * layout.scale), 1, colours.white);

    if (!showScroll && pages > 1) {
        if (this.bankActivePage > 0) {
            s.drawString('<prev>', x + Math.round(50 * layout.scale), y + Math.round(10 * layout.scale), 1, colours.white);
        }
        s.drawStringCenter(
            `Page ${this.bankActivePage + 1}/${pages}`,
            x + Math.round(180 * layout.scale),
            y + Math.round(10 * layout.scale),
            1,
            colours.white
        );
        if (this.bankActivePage + 1 < pages) {
            s.drawString('<next>', x + Math.round(245 * layout.scale), y + Math.round(10 * layout.scale), 1, colours.white);
        }
    }

    s.drawStringRight(
        'Close window',
        x + layout.closeHeaderRight,
        y + Math.round(10 * layout.scale),
        1,
        colours.white
    );
    s.drawString(
        'Number in bank in green',
        x + layout.gridLeft,
        y + Math.round(24 * layout.scale),
        1,
        colours.green
    );
    s.drawString(
        'Number held in blue',
        x + layout.width - Math.round(119 * layout.scale),
        y + Math.round(24 * layout.scale),
        1,
        colours.cyan
    );

    for (let row = 0; row < layout.visibleRows; row++) {
        for (let col = 0; col < layout.visibleColumns; col++) {
            const pos = offset + row * layout.visibleColumns + col;
            const slot = slots[pos];
            const sx = x + layout.gridLeft + col * layout.slotW;
            const sy = y + layout.gridTop + row * layout.slotH;
            s.drawBoxAlpha(
                sx,
                sy,
                layout.slotW,
                layout.slotH,
                slot !== undefined && slot === this.bankSelectedItemSlot
                    ? colours.red
                    : colours.lightGrey2,
                160
            );
            s.drawBoxEdge(sx, sy, layout.slotW + 1, layout.slotH + 1, 0);
            if (slot === undefined) {
                continue;
            }
            const id = this.bankItems[slot];
            s._spriteClipping_from9(
                sx,
                sy,
                layout.slotW - 1,
                layout.slotH - 2,
                this.spriteItem + GameData.itemPicture[id],
                GameData.itemMask[id],
                0,
                0,
                false
            );
            const bankLabel =
                this.options && this.options.compactAmounts
                    ? compactAmount(this.bankItemsCount[slot])
                    : String(this.bankItemsCount[slot]);
            const invLabel =
                this.options && this.options.compactAmounts
                    ? compactAmount(this.getInventoryCount(id))
                    : String(this.getInventoryCount(id));
            s.drawString(bankLabel, sx + 1, sy + Math.round(10 * layout.scale), 1, colours.green);
            s.drawStringRight(
                invLabel,
                sx + layout.slotW - 2,
                sy + layout.slotH - Math.round(5 * layout.scale),
                1,
                colours.cyan
            );
        }
    }

    if (showScroll && slots.length > layout.itemsPerPage) {
        const totalRows = Math.ceil(slots.length / layout.visibleColumns);
        const maxScrollHeight = layout.gridHeight - Math.round(28 * layout.scale);
        const scrubHeight = Math.max(
            8,
            Math.floor(maxScrollHeight / Math.max(1, totalRows / layout.visibleRows))
        );
        const scrubY = Math.floor(
            (this.bankScrollRow / Math.max(1, totalRows)) * maxScrollHeight
        );
        drawBankScrollbar(
            s,
            this.spriteUtil,
            x + layout.scrollbarX,
            y + layout.gridTop,
            layout.gridHeight,
            scrubY,
            scrubHeight
        );
    }

    if (!slots.length) {
        s.drawStringCenter(
            'No matching bank items',
            x + layout.width / 2,
            y + layout.gridTop + Math.floor(layout.gridHeight / 2),
            3,
            colours.yellow
        );
    }

    s.drawLineHoriz(x + Math.round(5 * layout.scale), y + layout.line1Y, layout.width - Math.round(10 * layout.scale), 0);
    s.drawLineHoriz(x + Math.round(5 * layout.scale), y + layout.line2Y, layout.width - Math.round(10 * layout.scale), 0);

    let visibleSearch = this.bankSearch || '';
    const cursor = this.bankSearchFocus ? '*' : '';
    const widthOf = text => {
        const measured = s.textWidth ? s.textWidth(text, 1) : NaN;
        return Number.isFinite(measured) ? measured : text.length * 8;
    };
    while (
        visibleSearch.length &&
        widthOf(`Search: ${visibleSearch}${cursor}`) > layout.width - Math.round(78 * layout.scale)
    ) {
        visibleSearch = visibleSearch.slice(1);
    }
    s.drawString(
        `Search: ${visibleSearch}${cursor}`,
        x + Math.round(2 * layout.scale),
        y + layout.searchY,
        1,
        colours.white
    );
    s.drawStringRight(
        'Presets',
        x + layout.closeHeaderRight,
        y + layout.searchY,
        1,
        colours.yellow
    );

    const used = Number.isInteger(this.newBankItemCount) ? this.newBankItemCount : 0;
    const maximum = Number.isInteger(this.bankItemsMax) ? this.bankItemsMax : '?';
    s.drawString(
        `Bank slots: ${used}/${maximum}`,
        x + Math.round(2 * layout.scale),
        y + layout.slotsInfoY,
        1,
        colours.white
    );

    if (this.options && this.options.bankValue && GameData.itemBasePrice) {
        let total = 0;
        let safe = true;
        for (let i = 0; i < used; i++) {
            const value = GameData.itemBasePrice[this.bankItems[i]] * this.bankItemsCount[i];
            if (
                !Number.isSafeInteger(value) ||
                value < 0 ||
                !Number.isSafeInteger(total + value)
            ) {
                safe = false;
                break;
            }
            total += value;
        }
        s.drawStringRight(
            `Base value: ${safe ? total : 'very large'}`,
            x + layout.closeHeaderRight,
            y + layout.slotsInfoY,
            1,
            colours.yellow
        );
    }

    if (this.bankSelectedItemSlot < 0) {
        s.drawStringCenter(
            'Select an object to withdraw or deposit',
            x + layout.width / 2,
            y + layout.withdrawRowY + Math.round(10 * layout.scale),
            3,
            colours.yellow
        );
    } else {
        for (const withdraw of [true, false]) {
            const count = available(this, this.bankSelectedItem, withdraw);
            if (count < 1) {
                continue;
            }
            const rowY = withdraw ? layout.withdrawRowY : layout.depositRowY;
            s.drawString(
                `${withdraw ? 'Withdraw' : 'Deposit'} ${(GameData.itemName[this.bankSelectedItem] || '').slice(0, 22)}`,
                x + Math.round(2 * layout.scale),
                y + rowY + Math.round(10 * layout.scale),
                1,
                colours.white
            );
            for (const button of amountButtons(this, withdraw, count, layout.scale)) {
                if (button.amount !== 'x' && button.amount > count) {
                    continue;
                }
                const hover =
                    mx >= button.x &&
                    mx < button.x + button.width &&
                    my >= rowY &&
                    my <= rowY + Math.round(11 * layout.scale);
                s.drawString(
                    button.label,
                    x + button.x + 1,
                    y + rowY + Math.round(10 * layout.scale),
                    1,
                    hover ? colours.red : colours.white
                );
            }
        }
    }

    if (this.bankPresetsOpen) {
        const presetTop = Math.round(70 * layout.scale);
        const presetWidth = Math.round(360 * layout.scale);
        s.drawBox(x + Math.round(24 * layout.scale), y + presetTop, presetWidth, Math.round(180 * layout.scale), 0);
        s.drawBoxEdge(
            x + Math.round(24 * layout.scale),
            y + presetTop,
            presetWidth,
            Math.round(180 * layout.scale),
            colours.white
        );
        s.drawStringCenter(
            'Bank presets',
            x + layout.width / 2,
            y + presetTop + Math.round(21 * layout.scale),
            3,
            colours.white
        );
        if (this.bankPresetConfirm) {
            s.drawStringCenter(
                `Save current inventory to preset ${this.bankPresetConfirm}?`,
                x + layout.width / 2,
                y + presetTop + Math.round(57 * layout.scale),
                1,
                colours.yellow
            );
            s.drawStringCenter(
                'This replaces any saved preset in that slot.',
                x + layout.width / 2,
                y + presetTop + Math.round(78 * layout.scale),
                1,
                colours.white
            );
            s.drawStringCenter(
                'The server will report the result.',
                x + layout.width / 2,
                y + presetTop + Math.round(105 * layout.scale),
                1,
                colours.white
            );
            s.drawStringCenter(
                'Confirm save',
                x + layout.width / 2 + Math.round(86 * layout.scale),
                y + presetTop + Math.round(170 * layout.scale),
                1,
                colours.yellow
            );
        } else {
            s.drawStringCenter(
                'Save or restore an inventory layout.',
                x + layout.width / 2,
                y + presetTop + Math.round(43 * layout.scale),
                1,
                colours.white
            );
            for (let slot = 1; slot <= 3; slot++) {
                const rowY = y + presetTop + Math.round(74 + (slot - 1) * 28 * layout.scale);
                s.drawString(`Preset ${slot}`, x + Math.round(55 * layout.scale), rowY, 1, colours.white);
                s.drawString('Save', x + Math.round(195 * layout.scale), rowY, 1, colours.yellow);
                s.drawString('Load', x + Math.round(290 * layout.scale), rowY, 1, colours.yellow);
            }
        }
        s.drawStringCenter(
            this.bankPresetConfirm ? 'Cancel (Escape)' : 'Close (Escape)',
            x + Math.round(117 * layout.scale),
            y + presetTop + Math.round(170 * layout.scale),
            1,
            colours.white
        );
    }

    if (this.bankAmountInput) {
        const input = this.bankAmountInput;
        const modalTop = Math.round(102 * layout.scale);
        const modalWidth = Math.round(360 * layout.scale);
        s.drawBox(x + Math.round(24 * layout.scale), y + modalTop, modalWidth, Math.round(84 * layout.scale), 0);
        s.drawBoxEdge(
            x + Math.round(24 * layout.scale),
            y + modalTop,
            modalWidth,
            Math.round(84 * layout.scale),
            colours.white
        );
        s.drawStringCenter(
            `${input.withdraw ? 'Withdraw' : 'Deposit'} how many? (1-${available(this, input.id, input.withdraw)})`,
            x + layout.width / 2,
            y + modalTop + Math.round(20 * layout.scale),
            1,
            colours.white
        );
        s.drawStringCenter(
            `${input.text}*`,
            x + layout.width / 2,
            y + modalTop + Math.round(41 * layout.scale),
            3,
            colours.cyan
        );
        s.drawStringCenter(
            input.error || 'Enter to confirm',
            x + layout.width / 2,
            y + modalTop + Math.round(53 * layout.scale),
            1,
            colours.yellow
        );
        s.drawStringCenter(
            'Cancel (Escape)',
            x + layout.width / 2,
            y + modalTop + Math.round(75 * layout.scale),
            1,
            colours.white
        );
    }
}

module.exports = {
    bankActivePage: 0,
    bankScrollRow: 0,
    drawDialogBank,
    bankKeyPress,
    resetBankInput,
    available,
    transact,
    populateBankOfferMenus,
    openBankAmountKeyboard,
    bankLayout,
    bankVisibleRows,
    bankShowScroll,
    bankIsCompact,
    WIDTH,
    HEIGHT,
    ITEMS_PER_PAGE,
    VANILLA_ITEMS_PER_PAGE
};
