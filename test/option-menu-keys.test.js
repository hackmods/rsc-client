const test = require('node:test');
const assert = require('node:assert/strict');

const clientOpcodes = require('../src/opcodes/client.json');
const { drawOptionMenu, handleOptionMenuKey } = require('../src/ui/option-menu');

function fakeClient({ showOptionMenu = true, optionNumbers = true, count = 2 } = {}) {
    const packets = [];
    let currentPacket = null;

    return {
        packets,
        showOptionMenu,
        optionMenuCount: count,
        optionMenuEntry: ['Talk', 'Trade'],
        options: { optionNumbers },
        packetStream: {
            newPacket(opcode) {
                currentPacket = { opcode, bytes: [] };
            },
            putByte(value) {
                currentPacket.bytes.push(value);
            },
            sendPacket() {
                packets.push(currentPacket);
                currentPacket = null;
            }
        }
    };
}

test('number keys choose a listed option and close the menu once', () => {
    const client = fakeClient();

    assert.equal(handleOptionMenuKey.call(client, 50), true);
    assert.deepEqual(client.packets, [{ opcode: clientOpcodes.CHOOSE_OPTION, bytes: [1] }]);
    assert.equal(client.showOptionMenu, false);
    assert.equal(handleOptionMenuKey.call(client, 50), false);
    assert.equal(client.packets.length, 1, 'a stale repeat cannot send another choice');
});

test('a number for a missing option is consumed without sending a packet', () => {
    const client = fakeClient({ count: 1 });

    assert.equal(handleOptionMenuKey.call(client, 50), true);
    assert.deepEqual(client.packets, []);
    assert.equal(client.showOptionMenu, true);
});

test('non-number keys, a hidden menu, and disabled numbering are not consumed', () => {
    const visible = fakeClient();
    assert.equal(handleOptionMenuKey.call(visible, 54), false);

    const hidden = fakeClient({ showOptionMenu: false });
    assert.equal(handleOptionMenuKey.call(hidden, 49), false);

    const disabled = fakeClient({ optionNumbers: false });
    assert.equal(handleOptionMenuKey.call(disabled, 49), false);
    assert.deepEqual(disabled.packets, []);
});

test('draw text includes the optional number prefix and measures it for clicks', () => {
    const client = fakeClient();
    const drawn = [];
    const measured = [];
    Object.assign(client, {
        options: { mobile: false, optionNumbers: true },
        mouseButtonClick: 0,
        mouseX: 1,
        mouseY: 1,
        surface: {
            drawString(...args) { drawn.push(args[0]); },
            textWidth(text) { measured.push(text); return 100; }
        }
    });

    drawOptionMenu.call(client);
    assert.deepEqual(drawn, ['(1) Talk', '(2) Trade']);
    assert.ok(measured.includes('(1) Talk'));
});
