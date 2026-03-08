const puppeteer = require('puppeteer');
(async () => {
    console.log("Starting browser...");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    console.log("Navigating to localhost:3001...");
    await page.goto('http://localhost:3001');
    console.log("Waiting...");
    await new Promise(r => setTimeout(r, 2000));
    console.log("Done waiting.");
    await browser.close();
})();
