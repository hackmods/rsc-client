const BZLib = require('../../src/bzlib');
const GameData = require('../../src/game-data');
const Surface = require('../../src/surface');
const Utility = require('../../src/utility');
const bank = require('../../src/ui/bank-dialog');
const statusOverlay = require('../../src/ui/status-overlay');
const quickReply = require('../../src/ui/quick-reply');
const socialDialog = require('../../src/ui/social-dialog');
const clientOpcodes = require('../../src/opcodes/client');

const FONT_FILES = ['h11p.jf', 'h12b.jf', 'h12p.jf', 'h13b.jf', 'h14b.jf', 'h16b.jf', 'h20b.jf', 'h24b.jf'];
const ICONS = [0x999999, 0xe4bd3d, 0x7f99a8, 0x907a62, 0xb87c54];

function int24(bytes, offset) {
    return ((bytes[offset] & 0xff) << 16) | ((bytes[offset + 1] & 0xff) << 8) | (bytes[offset + 2] & 0xff);
}

async function loadBitmapFonts() {
    const response = await fetch('/data204/fonts1.jag');
    if (!response.ok) throw new Error(`fonts1.jag request failed: ${response.status}`);
    const archive = new Int8Array(await response.arrayBuffer());
    const size = int24(archive, 0);
    const compressed = int24(archive, 3);
    let contents;

    if (compressed === size) {
        contents = archive.subarray(6, 6 + size);
    } else {
        contents = new Int8Array(size);
        BZLib.decompress(contents, size, archive, compressed, 6);
    }

    FONT_FILES.forEach((name, id) => {
        const font = Utility.loadData(name, 0, contents);
        if (!font) throw new Error(`font missing from fonts1.jag: ${name}`);
        Surface.createFont(font, id);
    });
}

function seedGameData() {
    GameData.itemName = ['Iron ore', 'Gold coins', 'Rune essence', 'Bronze sword', 'Raw shrimp'];
    GameData.itemPicture = Int32Array.from([0, 1, 2, 3, 4]);
    GameData.itemMask = Int32Array.from([0, 0, 0, 0, 0]);
    GameData.itemStackable = Int32Array.from([0, 0, 0, 1, 0]);
    GameData.itemBasePrice = Int32Array.from([14, 1, 30, 20, 5]);
}

function installSyntheticIcons(surface) {
    ICONS.forEach((colour, index) => {
        const size = 24;
        const pixels = new Int32Array(size * size);
        for (let y = 3; y < 21; y++) {
            for (let x = 3; x < 21; x++) {
                const edge = x === 3 || x === 20 || y === 3 || y === 20;
                const highlight = (x + y + index) % 7 === 0;
                if (!edge || ((x + y) % 2 === 0)) pixels[y * size + x] = highlight ? 0xe8e0c0 : colour;
            }
        }
        surface.surfacePixels[index] = pixels;
        surface.spriteWidth[index] = size;
        surface.spriteHeight[index] = size;
        surface.spriteWidthFull[index] = size;
        surface.spriteHeightFull[index] = size;
    });
}

