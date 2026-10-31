const clientOpcodes = require('../opcodes/client');
const colours = require('./_colours');

function handleOptionMenuKey(keyCode) {
    if (!this.showOptionMenu || this.options.optionNumbers === false) {
        return false;
    }

    const index = keyCode - 49;

    if (index < 0 || index > 4) {
        return false;
    }

    if (index < this.optionMenuCount) {
        this.packetStream.newPacket(clientOpcodes.CHOOSE_OPTION);
        this.packetStream.putByte(index);
        this.packetStream.sendPacket();
        this.showOptionMenu = false;
    }

    return true;
}

function optionMenuText(client, index) {
    const entry = client.optionMenuEntry[index];

    return client.options.optionNumbers === false
        ? entry
        : `(${index + 1}) ${entry}`;
}

function drawOptionMenu() {
    const fontSize = this.options.mobile ? 5 : 1;
    const fontHeight = this.options.mobile ? 18 : 12;
    const maxHeight = fontHeight * 5;

    const uiX = this.options.mobile ? 48 : 6;

    const uiY = this.options.mobile
        ? (this.gameHeight / 2 - maxHeight / 2) | 0
        : 0;

    if (this.mouseButtonClick !== 0) {
        for (let i = 0; i < this.optionMenuCount; i++) {
            if (
                this.mouseX < uiX - 6 ||
                this.mouseX >=
                    uiX -
                        6 +
                        this.surface.textWidth(
                            optionMenuText(this, i),
                            fontSize
                        ) ||
                this.mouseY <= uiY + i * fontHeight ||
                this.mouseY >= uiY + (fontHeight + i * fontHeight)
            ) {
                continue;
            }

            this.packetStream.newPacket(clientOpcodes.CHOOSE_OPTION);
            this.packetStream.putByte(i);
            this.packetStream.sendPacket();
            break;
        }

        this.mouseButtonClick = 0;
        this.showOptionMenu = false;
        return;
    }

    for (let i = 0; i < this.optionMenuCount; i++) {
        let textColour = colours.cyan;

        if (
            !this.options.mobile &&
            this.mouseX > uiX - 6 &&
            this.mouseX <
                uiX -
                    6 +
                    this.surface.textWidth(optionMenuText(this, i), fontSize) &&
            this.mouseY > uiY + i * fontHeight &&
            this.mouseY < uiY + (i * fontHeight + fontHeight)
        ) {
            textColour = colours.red;
        }

        this.surface.drawString(
            optionMenuText(this, i),
            uiX,
            uiY + (fontHeight + i * fontHeight),
            fontSize,
            textColour
        );
    }
}

module.exports = { drawOptionMenu, handleOptionMenuKey };
