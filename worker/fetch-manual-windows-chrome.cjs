const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const profile = process.argv[2] || path.join(process.env.USERPROFILE, 'Desktop', 'codex-meter-manual-chrome-profile');
  const url = process.argv[3] || 'https://chatgpt.com/';
  console.log('Using profile:', profile);
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
  });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    const text = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    const cookies = await context.cookies('https://chatgpt.com');
    console.log(JSON.stringify({
      url: page.url(),
      text: text.replace(/\s+/g, ' ').slice(0, 2000),
      cookieNames: cookies.map(c => c.name).sort(),
    }, null, 2));
  } finally {
    await context.close();
  }
})();
