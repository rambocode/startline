// 后台：右键菜单一键收藏，帐号密码的保存 / 查询 / 撤销，以及分步登录时暂存上一步填的帐号。
// 点击工具栏图标打开 popup.html，不再经过这里
importScripts('shared.js');

const BLUE = '#2563eb';
const PENDING_TTL = 10 * 60 * 1000;

// 在工具栏图标上短暂显示一个角标作为反馈
function flash(tabId, text, color) {
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2500);
}

// 收藏后的反馈：图标角标 + 页面顶部提示
function notify(tabId, text) {
  flash(tabId, '✓', BLUE);
  chrome.tabs.sendMessage(tabId, { type: 'toast', text }, { frameId: 0 }).catch(() => {});
}

// ---------- 右键菜单：网页空白处收藏此页、链接上收藏链接、右键工具栏图标收藏当前页，子菜单直接选分类 ----------
const WEB = ['http://*/*', 'https://*/*'];
let menuQueue = Promise.resolve();

// 按当前分类重建右键菜单；排队执行，避免并发重建时 id 冲突
function buildMenus() {
  menuQueue = menuQueue.then(async () => {
    const { cats } = await SL.load();
    await chrome.contextMenus.removeAll();
    // create 的错误只能经 lastError 回调拿到，这里吞掉避免控制台报未检查错误
    const create = (props) => chrome.contextMenus.create(props, () => void chrome.runtime.lastError);
    create({ id: 'page', title: '收藏此页到 Startline', contexts: ['page'], documentUrlPatterns: WEB });
    create({ id: 'link', title: '收藏链接到 Startline', contexts: ['link'], targetUrlPatterns: WEB });
    create({ id: 'action', title: '收藏当前页到', contexts: ['action'] });
    for (const c of cats) {
      create({ id: 'action:' + c.id, parentId: 'action', title: c.name, contexts: ['action'] });
      create({ id: 'page:' + c.id, parentId: 'page', title: c.name, contexts: ['page'], documentUrlPatterns: WEB });
      create({ id: 'link:' + c.id, parentId: 'link', title: c.name, contexts: ['link'], targetUrlPatterns: WEB });
    }
  }).catch(() => {});
  return menuQueue;
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

// 分类在新标签页里增删改名后，同步更新右键菜单
chrome.storage.onChanged.addListener((changes, area) => {
  const c = changes.cats;
  if (area === 'local' && c && JSON.stringify(c.newValue) !== JSON.stringify(c.oldValue)) buildMenus();
});

// 点击右键菜单中的分类
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const m = /^(page|link|action):(.+)$/.exec(String(info.menuItemId));
  if (!m || !tab) return;
  const isLink = m[1] === 'link';
  const raw = isLink ? info.linkUrl : info.pageUrl || tab.url;
  const url = SL.normUrl(raw);
  // 新标签页、chrome:// 等非网页不能收藏
  if (!url || !/^https?:/i.test(raw || '')) {
    flash(tab.id, '!', '#9ca3af');
    return;
  }
  // 链接拿不到目标页标题，名称先按域名生成，可在首页卡片的“⋯”里改
  notify(tab.id, await SL.saveTo(url, isLink ? '' : tab.title, m[2]));
});

// 内容脚本的请求：主机名一律取自发送方地址，不信任页面传来的域名
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!sender.tab || !sender.url || !/^https?:/.test(sender.url)) return false;
  handle(msg, sender).then(reply, () => reply(null));
  return true;
});

// 按消息类型分发
async function handle(msg, sender) {
  const host = SL.hostKey(new URL(sender.url).hostname);
  const pendingKey = 'pending:' + sender.tab.id;

  // 页内浮层跟随扩展自己的外观设置；本站关掉了帐号功能时不给帐号
  if (msg.type === 'getCreds') {
    const d = await SL.load();
    const look = { mode: d.settings.mode, motion: d.settings.motion };
    if (SL.fillOff(d.settings, host)) return { creds: [], pending: '', off: true, ...look };
    const creds = SL.credsFor(d.creds, host).sort((a, b) => b.ts - a.ts).map(({ id, user, pass }) => ({ id, user, pass }));
    const p = (await chrome.storage.session.get(pendingKey))[pendingKey];
    const pending = p && Date.now() - p.ts < PENDING_TTL && SL.credsFor([{ host: p.host }], host).length ? p.user : '';
    return { creds, pending, off: false, ...look };
  }

  if (msg.type === 'rememberUser') {
    if (SL.fillOff((await SL.load()).settings, host)) return { ok: false };
    await chrome.storage.session.set({ [pendingKey]: { host, user: String(msg.user).slice(0, 200), ts: Date.now() } });
    return { ok: true };
  }

  if (msg.type === 'saveCred') {
    const user = String(msg.user || '').trim().slice(0, 200);
    const pass = String(msg.pass || '');
    if (!user || !pass) return { status: 'skip' };
    const d = await SL.load();
    if (SL.fillOff(d.settings, host)) return { status: 'skip' };
    const same = SL.credsFor(d.creds, host).find((c) => c.user === user);
    if (same && same.pass === pass) return { status: 'same' };
    await chrome.storage.session.remove(pendingKey);
    if (same) {
      await SL.save({ creds: d.creds.map((c) => (c.id === same.id ? { ...c, pass, ts: Date.now() } : c)) });
      return { status: 'updated', id: same.id, prev: same.pass };
    }
    const cred = { id: SL.uid(), host, user, pass, ts: Date.now() };
    await SL.save({ creds: [...d.creds, cred] });
    return { status: 'saved', id: cred.id };
  }

  // 撤销刚才的保存：新增的删掉，更新的恢复旧密码；只允许操作本站帐号
  if (msg.type === 'undoCred') {
    const d = await SL.load();
    const own = SL.credsFor(d.creds, host).find((c) => c.id === msg.id);
    if (!own) return { ok: false };
    const creds = msg.prev
      ? d.creds.map((c) => (c.id === own.id ? { ...c, pass: msg.prev } : c))
      : d.creds.filter((c) => c.id !== own.id);
    await SL.save({ creds });
    return { ok: true };
  }

  return null;
}
