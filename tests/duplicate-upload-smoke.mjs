import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const playwright = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve('dist');
const output = process.env.TEST_OUTPUT || '.gocache/duplicate-upload';
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = process.env.TEST_BROWSER === 'webkit'
    ? await playwright.webkit.launch({ headless: true })
    : await playwright.chromium.launch({ channel: 'msedge', headless: true });
  for (const width of (process.env.TEST_WIDTHS || '320,390,1440').split(',').map(Number)) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 900, serviceWorkers: 'block' });
    const config = {
      username: 'test', qbittorrents: [{ id: 'qb1', alias: '下载服务器', host: 'localhost', port: 8080 }],
      lanes: [{ id: 'lane1', qbId: 'qb1', name: '电影' }], tagPool: [], trackerMappings: [],
      cards: [{ id: 'card1', laneId: 'lane1', qbId: 'qb1', name: '电影收藏', savePath: '/downloads/new/电影收藏', tags: [], cover: { type: 'monet', value: '#d8e8e2' } }]
    };
    const hash = 'a'.repeat(40);
    const existing = { filename: 'movie.torrent', status: 'duplicate', hash, name: '电影名称 · 重复种子测试', savePath: '/downloads/old/原始目录/电影', needsMove: true };
    let reply, uploadError = false, moveError = false;
    const moves = [];
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/cards/card1/upload') {
        await route.fulfill({ status: uploadError ? 502 : 200, json: uploadError ? { error: 'qBittorrent 添加种子失败：409 Conflict' } : reply });
        return;
      }
      if (path === '/api/qb/qb1/torrents/action') {
        moves.push(route.request().postDataJSON());
        await route.fulfill({ status: moveError ? 502 : 200, json: moveError ? { error: '新目录不可写' } : { ok: true } });
        return;
      }
      await route.fulfill({ json: path === '/api/config' ? config : { ok: true } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/#/cards`);
    const upload = async result => {
      reply = result;
      await page.locator('.binder-card input[type=file]').setInputFiles({ name: 'movie.torrent', mimeType: 'application/x-bittorrent', buffer: Buffer.from('fixture') });
      await page.getByRole('button', { name: '确认添加', exact: true }).click();
    };
    const result = (added, duplicate, failed, results) => ({ ok: !failed, added, duplicate, failed, count: added + duplicate, savePath: config.cards[0].savePath, results });
    const dialog = page.getByRole('dialog', { name: '更换已有种子的保存目录' });
    await upload(result(1, 0, 0, [{ filename: 'movie.torrent', status: 'added' }]));
    await page.getByText('成功添加 1 个种子', { exact: true }).waitFor();
    assert.equal(await dialog.count(), 0);
    await upload(result(0, 1, 0, [{ ...existing, savePath: config.cards[0].savePath, needsMove: false }]));
    await page.getByText('1 个种子已添加，无需重复添加', { exact: true }).waitFor();
    assert.equal(await dialog.count(), 0);
    assert.equal(moves.length, 0);
    await upload(result(0, 2, 0, [existing, { ...existing, filename: 'renamed.torrent' }]));
    await dialog.waitFor();
    assert.equal(await dialog.locator('.duplicate-upload-item').count(), 1, 'Repeated files produce one move candidate');
    assert((await dialog.innerText()).includes(existing.savePath));
    assert((await dialog.innerText()).includes(config.cards[0].savePath));
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden', 'Background scrolling is locked');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${output}/${width}-confirm.png` });
    await dialog.getByRole('button', { name: '保留原目录', exact: true }).click();
    assert.equal(moves.length, 0, 'Cancel never moves existing files');
    await upload(result(0, 1, 0, [existing]));
    await dialog.waitFor();
    moveError = true;
    await dialog.getByRole('button', { name: '确认更换目录', exact: true }).click();
    await dialog.getByText('新目录不可写', { exact: true }).waitFor();
    assert.equal(await dialog.isVisible(), true, 'Move failure keeps confirmation available');
    moveError = false;
    await dialog.getByRole('button', { name: '确认更换目录', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(moves, [1, 2].map(() => ({ action: 'setLocation', hashes: [hash], savePath: config.cards[0].savePath })));
    await upload(result(1, 1, 1, [existing, { filename: 'new.torrent', status: 'added' }, { filename: 'bad.torrent', status: 'failed', error: 'qBittorrent 拒绝添加' }]));
    await dialog.getByText('bad.torrent：qBittorrent 拒绝添加', { exact: true }).waitFor();
    assert((await page.locator('.upload-result-toast').innerText()).includes('1 个种子添加失败'));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    uploadError = true;
    await upload(null);
    await page.locator('.card-upload-modal .form-error').getByText('qBittorrent 添加种子失败：409 Conflict', { exact: true }).waitFor();
    assert.equal(await dialog.count(), 0, 'Unverified conflicts stay errors');
    assert.equal(moves.length, 2);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}: new/duplicate/mixed uploads, confirmed-only move, cancel and failed-move retry`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
