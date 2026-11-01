const GameData = require('../game-data');
const clientOpcodes = require('../opcodes/client');
const colours = require('./_colours');
const { compactAmount } = require('../lib/format-amount');

const DIALOG_X = 22;
const DIALOG_Y = 36;

function sendTradeUpdate(client) {
    client.packetStream.newPacket(clientOpcodes.TRADE_ITEM_UPDATE);
    client.packetStream.putByte(client.tradeItemsCount);

    for (let j = 0; j < client.tradeItemsCount; j++) {
        client.packetStream.putShort(client.tradeItems[j]);
        client.packetStream.putInt(client.tradeItemCount[j]);
    }

    client.packetStream.sendPacket();
    client.tradeRecipientAccepted = false;
    client.tradeAccepted = false;
}

function tradeOfferItem(client, itemType, itemAmount) {
    if (GameData.itemSpecial[itemType] === 1) {
        client.showMessage(
            'This object cannot be traded with other players',
            3
        );
        return;
    }

    let sendUpdate = false;
    let itemCountAdd = 0;

    for (let i = 0; i < client.tradeItemsCount; i++) {
        if (client.tradeItems[i] !== itemType) {
            continue;
        }

        if (GameData.itemStackable[itemType] === 0) {
            const invStack = (() => {
                for (let s = 0; s < client.inventoryItemsCount; s++) {
                    if (client.inventoryItemId[s] === itemType) {
                        return client.inventoryItemStackCount[s];
                    }
                }
                return 0;
            })();

            for (let j = 0; j < itemAmount; j++) {
                if (client.tradeItemCount[i] < invStack) {
                    client.tradeItemCount[i]++;
                }

                sendUpdate = true;
            }
        } else {
            itemCountAdd += itemAmount;
        }
    }

    if (client.getInventoryCount(itemType) <= itemCountAdd) {
        sendUpdate = true;
    }

    if (!sendUpdate && client.tradeItemsCount < 12) {
        if (GameData.itemStackable[itemType] === 0 && itemAmount > 1) {
            client.tradeItems[client.tradeItemsCount] = itemType;
            client.tradeItemCount[client.tradeItemsCount] = itemAmount;
            client.tradeItemsCount++;
        } else {
            const end = Math.min(
                12,
                client.tradeItemsCount + Math.max(1, itemAmount)
            );

            if (GameData.itemStackable[itemType] === 1) {
                for (
                    let i = client.tradeItemsCount;
                    i < end && client.tradeItemsCount < 12;
                    i++
                ) {
                    client.tradeItems[client.tradeItemsCount] = itemType;
                    client.tradeItemCount[client.tradeItemsCount] = 1;
                    client.tradeItemsCount++;
                }
            } else {
                client.tradeItems[client.tradeItemsCount] = itemType;
                client.tradeItemCount[client.tradeItemsCount] = 1;
                client.tradeItemsCount++;
            }
        }

        sendUpdate = true;
    }

    if (sendUpdate) {
        sendTradeUpdate(client);
    }
}

function tradeRemoveItem(client, itemType, itemAmount) {
    for (let n = 0; n < itemAmount; n++) {
        let removed = false;

        for (let i = 0; i < client.tradeItemsCount; i++) {
            if (client.tradeItems[i] !== itemType) {
                continue;
            }

            if (
                GameData.itemStackable[itemType] === 0 &&
                client.tradeItemCount[i] > 1
            ) {
                client.tradeItemCount[i]--;
                removed = true;
                break;
            }

            client.tradeItemsCount--;

            for (let j = i; j < client.tradeItemsCount; j++) {
                client.tradeItems[j] = client.tradeItems[j + 1];
                client.tradeItemCount[j] = client.tradeItemCount[j + 1];
            }

            removed = true;
            break;
        }

        if (!removed) {
            break;
        }
    }

    sendTradeUpdate(client);
}

function tradeKeyPress(keyCode) {
    if (!this.showDialogTrade || !this.tradeAmountInput) {
        return false;
    }

    const input = this.tradeAmountInput;

    if (keyCode === 27) {
        this.tradeAmountInput = null;
    } else if (keyCode === 13 || keyCode === 10) {
        const amount = /^\d+$/.test(input.text) ? Number(input.text) : NaN;

        if (
            Number.isInteger(amount) &&
            amount >= 1 &&
            amount <= input.max
        ) {
            if (input.mode === 'offer') {
                tradeOfferItem(this, input.id, amount);
            } else {
                tradeRemoveItem(this, input.id, amount);
            }

            this.tradeLastOfferX = amount;
            this.tradeAmountInput = null;
        } else {
            input.error = `Enter an amount from 1 to ${input.max}`;
        }
    } else if (keyCode === 8) {
        input.text = input.text.slice(0, -1);
        input.error = '';
    } else if (keyCode >= 48 && keyCode <= 57 && input.text.length < 5) {
        input.text += String.fromCharCode(keyCode);
        input.error = '';
    }

    return true;
}

