// 共享工具：默认数据、网址规整、存储读写（后台 Service Worker、新标签页、Popup、设置页共用）
const SL = (() => {
  // 首次使用时的默认分类
  const DEFAULT_CATS = [
    { id: 'work', name: '工作' },
    { id: 'dev', name: '开发' },
    { id: 'design', name: '设计' },
    { id: 'read', name: '阅读' },
    { id: 'life', name: '生活' },
  ];

  // 生成短随机 id
  function uid() {
    // 随机段取 8 位：导入时同一毫秒内会连续生成几百个 id，4 位容易撞
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  }

  // 主机名统一小写并去掉 www.，作为帐号匹配的键
  function hostKey(host) {
    return String(host || '').toLowerCase().replace(/^www\./, '');
  }

  // 把输入或标签页地址规整成 http(s) 网址（去掉 hash）；不合法返回空串。
  // 没写协议时用 scheme；未指定则 IP 和 localhost 用 http（内网服务多半没有证书），其余用 https
  function normUrl(input, scheme) {
    let v = String(input || '').trim();
    if (!v || /\s/.test(v)) return '';
    const typed = !/^[a-z][a-z0-9+.-]*:\/\//i.test(v);
    const local = /^(localhost|\d+(\.\d+){3})([:/]|$)/i.test(v);
    if (typed) v = (scheme || (local ? 'http' : 'https')) + '://' + v;
    try {
      const u = new URL(v);
      if (!/^https?:$/.test(u.protocol)) return '';
      // 手打且没写协议时要求像个域名，避免把随便一个词当成网址；写了协议的（如标签页地址 http://intranet/）都接受
      if (typed && !local && !u.hostname.includes('.')) return '';
      u.hash = '';
      return u.href;
    } catch (e) {
      return '';
    }
  }

  // 网址 → 去掉 www. 的主机名
  function hostOf(url) {
    try { return hostKey(new URL(url).hostname); } catch (e) { return ''; }
  }

  // 网址 → 展示用主机：去掉 www.，保留非默认端口（如 172.16.11.110:8080）
  function displayHost(url) {
    try {
      const u = new URL(url);
      return hostKey(u.hostname) + (u.port ? ':' + u.port : '');
    } catch (e) {
      return '';
    }
  }

  // 由网页标题或网址推一个简短站点名
  function siteName(title, url) {
    // 标题常见“页面名 - 站点名”，取最短的一段更接近站点名
    const parts = String(title || '').split(/\s+[-–—·]\s+|\s*[:：]\s+|\s*[|｜]\s*/).map((s) => s.trim()).filter(Boolean);
    const pick = parts.sort((a, b) => a.length - b.length)[0];
    if (pick && pick.length <= 24) return pick;
    const host = hostOf(url);
    // IP 地址、localhost、IPv6 没有可读的主域名，直接用主机加端口
    if (/^\d+(\.\d+){3}$/.test(host) || !host.includes('.') || host.includes(':')) return displayHost(url);
    const segs = host.split('.');
    const main = segs.length > 1 ? segs[segs.length - 2] : segs[0];
    return main.charAt(0).toUpperCase() + main.slice(1);
  }

  // 找出适用于某主机的帐号：同主机，或互为子域名
  function credsFor(creds, host) {
    const k = hostKey(host);
    return creds.filter((c) => c.host === k || k.endsWith('.' + c.host) || c.host.endsWith('.' + k));
  }

  // 读取全部数据并补齐默认值
  async function load() {
    const d = await chrome.storage.local.get(['cats', 'sites', 'creds', 'settings']);
    return {
      cats: d.cats || DEFAULT_CATS,
      sites: d.sites || [],
      creds: d.creds || [],
      // noFill：关掉了帐号保存与填充的主机；motion：界面动效总开关
      settings: { mode: 'light', motion: 'on', lastCat: 'work', noFill: [], ...(d.settings || {}) },
    };
  }

  // 写入部分数据
  function save(patch) {
    return chrome.storage.local.set(patch);
  }

  // 收藏网址：已存在则直接返回；未指定分类时落到上次使用的分类
  async function addSite(url, title, catId) {
    const d = await load();
    const exist = d.sites.find((s) => s.url === url);
    if (exist) return { site: exist, existed: true, cat: d.cats.find((c) => c.id === exist.cat) };
    const cat = d.cats.find((c) => c.id === (catId || d.settings.lastCat)) || d.cats[0];
    const site = { id: uid(), name: siteName(title, url), url, cat: cat.id, hits: 0, ts: Date.now() };
    await save({ sites: [...d.sites, site], settings: { ...d.settings, lastCat: cat.id }, cats: d.cats });
    return { site, existed: false, cat };
  }

  // 收藏网址并返回提示文字。catId 为空时落到上次使用的分类；
  // 指定了分类而网址已收藏在别的分类时，移到指定分类（分类与网址一次写入）
  async function saveTo(url, title, catId) {
    const r = await addSite(url, title, catId);
    if (!r.existed) return '已收藏到「' + r.cat.name + '」';
    if (!catId || r.site.cat === catId) return '已在「' + (r.cat ? r.cat.name : '导航') + '」中';
    const d = await load();
    const cat = d.cats.find((c) => c.id === catId);
    if (!cat) return '分类不存在';
    await save({
      sites: d.sites.map((s) => (s.id === r.site.id ? { ...s, cat: catId } : s)),
      settings: { ...d.settings, lastCat: catId },
    });
    return '已移到「' + cat.name + '」';
  }

  // 网页地址不能收藏时返回原因，能收藏返回空串
  function unsavable(url) {
    const u = String(url || '');
    if (!u) return '读不到这个页面的地址';
    if (/^chrome:\/\/newtab|^chrome-extension:/i.test(u)) return '这是 Startline 自己的页面';
    if (/^(chrome|edge|about|brave|devtools|view-source):/i.test(u)) return '浏览器内部页面不能收藏';
    if (/^file:/i.test(u)) return '本地文件不能收藏';
    if (!/^https?:/i.test(u) || !normUrl(u)) return '只能收藏 http 和 https 网页';
    return '';
  }

  // 某主机是否关掉了帐号保存与填充；关掉父域名时子域名一并生效
  function fillOff(settings, host) {
    const k = hostKey(host);
    return (settings.noFill || []).some((h) => k === h || k.endsWith('.' + h));
  }

  return { uid, hostKey, normUrl, hostOf, displayHost, siteName, credsFor, load, save, addSite, saveTo, unsavable, fillOff };
})();
