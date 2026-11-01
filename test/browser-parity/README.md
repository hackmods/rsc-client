# Browser UI fixture

This fixture renders the actual `src/ui/bank-dialog.js`, `status-overlay.js`, and `social-dialog.js` through the real
client `Surface` and bitmap fonts from `dist/data204/fonts1.jag`. Inventory quantities, item icons, packet replies, and
commands are synthetic and visibly labelled; it does not connect to a server or represent a player's bank.

From the client fork root, install Playwright Core outside the checkout and capture desktop/mobile screenshots:

```powershell
npm install --prefix (Join-Path $env:TEMP 'arsc-bank-browser-tools') playwright-core@1.64.1
$env:NODE_PATH = Join-Path $env:TEMP 'arsc-bank-browser-tools\node_modules'
$env:ARSC_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:ARSC_BROWSER_EVIDENCE = Join-Path $env:TEMP 'arsc-bank-browser-evidence'
node test/browser-parity/capture.cjs
```

The runner checks filtered selection, X amount cancel and confirm, preset save overwrite confirmation and load, the
status HUD, Tab reply, and mobile text/numeric keyboard paths. It saves PNGs and `results.json` to the evidence directory.
