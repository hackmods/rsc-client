const test = require('node:test');
const assert = require('node:assert/strict');
const overlay = require('../src/ui/status-overlay');

function client() {
    const calls = [];
    const mud = { options: { experienceDrops: true, statusBars: true }, loggedIn: 1,
        gameWidth: 512, gameHeight: 334,
        playerStatCurrent: Array(18).fill(10), playerStatBase: Array(18).fill(10),
        statFatigue: 375, surface: {} };
    for (const method of ['drawStringCenter', 'drawStringRight', 'drawBoxAlpha']) {
        mud.surface[method] = (...args) => calls.push([method, ...args]);
    }
    Object.assign(mud, overlay);
    mud.resetStatusOverlay();
    return { mud, calls };
}

test('quarter XP deltas preserve fractions and reject non-gains and invalid skills', () => {
    const { mud, calls } = client();
    mud.recordExperienceChange(14, 100, 105);
    for (const args of [[14, 105, 105], [14, 105, 100], [-1, 0, 4], [18, 0, 4], [0, NaN, 4]]) {
        mud.recordExperienceChange(...args);
    }
    assert.equal(mud.experienceDrops.length, 1);
    mud.drawStatusOverlay();
    assert.ok(calls.some(call => call[1] === '+1.25 Mining XP'));
});

test('logout, disabled drops and session reset do not retain new gains', () => {
    const { mud } = client();
    mud.loggedIn = 0;
    mud.recordExperienceChange(0, 0, 40);
    assert.equal(mud.experienceDrops.length, 0);
    mud.loggedIn = 1;
    mud.recordExperienceChange(0, 0, 40);
    mud.resetStatusOverlay();
    assert.deepEqual(mud.experienceDrops, []);
    mud.options.experienceDrops = false;
    mud.recordExperienceChange(0, 0, 40);
    assert.deepEqual(mud.experienceDrops, []);
});

test('queue is bounded and expires by elapsed time even while a modal hides it', t => {
    t.mock.method(Date, 'now', () => 1000);
    const { mud, calls } = client();
    for (let i = 0; i < 20; i++) mud.recordExperienceChange(0, i * 4, (i + 1) * 4);
    assert.equal(mud.experienceDrops.length, 6);
    mud.showDialogBank = true;
    Date.now.mock.mockImplementation(() => 4000);
    mud.drawStatusOverlay();
    assert.deepEqual(mud.experienceDrops, []);
    assert.deepEqual(calls, []);
});

test('HUD renders current stats, fatigue and boosts without opponent or energy data', () => {
    const { mud, calls } = client();
    mud.playerStatCurrent[0] = 12;
    mud.drawStatusOverlay();
    assert.ok(calls.some(call => call[1] === 'Hits: 10/10'));
    assert.ok(calls.some(call => call[1] === 'Prayer: 10/10'));
    assert.ok(calls.some(call => call[1] === 'Fatigue: 50%'));
    assert.ok(calls.some(call => call[1] === 'Attack: 12/10'));
});

test('modal surfaces suppress all overlays', () => {
    for (const flag of ['showDialogBank', 'showDialogExchange', 'showDialogTrade',
        'showDialogTradeConfirm', 'showDialogDuel', 'showDialogDuelConfirm',
        'showAppearanceChange', 'isSleeping']) {
        const { mud, calls } = client();
        mud.recordExperienceChange(0, 0, 4);
        mud[flag] = true;
        mud.drawStatusOverlay();
        assert.deepEqual(calls, [], flag);
    }
});
