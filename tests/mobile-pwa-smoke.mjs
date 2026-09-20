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
  username: 'test', qbittorrents: [account], tagPool: ['电影', '收藏'], trackerMappings: Array.from({ length: 7 }, (_, index) => ({ keyword: `tracker${index}`, name: `站点${index}` })),
  lanes: [{ id: 'lane1', qbId: 'qb1', name: '影视' }],
  cards: Array.from({ length: 4 }, (_, i) => ({ id: `card${i + 1}`, qbId: 'qb1', laneId: 'lane1', name: ['电影收藏', '剧集', '音乐收藏', '纪录片'][i], savePath: '/media/movies', tags: ['电影'], cover: { type: 'monet', value: '#d8e8e2' } }))
};
const tasks = Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
  const hash = String(index).padStart(40, '0');
  return [hash, { hash, name: `测试种子 ${index} · 超长电影名称与中文标签`, size: 1024 ** 3, progress: 0.5, state: 'downloading', dlspeed: 102400, upspeed: 51200, tags: '电影,收藏', save_path: '/media/movies', tracker: 'https://tracker.example.test/announce', amount_left: 1024 ** 3 / 2 }];
}));
const trackers = [{ name: 'tracker.example.test', bytes: 123456 }, { name: 'second.long-tracker.example.test', bytes: 65432 }];
const traffic = { summary: { uploaded: 188888, downloaded: 188888, seedingCount: 3, seedingSize: 1024 ** 3 }, uploadByTracker: trackers, downloadByTracker: trackers, hasHistory: true };
const schedules = [{ id: 'schedule1', qbId: 'qb1', name: '夜间自动下载与备用速度任务 · 超长名称', enabled: true, action: 'toggleAltSpeed', cron: '0 0 * * *', altSpeedOn: true, lastError: '用于验证长文本排版的提示信息' }];
async function mockAPI(context) {
  const localConfig = structuredClone(config);
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/cards/reorder') {
      const { ids } = route.request().postDataJSON();
      localConfig.cards = ids.map((id) => localConfig.cards.find((card) => card.id === id));
      await route.fulfill({ json: localConfig });
      return;
    }
    const json = path === '/api/config' ? localConfig
      : path.endsWith('/torrents') ? { tasks, full: true, rid: 1, transfer: { downSpeed: 102400, upSpeed: 51200 } }
      : path === '/api/traffic' ? traffic
      : path === '/api/schedules' ? { schedules }
      : path === '/api/logs' ? { logs: [{ id: 'log1', createdAt: new Date().toISOString(), source: 'manual', status: 'success', action: 'start', target: '测试种子', torrentNames: ['电影测试名称'] }] }
      : { ok: true };
    await route.fulfill({ json });
  });
}

const touchSessions = new WeakMap();
async function touchEvent(locator, type, point) {
  if (process.env.TEST_BROWSER !== 'webkit') {
    const page = locator.page();
    if (!touchSessions.has(page)) touchSessions.set(page, await page.context().newCDPSession(page));
    await touchSessions.get(page).send('Input.dispatchTouchEvent', {
      type: { touchstart: 'touchStart', touchmove: 'touchMove', touchend: 'touchEnd', touchcancel: 'touchCancel' }[type],
      touchPoints: type === 'touchend' || type === 'touchcancel' ? [] : [{ x: point.x, y: point.y }]
    });
    return;
  }
  if (type === 'touchstart') await locator.page().clock.pauseAt(await locator.page().evaluate(() => Date.now() + 1000));
  await locator.evaluate((element, { type, point }) => {
    // WebKit exposes Touch but does not allow constructing it on Windows.
    const touch = { identifier: 1, target: element, clientX: point.x, clientY: point.y };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [touch] },
      changedTouches: { value: [touch] }
    });
    element.dispatchEvent(event);
  }, { type, point });
  if (type === 'touchend' || type === 'touchcancel') await locator.page().clock.resume();
}

async function holdTouch(page, milliseconds) {
  if (process.env.TEST_BROWSER === 'webkit') await page.clock.runFor(milliseconds);
  else await page.waitForTimeout(milliseconds);
}

