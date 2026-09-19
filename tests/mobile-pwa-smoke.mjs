import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const playwright = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const output = process.env.TEST_OUTPUT || '.gocache/mobile-qa';
await mkdir(output, { recursive: true });
const browser = process.env.TEST_BROWSER === 'webkit'
  ? await playwright.webkit.launch({ headless: true })
  : await playwright.chromium.launch({ channel: process.env.TEST_BROWSER || 'msedge', headless: true });
let pwaServer;
const account = { id: 'qb1', alias: '家庭下载服务器', type: 'qbittorrent', protocol: 'http', host: 'localhost', port: 8080 };
const config = {
  username: 'test', qbittorrents: [account], tagPool: ['电影', '收藏'], trackerMappings: [],
  lanes: [{ id: 'lane1', qbId: 'qb1', name: '影视' }],
  cards: [{ id: 'card1', qbId: 'qb1', laneId: 'lane1', name: '电影收藏', savePath: '/media/movies', tags: ['电影'], cover: { type: 'monet', value: '#d8e8e2' } }]
};
const tasks = Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
  const hash = String(index).padStart(40, '0');
  return [hash, { hash, name: `测试种子 ${index} · 超长电影名称与中文标签`, size: 1024 ** 3, progress: 0.5, state: 'downloading', dlspeed: 102400, upspeed: 51200, tags: '电影,收藏', save_path: '/media/movies', tracker: 'https://tracker.example.test/announce', amount_left: 1024 ** 3 / 2 }];
}));
const traffic = { summary: { uploaded: 123456, downloaded: 123456, seedingCount: 3, seedingSize: 1024 ** 3 }, uploadByTracker: [{ name: 'tracker.example.test', bytes: 123456 }], downloadByTracker: [{ name: 'tracker.example.test', bytes: 123456 }], hasHistory: true };
async function mockAPI(context) {
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/api/config' ? config
      : path.endsWith('/torrents') ? { tasks, full: true, rid: 1, transfer: { downSpeed: 102400, upSpeed: 51200 } }
      : path === '/api/traffic' ? traffic
      : path === '/api/schedules' ? { schedules: [] }
      : path === '/api/logs' ? { logs: [{ id: 'log1', createdAt: new Date().toISOString(), source: 'manual', status: 'success', action: 'start', target: '测试种子', torrentNames: ['电影测试名称'] }] }
      : { ok: true };
    await route.fulfill({ json });
  });
}
try {
  for (const width of (process.env.TEST_WIDTHS || '320,390,430,768,932,1440').split(',').map(Number)) {
    const mobile = width <= 1100;
    const context = await browser.newContext({ viewport: { width, height: width === 932 ? 430 : 844 }, hasTouch: mobile, serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('qbinder-sidebar-collapsed', 'true'));
    await mockAPI(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [route, label] of [['cards', '卡片'], ['view', '视图'], ['tasks', '任务'], ['flow', '域流'], ['logs', '日志'], ['setting', '设置']]) {
      if (route === 'cards') await page.goto(base + '/#/cards');
      else await page.locator('.sidebar nav').getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(200);
      // Keep the emulated viewport fixed while checking landscape touch layouts.
      await page.screenshot({ path: `${output}/${width}-${route}.png` });
      const overflow = await page.evaluate(() => ({
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        nodes: [...document.querySelectorAll('body *')].filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed';
        }).slice(0, 8).map((e) => e.className)
      }));
      assert(overflow.scroll <= width + 1, `${width}/${route} overflow: ${JSON.stringify(overflow)}`);
      if (route === 'view' && mobile) {
        assert.equal(await page.locator('.mobile-torrent').count(), 8);
        await page.locator('.mobile-torrent').first().getByRole('button').click();
        await page.locator('.task-menu').getByRole('button', { name: '更改保存路径', exact: true }).click();
        await page.locator('.task-path-modal').waitFor();
        assert(await page.locator('.task-path-preset').first().isVisible());
        await page.screenshot({ path: `${output}/${width}-path.png` });
        await page.locator('.task-path-modal').getByRole('button', { name: '关闭', exact: true }).click();
        assert(await page.locator('.task-summary .transfer-value').first().isVisible());
      }
      if (route === 'tasks' && mobile) {
        await page.getByRole('button', { name: '新建任务', exact: true }).click();
        await page.locator('.schedule-editor').waitFor();
        assert(await page.locator('.schedule-editor').evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
        await page.screenshot({ path: `${output}/${width}-schedule.png` });
        await page.locator('.schedule-editor').getByRole('button', { name: '取消', exact: true }).click();
      }
      if (route === 'cards' && mobile) {
        await page.getByRole('button', { name: '编辑卡片 电影收藏', exact: true }).click();
        await page.getByRole('heading', { name: '卡片设置', exact: true }).waitFor();
        assert(await page.locator('.modal').evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
        await page.locator('.modal header button').click();
      }
      if (route === 'setting' && mobile) {
        const widths = await page.locator('.account-form-grid input').evaluateAll((els) => els.map((e) => e.clientWidth));
        assert(widths.every((w) => w > 200), `account inputs clipped: ${widths}`);
      }
    }
    assert.deepEqual(errors, [], `JS errors at ${width}`);
    await context.close();
    console.log(`PASS ${width}: six pages, no horizontal overflow${mobile ? ', touch actions and dialogs' : ', desktop layout'}`);
  }
  // Simulate an origin connection failure instead of WebKit's offline emulation:
  // the latter can fail before dispatching a service-worker fetch on Windows.
  let originUnavailable = false;
  const root = resolve('dist');
  pwaServer = createServer(async (request, response) => {
    if (originUnavailable) { request.socket.destroy(); return; }
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end('{"error":"Unauthorized"}');
      return;
    }
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    try {
      const data = await readFile(file);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((done) => pwaServer.listen(0, '127.0.0.1', done));
  const pwaBase = `http://127.0.0.1:${pwaServer.address().port}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(pwaBase);
  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Worker activation timed out')), 20000))
  ]));
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const manifest = await (await page.request.get(pwaBase + '/manifest.webmanifest')).json();
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert((await page.request.get(pwaBase + icon.src)).ok());
  await page.evaluate(() => fetch('/api/config').catch(() => {}));
  const cached = await page.evaluate(async () => {
    const cache = await caches.open('qbinder-offline-v1');
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  assert.deepEqual(cached, ['/offline.html']);
  originUnavailable = true;
  assert(await page.evaluate(() => fetch('/api/config').then(() => false, () => true)), 'Offline API must not return cached data or HTML');
  await page.reload();
  assert(await page.getByText('暂时无法连接服务器。请检查网络连接后重试。').isVisible());
  originUnavailable = false;
  await page.getByRole('link', { name: '重新连接' }).click();
  await page.locator('.login-panel').waitFor();
  await context.close();
  console.log('PASS PWA: manifest, icons, worker activation, offline fallback, reconnect, API not cached');
} finally {
  await browser.close();
  if (pwaServer) {
    pwaServer.closeAllConnections();
    await new Promise((done) => pwaServer.close(done));
  }
}
