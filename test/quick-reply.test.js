const test = require('node:test');
const assert = require('node:assert/strict');
const Long = require('long');
const Utility = require('../src/utility');
const ChatMessage = require('../src/chat-message');
const handlers = require('../src/packet-handlers/social');
const opcodes = require('../src/opcodes/server');
const { handleQuickReplyKey } = require('../src/ui/quick-reply');

function client() {
    return { loggedIn: 1, options: { tabReply: true, wordFilter: false },
        messageTokens: Array(100).fill(0), messageIndex: 0, maxSocialListSize: 100,
        inputPMCurrent: 'stale draft', inputPMFinal: 'stale submission',
        showDialogSocialInput: 0, messages: [],
        resetPMText() { this.inputPMCurrent = ''; this.inputPMFinal = ''; },
        showServerMessage(message) { this.messages.push(message); },
        handleQuickReplyKey };
}

function receive(mud, sender, token, text = 'hello') {
    const length = ChatMessage.scramble(text);
    const packet = new Int8Array(13 + length);
    packet[0] = opcodes.FRIEND_MESSAGE;
    packet.set(sender.toBytesBE(), 1);
    for (let i = 0; i < 4; i++) packet[9 + i] = token >>> (24 - i * 8);
    packet.set(ChatMessage.scrambledBytes.subarray(0, length), 13);
    handlers[opcodes.FRIEND_MESSAGE].call(mud, packet, packet.length);
}

test('Tab addresses the latest decoded PM sender with an empty PM draft', () => {
    const mud = client();
    const first = Utility.usernameToHash('Zasama');
    const latest = Utility.usernameToHash('Veteran');
    receive(mud, first, 1);
    receive(mud, latest, 2);
    assert.equal(mud.handleQuickReplyKey(9), true);
    assert.equal(mud.showDialogSocialInput, 2);
    assert.ok(mud.privateMessageTarget.equals(latest));
    assert.equal(mud.inputPMCurrent, '');
    assert.equal(mud.inputPMFinal, '');
});

test('duplicate messages and invalid sender hashes do not replace reply target', () => {
    const mud = client();
    const sender = Utility.usernameToHash('Zasama');
    receive(mud, sender, 1);
    receive(mud, Utility.usernameToHash('Other'), 1);
    receive(mud, Long.ZERO, 2);
    receive(mud, Long.NEG_ONE, 3);
    assert.ok(mud.lastPrivateMessageSender.equals(sender));
    assert.equal(mud.messages.length, 3);
});

test('non-Tab, missing target, disabled option and logout leave input untouched', () => {
    for (const setup of [
        mud => { mud.lastPrivateMessageSender = null; },
        mud => { mud.options.tabReply = false; },
        mud => { mud.loggedIn = 0; },
        mud => { mud.lastPrivateMessageSender = Long.ZERO; }
    ]) {
        const mud = client();
        mud.lastPrivateMessageSender = Utility.usernameToHash('Zasama');
        setup(mud);
        assert.equal(mud.handleQuickReplyKey(9), false);
        assert.equal(mud.showDialogSocialInput, 0);
        assert.equal(mud.inputPMCurrent, 'stale draft');
    }
    const mud = client();
    mud.lastPrivateMessageSender = Utility.usernameToHash('Zasama');
    assert.equal(mud.handleQuickReplyKey(65), false);
    assert.equal(mud.inputPMCurrent, 'stale draft');
});

test('Tab never replaces modal input or bank typing', () => {
    for (const flag of ['showDialogBank', 'showDialogExchange', 'showDialogShop',
        'showDialogTrade', 'showDialogTradeConfirm', 'showDialogDuel',
        'showDialogDuelConfirm', 'showAppearanceChange', 'isSleeping',
        'showDialogWelcome', 'showDialogServerMessage', 'showDialogConfirm',
        'showDialogSocialInput', 'showDialogReportAbuseStep',
        'showChangePasswordStep', 'showOptionMenu', 'bankSearchFocus', 'bankAmountInput']) {
        const mud = client();
        mud.lastPrivateMessageSender = Utility.usernameToHash('Zasama');
        mud[flag] = 1;
        assert.equal(mud.handleQuickReplyKey(9), false, flag);
        assert.equal(mud.inputPMCurrent, 'stale draft', flag);
        assert.equal(mud.privateMessageTarget, undefined, flag);
    }
});
