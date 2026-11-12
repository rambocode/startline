// 设置页：分类管理、已存帐号、外观、数据备份与导入；所有修改即时保存，失败时提示并可重试
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = UI.esc;
  const icon = UI.icon;

  // 分区注册表：地址只接受这里登记过的 id
  const SECTIONS = [
    { id: 'categories', group: '内容', name: '分类', icon: 'folder' },
    { id: 'creds', group: '内容', name: '已存帐号', icon: 'key' },
    { id: 'appearance', group: '通用', name: '外观', icon: 'sun' },
    { id: 'data', group: '通用', name: '数据与备份', icon: 'archive' },
  ];
  const DEFAULT_SECTION = 'creds';

  let data = null;
  const ui = {
    sec: DEFAULT_SECTION,
    q: new URLSearchParams(location.search).get('q') || '', // 帐号筛选，可由 Popup 的「管理 ↗」带进来
    shown: new Set(),       // 显示明文的帐号 id
    exportCreds: false,     // 导出时是否包含帐号密码；涉及隐私，每次打开默认不勾
    plan: null,             // 导入预览
    importErr: '',
  };

  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;

  // 当前地址对应的分区；未登记的回到默认分区
  function route() {
    const id = location.hash.slice(1);
    return SECTIONS.some((s) => s.id === id) ? id : DEFAULT_SECTION;
  }

  // 页内切换分区：替换地址不堆历史，刷新后回到同一分区
  function go(id) {
    if (!SECTIONS.some((s) => s.id === id)) return;
    history.replaceState(null, '', '#' + id);
    ui.sec = id;
    render();
    $('#work').scrollTop = 0;
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { ui.sec = route(); render(); });

  // ---------- 保存 ----------
  // 先改内存并重绘，再写存储；写入失败时回到存储里的真实数据，并给「重试」
  async function commit(patch) {
    Object.assign(data, patch);
    render();
    try {
      await SL.save(patch);
    } catch (e) {
      data = await SL.load();
      render();
      UI.toast('没有保存成功，存储空间可能已满', { error: true, action: { label: '重试', run: () => commit(patch) } });
    }
  }

  // ---------- 渲染 ----------
  // 整体重绘侧栏和当前分区；保住焦点，也保住正在编辑的分类名草稿
  function render() {
    const a = document.activeElement;
    const draft = a && a.dataset && a.dataset.draft ? { key: a.dataset.focus, value: a.value } : null;
    UI.keepFocus(() => {
      renderNav();
      const work = $('#work');
      work.removeAttribute('aria-busy');
      const sec = SECTIONS.find((s) => s.id === ui.sec);
      work.setAttribute('aria-label', sec.name);
      work.innerHTML = ({ categories: catsView, creds: credsView, appearance: lookView, data: dataView })[ui.sec]();
    });
    if (draft) {
      const el = document.querySelector(`[data-focus="${CSS.escape(draft.key)}"]`);
      if (el && el === document.activeElement) el.value = draft.value;
    }
  }

  // 侧栏导航与窄屏下拉
  function renderNav() {
    const count = { categories: data.cats.length, creds: data.creds.length };
    const groups = [...new Set(SECTIONS.map((s) => s.group))];
    // 分组之间用细线隔开，不再写组名：四个分区靠图标和名称就能认出来
    $('#nav').innerHTML = groups.map((g) => SECTIONS.filter((s) => s.group === g).map((s) =>
      `<a class="nav-item" href="#${s.id}" data-act="go" data-id="${s.id}" data-focus="nav:${s.id}"${s.id === ui.sec ? ' aria-current="page"' : ''}>
        ${icon(s.icon, 17)}<span class="nav-name">${esc(s.name)}</span>${count[s.id] != null ? `<span class="n">${count[s.id]}</span>` : ''}</a>`).join('')).join('<div class="nav-sep"></div>');
    $('#navSelect').innerHTML = groups.map((g) => `<optgroup label="${esc(g)}">` + SECTIONS.filter((s) => s.group === g).map((s) =>
      `<option value="${s.id}"${s.id === ui.sec ? ' selected' : ''}>${esc(s.name)}</option>`).join('') + '</optgroup>').join('');
  }

  // 分区标题：标题、一行摘要（可选）、右侧工具（可选）
  function head(title, sub = '', tools = '') {
    return `<div class="sec-head"><div class="sec-title"><h1>${esc(title)}</h1>${sub ? `<p class="sec-sub">${esc(sub)}</p>` : ''}</div>${tools}</div>`;
  }

  // ---------- 分类 ----------
  function catsView() {
    const only = data.cats.length === 1;
    const rows = data.cats.map((c, i) => {
      const n = data.sites.filter((s) => s.cat === c.id).length;
      return `<div class="row cat-row">
        ${icon('folder', 17)}
        <input class="field cat-name" value="${esc(c.name)}" maxlength="40" aria-label="分类名称" data-cat="${esc(c.id)}" data-focus="catName:${esc(c.id)}" data-draft="1">
        <span class="pill">${n} 个网址</span>
        <button class="icon-btn" data-act="catUp" data-id="${esc(c.id)}" data-focus="catUp:${esc(c.id)}" aria-label="上移" title="上移"${i === 0 ? ' disabled' : ''}>${icon('up', 16)}</button>
        <button class="icon-btn" data-act="catDown" data-id="${esc(c.id)}" data-focus="catDown:${esc(c.id)}" aria-label="下移" title="下移"${i === data.cats.length - 1 ? ' disabled' : ''}>${icon('down', 16)}</button>
        <button class="icon-btn danger" data-act="catDel" data-id="${esc(c.id)}" aria-label="删除分类" title="${only ? '至少保留一个分类' : '删除分类'}"${only ? ' disabled' : ''}>${icon('trash', 16)}</button>
      </div>`;
    }).join('');
    return `<div class="inner">${head('分类', data.cats.length + ' 个分类，新标签页按这个顺序分区')}
      <section class="card">${rows}
        <div class="row add-row"><input class="field" id="catNew" placeholder="新分类名称" maxlength="40" aria-label="新分类名称" data-focus="catNew" data-draft="1">
          <button class="btn" data-act="catAdd">${icon('plus', 15)}添加</button></div>
      </section></div>`;
  }

  // 新建分类
  function addCat() {
    const el = $('#catNew');
    const name = el.value.trim();
    if (!name) { el.focus(); return; }
    el.value = '';
    commit({ cats: [...data.cats, { id: SL.uid(), name }] });
  }

  // 改名：清空视为放弃
  function renameCat(el) {
    const id = el.dataset.cat;
    const name = el.value.trim();
    const cat = data.cats.find((c) => c.id === id);
    if (!cat) return;
    if (!name || name === cat.name) { el.value = cat.name; return; }
    commit({ cats: data.cats.map((c) => (c.id === id ? { ...c, name } : c)) });
  }

  // 上移 / 下移
  function moveCat(id, step) {
    const cats = [...data.cats];
    const i = cats.findIndex((c) => c.id === id);
    const j = i + step;
    if (i < 0 || j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    commit({ cats });
  }

  // 删除分类：空分类直接删并可撤销；有网址时先确认把网址移到哪个分类，分类与网址一次写入
  function delCat(id, trigger) {
    const cat = data.cats.find((c) => c.id === id);
    if (!cat || data.cats.length < 2) return;
    const rest = data.cats.filter((c) => c.id !== id);
    const n = data.sites.filter((s) => s.cat === id).length;
    const fixLast = (target) => (data.settings.lastCat === id ? { ...data.settings, lastCat: target } : data.settings);
    if (!n) {
      const before = { cats: data.cats, settings: data.settings };
      commit({ cats: rest, settings: fixLast(rest[0].id) });
      UI.toast('已删除分类「' + cat.name + '」', { undo: () => commit(before) });
      return;
    }
    openDialog({
      title: '删除分类「' + cat.name + '」',
      body: `<label>其中 <strong>${n}</strong> 个网址移到
          <select class="field" id="moveTo" style="margin-top:6px">${rest.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
        <p>网址、图标和已存帐号都不受影响。删除后可以再建一个同名分类，但网址不会自动移回来。</p>`,
      ok: '删除并移动',
      danger: true,
      trigger,
      onOk: () => {
        const to = $('#moveTo').value;
        if (!rest.some((c) => c.id === to)) return;
        commit({
          cats: rest,
          sites: data.sites.map((s) => (s.cat === id ? { ...s, cat: to } : s)),
          settings: fixLast(to),
        });
        UI.toast('已删除「' + cat.name + '」，网址移到「' + rest.find((c) => c.id === to).name + '」');
      },
    });
  }

  // ---------- 已存帐号 ----------
  function credsView() {
    const search = `<label class="search-box">${icon('search', 16)}<input id="credQ" data-focus="credQ" placeholder="按网站或帐号筛选" value="${esc(ui.q)}" spellcheck="false" autocomplete="off" aria-label="筛选帐号"></label>`;
    const hosts = new Set(data.creds.map((c) => c.host)).size;
    const sub = data.creds.length ? `${data.creds.length} 个帐号，来自 ${hosts} 个网站` : '';
    const off = data.settings.noFill || [];
    const offCard = off.length ? `<h2 class="group-title">不保存帐号的网站</h2>
      <section class="card">${off.map((h) => `<div class="row host-row">${UI.fav('https://' + h, 28)}<span class="row-label">${esc(h)}</span>
        <button class="btn-ghost" data-act="fillOn" data-id="${esc(h)}">恢复保存和填充</button></div>`).join('')}</section>` : '';
    return `<div class="inner wide">${head('已存帐号', sub, data.creds.length ? search : '')}
      <div class="cred-grid" id="credList">${credRows()}</div>${offCard}</div>`;
  }

  // 帐号所属网站在导航里的条目：同主机优先，其次互为子域名；用来显示用户起的名字和图标
  function siteFor(host) {
    const hostOf = (s) => SL.hostOf(s.url);
    return data.sites.find((s) => hostOf(s) === host)
      || data.sites.find((s) => SL.credsFor([{ host }], hostOf(s)).length) || null;
  }

  // 帐号列表（筛选时只重绘这一块）：按网站分组，每个网站一张卡片
  function credRows() {
    if (!data.creds.length) {
      return `<div class="card cred-empty">${icon('key', 22)}<p><strong>还没有保存帐号</strong></p><p>在网站上登录时会自动保存，下次打开自动填好。</p></div>`;
    }
    const k = ui.q.trim().toLowerCase();
    const groups = new Map();
    data.creds
      .filter((c) => !k || c.host.includes(k) || c.user.toLowerCase().includes(k) || (siteFor(c.host)?.name || '').toLowerCase().includes(k))
      .sort((a, b) => a.host.localeCompare(b.host) || b.ts - a.ts)
      .forEach((c) => groups.set(c.host, [...(groups.get(c.host) || []), c]));
    if (!groups.size) return `<div class="card cred-empty">${icon('search', 22)}<p>没有匹配「${esc(ui.q.trim())}」的帐号</p></div>`;
    return [...groups].map(([host, list]) => {
      const site = siteFor(host);
      const url = site ? site.url : SL.normUrl(host);
      const fav = site ? SiteIcon.html(site, 40) : UI.fav(url || 'https://' + host, 40);
      const link = url
        ? `<a class="cred-host" href="${esc(url)}" target="_blank" rel="noopener">${esc(host)}<span aria-hidden="true"> ↗</span></a>`
        : `<span class="cred-host">${esc(host)}</span>`;
      return `<article class="card cred-card">
        <header class="cred-head">${fav}
          <div class="cred-title"><strong>${esc(site ? site.name : host)}</strong>${link}</div>
          ${list.length > 1 ? `<span class="pill">${list.length} 个帐号</span>` : ''}
        </header>
        ${list.map(acctHtml).join('')}
      </article>`;
    }).join('');
  }

  // 一个帐号：帐号和密码各是一块带标签的读数框，操作按钮贴在框内右侧；密码遮罩用定长圆点，不暴露长度
  function acctHtml(c) {
    const shown = ui.shown.has(c.id);
    const id = esc(c.id);
    return `<div class="acct">
      <div class="acct-field"><span class="acct-text"><span class="acct-label">帐号</span><span class="acct-val" title="${esc(c.user)}">${esc(c.user)}</span></span>
        <button class="icon-btn" data-act="copyUser" data-id="${id}" aria-label="复制帐号" title="复制帐号">${icon('copy', 15)}</button></div>
      <div class="acct-field"><span class="acct-text"><span class="acct-label">密码</span><span class="acct-val acct-pass">${shown ? esc(c.pass) : '••••••••••'}</span></span>
        <button class="icon-btn" data-act="showPw" data-id="${id}" data-focus="show:${id}" aria-label="${shown ? '隐藏密码' : '显示密码'}" aria-pressed="${shown}" title="${shown ? '隐藏密码' : '显示密码'}">${icon(shown ? 'eyeOff' : 'eye', 15)}</button>
        <button class="icon-btn" data-act="copyPw" data-id="${id}" aria-label="复制密码" title="复制密码">${icon('copy', 15)}</button></div>
      <button class="icon-btn danger" data-act="delCred" data-id="${id}" aria-label="删除帐号" title="删除帐号">${icon('trash', 16)}</button>
    </div>`;
  }

  // ---------- 外观 ----------
  function lookView() {
    const m = data.settings.mode;
    const opt = (id, label) => `<button role="radio" aria-checked="${m === id}" tabindex="${m === id ? 0 : -1}" data-act="mode" data-id="${id}" data-focus="mode:${id}">${label}</button>`;
    const motion = data.settings.motion !== 'off';
    return `<div class="inner">${head('外观')}
      <section class="card">
        <div class="row"><div class="row-text"><span class="row-label" id="modeLabel">主题</span></div>
          <div class="seg" role="radiogroup" aria-labelledby="modeLabel">${opt('light', '浅色')}${opt('dark', '深色')}${opt('system', '跟随系统')}</div></div>
        <div class="row" data-switch-row><div class="row-text"><span class="row-label" id="motionLabel">界面动效</span>
          <span class="row-desc">关掉后提示条、弹窗不再有过渡动画</span></div>
          <button class="switch" role="switch" aria-checked="${motion}" aria-labelledby="motionLabel" data-act="motion" data-focus="motion"></button></div>
      </section></div>`;
  }

  // ---------- 数据与备份 ----------
  function dataView() {
    const p = ui.plan;
    const preview = p ? `<div class="preview" role="status">
        <p>将从 <strong>${esc(p.file)}</strong> 导入：</p>
        <ul>
          <li>新增 <strong>${p.add.cats}</strong> 个分类、<strong>${p.add.sites}</strong> 个网址、<strong>${p.add.creds}</strong> 个帐号</li>
          ${p.skip.sites || p.skip.creds ? `<li>跳过已经存在的 <strong>${p.skip.sites}</strong> 个网址、<strong>${p.skip.creds}</strong> 个帐号，不会覆盖</li>` : ''}
          ${p.bad ? `<li>忽略 <strong>${p.bad}</strong> 条格式不对的记录</li>` : ''}
        </ul>
        <div class="preview-acts"><button class="btn-primary" data-act="importGo"${p.add.cats + p.add.sites + p.add.creds ? '' : ' disabled'}>导入</button>
          <button class="btn" data-act="importCancel">取消</button></div></div>` : '';
    const err = ui.importErr ? `<div class="preview"><div class="note note-error" role="alert"><span>${esc(ui.importErr)}</span><button data-act="importPick">重新选择</button></div></div>` : '';
    return `<div class="inner">${head('数据与备份')}
      <section class="card">
        <div class="row"><div class="row-text"><span class="row-label">导出备份</span><span class="row-desc">分类、网址和自定义图标，存成一个 JSON 文件</span></div>
          <button class="btn" data-act="export">${icon('download', 15)}导出</button></div>
        <div class="row" data-switch-row><div class="row-text"><span class="row-label" id="expCredLabel">备份里包含帐号和密码</span>
          <span class="row-desc">密码会以明文写进文件，只在自己的设备之间迁移时打开</span></div>
          <button class="switch" role="switch" aria-checked="${ui.exportCreds}" aria-labelledby="expCredLabel" data-act="expCreds" data-focus="expCreds"></button></div>
      </section>
      <section class="card">
        <div class="row"><div class="row-text"><span class="row-label">从备份导入</span><span class="row-desc">先预览再导入；已有的网址和帐号不会被覆盖</span></div>
          <button class="btn" data-act="importPick" data-focus="importPick">${icon('upload', 15)}选择文件</button></div>
        ${preview}${err}
      </section></div>`;
  }

  // 本地日期 YYYYMMDD，用于备份文件名
  function stamp() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  // 导出备份文件
  function doExport() {
    const out = { app: 'startline', version: 1, exportedAt: new Date().toISOString(), cats: data.cats, sites: data.sites };
    if (ui.exportCreds) out.creds = data.creds;
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'startline-backup-' + stamp() + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast(ui.exportCreds ? '已导出，文件里有明文密码，注意保管' : '已导出');
  }

  // 当前数据的快照，用来发现预览期间别的入口改了数据
  function snap(d) {
    return JSON.stringify([d.cats, d.sites, d.creds]);
  }

  // 根据备份算出合并结果：分类按名称合并，网址按地址去重，帐号按「网站 + 帐号」去重；每个字段都校验
  function planImport(cur, inc, file) {
    const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const num = (v, dflt) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : dflt);
    const list = (v) => (Array.isArray(v) ? v : []);
    let bad = 0;

    const cats = [...cur.cats];
    const map = {};
    let addCats = 0;
    for (const c of list(inc.cats)) {
      const name = str(c && c.name, 40);
      if (!name) { bad++; continue; }
      let hit = cats.find((x) => x.name === name);
      if (!hit) { hit = { id: SL.uid(), name }; cats.push(hit); addCats++; }
      if (c.id != null) map[String(c.id)] = hit.id;
    }

    const sites = [...cur.sites];
    const urls = new Set(sites.map((s) => s.url));
    let addSites = 0;
    let skipSites = 0;
    for (const s of list(inc.sites)) {
      const url = SL.normUrl(s && typeof s.url === 'string' ? s.url : '');
      if (!url) { bad++; continue; }
      if (urls.has(url)) { skipSites++; continue; }
      urls.add(url);
      const site = {
        id: SL.uid(),
        name: str(s.name, 80) || SL.siteName('', url),
        url,
        cat: map[String(s.cat)] || cats[0].id,
        hits: num(s.hits, 0),
        ts: num(s.ts, Date.now()),
      };
      const ic = SiteIcon.clean(s.icon);
      if (ic) site.icon = ic;
      sites.push(site);
      addSites++;
    }

    const creds = [...cur.creds];
    const keys = new Set(creds.map((c) => c.host + '\n' + c.user));
    let addCreds = 0;
    let skipCreds = 0;
    for (const c of list(inc.creds)) {
      const host = SL.hostKey(str(c && c.host, 253));
      const user = str(c && c.user, 200);
      const pass = c && typeof c.pass === 'string' ? c.pass.slice(0, 1000) : '';
      if (!host || !/^[a-z0-9.:\-\[\]]+$/.test(host) || !user || !pass) { bad++; continue; }
      if (keys.has(host + '\n' + user)) { skipCreds++; continue; }
      keys.add(host + '\n' + user);
      creds.push({ id: SL.uid(), host, user, pass, ts: num(c.ts, Date.now()) });
      addCreds++;
    }

    return {
      file,
      base: snap(cur),
      patch: { cats, sites, creds },
      add: { cats: addCats, sites: addSites, creds: addCreds },
      skip: { sites: skipSites, creds: skipCreds },
      bad,
    };
  }

  // 选好文件后解析并生成预览
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    ui.plan = null;
    ui.importErr = '';
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20MB，不像是 Startline 的备份');
      let inc;
      try { inc = JSON.parse(await file.text()); } catch (err) { throw new Error('文件不是有效的 JSON'); }
      if (!inc || inc.app !== 'startline' || !Array.isArray(inc.sites)) throw new Error('这不是 Startline 导出的备份文件');
      ui.plan = planImport(await SL.load(), inc, file.name);
    } catch (err) {
      ui.importErr = err.message;
    }
    render();
  });

  // 确认导入：预览之后数据被改过就拒绝覆盖，要求重新预览
  async function importGo() {
    const p = ui.plan;
    if (!p) return;
    const now = await SL.load();
    if (snap(now) !== p.base) {
      ui.plan = null;
      ui.importErr = '预览之后数据被改动过，请重新选择文件预览';
      data = now;
      return render();
    }
    ui.plan = null;
    await commit(p.patch);
    UI.toast(`已导入 ${p.add.sites} 个网址、${p.add.cats} 个分类、${p.add.creds} 个帐号`);
  }

  // ---------- 弹窗：Esc 和遮罩关闭，焦点在弹窗内循环，关闭后还给触发按钮 ----------
  let dlg = null;
  function openDialog({ title, body, ok, danger, trigger, onOk }) {
    dlg = { trigger, onOk };
    $('#dialog').innerHTML = `<div class="dialog-scrim" data-act="dlgClose">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">
        <h2 id="dlgTitle">${esc(title)}</h2>
        <div class="dialog-body">${body}</div>
        <div class="dialog-foot"><button class="btn" data-act="dlgClose">取消</button>
          <button class="${danger ? 'btn btn-danger' : 'btn-primary'}" data-act="dlgOk">${esc(ok)}</button></div>
      </div></div>`;
    const first = $('#dialog select, #dialog input') || $('#dialog [data-act="dlgClose"].btn');
    first.focus();
  }

  // 关闭弹窗并把焦点还回去
  function closeDialog() {
    if (!dlg) return;
    const t = dlg.trigger;
    dlg = null;
    $('#dialog').innerHTML = '';
    const back = t && t.dataset && document.querySelector(`[data-act="${t.dataset.act}"][data-id="${CSS.escape(t.dataset.id || '')}"]`);
    if (back) back.focus();
  }

  document.addEventListener('keydown', (e) => {
    if (!dlg) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (e.key !== 'Tab') return;
    const items = [...document.querySelectorAll('#dialog button, #dialog select, #dialog input')];
    const i = items.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
    else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
  });

  // ---------- 操作分发 ----------
  const actions = {
    go: (id) => go(id),
    home: () => chrome.tabs.create({}),
    catAdd: addCat,
    catUp: (id) => moveCat(id, -1),
    catDown: (id) => moveCat(id, 1),
    catDel: (id, el) => delCat(id, el),
    fillOn: (h) => commit({ settings: { ...data.settings, noFill: (data.settings.noFill || []).filter((x) => x !== h) } }),
    showPw: (id) => { ui.shown.has(id) ? ui.shown.delete(id) : ui.shown.add(id); render(); },
    copyPw: (id) => {
      const c = data.creds.find((x) => x.id === id);
      if (c) navigator.clipboard.writeText(c.pass).then(() => UI.toast('已复制密码'), () => UI.toast('复制失败', { error: true }));
    },
    copyUser: (id) => {
      const c = data.creds.find((x) => x.id === id);
      if (c) navigator.clipboard.writeText(c.user).then(() => UI.toast('已复制帐号'), () => UI.toast('复制失败', { error: true }));
    },
    delCred: (id) => {
      const before = data.creds;
      const c = before.find((x) => x.id === id);
      commit({ creds: before.filter((x) => x.id !== id) });
      UI.toast('已删除 ' + (c ? c.user : '帐号'), { undo: () => commit({ creds: before }) });
    },
    mode: (id) => { commit({ settings: { ...data.settings, mode: id } }); UI.applyAppearance(data.settings); },
    motion: () => { commit({ settings: { ...data.settings, motion: data.settings.motion === 'off' ? 'on' : 'off' } }); UI.applyAppearance(data.settings); },
    expCreds: () => { ui.exportCreds = !ui.exportCreds; render(); },
    export: doExport,
    importPick: () => $('#importFile').click(),
    importGo,
    importCancel: () => { ui.plan = null; render(); },
    // 先执行（要读弹窗里的选择），再关闭弹窗
    dlgOk: () => { const run = dlg && dlg.onOk; if (run) run(); closeDialog(); },
    dlgClose: () => closeDialog(),
    reload: () => location.reload(),
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !actions[b.dataset.act]) return;
    // 遮罩上的关闭只响应直接点在遮罩上的点击
    if (b.classList.contains('dialog-scrim') && e.target !== b) return;
    if (b.tagName === 'A') e.preventDefault();
    actions[b.dataset.act](b.dataset.id, b);
  });

  $('#navSelect').addEventListener('change', (e) => go(e.target.value));

  // 输入：帐号筛选只重绘列表，地址里的 q 跟着更新
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'credQ') return;
    ui.q = e.target.value;
    $('#credList').innerHTML = credRows();
    const u = new URL(location.href);
    if (ui.q) u.searchParams.set('q', ui.q); else u.searchParams.delete('q');
    history.replaceState(null, '', u);
  });

  // 分类改名在失焦或回车时提交
  document.addEventListener('change', (e) => {
    if (e.target.dataset.cat) renameCat(e.target);
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.isComposing || e.keyCode === 229) return;
    if (t.id === 'catNew' && e.key === 'Enter') { e.preventDefault(); addCat(); }
    if (t.dataset && t.dataset.cat && e.key === 'Escape') {
      const cat = data.cats.find((c) => c.id === t.dataset.cat);
      if (cat) t.value = cat.name;
      t.blur();
    }
    if (t.id === 'credQ' && e.key === 'Escape' && t.value) { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); }
  });

  // 其他入口改了数据时同步过来
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !data) return;
    data = await SL.load();
    UI.applyAppearance(data.settings);
    render();
  });

  // 启动
  SL.load().then((d) => {
    data = d;
    ui.sec = route();
    UI.applyAppearance(d.settings);
    render();
  }, () => {
    $('#work').innerHTML = '<div class="note note-error" role="alert"><span>读取失败</span><button data-act="reload">重新打开</button></div>';
  });
})();