function createFixture() {
    const mode = new URLSearchParams(location.search).get('mode') === 'mobile' ? 'mobile' : 'desktop';
    const gameWidth = mode === 'mobile' ? 512 : 800;
    const gameHeight = mode === 'mobile' ? 346 : 600;
    const canvas = document.querySelector('#screen');
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = gameWidth;
    canvas.height = gameHeight;
    canvas.style.maxWidth = mode === 'mobile' ? '512px' : '800px';
    document.body.dataset.mode = mode;

    const packets = [];
    const commands = [];
    const keyboard = [];
    let packet;
    const client = {
        _graphics: { ctx: context },
        gameWidth,
        gameHeight,
        showDialogBank: true,
        bankItems: Int32Array.from([0, 1, 2, 3, 4]),
        bankItemsCount: Int32Array.from([75, 3000, 120, 5, 48]),
        bankItemCount: 5,
        newBankItemCount: 5,
        bankItemsMax: 192,
        bankSelectedItem: -2,
        bankSelectedItemSlot: -1,
        bankSearch: '',
        bankSearchFocus: false,
        bankAmountInput: null,
        bankActivePage: 0,
        bankLastWithdrawX: 42,
        bankLastDepositX: 12,
        options: { mobile: mode === 'mobile', bankValue: true, experienceDrops: true, statusBars: true, tabReply: true },
        mouseX: 0,
        mouseY: 0,
        mouseButtonClick: 0,
        mouseScrollDelta: 0,
        spriteItem: 0,
        mobileInputEl: mode === 'mobile' ? {} : null,
        packets,
        commands,
        keyboard,
        packetStream: {
            newPacket(opcode) { packet = [opcode]; },
            putShort(value) { packet.push(value); },
            putInt(value) { packet.push(value); },
            sendPacket() { packets.push(packet); packet = null; }
        },
        sendCommandString(command) { commands.push(command); },
        getInventoryCount(id) { return id === 1 ? 250 : id === 3 ? 1 : 0; },
        openKeyboard(type, value, limit) { keyboard.push({ action: 'open', type, value, limit }); },
        closeKeyboard() { keyboard.push({ action: 'close' }); },
        resetPMText: socialDialog.resetPMText,
        handleQuickReplyKey: quickReply.handleQuickReplyKey,
        drawDialogSocialInput: socialDialog.drawDialogSocialInput,
        drawStatusOverlay: statusOverlay.drawStatusOverlay,
        recordExperienceChange: statusOverlay.recordExperienceChange,
        resetStatusOverlay: statusOverlay.resetStatusOverlay
    };

    Object.assign(client, bank);
    client.surface = new Surface(gameWidth, gameHeight, 128, client);
    client.surface.setBounds(0, 0, gameWidth, gameHeight);
    client.surface.renderedText = [];
    const drawString = client.surface.drawString;
    client.surface.drawString = function (text, ...args) {
        this.renderedText.push(String(text));
        return drawString.call(this, text, ...args);
    };
    installSyntheticIcons(client.surface);
    client.playerStatCurrent = Array(18).fill(10);
    client.playerStatBase = Array(18).fill(10);
    client.playerStatCurrent[0] = 12;
    client.statFatigue = 187;
    client.loggedIn = 1;
    client.showUITab = false;
    client.localPlayer = { hash: Utility.usernameToHash('FixturePlayer') };
    client.privateMessageTarget = null;

    let backgroundFrame = 0;
    function render() {
        const surface = client.surface;
        surface.renderedText.length = 0;
        surface.blackScreen();
        surface.drawBox(0, 0, gameWidth, gameHeight, 0x263b32);
        for (let y = 0; y < gameHeight; y += 24) {
            const offset = (backgroundFrame % 3) * 8;
            surface.drawLineHoriz(offset, y, Math.max(0, gameWidth - offset), y % 48 ? 0x2b4436 : 0x304a38);
        }
        surface.drawBoxAlpha(0, Math.floor(gameHeight * 0.72), gameWidth, Math.ceil(gameHeight * 0.28), 0x141d20, 96);

        if (client.showDialogBank) client.drawDialogBank();
        if (client.loggedIn && !client.showDialogBank && !client.showDialogSocialInput) client.drawStatusOverlay();
        if (client.showDialogSocialInput) client.drawDialogSocialInput();

        surface.setComplete();
        context.putImageData(surface.imageData, 0, 0);
        backgroundFrame++;
    }

    function reset(view = 'bank') {
        client.showDialogBank = view === 'bank';
        client.showDialogSocialInput = 0;
        client.bankSearch = '';
        client.bankSearchFocus = false;
        client.bankAmountInput = null;
        client.bankPresetsOpen = false;
        client.bankPresetConfirm = 0;
        client.bankActivePage = 0;
        client.bankSelectedItem = -2;
        client.bankSelectedItemSlot = -1;
        client.mouseButtonClick = 0;
        client.mouseScrollDelta = 0;
        client.packets.length = 0;
        client.commands.length = 0;
        client.keyboard.length = 0;
        client.resetPMText();
        client.resetStatusOverlay();
        client.options.experienceDrops = true;
        client.options.statusBars = true;
        client.options.tabReply = true;

        if (view === 'hud') {
            client.recordExperienceChange(14, 400, 444);
        } else if (view === 'pm') {
            client.lastPrivateMessageSender = Utility.usernameToHash('CoinTester');
            if (!client.handleQuickReplyKey(9)) throw new Error('Tab reply fixture did not open');
            client.inputPMCurrent = 'Ready for bank UI review';
        }

        render();
        return { view, mode };
    }

    function clickBank(relativeX, relativeY) {
        const x = ((gameWidth / 2) | 0) - 204;
        const y = ((gameHeight / 2) | 0) - 167;
        client.mouseX = x + relativeX;
        client.mouseY = y + relativeY;
        client.mouseButtonClick = 1;
        render();
    }

    function typeBank(text) {
        for (const character of text) client.bankKeyPress(character.charCodeAt(0));
        render();
    }

    function pressBank(keyCode) {
        const consumed = client.bankKeyPress(keyCode);
        render();
        return consumed;
    }

    return { client, canvas, mode, render, reset, clickBank, typeBank, pressBank };
}

async function start() {
    try {
        seedGameData();
        await loadBitmapFonts();
        const fixture = createFixture();
        window.bankFixture = fixture;
        const result = document.querySelector('#fixture-result');
        result.textContent = `${fixture.mode.toUpperCase()} INPUT PATH · synthetic bank rows · real client drawing module`;
        fixture.reset('bank');
        window.dispatchEvent(new Event('bank-fixture-ready'));
    } catch (error) {
        document.querySelector('#fixture-result').textContent = `FIXTURE ERROR: ${error.stack || error}`;
        console.error(error);
    }
}

start();

