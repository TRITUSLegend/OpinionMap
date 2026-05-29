const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'frontend/dist')));

const server = app.listen(3000, async () => {
    console.log('Server running on 3000');
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
        
        await page.goto('http://localhost:3000');
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
        server.close();
    } catch (e) {
        console.error('Puppeteer failed', e);
        server.close();
    }
});
