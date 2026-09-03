// 将 frontend/public/logo.svg 渲染为 Windows / Electron 可用的 PNG、ICO。
// 依赖系统 Chrome/Edge（与爬虫共用），以便正确绘制中文字体。

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const ROOT = path.join(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'frontend', 'public', 'logo.svg');
const OUT_DIR = path.join(ROOT, 'build');
const PNG_PATH = path.join(OUT_DIR, 'icon.png');
const ICO_PATH = path.join(OUT_DIR, 'icon.ico');
const SIZE = 512;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH || null,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].filter(Boolean);

function detectBrowser() {
  return CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || null;
}

async function renderPng(exe) {
  const puppeteer = require('puppeteer-core');
  let svg = fs.readFileSync(SVG_PATH, 'utf8');
  svg = svg
    .replace(/\swidth="100"/, ` width="${SIZE}"`)
    .replace(/\sheight="100"/, ` height="${SIZE}"`);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;background:#050505;width:${SIZE}px;height:${SIZE}px;overflow:hidden">
  <div style="width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center;background:#050505">
    ${svg}
  </div>
</body></html>`;

  const tmpHtml = path.join(os.tmpdir(), `studymaterials-icon-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: exe,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
    await page.goto(`file://${tmpHtml.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await new Promise((r) => setTimeout(r, 200));
    return Buffer.from(await page.screenshot({ type: 'png', omitBackground: false }));
  } finally {
    await browser.close();
    try { fs.unlinkSync(tmpHtml); } catch (_) { /* ignore */ }
  }
}

async function main() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`找不到图标源文件: ${SVG_PATH}`);
  }
  const exe = detectBrowser();
  if (!exe) {
    throw new Error('未找到 Chrome/Edge，无法渲染含中文的 SVG 图标');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('渲染图标…', SVG_PATH);
  const png512 = await renderPng(exe);
  fs.writeFileSync(PNG_PATH, png512);

  // 多尺寸 ICO，任务栏 / 桌面快捷方式 / 资源管理器都能正确显示
  const pngBuffers = await Promise.all(
    ICO_SIZES.map((size) => sharp(png512).resize(size, size).png().toBuffer()),
  );
  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(ICO_PATH, ico);
  console.log('已生成:', PNG_PATH);
  console.log('已生成:', ICO_PATH, `(${ICO_SIZES.join('/')})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
