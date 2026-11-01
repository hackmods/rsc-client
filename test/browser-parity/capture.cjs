const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const clientOpcodes = require('../../src/opcodes/client');

const clientRoot = path.resolve(__dirname, '..', '..');
const serverScript = path.join(__dirname, 'serve.cjs');
const chromePath = process.env.ARSC_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const evidenceDir = path.resolve(process.env.ARSC_BROWSER_EVIDENCE || path.join(os.tmpdir(), 'arsc-bank-browser-evidence'));

function getPort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

async function waitForServer(url, child) {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
        if (child.exitCode !== null) throw new Error(`fixture server exited with ${child.exitCode}`);
        try {
            const response = await fetch(`${url}/health`);
            if (response.ok) return;
        } catch { /* waiting for listen */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('timed out waiting for browser fixture server');
}

async function main() {
    const { chromium } = require('playwright-core');
    await fs.mkdir(evidenceDir, { recursive: true });
    const port = await getPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = spawn(process.execPath, [serverScript], {
        cwd: clientRoot,
        env: { ...process.env, ARSC_FIXTURE_PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.pipe(process.stdout);
    server.stderr.pipe(process.stderr);

    let browser;
    const results = [];
    async function screenshot(page, name, label) {
        await page.evaluate((text) => {
            document.querySelector('#fixture-result').textContent = text;
        }, `SIMULATED FIXTURE · ${label}`);
        const target = path.join(evidenceDir, `${name}.png`);
        await page.screenshot({ path: target, fullPage: false });
        results.push(target);
    }

    try {
        await waitForServer(baseUrl, server);
        browser = await chromium.launch({
            executablePath: chromePath,
            headless: true,
            args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
        });

        const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
        await desktop.goto(`${baseUrl}/?mode=desktop`, { waitUntil: 'networkidle' });
        await desktop.waitForFunction(() => window.bankFixture && window.bankFixture.client.surface.textWidth('Bank', 1) > 0);
        await screenshot(desktop, 'desktop-bank', 'desktop bank, real client surface and bitmap font');

        const searchResult = await desktop.evaluate(() => {
            const f = window.bankFixture;
            f.reset('bank');
            f.clickBank(70, 290);
            f.typeBank('coin');
            f.clickBank(15, 35);
            return {
                query: f.client.bankSearch,
                selectedItem: f.client.bankSelectedItem,
                selectedNameDrawn: f.client.surface.renderedText.includes('Withdraw Gold coins'),
                textWidth: f.client.surface.textWidth('Search: coin*', 1)
            };
        });
        assert.equal(searchResult.query, 'coin');
        assert.equal(searchResult.selectedItem, 1, 'filter click maps to original bank item id');
        assert.equal(searchResult.selectedNameDrawn, true);
        assert.ok(searchResult.textWidth > 0, 'uses the client bitmap font metrics');
        await screenshot(desktop, 'desktop-search', 'search filters to Gold coins and preserves selected item identity');

        const quantityPrompt = await desktop.evaluate(() => {
            const f = window.bankFixture;
            f.reset('bank');
            f.clickBank(65, 35);
            f.clickBank(328, 238);
            return !!f.client.bankAmountInput;
        });
        assert.equal(quantityPrompt, true);
        await screenshot(desktop, 'desktop-quantity-prompt', 'withdraw X quantity modal');

        await desktop.evaluate(() => window.bankFixture.typeBank('42'));
        const quantityText = await desktop.evaluate(() => window.bankFixture.client.surface.renderedText.includes('42*'));
        assert.equal(quantityText, true);
        await screenshot(desktop, 'desktop-quantity-entered', 'quantity modal with 42 entered');

        const cancelResult = await desktop.evaluate(() => {
            const f = window.bankFixture;
            f.clickBank(204, 177);
            return { modalOpen: !!f.client.bankAmountInput, packets: f.client.packets.length };
        });
        assert.deepEqual(cancelResult, { modalOpen: false, packets: 0 }, 'cancel sends no bank packet');
        const confirmResult = await desktop.evaluate(() => {
            const f = window.bankFixture;
            f.reset('bank');
            f.clickBank(65, 35);
            f.clickBank(328, 238);
            f.typeBank('42');
            f.pressBank(13);
            return { modalOpen: !!f.client.bankAmountInput, packet: f.client.packets[0] };
        });
        assert.equal(confirmResult.modalOpen, false);
        assert.deepEqual(confirmResult.packet, [clientOpcodes.BANK_WITHDRAW, 1, 42, 0x12345678], 'confirm sends the expected quantity packet');
        await screenshot(desktop, 'desktop-quantity-confirmed', 'quantity confirmed; packet recorded by fake stream');

        await desktop.evaluate(() => {
            const f = window.bankFixture;
            f.reset('bank');
            f.clickBank(370, 290);
        });
        assert.equal(await desktop.evaluate(() => window.bankFixture.client.bankPresetsOpen), true);
        await screenshot(desktop, 'desktop-presets', 'preset list modal');

        await desktop.evaluate(() => window.bankFixture.clickBank(200, 135));
        assert.equal(await desktop.evaluate(() => window.bankFixture.client.bankPresetConfirm), 1);
        await screenshot(desktop, 'desktop-preset-save-confirm', 'explicit preset overwrite confirmation');

        const presetResult = await desktop.evaluate(() => {
            const f = window.bankFixture;
            f.clickBank(100, 235);
            const cancelHadNoCommand = f.client.commands.length === 0;
            f.clickBank(200, 135);
            f.clickBank(290, 235);
            f.clickBank(370, 290);
            f.clickBank(290, 163);
            return { cancelHadNoCommand, commands: [...f.client.commands] };
        });
        assert.equal(presetResult.cancelHadNoCommand, true);
        assert.deepEqual(presetResult.commands, ['bankpreset save 1', 'bankpreset load 2']);
        await screenshot(desktop, 'desktop-preset-load', 'save confirmation accepted and load command recorded');

        const hud = await desktop.evaluate(() => {
            const f = window.bankFixture;
            f.reset('hud');
            return f.client.surface.renderedText;
        });
        assert.ok(hud.includes('Hits: 10/10'));
        assert.ok(hud.includes('Prayer: 10/10'));
        assert.ok(hud.some((text) => text.includes('Fatigue:')));
        assert.ok(hud.includes('+11 Mining XP'));
        await screenshot(desktop, 'desktop-hud', 'status bars and XP drop using real status overlay module');

        const pm = await desktop.evaluate(() => {
            const f = window.bankFixture;
            f.reset('pm');
            return {
                title: f.client.surface.renderedText.find((text) => text.startsWith('Enter message to send to ')),
                draft: f.client.surface.renderedText.includes('Ready for bank UI review*')
            };
        });
        assert.equal(pm.title, 'Enter message to send to Cointester');
        assert.equal(pm.draft, true);
        await screenshot(desktop, 'desktop-pm-reply', 'Tab reply opens the private-message dialog for the latest sender');
        await desktop.close();

        const mobileContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true
        });
        const mobile = await mobileContext.newPage();
        await mobile.goto(`${baseUrl}/?mode=mobile`, { waitUntil: 'networkidle' });
        await mobile.waitForFunction(() => window.bankFixture && window.bankFixture.client.options.mobile);
        await screenshot(mobile, 'mobile-bank', 'mobile size and mobile keyboard path enabled');

        const mobileSearch = await mobile.evaluate(() => {
            const f = window.bankFixture;
            f.reset('bank');
            f.clickBank(70, 290);
            const opened = f.client.keyboard.at(-1);
            f.typeBank('coin');
            f.clickBank(15, 35);
            f.clickBank(370, 290);
            return {
                selectedItem: f.client.bankSelectedItem,
                keyboardKind: opened && opened.type,
                keyboardClosedOnPresets: f.client.keyboard.some((entry) => entry.action === 'close'),
                presetsOpen: f.client.bankPresetsOpen
            };
        });
        assert.equal(mobileSearch.selectedItem, 1);
        assert.equal(mobileSearch.keyboardKind, 'text');
        assert.equal(mobileSearch.keyboardClosedOnPresets, true);
        assert.equal(mobileSearch.presetsOpen, true);
        await screenshot(mobile, 'mobile-search-presets', 'touch keyboard search, result selection, then preset modal');

        const mobileQuantity = await mobile.evaluate(() => {
            const f = window.bankFixture;
            f.reset('bank');
            f.clickBank(65, 35);
            f.clickBank(328, 238);
            const opened = f.client.keyboard.at(-1);
            f.typeBank('42');
            const typed = f.client.surface.renderedText.includes('42*');
            f.pressBank(13);
            return {
                keyboardKind: opened && opened.type,
                typed,
                modalClosed: !f.client.bankAmountInput,
                packet: f.client.packets[0],
                keyboardClosed: f.client.keyboard.some((entry) => entry.action === 'close')
            };
        });
        assert.equal(mobileQuantity.keyboardKind, 'number');
        assert.equal(mobileQuantity.typed, true);
        assert.equal(mobileQuantity.modalClosed, true);
        assert.deepEqual(mobileQuantity.packet, [clientOpcodes.BANK_WITHDRAW, 1, 42, 0x12345678]);
        assert.equal(mobileQuantity.keyboardClosed, true);
        await screenshot(mobile, 'mobile-quantity-confirmed', 'touch numeric input confirmed; packet recorded by fake stream');

        const mobilePreset = await mobile.evaluate(() => {
            const f = window.bankFixture;
            f.reset('bank');
            f.clickBank(370, 290);
            f.clickBank(200, 135);
            return { open: f.client.bankPresetsOpen, confirm: f.client.bankPresetConfirm };
        });
        assert.deepEqual(mobilePreset, { open: true, confirm: 1 });
        await screenshot(mobile, 'mobile-preset-save-confirm', 'mobile preset overwrite confirmation');

        const mobileCancel = await mobile.evaluate(() => {
            const f = window.bankFixture;
            f.clickBank(100, 235);
            const canceled = f.client.bankPresetConfirm === 0 && f.client.commands.length === 0;
            f.clickBank(200, 135);
            f.clickBank(290, 235);
            return { canceled, commands: [...f.client.commands] };
        });
        assert.equal(mobileCancel.canceled, true);
        assert.deepEqual(mobileCancel.commands, ['bankpreset save 1']);
        await screenshot(mobile, 'mobile-preset-save-accepted', 'mobile cancel then explicit preset save command');
        await mobileContext.close();

        await fs.writeFile(path.join(evidenceDir, 'results.json'), JSON.stringify({
            fixture: 'synthetic bank inventory and fake packet/command streams; no live world connection',
            desktop: { searchResult, cancelResult, confirmPacket: confirmResult.packet, presetCommands: presetResult.commands, pm },
            mobile: { search: mobileSearch, quantity: mobileQuantity, preset: mobileCancel },
            screenshots: results
        }, null, 2));
        process.stdout.write(`PASS browser fixture: ${results.length} screenshots in ${evidenceDir}\n`);
    } finally {
        if (browser) await browser.close();
        server.kill('SIGTERM');
    }
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});

