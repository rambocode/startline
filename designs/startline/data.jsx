// 数据与通用工具：种子数据、域名解析、图标、字母头像（所有文件共享，挂到 window）

const SEED_CATS = [
  { id: 'work', name: '工作' },
  { id: 'dev', name: '开发' },
  { id: 'design', name: '设计' },
  { id: 'read', name: '阅读' },
  { id: 'life', name: '生活' },
];

// [名称, 域名, 分类, 点击次数]
const SEED_SITES = [
  ['飞书', 'feishu.cn', 'work', 31],
  ['Notion', 'notion.so', 'work', 18],
  ['Linear', 'linear.app', 'work', 9],
  ['Gmail', 'mail.google.com', 'work', 24],
  ['GitHub', 'github.com', 'dev', 42],
  ['Cloudflare', 'dash.cloudflare.com', 'dev', 6],
  ['npm', 'npmjs.com', 'dev', 4],
  ['MDN', 'developer.mozilla.org', 'dev', 11],
  ['Stack Overflow', 'stackoverflow.com', 'dev', 3],
  ['Figma', 'figma.com', 'design', 27],
  ['Dribbble', 'dribbble.com', 'design', 2],
  ['Are.na', 'are.na', 'design', 1],
  ['少数派', 'sspai.com', 'read', 7],
  ['Hacker News', 'news.ycombinator.com', 'read', 15],
  ['即刻', 'okjike.com', 'read', 5],
  ['豆瓣', 'douban.com', 'life', 3],
  ['哔哩哔哩', 'bilibili.com', 'life', 12],
  ['12306', '12306.cn', 'life', 0],
].map(([name, domain, cat, hits], i) => ({ id: 's' + i, name, domain, cat, hits }));

const SEED_CREDS = [
  { id: 'c1', domain: 'github.com', user: 'mike-dev', pass: 'gh_T7k!92xLmQ', ts: 3 },
  { id: 'c2', domain: 'github.com', user: 'mike@studio.io', pass: 'Stud10-octo-88', ts: 2 },
  { id: 'c3', domain: 'figma.com', user: 'mike@studio.io', pass: 'fig-Vector#41', ts: 1 },
  { id: 'c4', domain: 'notion.so', user: 'mike@studio.io', pass: 'n0tion-Pages!', ts: 1 },
];

// 没收藏过的常见域名 → 展示名
const KNOWN_NAMES = { 'vercel.com': 'Vercel', 'google.com': 'Google', 'x.com': 'X', 'youtube.com': 'YouTube' };

// 生成短随机 id
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// 把用户输入的网址规整成域名；不像域名时返回空串
function domainOf(input) {
  const d = String(input || '').trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
}

// 由域名推一个展示名（取主域名段并首字母大写）
function nameOf(domain) {
  if (KNOWN_NAMES[domain]) return KNOWN_NAMES[domain];
  const parts = domain.split('.');
  const main = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return main.charAt(0).toUpperCase() + main.slice(1);
}

// 字符串 → 稳定色相，用于字母头像配色
function hueOf(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// 按小时给问候语
function greetOf(date) {
  const h = date.getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

// 时间与日期的展示文本
function clockOf(date) {
  const p = (n) => String(n).padStart(2, '0');
  return {
    time: p(date.getHours()) + ':' + p(date.getMinutes()),
    date: (date.getMonth() + 1) + '月' + date.getDate() + '日',
    week: '星期' + '日一二三四五六'[date.getDay()],
  };
}

const ICON_PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.2-4.2',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  key: 'M8 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11 12l9-9M17 6l3 3M14 9l2 2',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zm10 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  back: 'M15 5l-7 7 7 7',
  reload: 'M19 12a7 7 0 1 1-2.1-5M19 4v4h-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};

// 线性小图标
function Icon({ name, size = 16 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]}></path>
    </svg>
  );
}

// 字母头像：没有真实 favicon 时的占位
function Letter({ name, domain, size = 28 }) {
  return (
    <span className="letter" style={{ '--h': hueOf(domain), width: size, height: size, fontSize: size * 0.46 }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

// Startline 标志：一条起跑线加一个点
function Mark({ size = 16 }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="11" width="12" height="2" rx="1" fill="currentColor"></rect>
      <circle cx="5" cy="5.5" r="2.5" fill="var(--accent)"></circle>
    </svg>
  );
}

Object.assign(window, {
  SEED_CATS, SEED_SITES, SEED_CREDS,
  uid, domainOf, nameOf, hueOf, greetOf, clockOf,
  Icon, Letter, Mark,
});
