import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve('dist');
const output = process.env.TEST_OUTPUT || '.gocache/safe-area';
await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = process.env.TEST_BROWSER === 'webkit' ? await playwright.webkit.launch() : await playwright.chromium.launch({ channel: 'msedge' });
  // Desktop engines do not expose an iPhone's physical notch; emulate its inset
  // through the same custom property resolved from env(safe-area-inset-top).
  for (const { width, height, inset } of [{ width: 320, height: 568, inset: 20 }, { width: 390, height: 844, inset: 59 }, { width: 932, height: 430, inset: 0 }, { width: 1440, height: 900, inset: 59 }]) {
    const mobile = width <= 1100;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, serviceWorkers: 'block' });
    await context.addInitScript(inset => {
      document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--safe-area-top', `${inset}px`));
    }, inset);
    const account = { id: 'qb', alias: '下载服务器', host: 'localhost', port: 8080 };
    const config = {
      username: 'test', qbittorrents: [account], tagPool: [], trackerMappings: [], lanes: [{ id: 'lane', qbId: 'qb', name: '影视' }],
      cards: Array.from({ length: 12 }, (_, i) => ({ id: `card${i}`, laneId: 'lane', qbId: 'qb', name: `收藏 ${i}`, savePath: '/downloads/new', tags: [], cover: { type: 'monet', value: '#d8e8e2' } }))
    };
    const tasks = Object.fromEntries(Array.from({ length: 30 }, (_, i) => {
      const hash = String(i).padStart(40, '0');
      return [hash, { hash, name: `种子 ${i}`, progress: .5, size: 100000, state: 'downloading', save_path: '/downloads/old' }];
    }));
    let signedIn = true;
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/config') { await route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? config : { error: '请登录' } }); return; }
      const json = path.endsWith('/torrents') ? { tasks, full: true, rid: 1, transfer: {} }
        : path === '/api/schedules' ? { schedules: [] }
        : path === '/api/logs' ? { logs: [] }
        : path === '/api/traffic' ? { summary: {}, hasHistory: true, uploadByTracker: [{ name: 'tracker.test', bytes: 1024 }], downloadByTracker: [] }
        : path.endsWith('/upload') ? { ok: true, added: 0, duplicate: 1, failed: 0, count: 1, results: [{ status: 'duplicate' }] }
        : { ok: true };
      await route.fulfill({ json });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['cards', 'view', 'tasks', 'flow', 'logs', 'setting']) {
      await page.goto(`${base}/#/${route}`);
      await page.locator('.content').waitFor();
      const guard = page.locator('body > .mobile-safe-area');
      assert.equal(await guard.getAttribute('aria-hidden'), 'true');
      if (!mobile) { assert.equal(await guard.isVisible(), false); continue; }
      assert.equal((await guard.boundingBox())?.height || 0, inset);
      const logo = await page.locator('.mobile-app-header img').boundingBox();
      assert(logo.y >= inset + 8, `${route}: header lies below safe area`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (inset) {
        assert(await guard.evaluate(e => (getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter).includes('blur')));
        assert(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, 5).classList.contains('mobile-safe-area')));
      }
      if (route === 'cards') {
        assert.equal(await page.locator('.top-tabs').evaluate(e => getComputedStyle(e).position), 'relative');
        if (inset) {
          const accountButton = page.locator('.top-tabs .account-switcher-trigger');
          const before = await accountButton.boundingBox();
          const x = before.x + before.width / 2;
          await page.evaluate(y => scrollTo(0, y), before.y + before.height / 2 - inset / 2);
          await page.waitForFunction(() => scrollY > 0);
          await page.touchscreen.tap(x, inset / 2);
          assert.equal(await page.locator('.account-switcher-menu').count(), 0, 'Covered account button cannot be tapped');
          await page.screenshot({ path: `${output}/${width}-scrolled.png` });
          await page.evaluate(() => scrollTo(0, 0));
          await accountButton.click();
          assert(await page.locator('.account-switcher-menu').isVisible(), 'Account button works below safe area');
          await accountButton.click();
        }
        await page.locator('.binder-card input[type=file]').first().setInputFiles({ name: 'test.torrent', mimeType: 'application/x-bittorrent', buffer: Buffer.from('fixture') });
        const modal = page.locator('.card-upload-modal');
        await modal.waitFor();
        assert((await modal.boundingBox()).y >= inset + 11);
        await modal.getByRole('button', { name: '确认添加', exact: true }).click();
        await page.locator('.upload-result-toast').waitFor();
        await page.waitForTimeout(300);
        assert((await page.locator('.upload-result-toast').boundingBox()).y >= inset + 15);
      }
      if (route === 'view') {
        await page.getByRole('button', { name: '筛选任务', exact: true }).click();
        const filter = page.locator('.task-filter-popover');
        await filter.waitFor();
        const filterBox = await filter.boundingBox();
        assert(filterBox.y >= inset + 11 && filterBox.y + filterBox.height <= height, 'Filter fits below safe area');
        await filter.getByRole('button', { name: '确认', exact: true }).click();
        await filter.waitFor({ state: 'detached' });
        await page.locator('.mobile-search-fab').click();
        const search = page.locator('.mobile-search-dialog');
        await search.waitFor();
        assert((await search.boundingBox()).y >= inset + 12);
        if (inset) assert(await page.evaluate(() => document.elementFromPoint(20, 5).classList.contains('mobile-safe-area')), 'Safe area stays above teleported search');
        await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
        await page.locator('.mobile-torrent').first().getByRole('button').click();
        const menu = page.locator('.task-menu');
        await menu.waitFor();
        assert((await menu.boundingBox()).y >= inset + 9);
        await menu.getByRole('button', { name: '更改保存路径', exact: true }).click();
        await page.locator('.task-path-modal').waitFor();
        const pathBox = await page.locator('.task-path-modal').boundingBox();
        assert(pathBox.y >= inset + 11 && pathBox.y + pathBox.height <= height - 11, 'Tall path modal fits within safe bounds');
        await page.screenshot({ path: `${output}/${width}-modal.png` });
        await page.locator('.task-path-modal').getByRole('button', { name: '关闭', exact: true }).click();
      }
      if (route === 'flow') {
        const legend = page.locator('.traffic-legend-item').first();
        await legend.click();
        const tooltip = page.locator('.traffic-pie-tooltip');
        await tooltip.waitFor();
        assert((await tooltip.boundingBox()).y >= inset + 9);
      }
    }
    if (mobile) {
      signedIn = false;
      await page.reload();
      await page.locator('.login-panel').waitFor();
      assert((await page.getByRole('textbox', { name: '用户名', exact: true }).boundingBox()).y >= inset + 12);
      assert.equal(await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content'), 'black-translucent');
      await page.screenshot({ path: `${output}/${width}-login.png` });
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}/${inset}px: six routes, safe-area hit blocking, controls, overlays and login`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
