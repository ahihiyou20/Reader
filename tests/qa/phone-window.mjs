// Opens the site in a visible browser window that behaves like a phone (size, touch, user agent),
// for trying it by hand. Stays open until the window is closed.
//   node tests/qa/phone-window.mjs [url] [device name, default "iPhone 13"]
import { chromium, devices } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173';
const device = devices[process.argv[3] ?? 'iPhone 13'];
const browser = await chromium.launch({ headless: false, args: ['--window-position=80,40'] });
const context = await browser.newContext({ ...device, locale: 'vi-VN' });
const page = await context.newPage();
await page.goto(url);
browser.on('disconnected', () => process.exit(0));
page.on('close', () => browser.close());
