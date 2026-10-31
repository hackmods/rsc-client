const MODALS = ['showDialogBank', 'showDialogExchange', 'showDialogShop',
    'showDialogTrade', 'showDialogTradeConfirm', 'showDialogDuel',
    'showDialogDuelConfirm', 'showAppearanceChange', 'isSleeping',
    'showDialogWelcome', 'showDialogServerMessage', 'showDialogConfirm',
    'showDialogSocialInput', 'showDialogReportAbuseStep',
    'showChangePasswordStep', 'showOptionMenu', 'showRightClickMenu',
    'bankSearchFocus', 'bankAmountInput'];

function handleQuickReplyKey(keyCode) {
    const sender = this.lastPrivateMessageSender;
    if (keyCode !== 9 || !this.loggedIn || !this.options.tabReply ||
        MODALS.some(flag => this[flag]) || !sender ||
        typeof sender.greaterThan !== 'function' || !sender.greaterThan(0)) {
        return false;
    }
    this.resetPMText();
    this.privateMessageTarget = sender;
    this.showDialogSocialInput = 2;
    return true;
}

module.exports = { handleQuickReplyKey };
