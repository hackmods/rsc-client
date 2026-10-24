const colours = require('./_colours');

const WIDTH = 300;
const HEIGHT = 90;

function drawDialogConfirm() {
    const dialogX = 256 - ((WIDTH / 2) | 0);
    const dialogY = 167 - ((HEIGHT / 2) | 0);

    this.surface.drawBox(dialogX, dialogY, WIDTH, HEIGHT, colours.black);
    this.surface.drawBoxEdge(dialogX, dialogY, WIDTH, HEIGHT, colours.white);

    let y = dialogY + 22;

    this.surface.drawStringCenter(this.confirmTextTop, 256, y, 1, colours.white);

    y += 18;

    this.surface.drawStringCenter(
        this.confirmTextBottom,
        256,
        y,
        1,
        colours.white
    );

    const buttonY = dialogY + HEIGHT - 12;
    const yesX = 256 - 50;
    const noX = 256 + 50;

    const overYes =
        this.mouseX >= yesX - 25 &&
        this.mouseX <= yesX + 25 &&
        this.mouseY > buttonY - 12 &&
        this.mouseY < buttonY + 4;

    const overNo =
        this.mouseX >= noX - 25 &&
        this.mouseX <= noX + 25 &&
        this.mouseY > buttonY - 12 &&
        this.mouseY < buttonY + 4;

    this.surface.drawStringCenter(
        'Yes',
        yesX,
        buttonY,
        1,
        overYes ? colours.yellow : colours.white
    );

    this.surface.drawStringCenter(
        'No',
        noX,
        buttonY,
        1,
        overNo ? colours.yellow : colours.white
    );

    if (this.mouseButtonClick !== 0) {
        if (overYes) {
            if (this.confirmType === 1) {
                this.sendCommandString('skiptutorial');
            }

            this.showDialogConfirm = false;
        } else if (
            overNo ||
            this.mouseX < dialogX ||
            this.mouseX > dialogX + WIDTH ||
            this.mouseY < dialogY ||
            this.mouseY > dialogY + HEIGHT
        ) {
            this.showDialogConfirm = false;
        }
    }

    this.mouseButtonClick = 0;
}

module.exports = {
    showDialogConfirm: false,
    confirmType: 0,
    confirmTextTop: '',
    confirmTextBottom: '',
    drawDialogConfirm
};
