// lib/detail-noise.js — 详情正文推广 / 导航噪声过滤
//
// 关键词采用「通配符易匹配」：依赖 lib/exclude.js 的 matchPattern
//   - 含 '*' 时按锚定通配：'*娱乐' 仅命中以「娱乐」结尾（金沙娱乐 / 皇冠娱乐 / xx娱乐）
//   - 不含 '*' 时为「词根子串」：'官方' 命中 官方邮箱 / 官方群 / 官方微信 ……（嵌入句中也命中）
// 相比原先逐个写死品牌全名，模式更少、覆盖变体更全。

const { matchPattern, escapeRegExp } = require('./exclude');

/**
 * 详情正文噪声模式（已精简）。分组见注释：
 *   - 地址/访问引导
 *   - 官方/社群/下载导流
 *   - 邮箱/邮件
 *   - 推广/赌博品牌词根（易匹配，覆盖任意前缀变体）
 *   - 软引导/套话词根
 */
const NOISE_PATTERNS = [
  // 地址 / 访问引导
  '地址',      // 最新/永久/国内/海外地址、获取最新地址
  '网址',      // 获取最新网址
  '翻墙',      // 需翻墙
  '通道',      // 快速通道
  '查看最新',  // 随时查看最新
  // 官方 / 社群 / 下载导流（含微信变体、电报、扫码）
  '官方',      // 官方邮箱 / 群 / 微信 / APP / 频道 / 交流群
  'QQ',        // QQ群点我 / 51fans网QQ
  '微信',      // 加我微信（含非官方变体）
  'vx',        // 薇信 / vx 拼写变体
  '薇信',      // 微信变体
  '电报',      // 电报 / Telegram 引流
  'TG',        // Telegram 缩写
  '二维码',    // 扫码加 / 扫码下载
  '扫码',      // 扫码下载 / 加群
  '加入',      // 点此加入
  '下载',      // 点此下载 / 下载入口 / 下载APP
  '获取方法',  // 获取方法
  // 防失联 / 备用域名
  '失联',      // 防失联请收藏
  '备用',      // 备用地址 / 备用域名
  // 客户端 / App 下载
  'APP',       // 官方APP
  '安卓',      // 安卓下载
  '苹果',      // 苹果 / iOS
  'apk',       // 安装包
  'ios',       // iOS 版
  // 会员 / 付费解锁
  '会员',      // 充值会员
  'VIP',       // VIP 解锁
  '充值',      // 充值
  '解锁',      // 解锁完整版
  // 招商 / 广告合作
  '招商',      // 招商代理
  '代理',      // 代理加盟
  '广告',      // 广告合作
  '赞助',      // 赞助
  '商务合作',  // 商务合作
  // 赌博 / 博彩导流（黑话 + 注册开户）
  '菠菜',      // 博彩黑话
  '外围',      // 外围 / 博彩
  '注册',      // 注册开户
  '开户',      // 开户送彩金
  '彩金',      // 彩金返利
  // 同城 / 约炮
  '约炮',      // 同城约炮
  '同城',      // 同城交友
  // 资源 / 网盘下载
  '网盘',      // 百度网盘 / 夸克
  '磁力',      // 磁力链接
  '迅雷',      // 迅雷下载
  '种子',      // 种子文件
  // 站点公告 / 免责声明
  '公告',      // 更新公告
  '侵权',      // 如涉及侵权请联系删除
  '免责',      // 免责声明
  // 邮箱 / 邮件
  '邮件',      // 发送邮件至 / 发任意邮件
  'pm.me',     // 推广邮箱域名
  // 推广 / 赌博品牌词根（易匹配，覆盖各品牌前缀变体）
  '娱乐',      // 金沙娱乐 / 皇冠娱乐 / xx娱乐
  '直播',      // 金沙直播 / 33直播 / xx直播
  // 软引导 / 套话词根
  '病毒',      // 绝无病毒
  '提示',      // 提示拦截 / 温馨提示
  '截图',      // 请截图保存
  '关键词',    // 关键词：
  '播放异常',  // 如遇播放异常
  '畅聊',      // 畅聊刺激内容
  '创作者',    // 创作者深度合作 / 认真做内容的创作者
  '老司机',    // 带给更多老司机
  'Fans',      // 51Fans 系列
  '深度合作',  // 创作者深度合作
  '后悔',      // 错过真的要后悔
  '反馈更新',  // 反馈更新建议
  '浏览推荐',  // 浏览推荐器
];

/** 向后兼容：由 NOISE_PATTERNS 合成的正则（外部一般直接用 isPromoDetailText） */
const DETAIL_TEXT_NOISE_RE = new RegExp(
  NOISE_PATTERNS.map((p) =>
    p.includes('*') ? p.split('*').map(escapeRegExp).join('.*') : escapeRegExp(p)
  ).join('|'),
  'i'
);

function normalizeDetailText(t) {
  return String(t || '').replace(/\s+/g, ' ').trim();
}

/** 是否为应丢弃的推广 / FAQ / 导航段落 */
function isPromoDetailText(t) {
  const s = normalizeDetailText(t);
  if (!s || s.length < 2) return true;
  // 通配符「易匹配」关键词
  if (NOISE_PATTERNS.some((p) => matchPattern(s, p))) return true;
  // 结构性噪声（正则）
  if (/可能你会感兴趣|常见疑问解答|\bFAQ\b/i.test(s)) return true;
  if (/^(Q[：:]|A[：:]|问[：:]|答[：:])/i.test(s)) return true;
  // 单独一行的推广邮箱
  if (/^[\w.+-]+@(pm\.me|proton\.me|protonmail\.com)\s*$/i.test(s)) return true;
  // 单独一行的镜像站域名
  if (/^https?:\/\/(www\.)?(51shipin|51sp|51sptv|91vip|91cg)\w*\./i.test(s)) return true;
  if (/^(www\.)?(51shipin|51sp|51sptv|91vip|91cg)\w*\.[\w.]+\/?$/i.test(s)) return true;
  // 仅罗列浏览器名的推荐行
  if (/^(Edge|夸克|UC|Chrome|Safari|Yandex)(\s*[\/|、]\s*(Edge|夸克|UC|Chrome|Safari|Yandex))+$/i.test(s)) {
    return true;
  }
  return false;
}

function sanitizeDetailBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.filter((b) => {
    if (!b || b.type !== 'text') return true;
    return !isPromoDetailText(b.text);
  });
}

function sanitizeDetailContent(content) {
  const raw = String(content || '');
  if (!raw) return '';
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isPromoDetailText(line))
    .join('\n');
}

function sanitizeArticleBody(article) {
  if (!article || typeof article !== 'object') return article;
  const blocks = sanitizeDetailBlocks(article.blocks);
  let content = sanitizeDetailContent(article.content);
  if (!content && blocks.length) {
    content = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
  }
  return { ...article, blocks, content };
}

module.exports = {
  NOISE_PATTERNS,
  DETAIL_TEXT_NOISE_RE,
  isPromoDetailText,
  sanitizeDetailBlocks,
  sanitizeDetailContent,
  sanitizeArticleBody,
};
