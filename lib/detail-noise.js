// lib/detail-noise.js — 详情正文推广 / 导航噪声过滤

/** 地址、邮箱、官方群、下载引导等站务推广文案 */
const DETAIL_TEXT_NOISE_RE = new RegExp([
  '最新地址',
  '永久地址',
  '永久主页',
  '快速通道',
  '国内地址',
  '海外地址',
  '需翻墙',
  '浏览推荐器',
  '官方邮箱',
  '官方群',
  '官方微信',
  '官方QQ',
  '官方APP',
  '点此加入',
  '点击加入',
  '点此下载',
  '下载入口',
  '下载\\s*APP',
  '下载\\s*91',
  '随时查看最新',
  '提示拦截',
  '绝无病毒',
  '发送邮件至',
  '获取最新地址',
  '获取最新网址',
  '网站无法访问',
  '如遇播放异常',
  '畅聊刺激内容',
  '反馈更新建议',
  '91吃瓜最新地址',
  '91吃瓜永久',
  '91吃瓜推荐',
  '91vip\\d*',
  '91cg\\d',
  '建议使用\\s*Chrome',
  '请截图保存',
  '关键词：',
  '^⬇️',
  '年度最强影院',
  '著作权归',
  '转载请注明',
  '@pm\\.me',
  // 引导点击 / 评论区灌水
  '快点击观看',
  '点击观看完整',
  '观看完整视频',
  '评论区讨论',
  '一起评论',
  '讨论分享吧',
  '点赞关注',
  '关注不迷路',
  '记得三连',
  // 站务 / 导流
  '官方频道',
  '官方交流群',
  'QQ群点我',
  '电报群',
  'TG群',
  '加入群聊',
  '获取方法',
  '发任意邮件',
  '收藏本站',
  '无法访问请',
  '创作者深度合作',
  '认真做内容的创作者',
  '带给更多老司机',
  '51Fans期待',
  '51fans网QQ',
  // 版权套话
  '版权声明',
  '未经授权不得',
  '依法追究',
  '温馨提示',
  // 博彩 / 站外广告
  '全国空降',
  '春药',
  '开元棋牌',
  '太阳城',
  '金沙直播',
  '金沙娱乐',
  '澳门赌场',
  '澳门娱乐',
  'PG官方',
  '91免费看',
  '51免费看',
  '欲洛降临',
  '33直播',
  '免费转\\d*',
  // 软引导 CTA（短套话）
  '快来收藏慢慢看',
  '一定要收藏慢慢看',
  '错过真的要后悔',
  '完整版请',
  '高清资源请',
  '私密群组获取',
].join('|'), 'i');

function normalizeDetailText(t) {
  return String(t || '').replace(/\s+/g, ' ').trim();
}

/** 是否为应丢弃的推广 / FAQ / 导航段落 */
function isPromoDetailText(t) {
  const s = normalizeDetailText(t);
  if (!s || s.length < 2) return true;
  if (DETAIL_TEXT_NOISE_RE.test(s)) return true;
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
  DETAIL_TEXT_NOISE_RE,
  isPromoDetailText,
  sanitizeDetailBlocks,
  sanitizeDetailContent,
  sanitizeArticleBody,
};