try {
  for (const width of (process.env.TEST_WIDTHS || '320,390,430,768,932,1440').split(',').map(Number)) {
    const mobile = width <= 1100;
    const context = await browser.newContext({ viewport: { width, height: width === 932 ? 430 : 844 }, hasTouch: mobile, serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('qbinder-sidebar-collapsed', 'true'));
    await mockAPI(context);
    const page = await context.newPage();
    if (process.env.TEST_BROWSER === 'webkit') await page.clock.install();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const [route, label] of [['cards', '卡片'], ['view', '视图'], ['tasks', '任务'], ['flow', '域流'], ['logs', '日志'], ['setting', '设置']]) {
      if (route === 'cards') await page.goto(base + '/#/cards');
      else if (mobile) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        const direct = page.locator('.mobile-dock nav').getByRole('button', { name: label, exact: true });
        if (await direct.count()) await direct.click();
        else {
          await page.locator('.mobile-dock').getByRole('button', { name: '更多', exact: true }).click();
          await page.locator('.dock-more-menu').getByRole('button', { name: label, exact: true }).click();
        }
      } else await page.locator('.desktop-sidebar nav').getByRole('button', { name: label, exact: true }).click();
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
      if (route === 'cards' || route === 'view') {
        const toolbar = page.locator(route === 'cards' ? '.top-tabs' : '.task-toolbar');
        assert.equal(await toolbar.evaluate(e => getComputedStyle(e).position), 'relative', 'Toolbar scrolls with page');
      }
      if (route === 'view' && mobile) {
        const accountBox = await page.locator('.task-toolbar .account-switcher').boundingBox();
        const filterBox = await page.getByRole('button', { name: '筛选任务', exact: true }).boundingBox();
        assert(accountBox.x < filterBox.x && Math.abs(accountBox.y - filterBox.y) < 3, 'Account and filter share row');
        assert.equal(await page.locator('.task-search').isVisible(), false);
        await page.locator('.mobile-search-fab').click();
        await page.getByRole('textbox', { name: '搜索种子', exact: true }).fill('测试种子 0');
        assert.equal(await page.locator('.mobile-torrent').count(), 1);
        await page.getByRole('textbox', { name: '搜索种子', exact: true }).fill('');
        await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
        await page.waitForTimeout(500);
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.waitForTimeout(500);
        assert(await page.locator('.mobile-dock').evaluate(e => e.classList.contains('dock-hidden')), 'Scroll down hides Dock');
        await page.evaluate(() => window.scrollTo(0, 200));
        await page.waitForTimeout(500);
        assert.equal(await page.locator('.mobile-dock').evaluate(e => e.classList.contains('dock-hidden')), false, 'Scroll up reveals Dock');
        await page.evaluate(() => window.scrollTo(0, 0));
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
        assert.equal(await page.locator('.schedule-card').count(), 1);
        const main = await page.locator('.schedule-card-main').boundingBox();
        const actions = await page.locator('.schedule-card-actions').boundingBox();
        assert(actions.y >= main.y + main.height, 'Schedule actions below content');
        await page.getByRole('button', { name: '新建任务', exact: true }).click();
        await page.locator('.schedule-editor').waitFor();
        assert(await page.locator('.schedule-editor').evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
        await page.screenshot({ path: `${output}/${width}-schedule.png` });
        await page.locator('.schedule-editor').getByRole('button', { name: '取消', exact: true }).click();
      }
      if (route === 'cards') {
        const input = page.getByRole('textbox', { name: '新增横栏名称', exact: true });
        assert(await input.isVisible(), 'Lane input visible on desktop and mobile');
        const inputBox = await input.boundingBox();
        const accountBox = await page.locator('.top-tabs .account-switcher').boundingBox();
        assert(Math.abs(inputBox.y - accountBox.y) < 3 && inputBox.x >= accountBox.x + accountBox.width, 'Lane input beside account');
        await page.getByRole('button', { name: '添加卡片', exact: true }).hover();
        assert.equal(await page.locator('.ui-tooltip').count(), 0, 'No button hover tooltip');
      }
      if (route === 'cards' && mobile) {
        assert.deepEqual(await page.locator('.mobile-dock nav button').allTextContents(), ['卡片', '视图', '域流', '更多']);
        await page.getByRole('button', { name: '更多', exact: true }).click();
        assert.deepEqual(await page.locator('.dock-more-menu button').allTextContents(), ['任务', '日志', '设置']);
        await page.screenshot({ path: `${output}/${width}-dock-more.png` });
        await page.locator('.mobile-app-header strong').click();
        await page.waitForTimeout(250);
        if (process.env.TEST_BROWSER === 'webkit') await page.clock.runFor(500);
        await page.locator('.dock-more-menu').waitFor({ state: 'detached' });
        assert.equal(await page.locator('.dock-more-menu').count(), 0);
        const cards = page.locator('.binder-card');
        const first = await cards.nth(0).boundingBox();
        const second = await cards.nth(1).boundingBox();
        assert(Math.abs(first.y - second.y) < 1 && second.x > first.x, 'Two cards per row');
        assert(Math.abs(first.height - first.width) < 2, 'Square desktop-style cover');
        assert.equal(await page.locator('.mobile-edit:visible').count(), 0);
        const chooser = page.waitForEvent('filechooser');
        await cards.first().tap();
        await (await chooser).setFiles([]);
        const touchBox = await cards.first().boundingBox();
        const point = { x: touchBox.x + touchBox.width / 2, y: Math.max(90, touchBox.y + 40) };
        await touchEvent(cards.first(), 'touchstart', point);
        await holdTouch(page, 900);
        await page.getByRole('heading', { name: '卡片设置', exact: true }).waitFor({ timeout: 5000 });
        await touchEvent(cards.first(), 'touchend', point);
        await page.getByRole('heading', { name: '卡片设置', exact: true }).waitFor();
        assert(await page.locator('.modal').evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
        await page.locator('.modal header button').click();
        await cards.first().scrollIntoViewIfNeeded();
        const dragBox = await cards.first().boundingBox();
        await touchEvent(cards.first(), 'touchstart', { x: dragBox.x + 40, y: Math.max(90, dragBox.y + 40) });
        await holdTouch(page, 500);
        const targetBox = await cards.nth(1).boundingBox();
        const target = { x: targetBox.x + targetBox.width / 2, y: Math.max(90, targetBox.y + 40) };
        await touchEvent(cards.first(), 'touchmove', target);
        const reordered = page.waitForResponse((r) => r.url().endsWith('/api/cards/reorder'));
        await touchEvent(cards.first(), 'touchend', target);
        await reordered;
        await page.waitForTimeout(100);
        assert.equal(await cards.first().getAttribute('data-card-id'), 'card2', 'Touch sorting persisted');
        await page.reload();
        await cards.first().waitFor();
        assert.equal(await cards.first().getAttribute('data-card-id'), 'card2', 'Order survives reload');
        await touchEvent(cards.first(), 'touchstart', point);
        await holdTouch(page, 500);
        await touchEvent(cards.first(), 'touchcancel', point);
        assert.equal(await page.locator('.binder-card.dragging').count(), 0, 'Canceled gesture clears drag');
        assert.equal(await page.getByRole('heading', { name: '卡片设置', exact: true }).count(), 0);
      }
      if (route === 'flow' && mobile) {
        const panel = await page.locator('.traffic-chart-content').first().boundingBox();
        const pie = await page.locator('.traffic-pie').first().boundingBox();
        assert(Math.abs((panel.x + panel.width / 2) - (pie.x + pie.width / 2)) < 2, 'Pie centered');
        const legend = page.locator('.traffic-chart-panel').first().locator('.traffic-legend-item');
        await legend.nth(0).tap();
        assert.equal(await page.locator('.traffic-pie-segment.active').count(), 1);
        await legend.nth(1).tap();
        assert.equal(await page.locator('.traffic-pie-segment.active').count(), 0, 'Different sector clears selection');
        assert.equal(await page.locator('.traffic-pie-tooltip').count(), 0, 'No hover tooltip on touch');
        const pieElement = page.locator('.traffic-pie').first();
        const pieSize = (await pieElement.boundingBox()).width;
        await pieElement.tap({ position: { x: pieSize * .75, y: pieSize * .5 } });
        assert.equal(await page.locator('.traffic-pie-segment.active').count(), 1, 'Sector tap selects');
        await pieElement.tap({ position: { x: pieSize * .75, y: pieSize * .5 } });
        assert.equal(await page.locator('.traffic-pie-segment.active').count(), 1, 'Same sector retains selection');
        await pieElement.tap({ position: { x: pieSize * .25, y: pieSize * .35 } });
        assert.equal(await page.locator('.traffic-pie-segment.active').count(), 0, 'Other sector clears selection');
        const refresh = await page.getByRole('button', { name: '刷新流量', exact: true }).boundingBox();
        const account = await page.locator('.traffic-account-switcher').boundingBox();
        const range = await page.locator('.traffic-range-select').boundingBox();
        assert(Math.abs(refresh.y - account.y) < 2 && Math.abs(range.y - account.y) < 2, 'Traffic controls aligned');
        await page.locator('.traffic-range-select').selectOption('7d');
        assert.equal(await page.locator('.traffic-range-select').inputValue(), '7d');
      }
      if (route === 'flow' && !mobile) {
        await page.locator('.traffic-legend-item').first().hover();
        assert(await page.locator('.traffic-pie-tooltip').isVisible(), 'Desktop traffic hover details preserved');
      }
      if (route === 'setting' && mobile) {
        const widths = await page.locator('.account-form-grid input').evaluateAll((els) => els.map((e) => e.clientWidth));
        assert(widths.every((w) => w > 200), `account inputs clipped: ${widths}`);
        const dockSettings = page.locator('.dock-settings');
        await dockSettings.scrollIntoViewIfNeeded();
        const list = page.locator('.dock-settings-list');
        assert.equal(await list.evaluate(e => e.clientHeight), 178, 'Exactly three rows and two gaps');
        assert(await list.evaluate(e => e.scrollHeight > e.clientHeight && getComputedStyle(e).scrollbarWidth === 'none'));
        await page.screenshot({ path: `${output}/${width}-dock-settings.png` });
        const backupBox = await page.locator('.backup-panel').boundingBox();
        const settingsBox = await dockSettings.boundingBox();
        assert(Math.abs(backupBox.x - settingsBox.x) < 2 && settingsBox.y >= backupBox.y + backupBox.height, 'Backup and Dock stacked');
        await page.getByRole('switch', { name: '在 Dock 显示视图', exact: true }).uncheck();
        await page.getByRole('switch', { name: '在 Dock 显示域流', exact: true }).uncheck();
        assert(await page.getByRole('switch', { name: '在 Dock 显示卡片', exact: true }).isDisabled(), 'At least one page');
        await page.getByRole('switch', { name: '在 Dock 显示任务', exact: true }).check();
        const handle = page.getByRole('button', { name: '拖拽排序任务', exact: true });
        await handle.scrollIntoViewIfNeeded();
        const start = await handle.boundingBox();
        const listBox = await list.boundingBox();
        const row = { x: listBox.x, y: listBox.y - 12 };
        if (process.env.TEST_BROWSER !== 'webkit') {
          await touchEvent(handle, 'touchstart', { x: start.x + start.width / 2, y: start.y + start.height / 2 });
          await touchEvent(handle, 'touchmove', { x: row.x + 35, y: row.y + 20 });
          await page.waitForTimeout(600);
          await touchEvent(handle, 'touchend', { x: row.x + 35, y: row.y + 20 });
        } else {
          await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
          await page.mouse.down();
          await page.mouse.move(row.x + 35, row.y + 20, { steps: 8 });
          await page.waitForTimeout(600);
          if (process.env.TEST_BROWSER === 'webkit') await page.clock.runFor(600);
          await page.mouse.up();
        }
        assert.deepEqual(await page.locator('.mobile-dock nav button').allTextContents(), ['任务', '卡片', '更多']);
        await page.reload();
        await page.locator('.dock-settings').waitFor();
        assert.deepEqual(await page.locator('.mobile-dock nav button').allTextContents(), ['任务', '卡片', '更多'], 'Dock preferences survive reload');
        for (const label of ['视图', '域流', '日志', '设置']) await page.getByRole('switch', { name: `在 Dock 显示${label}`, exact: true }).check();
        assert.equal(await page.locator('.mobile-dock nav button').count(), 6);
        assert.equal(await page.locator('.dock-more-button').count(), 0);
        await page.getByRole('button', { name: '拖拽排序任务', exact: true }).press('ArrowDown');
        assert.equal(await page.locator('.mobile-dock nav button').first().textContent(), '卡片');
        await page.getByRole('button', { name: '拖拽排序任务', exact: true }).press('ArrowUp');
        assert.equal(await page.locator('.mobile-dock nav button').first().textContent(), '任务');
        await page.evaluate(() => localStorage.setItem('qbinder-mobile-dock', JSON.stringify([{ id: 'invalid', enabled: true }, { id: 'cards', enabled: false }, { id: 'cards', enabled: true }])));
        await page.reload();
        await page.locator('.dock-settings').waitFor();
        assert.equal(await page.locator('.dock-setting-row').count(), 6, 'Stored entries normalized');
        assert(await page.locator('.mobile-dock nav button').count() >= 2);
        await page.evaluate(() => {
          const entries = [...document.querySelectorAll('[data-dock-id]')].map(row => ({ id: row.dataset.dockId, enabled: false }));
          localStorage.setItem('qbinder-mobile-dock', JSON.stringify(entries));
        });
        await page.reload();
        await page.locator('.dock-settings').waitFor();
        assert.equal(await page.locator('.dock-settings input:checked').count(), 1, 'All-disabled storage repairs to one visible page');
        await page.getByRole('button', { name: '更多', exact: true }).click();
        await page.getByRole('button', { name: '更多', exact: true }).press('Escape');
        await page.waitForTimeout(250);
        if (process.env.TEST_BROWSER === 'webkit') await page.clock.runFor(500);
        await page.locator('.dock-more-menu').waitFor({ state: 'detached' });
        assert.equal(await page.locator('.dock-more-menu').count(), 0, 'Escape closes More');
      }
      if (route === 'setting') {
        const visibleRows = await page.locator('.tracker-mapping-list').evaluate(list => {
          const bounds = list.getBoundingClientRect();
          return [...list.children].filter(row => row.getBoundingClientRect().bottom <= bounds.bottom + 1).length;
        });
        assert.equal(visibleRows, 5, 'Five Tracker mappings fit before scrolling');
        await page.locator('.tracker-mapping-panel').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/${width}-fields.png` });
        if (!mobile) {
          for (const collapsed of [true, false]) {
            await page.evaluate(value => localStorage.setItem('qbinder-sidebar-collapsed', String(value)), collapsed);
            if (!collapsed) await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
            const navIcon = await page.locator('.desktop-sidebar nav button svg').first().boundingBox();
            const logoutIcon = await page.locator('.desktop-sidebar .logout svg').boundingBox();
            assert(Math.abs(navIcon.x - logoutIcon.x) < 2, 'Sidebar logout icon aligned');
          }
        }
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
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: `${output}/${width}-login.png` });
    assert(await page.getByRole('textbox', { name: '用户名', exact: true }).isVisible());
    await page.getByRole('checkbox', { name: '保持登录', exact: true }).check();
    const remember = await page.locator('.login-remember').boundingBox();
    const submit = await page.locator('.login-submit').boundingBox();
    assert(submit.y >= remember.y + remember.height, 'Login button below remember preference');
    await page.getByRole('button', { name: '显示密码', exact: true }).click();
    assert.equal(await page.locator('input[autocomplete="current-password"]').getAttribute('type'), 'text');
    await page.getByRole('button', { name: '隐藏密码', exact: true }).click();
    assert(await page.locator('.login-panel').evaluate(e => e.scrollWidth <= e.clientWidth + 1));
  }
  await context.close();
  console.log('PASS PWA: manifest, icons, worker activation, offline fallback, reconnect, API not cached');
} finally {
  await browser.close();
  if (pwaServer) {
    pwaServer.closeAllConnections();
    await new Promise((done) => pwaServer.close(done));
  }
}
