// 从 build/logo.ico 生成 rcedit 兼容的标准 ICO + 窗口用 PNG

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const ROOT = path.join(__dirname, '..');
const LOGO_ICO = path.join(ROOT, 'build', 'logo.ico');
const APP_ICO = path.join(ROOT, 'build', 'app-icon.ico');
const ICON_PNG = path.join(ROOT, 'build', 'icon.png');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function extractPngsFromIco(icoBuf) {
  const count = icoBuf.readUInt16LE(4);
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const size = icoBuf.readUInt32LE(o + 8);
    const offset = icoBuf.readUInt32LE(o + 12);
    const slice = icoBuf.subarray(offset, offset + size);
    if (slice.length >= 8 && slice.subarray(0, 8).equals(pngSig)) {
      frames.push(Buffer.from(slice));
    }
  }
  return frames;
}

async function main() {
  if (!fs.existsSync(LOGO_ICO)) {
    throw new Error(`找不到打包图标源: ${LOGO_ICO}`);
  }

  const icoBuf = fs.readFileSync(LOGO_ICO);
  const frames = extractPngsFromIco(icoBuf);
  if (!frames.length) {
    throw new Error('logo.ico 中未找到 PNG 帧，无法转换');
  }

  // 取最大帧作为 master
  frames.sort((a, b) => b.length - a.length);
  const master = frames[0];
  const png512 = await sharp(master)
    .resize(512, 512, { fit: 'contain', background: { r: 5, g: 5, b: 5, alpha: 1 } })
    .png()
    .toBuffer();
  fs.writeFileSync(ICON_PNG, png512);

  // 重新生成标准多尺寸 ICO（rcedit 对部分原始 ICO 会 Unable to commit changes）
  const bufs = await Promise.all(
    ICO_SIZES.map((size) => sharp(png512).resize(size, size).png().toBuffer()),
  );
  fs.writeFileSync(APP_ICO, await pngToIco(bufs));

  console.log('已生成 build/app-icon.ico（写入 exe 用）与 build/icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
