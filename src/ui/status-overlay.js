const SKILLS = ['Attack', 'Defense', 'Strength', 'Hits', 'Ranged', 'Prayer',
    'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking',
    'Crafting', 'Smithing', 'Mining', 'Herblaw', 'Agility', 'Thieving'];
const DROP_LIFETIME = 3000;
const MAX_DROPS = 6;
const MODALS = ['showDialogBank', 'showDialogExchange', 'showDialogShop',
    'showDialogTrade', 'showDialogTradeConfirm', 'showDialogDuel',
    'showDialogDuelConfirm', 'showAppearanceChange', 'isSleeping',
    'showDialogWelcome', 'showDialogServerMessage', 'showDialogConfirm',
    'showDialogSocialInput', 'showDialogReportAbuseStep'];

function resetStatusOverlay() {
    this.experienceDrops = [];
}

// Call only for incremental packets after the login skill baseline is ready.
// The protocol stores XP in quarter units, as does playerExperience.
function recordExperienceChange(skillIndex, oldRawXp, newRawXp) {
    if (!this.options.experienceDrops || !this.loggedIn ||
        !Number.isInteger(skillIndex) || skillIndex < 0 || skillIndex >= SKILLS.length ||
        !Number.isFinite(oldRawXp) || !Number.isFinite(newRawXp) ||
        oldRawXp < 0 || newRawXp <= oldRawXp) {
        return;
    }
    const now = Date.now();
    this.experienceDrops = (this.experienceDrops || [])
        .filter(drop => now - drop.created < DROP_LIFETIME);
    this.experienceDrops.push({ skillIndex, amount: (newRawXp - oldRawXp) / 4, created: now });
    if (this.experienceDrops.length > MAX_DROPS) {
        this.experienceDrops.shift();
    }
}

function drawStatusOverlay() {
    const now = Date.now();
    this.experienceDrops = (this.experienceDrops || [])
        .filter(drop => now - drop.created < DROP_LIFETIME);
    if (!this.loggedIn || this.showOptionMenu || this.showRightClickMenu ||
        this.showChangePasswordStep || this.logoutTimeout || this.showUiWildWarn === 1 ||
        MODALS.some(flag => this[flag])) {
        return;
    }
    const surface = this.surface;
    const width = this.gameWidth || surface.width;
    const height = this.gameHeight || surface.height;
    if (this.options.experienceDrops) {
        this.experienceDrops.forEach((drop, index) => {
            const y = Math.round(height / 4 + index * 16 - (now - drop.created) / 100);
            surface.drawStringCenter(`+${drop.amount} ${SKILLS[drop.skillIndex]} XP`,
                width >> 1, y, 1, 0xffffff);
        });
    }
    if (!this.options.statusBars) {
        return;
    }
    const current = this.playerStatCurrent;
    const base = this.playerStatBase;
    const barWidth = Math.min(142, Math.floor(width / 3));
    const bar = (label, value, max, y, colour, percentage) => {
        if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
            return;
        }
        surface.drawBoxAlpha(7, y, barWidth, 16, 0, 160);
        surface.drawBoxAlpha(7, y, Math.floor(barWidth * Math.max(0, Math.min(1, value / max))), 16, colour, 160);
        const text = percentage ? `${Math.floor(value * 100 / max)}%` : `${value}/${max}`;
        surface.drawStringCenter(`${label}: ${text}`, 7 + (barWidth >> 1), y + 12, 1, 0xffffff);
    };
    bar('Hits', current[3], base[3], 121, 0x008000);
    bar('Prayer', current[5], base[5], 140, 0x008080);
    bar('Fatigue', this.statFatigue, 750, 159, 0x707070, true);
    // Keep changed-stat text clear of the right-hand tab panels.
    if (this.showUITab) {
        return;
    }
    let y = 48;
    for (let i = 0; i < SKILLS.length && y < height - 40; i++) {
        if (i === 3 || i === 5 || base[i] <= 0 || current[i] === base[i]) {
            continue;
        }
        surface.drawStringRight(`${SKILLS[i]}: ${current[i]}/${base[i]}`,
            width - 4, y, 1, current[i] > base[i] ? 0x00ff00 : 0xff8000);
        y += 14;
    }
}

module.exports = { resetStatusOverlay, recordExperienceChange, drawStatusOverlay };
