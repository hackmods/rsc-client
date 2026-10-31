const test = require('node:test');
const assert = require('node:assert/strict');
const MudClient = require('../src/mudclient');
const GameShell = require('../src/game-shell');
const bank = require('../src/ui/bank-dialog');
const options = require('../src/ui/option-menu');
const quickReply = require('../src/ui/quick-reply');
const overlay = require('../src/ui/status-overlay');
const statHandlers = require('../src/packet-handlers/player-stats');
const bankHandlers = require('../src/packet-handlers/bank');
const op = require('../src/opcodes/server.json');

function client() {
    const c = Object.assign(Object.create(MudClient.prototype), bank, options, quickReply, overlay);
    Object.assign(c, { options: { optionNumbers: true, experienceDrops: true }, loggedIn: 1,
        logoutTimeout: 0, combatTimeout: 0, showChangePasswordStep: 0,
        showDialogSocialInput: 0, showDialogReportAbuseStep: 0,
        inputTextCurrent: '', inputPMCurrent: '', inputTextFinal: '', inputPMFinal: '',
        playerExperience: new Int32Array(18), playerStatCurrent: new Int32Array(18),
        playerStatBase: new Int32Array(18), chat: [], packets: [],
        packetStream: { newPacket(id) { c.packets.push(id); }, putByte() {}, sendPacket() {} },
        panelMessageTabs: { keyPress(key) { c.chat.push(key); } }
    });
    return c;
}
const press = (c, key) => GameShell.prototype.keyPressed.call(c, {
    key, keyCode: key === 'Escape' ? 27 : key.charCodeAt(0), preventDefault() {}
});

test('bank owns typed keys and Escape without leaking to chat, PM or sleep input', () => {
    const c = client();
    c.showDialogBank = true;
    c.bankSearchFocus = true;
    press(c, 'a');
    assert.equal(c.bankSearch, 'a');
    assert.deepEqual(c.chat, []);
    assert.equal(c.inputTextCurrent, '');
    assert.equal(c.inputPMCurrent, '');
    press(c, 'Escape');
    assert.equal(c.bankSearchFocus, false);
});

test('visible bank takes precedence over stale exchange flag', () => {
    const c = client();
    c.showDialogBank = c.showDialogExchange = c.bankSearchFocus = true;
    c.exchangeKeyPress = () => assert.fail('hidden exchange received key');
    press(c, 'x');
    assert.equal(c.bankSearch, 'x');
});

test('dialogue number is consumed once and cannot enter background text buffers', () => {
    const c = client();
    c.showOptionMenu = true;
    c.optionMenuCount = 2;
    press(c, '1');
    assert.equal(c.packets.length, 1);
    assert.equal(c.showOptionMenu, false);
    assert.deepEqual(c.chat, []);
    assert.equal(c.inputPMCurrent, '');
    c.showDialogSocialInput = 2;
    c.showOptionMenu = true;
    press(c, '2');
    assert.equal(c.packets.length, 1);
    assert.equal(c.inputPMCurrent, '2');
});

test('full stat snapshots reset XP baseline while incremental packets record only gains', () => {
    const c = client();
    const packet = Buffer.alloc(1 + 18 * 6 + 1);
    for (let i = 0; i < 18; i++) {
        packet[1 + i] = packet[19 + i] = 10;
        packet.writeUInt32BE(400, 37 + i * 4);
    }
    const update = Buffer.alloc(6);
    update[1] = 14;
    update.writeUInt32BE(440, 2);
    statHandlers[op.PLAYER_STAT_EXPERIENCE_UPDATE].call(c, update);
    assert.equal(c.experienceDrops, undefined);
    statHandlers[op.PLAYER_STAT_LIST].call(c, packet);
    assert.deepEqual(c.experienceDrops, []);
    statHandlers[op.PLAYER_STAT_EXPERIENCE_UPDATE].call(c, update);
    assert.equal(c.experienceDrops[0].amount, 10);
    statHandlers[op.PLAYER_STAT_EXPERIENCE_UPDATE].call(c, update);
    assert.equal(c.experienceDrops.length, 1);
    statHandlers[op.PLAYER_STAT_LIST].call(c, packet);
    assert.deepEqual(c.experienceDrops, []);
});

test('server bank compaction reopen preserves search; close clears it', () => {
    const c = client();
    c.showDialogBank = true;
    c.bankSearch = 'ore';
    c.updateBankItems = () => {};
    bankHandlers[op.BANK_OPEN].call(c, Buffer.from([42, 0, 192]));
    assert.equal(c.bankSearch, 'ore');
    bankHandlers[op.BANK_CLOSE].call(c);
    assert.equal(c.bankSearch, '');
});
