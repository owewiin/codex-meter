const { chromium } = require('playwright');
const readline = require('readline');
const path = require('path');

(async () => {
  const profile = process.argv[2] || path.join(process.env.USERPROFILE, 'Desktop', 'codex-meter-playwright-profile-win');
  console.log('Using Windows Playwright profile:', profile);
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
    args: ['--new-window'],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://chatgpt.com/auth/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.bringToFront();
  console.log('Opened:', page.url());
  console.log('You should see Log in or sign up / Continue with Google / Continue with Apple / Email address.');
  console.log('Finish login in that Chrome window, then return here and press Enter.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press Enter after login is complete... ', resolve));
  rl.close();
  await page.waitForTimeout(1000);
  console.log('Current URL:', page.url());
  const text = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
  console.log('Page text preview:', text.replace(/\s+/g, ' ').slice(0, 500));
  await context.storageState({ path: path.join(profile, 'storage-state.json') });
  console.log('Saved storage-state.json under profile.');
  await context.close();
})();
