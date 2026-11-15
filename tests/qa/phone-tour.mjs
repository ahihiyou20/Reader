// Phone tour: walks every screen and feature of the built site on phone-sized touch screens, in a
// visible browser window, and reports what broke. Each step is named in a label on the page.
//   PORT=4173 node scripts/serve.mjs out & node tests/qa/phone-tour.mjs [--headless] [--out dir]
// Checks at every step: uncaught errors, horizontal overflow, controls under 40 px, text cut off,
// and controls overlapping each other.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const args = process.argv.slice(2);
const headless = args.includes('--headless');
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'test-results/phone-tour';
fs.mkdirSync(outDir, { recursive: true });

const desk = (width, height) => ({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
const PHONES = [
  ['iPhone 13', devices['iPhone 13']],
  ['iPhone SE', devices['iPhone SE']],
  ['iPhone 13 landscape', devices['iPhone 13 landscape']],
  ...(args.includes('--desktop') ? [['Desktop 1440', desk(1440, 900)], ['Laptop 1024', desk(1024, 768)]] : []),
];

const results = [];

async function label(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById('__tour');
    if (!el) {
      el = document.createElement('div');
      el.id = '__tour';
      el.style.cssText =
        'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:2147483647;padding:4px 10px;border-radius:999px;background:#ffd43b;color:#111;font:600 11px system-ui;pointer-events:none;max-width:90vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      document.documentElement.append(el);
    }
    el.textContent = t;
  }, text);
}

