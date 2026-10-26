const serverOpcodes = require('../opcodes/server');
const {
    parseExchangeState,
    parseExchangeQuote
} = require('../lib/exchange');

// Packet buffers hold the opcode at index 0, so bodies start at 1.
const BODY = 1;

module.exports = {
    [serverOpcodes.EXCHANGE_STATE]: function (data) {
        const state = parseExchangeState(data, BODY);

        // bit0 opens the panel; without it the state only refreshes an open one
        if (!state.open && !this.showDialogExchange) {
            return;
        }

        this.exchangeState = state;

        if (state.open && !this.showDialogExchange) {
            this.openDialogExchange();
        }
    },
    [serverOpcodes.EXCHANGE_QUOTE]: function (data) {
        const quote = parseExchangeQuote(data, BODY);

        if (!this.exchangeQuotes) {
            this.exchangeQuotes = {};
        }

        this.exchangeQuotes[quote.itemId] = quote;

        if (this.showDialogExchange) {
            this.exchangeQuoteArrived(quote);
        }
    },
    [serverOpcodes.EXCHANGE_CLOSE]: function () {
        this.showDialogExchange = false;
    }
};