function populateTradeOfferMenus(client) {
    if (
        !client.options.transactionMenus ||
        client.showRightClickMenu ||
        client.tradeAmountInput
    ) {
        return;
    }

    const mouseX = client.mouseX - DIALOG_X;
    const mouseY = client.mouseY - DIALOG_Y;
    const { addOfferMenus } = require('./offer-menus');

    if (
        mouseX > 216 &&
        mouseY > 30 &&
        mouseX < 462 &&
        mouseY < 235
    ) {
        const slot =
            (((mouseX - 217) / 49) | 0) + (((mouseY - 31) / 34) | 0) * 5;

        if (slot >= 0 && slot < client.inventoryItemsCount) {
            const itemId = client.inventoryItemId[slot];
            const itemName = `@lre@${GameData.itemName[itemId] || ''}`;
            const itemAmount = client.getInventoryCount(itemId);

            addOfferMenus(
                client,
                'Offer',
                603,
                itemId,
                itemAmount,
                itemName,
                client.tradeLastOfferX || 0
            );
        }

        return;
    }

    if (mouseX > 8 && mouseY > 30 && mouseX < 205 && mouseY < 133) {
        const itemIndex =
            (((mouseX - 9) / 49) | 0) + (((mouseY - 31) / 34) | 0) * 4;

        if (itemIndex >= 0 && itemIndex < client.tradeItemsCount) {
            const itemId = client.tradeItems[itemIndex];
            let itemAmount = 0;

            for (let i = 0; i < client.tradeItemsCount; i++) {
                if (client.tradeItems[i] !== itemId) {
                    continue;
                }

                if (GameData.itemStackable[itemId] === 0) {
                    itemAmount = client.tradeItemCount[i];
                    break;
                }

                itemAmount++;
            }

            const itemName = `@lre@${GameData.itemName[itemId] || ''}`;

            addOfferMenus(
                client,
                'Remove',
                604,
                itemId,
                itemAmount,
                itemName,
                client.tradeLastOfferX || 0
            );
        }
    }
}

function handleTradePointer(client) {
    const mouseX = client.mouseX - DIALOG_X;
    const mouseY = client.mouseY - DIALOG_Y;
    const useMenus = client.options && client.options.transactionMenus;

    if (!useMenus) {
        if (
            client.mouseButtonClick !== 0 &&
            client.mouseButtonItemCountIncrement === 0
        ) {
            client.mouseButtonItemCountIncrement = 1;
        }

        if (client.mouseButtonItemCountIncrement <= 0) {
            return;
        }
    } else if (client.mouseButtonClick === 0) {
        return;
    }

    if (mouseX >= 0 && mouseY >= 0 && mouseX < 468 && mouseY < 262) {
        if (!useMenus && mouseX > 216 && mouseY > 30 && mouseX < 462 && mouseY < 235) {
            const slot =
                (((mouseX - 217) / 49) | 0) +
                (((mouseY - 31) / 34) | 0) * 5;

            if (slot >= 0 && slot < client.inventoryItemsCount) {
                tradeOfferItem(
                    client,
                    client.inventoryItemId[slot],
                    client.mouseButtonItemCountIncrement
                );
            }
        }

        if (!useMenus && mouseX > 8 && mouseY > 30 && mouseX < 205 && mouseY < 133) {
            const itemIndex =
                (((mouseX - 9) / 49) | 0) + (((mouseY - 31) / 34) | 0) * 4;

            if (itemIndex >= 0 && itemIndex < client.tradeItemsCount) {
                tradeRemoveItem(
                    client,
                    client.tradeItems[itemIndex],
                    client.mouseButtonItemCountIncrement
                );
            }
        }

        if (
            mouseX >= 217 &&
            mouseY >= 238 &&
            mouseX <= 286 &&
            mouseY <= 259
        ) {
            client.tradeAccepted = true;
            client.packetStream.newPacket(clientOpcodes.TRADE_ACCEPT);
            client.packetStream.sendPacket();
        }

        if (
            mouseX >= 394 &&
            mouseY >= 238 &&
            mouseX < 463 &&
            mouseY < 259
        ) {
            client.showDialogTrade = false;
            client.packetStream.newPacket(clientOpcodes.TRADE_DECLINE);
            client.packetStream.sendPacket();
        }
    } else if (client.mouseButtonClick !== 0) {
        client.showDialogTrade = false;
        client.packetStream.newPacket(clientOpcodes.TRADE_DECLINE);
        client.packetStream.sendPacket();
    }

    client.mouseButtonClick = 0;

    if (useMenus) {
        client.mouseButtonItemCountIncrement = 0;
    } else {
        client.mouseButtonItemCountIncrement = 0;
    }
}

