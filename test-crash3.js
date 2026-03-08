const puppeteer = require('puppeteer');

(async () => {
    try {
        console.log("Starting browser...");
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));

        console.log("Navigating to http://localhost:3001...");
        await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' });

        console.log("Waiting 3s for React to hydrate and potentially crash...");
        await new Promise(r => setTimeout(r, 3000));

        console.log("Done. Closing browser.");
        await browser.close();
    } catch (err) {
        console.error("Puppeteer Script Error:", err);
    }
})();
