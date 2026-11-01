const MENU_BANK_WITHDRAW = 601;
const MENU_BANK_DEPOSIT = 602;
const MENU_TRANSACTION_OFFER = 603;
const MENU_TRANSACTION_REMOVE = 604;
const MENU_INVENTORY_EXAMINE = 3600;

function menuCapacity(client) {
    return client.menuType ? client.menuType.length : 250;
}

function addOfferMenu(client, type, itemId, amount, displayAmount, itemName) {
    if (client.menuItemsCount >= menuCapacity(client)) {
        return false;
    }

    const i = client.menuItemsCount;
    client.menuItemText1[i] = displayAmount;
    client.menuItemText2[i] = itemName;
    client.menuType[i] = type;
    client.menuIndex[i] = itemId;
    client.menuTargetIndex[i] = amount;
    client.menuItemsCount++;
    return true;
}

function addOfferMenus(client, typeString, menuType, itemId, itemAmount, itemName, lastX) {
    const opts = client.options || {};
    let formatted = `${typeString}-1`;

    if (itemAmount >= 1) {
        addOfferMenu(client, menuType, itemId, 1, formatted, itemName);
    }

    if (itemAmount >= 5) {
        formatted = `${typeString}-5`;
        addOfferMenu(client, menuType, itemId, 5, formatted, itemName);
    }

    if (itemAmount >= 10) {
        formatted = `${typeString}-10`;
        addOfferMenu(client, menuType, itemId, 10, formatted, itemName);
    }

    if (itemAmount >= 50) {
        formatted = `${typeString}-50`;
        addOfferMenu(client, menuType, itemId, 50, formatted, itemName);
    }

    if (opts.offerX && opts.lastOfferX) {
        if (
            lastX !== 0 && lastX !== 1 && lastX !== 5 && lastX !== 10 &&
            lastX !== 50 && itemAmount >= lastX
        ) {
            formatted = `${typeString}-${lastX}`;
            addOfferMenu(client, menuType, itemId, lastX, formatted, itemName);
        }
    }

    if (opts.offerX && itemAmount > 1) {
        formatted = `${typeString}-X`;
        addOfferMenu(client, menuType, itemId, -itemAmount, formatted, itemName);
    }

    if (opts.offerX && itemAmount >= 1) {
        formatted = `${typeString}-All`;
        addOfferMenu(client, menuType, itemId, itemAmount, formatted, itemName);
    }

    if (client.menuItemsCount >= menuCapacity(client)) {
        return;
    }

    const i = client.menuItemsCount;
    client.menuItemText1[i] = 'Examine';
    client.menuItemText2[i] = itemName;
    client.menuType[i] = MENU_INVENTORY_EXAMINE;
    client.menuIndex[i] = itemId;
    client.menuItemsCount++;
}

function handleOfferMenuClick(client, index) {
    const menuType = client.menuType[index];
    if (menuType < MENU_BANK_WITHDRAW || menuType > MENU_TRANSACTION_REMOVE) {
        return false;
    }

    const itemId = client.menuIndex[index];
    const amount = client.menuTargetIndex[index];

    if (menuType === MENU_BANK_WITHDRAW || menuType === MENU_BANK_DEPOSIT) {
        const withdraw = menuType === MENU_BANK_WITHDRAW;
        if (amount < 0) {
            client.bankAmountInput = { id: itemId, withdraw, text: '', error: '' };
            const { openBankAmountKeyboard } = require('./bank-dialog');
            if (typeof openBankAmountKeyboard === 'function') {
                openBankAmountKeyboard(client);
            }
            return true;
        }
        const { transact } = require('./bank-dialog');
        if (transact(client, itemId, amount, withdraw)) {
            client[withdraw ? 'bankLastWithdrawX' : 'bankLastDepositX'] = amount;
        }
        return true;
    }

    if (menuType === MENU_TRANSACTION_OFFER) {
        if (amount < 0) {
            client.tradeAmountInput = {
                mode: 'offer',
                id: itemId,
                max: -amount,
                text: '',
                error: ''
            };
            const { openTradeAmountKeyboard } = require('./trade-dialog');
            if (typeof openTradeAmountKeyboard === 'function') {
                openTradeAmountKeyboard(client);
            }
            return true;
        }
        const { tradeOfferItem } = require('./trade-dialog');
        tradeOfferItem(client, itemId, amount);
        client.tradeLastOfferX = amount;
        return true;
    }

    if (menuType === MENU_TRANSACTION_REMOVE) {
        if (amount < 0) {
            client.tradeAmountInput = {
                mode: 'remove',
                id: itemId,
                max: -amount,
                text: '',
                error: ''
            };
            const { openTradeAmountKeyboard } = require('./trade-dialog');
            if (typeof openTradeAmountKeyboard === 'function') {
                openTradeAmountKeyboard(client);
            }
            return true;
        }
        const { tradeRemoveItem } = require('./trade-dialog');
        tradeRemoveItem(client, itemId, amount);
        client.tradeLastOfferX = amount;
        return true;
    }

    return false;
}

module.exports = {
    MENU_BANK_WITHDRAW,
    MENU_BANK_DEPOSIT,
    MENU_TRANSACTION_OFFER,
    MENU_TRANSACTION_REMOVE,
    addOfferMenus,
    handleOfferMenuClick
};