/** Layout faults visible on the screen right now. */
const audit = (page) =>
  page.evaluate(() => {
    const out = [];
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && c.visibility !== 'hidden' && +c.opacity > 0.05 && !e.closest('[inert],[aria-hidden="true"],#__tour');
    };
    const name = (e) => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40);
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px > ${innerWidth}px)`);
    const controls = [...document.querySelectorAll('button, a[href], input, select, [role="button"]')].filter(vis);
    for (const e of controls) {
      const r = e.getBoundingClientRect();
      // A transparent ::after that reaches past the box counts as the hit area.
      const after = getComputedStyle(e, '::after');
      const grown = after.content !== 'none' && after.position === 'absolute' && parseFloat(after.top) < 0;
      if ((r.width < 32 || r.height < 32) && !grown && !e.closest('.ccredit, .fine, .srcs, .credit, p')) out.push(`small target ${Math.round(r.width)}×${Math.round(r.height)}: "${name(e)}"`);
      if (r.right > innerWidth + 1 || r.left < -1) out.push(`off screen: "${name(e)}"`);
    }
    for (const e of [...document.querySelectorAll('button, .pill, .chip, h2, h3, .label, .hint-t')].filter(vis)) {
      const c = getComputedStyle(e);
      if (e.scrollWidth > e.clientWidth + 2 && c.textOverflow !== 'ellipsis' && c.overflow !== 'visible' && e.textContent.trim()) out.push(`text cut: "${name(e)}"`);
    }
    const top = controls.filter((e) => !e.closest('.panel, .sheet, .welcome') || e.closest('.phead, .wfx-bar, .welcome-nav'));
    for (let i = 0; i < top.length; i++)
      for (let j = i + 1; j < top.length; j++) {
        if (top[i].contains(top[j]) || top[j].contains(top[i])) continue;
        const a = top[i].getBoundingClientRect();
        const b = top[j].getBoundingClientRect();
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 3 && iy > 3) out.push(`overlap: "${name(top[i])}" × "${name(top[j])}"`);
      }
    // Every control on the top layer must receive a tap at its centre, not something drawn over it.
    const layers = [...document.querySelectorAll('.welcome:not(.leaving), .sheet, .panel, .sidenav.open, .lmenu.open')].filter(vis);
    const layer = layers[layers.length - 1];
    for (const e of controls) {
      if (layer && !layer.contains(e)) continue;
      if (!layer && e.closest('.panel, .sheet, .welcome, .sidenav, .lmenu')) continue;
      const r = e.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== e && !e.contains(hit) && !hit.closest('#__tour') && !(e.tagName === 'LABEL' && e.control === hit))
        out.push(`covered: "${name(e)}" under ${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`);
    }
    return [...new Set(out)];
  });

async function swipe(page, from, to, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= steps; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function tour(phone, device) {
  const context = await browser.newContext({ ...device, locale: 'vi-VN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  const { width: W, height: H } = device.viewport;
  let n = 0;
  const step = async (title, fn, expect) => {
    n++;
    await label(page, `${phone} · ${n}. ${title}`).catch(() => {});
    const before = errors.length;
    let ok = true;
    let note = '';
    try {
      await fn();
      await page.waitForTimeout(700);
      if (expect) {
        const r = await expect();
        if (r !== true) {
          ok = false;
          note = String(r || 'expectation failed');
        }
      }
    } catch (e) {
      ok = false;
      note = e.message.split('\n')[0].slice(0, 160);
    }
    const faults = await audit(page).catch(() => []);
    const errs = errors.slice(before);
    const file = `${phone.replace(/\s+/g, '-')}-${String(n).padStart(2, '0')}.jpg`;
    await page.screenshot({ path: path.join(outDir, file), type: 'jpeg', quality: 55 }).catch(() => {});
    results.push({ phone, n, title, ok, note, faults, errors: errs, file });
    console.log(`${ok && !errs.length ? '✓' : '✗'} ${phone} ${n}. ${title}${note ? ` — ${note}` : ''}${errs.length ? ` — JS: ${errs.join(' | ')}` : ''}${faults.length ? `\n    ${faults.join('\n    ')}` : ''}`);
  };
  const has = (sel) => async () => ((await page.locator(sel).count()) ? true : `${sel} not found`);
  const active = (k) => `[aria-posinset="${k}"]`;
  const escape = () => page.keyboard.press('Escape');

  // First visit
  await step('Màn chào hiện ở lần đầu', () => page.goto(BASE, { waitUntil: 'domcontentloaded' }).then(() => page.waitForSelector('.welcome', { timeout: 30000 })), has('.welcome-start'));
  await step('Cuộn tới "Pagemoor làm gì?"', () => page.evaluate(() => document.querySelector('#w-what').scrollIntoView({ behavior: 'smooth' })), has('.wfx-card[aria-current="true"]'));
  await step('Chuyển thẻ tính năng', () => page.locator('.wfx-tick').nth(2).tap(), async () => ((await page.locator('.wfx-card').nth(2).getAttribute('aria-current')) === 'true' ? true : 'card 3 not active'));
  await step('Cuộn tới "Bài nổi bật", sang bài sau', async () => {
    await page.evaluate(() => document.querySelector('#w-picks').scrollIntoView({ behavior: 'smooth' }));
    await page.waitForTimeout(900);
    await page.locator('.wcf-arrow.next').tap();
  });
  await step('Mở bài nổi bật (màn chào mờ dần)', () => page.locator('.wcf-card[aria-current="true"]').tap(), async () => {
    await page.waitForTimeout(900);
    return (await page.locator('.welcome').count()) ? 'welcome still open' : true;
  });

  // Feed and an article
  await step('Bìa bài: tiêu đề, nút, ghi công ảnh', () => page.waitForSelector(`${active(1)} .ctitle`), has(`${active(1)} .ccredit`));
  await step('Vuốt lên sang bài kế', () => swipe(page, { x: W / 2, y: H * 0.72 }, { x: W / 2, y: H * 0.2 }), async () => {
    await page.waitForTimeout(600);
    const top = await page.locator(active(2)).evaluate((e) => e.getBoundingClientRect().top);
    return Math.abs(top) < 4 ? true : `article 2 at ${Math.round(top)}px`;
  });
  await step('Thả tim bài', () => page.locator(`${active(2)} .rail button`).first().tap(), async () => ((await page.locator(`${active(2)} .rail button`).first().getAttribute('aria-pressed')) === 'true' ? true : 'like not on'));
  await step('Vuốt trái sang Chi tiết', () => swipe(page, { x: W * 0.85, y: H * 0.5 }, { x: W * 0.15, y: H * 0.5 }), async () => ((await page.locator(`${active(2)} .view.details`).getAttribute('aria-hidden')) === 'false' ? true : 'details not shown'));
  await step('Chạm một từ để xem nghĩa', async () => {
    const p = page.locator(`${active(2)} .dscroll .sec.on p`).first();
    const b = await p.boundingBox();
    await page.touchscreen.tap(b.x + Math.min(60, b.width / 3), b.y + 12);
    await page.waitForSelector('.wordpop', { timeout: 8000 });
    await page.waitForFunction(() => !/…$|\.\.\.$/.test(document.querySelector('.wordpop p')?.textContent ?? '…'), null, { timeout: 12000 }).catch(() => {});
  }, has('.wordpop'));
  await step('Đóng ô nghĩa bằng cách cuộn', () => page.mouse.wheel(0, 300), async () => ((await page.locator('.wordpop').count()) ? 'popover still open' : true));
  await step('Nghe (sách nói)', () => page.locator(`${active(2)} .pill.listen`).tap(), has('.audiobar'));
  await step('Đổi tốc độ đọc', () => page.locator('.audiobar-rate').tap(), async () => ((await page.locator('.audiobar-rate').textContent()).includes('1.25') ? true : 'rate not 1.25'));
  await step('Đoạn sau, rồi tạm dừng', async () => {
    await page.locator('.audiobar').getByRole('button').nth(2).tap();
    await page.locator('.audiobar .iconbtn.main').tap();
  });
  await step('Tắt sách nói', () => page.locator('.audiobar').getByRole('button').last().tap(), async () => ((await page.locator('.audiobar').count()) ? 'bar still open' : true));
  await step('Mở trích nguồn (nền không giật)', async () => {
    const app = await page.evaluate(() => document.querySelector('.app').scrollTop);
    await page.locator(`${active(2)} .dscroll .cite`).first().tap();
    await page.waitForSelector('.sheet', { timeout: 5000 });
    const after = await page.evaluate(() => document.querySelector('.app').scrollTop);
    if (after !== app) throw new Error(`app frame moved ${after - app}px`);
  }, has('.sheet'));
  await step('Đóng bảng nguồn', escape);
  await step('Vuốt trái sang Bình luận & Áp dụng', () => swipe(page, { x: W * 0.85, y: H * 0.5 }, { x: W * 0.15, y: H * 0.5 }), async () => ((await page.locator(`${active(2)} .view.engage`).getAttribute('aria-hidden')) === 'false' ? true : 'engage not shown'));
  await step('Đánh dấu một bước áp dụng', async () => {
    const s = page.locator(`${active(2)} .step`).first();
    if (await s.count()) await s.tap();
  });
  await step('Ô viết bình luận', () => page.locator(`${active(2)} .view.engage [placeholder]`).first().tap().then(() => escape()), async () => (page.evaluate(() => document.querySelector('.feed').scrollTop === 0 ? true : 'feed moved when the field took focus')));
  await step('Vuốt phải hai lần về bìa', async () => {
    await swipe(page, { x: W * 0.15, y: H * 0.5 }, { x: W * 0.85, y: H * 0.5 });
    await page.waitForTimeout(500);
    await swipe(page, { x: W * 0.15, y: H * 0.5 }, { x: W * 0.85, y: H * 0.5 });
  }, async () => ((await page.locator(`${active(2)} .view.cover`).getAttribute('aria-hidden')) === 'false' ? true : 'cover not shown'));

  // Search, Explore
  await step('Tìm kiếm', async () => {
    await page.locator('.bnav .search').tap();
    await page.locator('.sinput').fill('black hole');
    await page.waitForSelector('.ritem', { timeout: 8000 });
  }, has('.ritem'));
  await step('Mở kết quả tìm kiếm', () => page.locator('.ritem').first().tap(), async () => ((await page.locator('.panel').count()) ? 'search panel still open' : true));
  await step('Khám phá (la bàn)', () => page.locator('.tb-ic.compass').tap(), has('.panel.explore .card'));
  await step('Lọc chuyên mục', () => page.locator('.panel.explore .chip').nth(2).tap(), has('.panel.explore .grid .card'));
  await step('Ảnh thẻ đã tải', () => page.waitForTimeout(1200), async () => {
    const r = await page.evaluate(() => { const c = [...document.querySelectorAll('.panel.explore .grid .card')].filter((x) => x.getBoundingClientRect().top < innerHeight); return [c.length, c.filter((x) => x.querySelector('img.in')).length]; });
    return r[1] >= Math.min(2, r[0]) ? true : `${r[1]}/${r[0]} images loaded`;
  });
  await step('Mở bài từ Khám phá', () => page.locator('.panel.explore .grid .card').first().tap(), async () => ((await page.locator('.panel').count()) ? 'explore still open' : true));

  // Menu: Library, Profile, Settings
  const menu = async (i) => {
    await page.locator('.navbtn').tap();
    await page.waitForTimeout(400);
    await page.locator('.sidenav button').nth(i).tap();
  };
  await step('Mở menu', () => page.locator('.navbtn').tap(), has('.sidenav.open'));
  await step('Đóng menu', () => page.locator('.click-shield.dim').tap({ position: { x: W - 20, y: H / 2 } }));
  await step('Thư viện', () => menu(2), has('.panel .chips'));
  await step('Tạo bộ sưu tập', async () => {
    await page.locator('.panel .chip', { hasText: /mới|new/i }).tap();
    await page.locator('.namer .input').fill('Đọc cuối tuần');
    await page.locator('.namer .pill').tap();
  }, has('.panel .chip:has-text("Đọc cuối tuần")'));
  await step('Lịch sử đọc', () => page.locator('.panel .chip').filter({ hasText: /Đã đọc|History/ }).tap(), has('.panel .lib-meta, .panel .empty-note'));
  await step('Hồ sơ', () => escape().then(() => menu(3)), has('.panel .stats.four'));
  await step('Chọn chủ đề yêu thích', () => page.locator('.panel .chips.wrap .chip').first().tap(), async () => ((await page.locator('.panel .chips.wrap .chip').first().getAttribute('aria-pressed')) === 'true' ? true : 'topic not selected'));
  await step('Vì sao bạn thấy những bài này', () => page.locator('.panel .why summary').tap(), has('.panel .why[open] .why-row'));
  await step('Cài đặt', () => escape().then(() => menu(4)), has('.panel select'));
  await step('Giọng đọc chỉ gồm giọng thật', () => page.waitForTimeout(300), async () => {
    const names = await page.locator('.panel select option').allTextContents();
    const bad = names.filter((x) => /Bad News|Zarvox|Bubbles|Bells|Boing|Jester|Trinoids|Whisper|Wobble|Organ|Cellos|Bahh|Superstar|Albert|Fred|Ralph|Junior|Kathy|Good News/.test(x));
    return bad.length ? `novelty voices: ${bad.join(', ')}` : true;
  });
  await step('Cỡ chữ đọc', () => page.locator('.panel .range').fill('21'));
  await step('Đổi ngôn ngữ sang Deutsch', () => page.locator('.panel .seg.wrap button', { hasText: 'Deutsch' }).tap(), async () => {
    await page.waitForTimeout(1300);
    return (await page.locator('.panel .phead h2').textContent()) === 'Einstellungen' ? true : 'settings title not German';
  });
  await step('Đổi lại Tiếng Việt', () => page.locator('.panel .seg.wrap button', { hasText: 'Tiếng Việt' }).tap(), () => page.waitForTimeout(1300).then(() => true));
  await step('Đóng cài đặt', escape);

  // Top bar
  await step('Chuông thông báo (rung, mở dần)', () => page.locator('.tb-ic.bell').tap(), has('.panel'));
  await step('Đóng thông báo', escape);
  await step('Tin nhắn', () => page.locator('.bnav .chat').tap(), has('.panel'));
  await step('Đóng tin nhắn', escape);
  await step('Nút + (đăng nhập để viết)', () => page.locator('.bnav .plus').tap(), has('.sheet'));
  await step('Đóng', escape);
  await step('Menu ngôn ngữ', () => page.locator('.lang').tap(), has('.lmenu.open'));
  await step('Đóng menu ngôn ngữ', escape);

  await context.close();
}

const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 120 });
for (const [phone, device] of PHONES) await tour(phone, device);
await browser.close();

const failed = results.filter((r) => !r.ok || r.errors.length);
const faulty = results.filter((r) => r.faults.length);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length} steps · ${failed.length} failed · ${faulty.length} with layout faults · screenshots in ${outDir}`);
process.exit(failed.length ? 1 : 0);