function drawDialogTrade() {
    handleTradePointer(this);

    if (!this.showDialogTrade) {
        return;
    }

    this.surface.drawBox(DIALOG_X, DIALOG_Y, 468, 12, 192);

    this.surface.drawBoxAlpha(
        DIALOG_X,
        DIALOG_Y + 12,
        468,
        18,
        colours.grey,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X,
        DIALOG_Y + 30,
        8,
        248,
        colours.grey,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X + 205,
        DIALOG_Y + 30,
        11,
        248,
        colours.grey,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X + 462,
        DIALOG_Y + 30,
        6,
        248,
        colours.grey,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X + 8,
        DIALOG_Y + 133,
        197,
        22,
        colours.grey,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X + 8,
        DIALOG_Y + 258,
        197,
        20,
        colours.grey,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X + 216,
        DIALOG_Y + 235,
        246,
        43,
        colours.grey,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X + 8,
        DIALOG_Y + 30,
        197,
        103,
        colours.lightGrey2,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X + 8,
        DIALOG_Y + 155,
        197,
        103,
        colours.lightGrey2,
        160
    );

    this.surface.drawBoxAlpha(
        DIALOG_X + 216,
        DIALOG_Y + 30,
        246,
        205,
        colours.lightGrey2,
        160
    );

    for (let i = 0; i < 4; i++) {
        this.surface.drawLineHoriz(
            DIALOG_X + 8,
            DIALOG_Y + 30 + i * 34,
            197,
            colours.black
        );
    }

    for (let i = 0; i < 4; i++) {
        this.surface.drawLineHoriz(
            DIALOG_X + 8,
            DIALOG_Y + 155 + i * 34,
            197,
            colours.black
        );
    }

    for (let i = 0; i < 7; i++) {
        this.surface.drawLineHoriz(
            DIALOG_X + 216,
            DIALOG_Y + 30 + i * 34,
            246,
            colours.black
        );
    }

    for (let i = 0; i < 6; i++) {
        if (i < 5) {
            this.surface.drawLineVert(
                DIALOG_X + 8 + i * 49,
                DIALOG_Y + 30,
                103,
                colours.black
            );
            this.surface.drawLineVert(
                DIALOG_X + 8 + i * 49,
                DIALOG_Y + 155,
                103,
                colours.black
            );
        }

        this.surface.drawLineVert(
            DIALOG_X + 216 + i * 49,
            DIALOG_Y + 30,
            205,
            colours.black
        );
    }

    this.surface.drawString(
        'Trading with: ' + this.tradeRecipientName,
        DIALOG_X + 1,
        DIALOG_Y + 10,
        1,
        colours.white
    );

    this.surface.drawString(
        'Your Offer',
        DIALOG_X + 9,
        DIALOG_Y + 27,
        4,
        colours.white
    );

    this.surface.drawString(
        "Opponent's Offer",
        DIALOG_X + 9,
        DIALOG_Y + 152,
        4,
        colours.white
    );

    this.surface.drawString(
        'Your Inventory',
        DIALOG_X + 216,
        DIALOG_Y + 27,
        4,
        colours.white
    );

    if (!this.tradeAccepted) {
        this.surface._drawSprite_from3(
            DIALOG_X + 217,
            DIALOG_Y + 238,
            this.spriteMedia + 25
        );
    }

    this.surface._drawSprite_from3(
        DIALOG_X + 394,
        DIALOG_Y + 238,
        this.spriteMedia + 26
    );

    if (this.tradeRecipientAccepted) {
        this.surface.drawStringCenter(
            'Other player',
            DIALOG_X + 341,
            DIALOG_Y + 246,
            1,
            colours.white
        );

        this.surface.drawStringCenter(
            'has accepted',
            DIALOG_X + 341,
            DIALOG_Y + 256,
            1,
            colours.white
        );
    }

    if (this.tradeAccepted) {
        this.surface.drawStringCenter(
            'Waiting for',
            DIALOG_X + 217 + 35,
            DIALOG_Y + 246,
            1,
            colours.white
        );

        this.surface.drawStringCenter(
            'other player',
            DIALOG_X + 217 + 35,
            DIALOG_Y + 256,
            1,
            colours.white
        );
    }

    for (let i = 0; i < this.inventoryItemsCount; i++) {
        const slotX = 217 + DIALOG_X + (i % 5) * 49;
        const slotY = 31 + DIALOG_Y + ((i / 5) | 0) * 34;

        this.surface._spriteClipping_from9(
            slotX,
            slotY,
            48,
            32,
            this.spriteItem + GameData.itemPicture[this.inventoryItemId[i]],
            GameData.itemMask[this.inventoryItemId[i]],
            0,
            0,
            false
        );

        if (GameData.itemStackable[this.inventoryItemId[i]] === 0) {
            const count = this.inventoryItemStackCount[i];
            const label = this.options.compactAmounts
                ? compactAmount(count)
                : count.toString();

            this.surface.drawString(
                label,
                slotX + 1,
                slotY + 10,
                1,
                colours.yellow
            );
        }
    }

    for (let i = 0; i < this.tradeItemsCount; i++) {
        const slotX = 9 + DIALOG_X + (i % 4) * 49;
        const slotY = 31 + DIALOG_Y + ((i / 4) | 0) * 34;

        this.surface._spriteClipping_from9(
            slotX,
            slotY,
            48,
            32,
            this.spriteItem + GameData.itemPicture[this.tradeItems[i]],
            GameData.itemMask[this.tradeItems[i]],
            0,
            0,
            false
        );

        if (GameData.itemStackable[this.tradeItems[i]] === 0) {
            const count = this.tradeItemCount[i];
            const label = this.options.compactAmounts
                ? compactAmount(count)
                : count.toString();

            this.surface.drawString(
                label,
                slotX + 1,
                slotY + 10,
                1,
                colours.yellow
            );
        }

        if (
            this.mouseX > slotX &&
            this.mouseX < slotX + 48 &&
            this.mouseY > slotY &&
            this.mouseY < slotY + 32
        ) {
            this.surface.drawString(
                `${GameData.itemName[this.tradeItems[i]]}: @whi@` +
                    GameData.itemDescription[this.tradeItems[i]],
                DIALOG_X + 8,
                DIALOG_Y + 273,
                1,
                colours.yellow
            );
        }
    }

    for (let i = 0; i < this.tradeRecipientItemsCount; i++) {
        const slotX = 9 + DIALOG_X + (i % 4) * 49;
        const slotY = 156 + DIALOG_Y + ((i / 4) | 0) * 34;

        this.surface._spriteClipping_from9(
            slotX,
            slotY,
            48,
            32,
            this.spriteItem + GameData.itemPicture[this.tradeRecipientItems[i]],
            GameData.itemMask[this.tradeRecipientItems[i]],
            0,
            0,
            false
        );

        if (GameData.itemStackable[this.tradeRecipientItems[i]] === 0) {
            this.surface.drawString(
                this.tradeRecipientItemCount[i].toString(),
                slotX + 1,
                slotY + 10,
                1,
                colours.yellow
            );
        }

        if (
            this.mouseX > slotX &&
            this.mouseX < slotX + 48 &&
            this.mouseY > slotY &&
            this.mouseY < slotY + 32
        ) {
            this.surface.drawString(
                GameData.itemName[this.tradeRecipientItems[i]] +
                    ': @whi@' +
                    GameData.itemDescription[this.tradeRecipientItems[i]],
                DIALOG_X + 8,
                DIALOG_Y + 273,
                1,
                colours.yellow
            );
        }
    }

    if (this.tradeAmountInput) {
        const input = this.tradeAmountInput;
        const cx = DIALOG_X + 234;
        const cy = DIALOG_Y + 120;

        this.surface.drawBox(cx - 120, cy - 20, 240, 84, 0);
        this.surface.drawBoxEdge(cx - 120, cy - 20, 240, 84, colours.white);
        this.surface.drawStringCenter(
            `${input.mode === 'offer' ? 'Offer' : 'Remove'} how many? (1-${input.max})`,
            cx,
            cy,
            1,
            colours.white
        );
        this.surface.drawStringCenter(`${input.text}*`, cx, cy + 20, 3, colours.cyan);
        this.surface.drawStringCenter(
            input.error || 'Enter to confirm',
            cx,
            cy + 32,
            1,
            colours.yellow
        );
        this.surface.drawStringCenter(
            'Cancel (Escape)',
            cx,
            cy + 52,
            1,
            colours.white
        );
    }
}

function openTradeAmountKeyboard(client) {
    if (!client || !client.tradeAmountInput) return;
    if (!(client.options && client.options.mobile && client.openKeyboard)) return;
    const input = client.tradeAmountInput;
    client.lastMobileInput = input.text || '';
    client.openKeyboard('number', input.text || '', 5, {
        left: `${DIALOG_X + 114}px`,
        top: `${DIALOG_Y + 100}px`,
        width: '240px',
        height: '20px'
    });
}

module.exports = {
    drawDialogTrade,
    showDialogTrade: false,
    tradeOfferItem,
    tradeRemoveItem,
    tradeKeyPress,
    populateTradeOfferMenus,
    openTradeAmountKeyboard
};
