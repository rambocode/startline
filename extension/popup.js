// Popup：把当前网页收藏到分类、改分类或移除收藏；显示本站已存帐号，提供本站帐号保存与填充开关
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = UI.esc;
  const app = $('#app');
  // 不能运行内容脚本的站点：帐号开关在这里没有意义
  const NO_SCRIPT_HOSTS = /^(chromewebstore\.google\.com|chrome\.google\.com|microsoftedge\.microsoft\.com)$/;

  // 界面状态。msg：结果行的文字和可选撤销；err：写入失败的提示和重试
  const st = { tab: null, url: '', reason: '', data: null, sel: null, busy: false, msg: null, err: null, ready: false };
  let msgTimer = 0;

  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;

  // 当前网页已收藏的条目
  function site() {
    return st.url ? st.data.sites.find((s) => s.url === st.url) : null;
  }

  // 分类 id → 名称
  function catName(id) {
    const c = st.data.cats.find((x) => x.id === id);
    return c ? c.name : '';
  }

  // 未收藏时预选的分类：沿用用户在这里点过的，否则上次使用的，分类被删了就落到第一个
  function fixSel() {
    const ids = st.data.cats.map((c) => c.id);
    if (!ids.includes(st.sel)) st.sel = ids.includes(st.data.settings.lastCat) ? st.data.settings.lastCat : ids[0];
  }

  // ---------- 渲染 ----------
  // 第一次就绪时搭好不重绘的骨架：结果行是常驻的 status 区域，读屏才能稳定播报
  function mountShell() {
    app.removeAttribute('inert');
    app.removeAttribute('aria-busy');
    app.removeAttribute('role');
    app.innerHTML = `<section class="card hero" id="hero"><div id="heroBody" class="hero-body"></div><p class="result" id="result" role="status"></p></section><div id="site"></div>`;
  }

  // 整体重绘；保住键盘焦点
  function render() {
    UI.keepFocus(() => {
      $('#hero').classList.toggle('unavailable', !!st.reason);
      $('#heroBody').innerHTML = st.reason ? unavailableHtml() : heroHtml();
      $('#result').innerHTML = resultHtml();
      $('#result').hidden = !!st.reason;
      $('#site').innerHTML = siteHtml();
    });
  }

  // 当前页面不能收藏：说明原因，主按钮不可用
  function unavailableHtml() {
    return `<div class="page"><span class="fav" style="width:36px;height:36px">${UI.icon('globe', 18)}</span>
      <div class="page-text"><p class="page-name">${esc(st.tab && st.tab.title ? st.tab.title : '此页面')}</p><p class="page-host">${esc(st.reason)}</p></div></div>
      <button class="btn-primary block" disabled title="${esc(st.reason)}">收藏</button>`;
  }

  // 主卡片：网页摘要、分类单选、主按钮
  function heroHtml() {
    const s = site();
    const cur = s ? s.cat : st.sel;
    const name = s ? s.name : SL.siteName(st.tab.title, st.url);
    const chips = st.data.cats.map((c) =>
      `<button class="chip" role="radio" aria-checked="${c.id === cur}" tabindex="${c.id === cur ? 0 : -1}" data-act="cat" data-id="${esc(c.id)}" data-focus="cat:${esc(c.id)}">${esc(c.name)}</button>`
    ).join('');
    const label = s ? '移除收藏' : '收藏到「' + catName(cur) + '」';
    return `<div class="page">${s ? SiteIcon.html(s, 36) : UI.fav(st.url, 36)}
        <div class="page-text"><p class="page-name">${esc(name)}</p><p class="page-host">${esc(SL.displayHost(st.url))}</p></div>
        ${s ? '<span class="state">已收藏</span>' : ''}</div>
      <div class="chips" role="radiogroup" id="cats" aria-label="分类">${chips}</div>
      <button class="btn-primary block" data-act="main" data-focus="main" aria-pressed="${!!s}"${st.busy ? ' aria-busy="true"' : ''}>${esc(label)}</button>`;
  }

  // 结果行：写入失败优先，其次是最近一次操作的结果
  function resultHtml() {
    if (st.err) return `<span class="note note-error" style="flex:1"><span>${esc(st.err.text)}</span><button data-act="retry">重试</button></span>`;
    if (st.msg) return `<span>${esc(st.msg.text)}</span>${st.msg.undo ? '<button data-act="undo">撤销</button>' : ''}`;
    return '';
  }

  // 本站帐号：有帐号时显示数量和「管理 ↗」；能运行内容脚本的站点显示开关
  function siteHtml() {
    if (st.reason) return '';
    const host = SL.hostOf(st.url);
    const n = SL.credsFor(st.data.creds, host).length;
    const rows = [];
    if (n) {
      rows.push(`<div class="row"><div class="row-text"><span class="row-label">${UI.icon('key', 15)}<span>本站已存 <span class="count">${n}</span> 个帐号</span></span></div>
        <button class="btn-ghost" data-act="creds">管理 <span aria-hidden="true">↗</span></button></div>`);
    }
    if (!NO_SCRIPT_HOSTS.test(host)) {
      const on = !SL.fillOff(st.data.settings, host);
      rows.push(`<div class="row" data-switch-row><div class="row-text"><span class="row-label" id="fillLabel">在本站保存和填充帐号</span></div>
        <button class="switch" role="switch" aria-checked="${on}" aria-labelledby="fillLabel" data-act="fill" data-focus="fill"></button></div>`);
    }
    return rows.length ? `<section class="card site">${rows.join('')}</section>` : '';
  }

  // ---------- 写入 ----------
  // 统一的写入流程：进行中标记主按钮，失败时保留现场并给「重试」，成功后重读数据
  async function write(run) {
    st.busy = true;
    st.err = null;
    render();
    try {
      await run();
    } catch (e) {
      st.err = { text: '没有保存成功，存储空间可能已满', retry: () => write(run) };
    }
    st.data = await SL.load();
    fixSel();
    st.busy = false;
    render();
  }

  // 结果行的提示：带撤销的留到下一次操作，普通结果 2.8 秒后消失
  function say(text, undo) {
    clearTimeout(msgTimer);
    st.msg = { text, undo };
    if (!undo) msgTimer = setTimeout(() => { st.msg = null; render(); }, 2800);
  }

  // 收藏到预选的分类
  function add() {
    return write(async () => say(await SL.saveTo(st.url, st.tab.title, st.sel)));
  }

  // 移除收藏；撤销时把原条目放回原位置（名称、图标、打开次数都在）
  function remove() {
    const s = site();
    if (!s) return render();
    const idx = st.data.sites.indexOf(s);
    st.sel = s.cat;
    return write(async () => {
      const d = await SL.load();
      await SL.save({ sites: d.sites.filter((x) => x.id !== s.id) });
      say('已移除', () => write(async () => {
        const now = await SL.load();
        if (now.sites.some((x) => x.url === s.url)) return say('已经在导航里了');
        const sites = [...now.sites];
        sites.splice(Math.min(idx, sites.length), 0, s);
        await SL.save({ sites });
        say('已恢复');
      }));
    });
  }

  // 已收藏时改分类（立即生效），未收藏时只改预选
  function pickCat(id) {
    const s = site();
    if (!s) { st.sel = id; st.msg = null; return render(); }
    if (s.cat === id) return;
    return write(async () => {
      const d = await SL.load();
      await SL.save({
        sites: d.sites.map((x) => (x.id === s.id ? { ...x, cat: id } : x)),
        settings: { ...d.settings, lastCat: id },
      });
      say('已移到「' + catName(id) + '」');
    });
  }

  // 切换本站帐号保存与填充；打开时连同覆盖本站的父域名条目一起去掉，然后让网页里的脚本重新拉取
  function toggleFill() {
    const host = SL.hostOf(st.url);
    return write(async () => {
      const d = await SL.load();
      const list = d.settings.noFill || [];
      const noFill = SL.fillOff(d.settings, host)
        ? list.filter((h) => !(host === h || host.endsWith('.' + h)))
        : [...list, host];
      await SL.save({ settings: { ...d.settings, noFill } });
      chrome.tabs.sendMessage(st.tab.id, { type: 'refresh' }).catch(() => {});
    });
  }

  // 打开扩展页面后关闭 Popup；打开失败时留在原地
  function openAndClose(p) {
    p.then(() => window.close(), () => say('打不开这个页面'));
  }

  const actions = {
    home: () => openAndClose(chrome.tabs.create({})),
    settings: () => openAndClose(chrome.runtime.openOptionsPage()),
    creds: () => openAndClose(chrome.tabs.create({ url: chrome.runtime.getURL('options.html?q=' + encodeURIComponent(SL.hostOf(st.url)) + '#creds') })),
    cat: (id) => pickCat(id),
    main: () => { if (!st.busy) return site() ? remove() : add(); },
    fill: () => { if (!st.busy) toggleFill(); },
    undo: () => { const u = st.msg && st.msg.undo; st.msg = null; if (u) u(); },
    retry: () => { const r = st.err && st.err.retry; if (r) r(); },
    reload: () => location.reload(),
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && actions[b.dataset.act]) actions[b.dataset.act](b.dataset.id);
  });

  // 别的入口（新标签页、右键菜单、设置页）改了数据时跟着更新
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !st.ready || st.busy) return;
    st.data = await SL.load();
    UI.applyAppearance(st.data.settings);
    fixSel();
    render();
  });

  // ---------- 启动：5 秒还没就绪就给「重新打开」 ----------
  const slow = setTimeout(() => {
    if (st.ready) return;
    mountShell();
    $('#heroBody').innerHTML = '<div class="note note-error"><span>读取超时</span><button data-act="reload">重新打开</button></div>';
  }, 5000);

  Promise.all([chrome.tabs.query({ active: true, currentWindow: true }), SL.load()]).then(([[tab], data]) => {
    clearTimeout(slow);
    st.tab = tab || { title: '' };
    st.data = data;
    const raw = tab ? tab.url || tab.pendingUrl || '' : '';
    st.reason = SL.unsavable(raw);
    st.url = st.reason ? '' : SL.normUrl(raw);
    fixSel();
    UI.applyAppearance(data.settings);
    st.ready = true;
    mountShell();
    render();
  }, () => {
    clearTimeout(slow);
    mountShell();
    $('#heroBody').innerHTML = '<div class="note note-error"><span>读取失败</span><button data-act="reload">重新打开</button></div>';
  });
})();
