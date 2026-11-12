// 新标签页（居中启动台）：时钟、搜索、分类标签、网址磁贴（拖拽排序、详情浮层）。外观和已存帐号的完整管理在设置页
(() => {
  const $ = (s) => document.querySelector(s);

  let data = null; // { cats, sites, creds, settings }
  // 纯界面状态：当前分类、搜索词、正在编辑的输入框、浮层等
  const ui = {
    sel: 'all', q: '',
    adding: null, addVal: '', addBad: false, // adding: 分类 id 或 'hero'
    renaming: null, renameVal: '',
    addingCat: false, catVal: '',
    pop: null, // { id, rect }
    draft: { name: null, url: null }, urlBad: false, // 详情浮层里正在编辑的名称 / 网址
    iconPicker: false, // 详情浮层里是否展开图标选择
    shown: new Set(), // 详情浮层里显示明文的帐号 id
  };

  const { esc, icon, fav } = UI;

  // 按小时给问候语
  function greetOf(d) {
    const h = d.getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  // 刷新顶部时间
  function tick() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    $('#greet').textContent = greetOf(d);
    $('#time').textContent = p(d.getHours()) + ':' + p(d.getMinutes());
    $('#date').textContent = d.getMonth() + 1 + '月' + d.getDate() + '日 周' + '日一二三四五六'[d.getDay()];
  }

  // 写入存储并立即重绘（存储变化回调会再同步一次）；写入失败时回到存储里的真实数据并给「重试」
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

  // ---------- 查询 ----------
  // 当前搜索词匹配到的网址
  function matched() {
    const k = ui.q.trim().toLowerCase();
    if (!k) return data.sites;
    return data.sites.filter((s) => s.name.toLowerCase().includes(k) || s.url.toLowerCase().includes(k));
  }

  // 某网址已存的帐号
  function credsOf(site) {
    return SL.credsFor(data.creds, SL.hostOf(site.url));
  }

  // ---------- 渲染 ----------
  // 重绘期间为 true：Chrome 会对被替换掉的输入框触发 focusout，这类失焦不能当成用户离开输入框
  let rendering = false;
  let nextFocus = null; // 重绘后应获得焦点的输入框（键盘切换时由 focusout 指定）

  // 整体重绘；重绘前后保持正在输入的输入框的焦点和光标
  function render() {
    const a = document.activeElement;
    const key = nextFocus || (a && a.dataset && a.dataset.focus);
    const sel = !nextFocus && key ? [a.selectionStart, a.selectionEnd] : null;
    nextFocus = null;

    rendering = true;
    try {
      renderNav();
      renderHeroAdd();
      const list = $('#list');
      list.removeAttribute('aria-busy');
      list.innerHTML = sitesView();
      renderPop();
    } finally {
      rendering = false;
    }
    UI.applyAppearance(data.settings);
    SiteIcon.check(data.sites.filter((s) => !s.icon).map((s) => s.url), () => {
      if (dragId) renderAfterDrag = true; else render();
    });

    const el = key && document.querySelector(`[data-focus="${key}"]`);
    if (el) {
      el.focus();
      if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* 部分输入类型不支持 */ }
    }
  }

  // 搜索框下的分类标签：全部 / 各分类 / 新建分类；空分类用次要色（.nil），不显示数量
  function renderNav() {
    const item = (id, name, n, drop) =>
      `<button class="nav-item${ui.sel === id ? ' on' : ''}${n ? '' : ' nil'}" data-act="sel" data-id="${esc(id)}" aria-pressed="${ui.sel === id}"${drop ? ` data-drop-cat="${esc(id)}"` : ''}>${esc(name)}</button>`;
    const cats = data.cats.map((c) => item(c.id, c.name, data.sites.filter((s) => s.cat === c.id).length, true)).join('');
    const addCat = ui.addingCat
      ? `<input data-focus="cat" data-input="cat" placeholder="分类名称" aria-label="分类名称" value="${esc(ui.catVal)}">`
      : `<button class="add-cat" data-act="addingCat" aria-label="新建分类" title="新建分类">${icon('plus', 15)}</button>`;
    $('#nav').innerHTML = item('all', '全部', data.sites.length) + cats + addCat;
  }

  // 顶部蓝色主按钮：添加网址（落到当前分类，全部视图下落到上次使用的分类）
  function renderHeroAdd() {
    $('#heroAdd').innerHTML = ui.adding === 'hero'
      ? `<input class="${ui.addBad ? 'bad' : ''}" data-focus="add-hero" data-input="add" placeholder="输入网址，回车添加" value="${esc(ui.addVal)}" spellcheck="false">`
      : `<button class="btn-primary" data-act="adding" data-id="hero">${icon('plus', 16)}<span>添加网址</span></button>`;
  }

  // 网址磁贴：图标在上，名称和主机在下；帐号标记和编辑按钮绝对定位在两个上角
  function card(s) {
    const n = credsOf(s).length;
    const keys = n ? `<span class="keymark" title="已存 ${n} 个帐号" aria-label="已存 ${n} 个帐号">${icon('key', 13)}${n > 1 ? n : ''}</span>` : '';
    return `<div class="card" draggable="true" data-site="${esc(s.id)}">
      <a class="card-main" href="${esc(s.url)}" target="_blank" rel="noopener" data-open="${esc(s.id)}" draggable="false">
        ${SiteIcon.html(s, 48)}
        <span class="card-text"><span class="card-name">${esc(s.name)}</span><span class="card-host">${esc(SL.displayHost(s.url))}</span></span>
      </a>
      ${keys}
      <button class="icon-btn" data-act="pop" data-id="${esc(s.id)}" aria-label="编辑" title="编辑">${icon('more', 18)}</button>
    </div>`;
  }

  // 分区末尾的添加入口：正在添加时是输入框，否则是虚线添加磁贴（只在单独查看空分类时出现）
  function addTile(catId) {
    if (ui.adding === catId) {
      return `<input class="${ui.addBad ? 'bad' : ''}" data-focus="add-${esc(catId)}" data-input="add" placeholder="example.com" value="${esc(ui.addVal)}" spellcheck="false">`;
    }
    return `<button class="add-tile" data-act="adding" data-id="${esc(catId)}">${icon('plus', 18)}<span>添加网址</span></button>`;
  }

  // 分区标题：分类名称（双击改名）；鼠标移到分区上出现“+”，空分类可删除（至少保留一个分类）
  function secHead(cat, count) {
    const title = ui.renaming === cat.id
      ? `<input data-focus="rename" data-input="rename" value="${esc(ui.renameVal)}">`
      : `<h2 class="sec-title" data-dbl="rename" data-id="${esc(cat.id)}" title="双击改名">${esc(cat.name)}</h2>`;
    const add = `<button class="icon-btn" data-act="adding" data-id="${esc(cat.id)}" aria-label="添加网址" title="添加网址">${icon('plus', 15)}</button>`;
    const del = count === 0 && data.cats.length > 1
      ? `<button class="icon-btn" data-act="delCat" data-id="${esc(cat.id)}" aria-label="删除分类" title="删除分类">${icon('close', 14)}</button>`
      : '';
    return `<div class="sec-head">${title}<span class="sec-acts">${add}${del}</span></div>`;
  }

  // 网址列表：“全部”按分类分组（不显示空分类）；选中某个分类时只显示该分类
  function sitesView() {
    const list = matched();
    const q = ui.q.trim();
    const cat = data.cats.find((c) => c.id === ui.sel);
    const scope = cat ? list.filter((s) => s.cat === cat.id) : list;
    if (q && !scope.length) return `<p class="empty">没有匹配的网址，回车用默认搜索引擎搜索</p>`;
    if (!data.sites.length && !cat) {
      return `<p class="empty">在任意网页上点工具栏的 Startline 图标，选好分类后收藏；也可以在网页上点右键选 <strong>收藏此页到 Startline</strong>，或点右上角的「添加网址」。</p>`;
    }
    const cats = cat ? [cat] : data.cats;
    return cats.map((c) => {
      const items = list.filter((s) => s.cat === c.id);
      const total = data.sites.filter((s) => s.cat === c.id).length;
      // “全部”里跳过空分类和没有搜索结果的分类（正在给它添加时除外）
      if (!cat && !items.length && ui.adding !== c.id) return '';
      const tail = q ? '' : ui.adding === c.id || (cat && !items.length) ? addTile(c.id) : '';
      return `<section class="sec" data-cat="${esc(c.id)}">${secHead(c, total)}<div class="tiles">${items.map(card).join('')}${tail}</div></section>`;
    }).join('');
  }

  // 帐号的操作按钮：显示 / 复制 / 删除
  function credActs(c) {
    return `<button class="icon-btn" data-act="showPw" data-id="${esc(c.id)}" aria-label="显示密码">${icon('eye', 16)}</button>
      <button class="icon-btn" data-act="copyPw" data-id="${esc(c.id)}" aria-label="复制密码">${icon('copy', 16)}</button>
      <button class="icon-btn" data-act="delCred" data-id="${esc(c.id)}" aria-label="删除帐号">${icon('trash', 16)}</button>`;
  }

  // 网址详情浮层：编辑名称和网址、改分类、管理帐号、移除
  function renderPop() {
    const site = ui.pop && data.sites.find((s) => s.id === ui.pop.id);
    if (!site) { $('#pop').innerHTML = ''; ui.pop = null; return; }
    const creds = credsOf(site);
    // 输入中的草稿优先，避免重绘（如其他页面改了数据）冲掉正在输入的内容
    const name = ui.draft.name ?? site.name;
    const url = ui.draft.url ?? site.url;
    $('#pop').innerHTML = `<div class="scrim" data-act="closePop"></div>
      <div class="pop" role="dialog" aria-label="${esc(site.name)}">
        <div class="pop-head"><button class="pop-icon${ui.iconPicker ? ' on' : ''}" data-act="iconToggle" title="更换图标" aria-label="更换图标" aria-expanded="${ui.iconPicker}">${SiteIcon.html(site, 40)}</button>
          <div class="pop-fields">
            <input class="field field-name" data-focus="siteName" data-input="siteName" value="${esc(name)}" placeholder="名称" aria-label="名称">
            <input class="field field-url${ui.urlBad ? ' bad' : ''}" data-focus="siteUrl" data-input="siteUrl" value="${esc(url)}" placeholder="https://" aria-label="网址" spellcheck="false">
          </div>
        </div>
        ${ui.iconPicker ? SiteIcon.picker(site) : ''}
        <div class="chips">${data.cats.map((c) =>
          `<button class="chip${c.id === site.cat ? ' on' : ''}" data-act="move" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>
        ${creds.length ? '<div class="pop-creds">' + creds.map((c) => `
          <div class="pop-cred">
            <div class="pop-cred-id"><span>${esc(c.user)}</span><span>${ui.shown.has(c.id) ? esc(c.pass) : '•'.repeat(Math.min(c.pass.length, 12))}</span></div>
            ${credActs(c)}
          </div>`).join('') + '</div>' : ''}
        <div class="pop-foot"><button class="link-danger" data-act="removeSite">移除网址</button>
          ${creds.length ? '<button class="link" data-act="manageCreds">管理帐号 <span aria-hidden="true">↗</span></button>' : ''}</div>
      </div>`;
    placePop();
  }

  // 浮层定位：先量实际高度，下方放不下就翻到按钮上方
  function placePop() {
    const el = $('#pop .pop');
    const r = ui.pop.rect;
    const h = el.offsetHeight;
    const below = r.bottom + 6;
    el.style.left = Math.max(8, Math.min(r.right - 320, innerWidth - 336)) + 'px';
    el.style.top = (below + h > innerHeight - 8 ? Math.max(8, r.top - 6 - h) : below) + 'px';
  }

  // ---------- 提示条 ----------
  const toast = (text, undo) => UI.toast(text, { undo });

  // 带撤销的删除：记住删除前的整组数据
  function removeWithUndo(key, id, text) {
    const before = data[key];
    commit({ [key]: before.filter((x) => x.id !== id) });
    toast(text, () => commit({ [key]: before }));
  }

  // ---------- 拖拽排序 ----------
  let dragId = null;         // 正在拖动的网址 id
  let renderAfterDrag = false; // 拖动期间数据有变化，结束后再重绘（拖动中重绘会替换掉被拖的元素）

  // 清除所有放置指示
  function clearDropMarks() {
    document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
  }

  // 根据指针位置算放置目标：在分区里找离指针最近的卡片，落在它左半边插到前面、右半边插到后面；
  // 分区里没有其他网址时追加到该分类；落在侧栏分类上则移到该分类末尾
  function dropTarget(e) {
    const sec = e.target.closest('.sec[data-cat]');
    if (sec) {
      let best = null;
      let bestDist = Infinity;
      for (const c of sec.querySelectorAll('.card[data-site]')) {
        if (c.dataset.site === dragId) continue;
        const r = c.getBoundingClientRect();
        const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (d < bestDist) { bestDist = d; best = { c, r }; }
      }
      if (!best) return { el: sec, cat: sec.dataset.cat };
      return { el: best.c, siteId: best.c.dataset.site, after: e.clientX > best.r.left + best.r.width / 2 };
    }
    const nav = e.target.closest('[data-drop-cat]');
    if (nav) return { el: nav, cat: nav.dataset.dropCat };
    return null;
  }

  // 把网址放到目标位置：数组顺序即显示顺序，跨分类时同时改分类
  function dropSite(id, t) {
    const site = data.sites.find((s) => s.id === id);
    if (!site) return;
    const rest = data.sites.filter((s) => s.id !== id);
    let cat;
    let idx;
    if (t.siteId) {
      const target = rest.find((s) => s.id === t.siteId);
      cat = target.cat;
      idx = rest.indexOf(target) + (t.after ? 1 : 0);
    } else {
      cat = t.cat;
      // 追加到该分类最后一个网址之后；分类为空时放到最后
      const last = rest.map((s) => s.cat).lastIndexOf(cat);
      idx = last === -1 ? rest.length : last + 1;
    }
    rest.splice(idx, 0, { ...site, cat });
    const moved = cat !== site.cat;
    commit(moved ? { sites: rest, settings: { ...data.settings, lastCat: cat } } : { sites: rest });
    if (moved) toast('已移到「' + data.cats.find((c) => c.id === cat).name + '」');
  }

  // 结束拖动并补上拖动期间被推迟的重绘
  function endDrag() {
    if (!dragId) return;
    dragId = null;
    clearDropMarks();
    document.querySelectorAll('.card.dragging').forEach((el) => el.classList.remove('dragging'));
    if (renderAfterDrag) { renderAfterDrag = false; render(); }
  }

  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest && e.target.closest('.card[data-site]');
    if (!card) return;
    dragId = card.dataset.site;
    ui.pop = null;
    const site = data.sites.find((s) => s.id === dragId);
    e.dataTransfer.effectAllowed = 'move';
    // 同时带上网址，拖到地址栏或其他应用也能用
    e.dataTransfer.setData('text/uri-list', site.url);
    e.dataTransfer.setData('text/plain', site.url);
    // 延后一帧再变淡，否则拖动时的预览图也会是淡的
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  document.addEventListener('dragover', (e) => {
    if (!dragId) return;
    const t = dropTarget(e);
    clearDropMarks();
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    t.el.classList.add(t.siteId ? (t.after ? 'drop-after' : 'drop-before') : 'drop-into');
  });

  document.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const t = dropTarget(e);
    const id = dragId;
    endDrag();
    if (t) dropSite(id, t);
  });

  document.addEventListener('dragend', endDrag);

  // ---------- 操作 ----------
  // 提交添加网址
  async function submitAdd() {
    const url = SL.normUrl(ui.addVal);
    if (!url) { ui.addBad = true; render(); return; }
    const catId = ui.adding === 'hero' ? (data.cats.some((c) => c.id === ui.sel) ? ui.sel : null) : ui.adding;
    ui.adding = null; ui.addVal = ''; ui.addBad = false;
    const r = await SL.addSite(url, '', catId);
    if (r.existed) toast('已经收藏过了');
    data = await SL.load();
    render();
  }

  // 打开网址：累计打开次数（链接本身负责开新标签）
  function countOpen(id) {
    commit({ sites: data.sites.map((s) => (s.id === id ? { ...s, hits: (s.hits || 0) + 1 } : s)) });
  }

  // 详情浮层对应的网址
  function popSite() {
    return ui.pop && data.sites.find((s) => s.id === ui.pop.id);
  }

  // 改图标时沿用当前颜色，没有就用该网址的默认色
  function currentIconColor() {
    const site = popSite();
    return SiteIcon.colorOf(site && site.icon, site ? site.url : '');
  }

  // 设置某个网址的图标；icon 为 null 表示恢复自动
  function setIconFor(id, icon) {
    commit({
      sites: data.sites.map((s) => {
        if (s.id !== id) return s;
        const { icon: _old, ...rest } = s;
        return icon ? { ...rest, icon } : rest;
      }),
    });
  }

  // 设置详情浮层里这个网址的图标
  function setIcon(icon) {
    if (ui.pop) setIconFor(ui.pop.id, icon);
  }

  // 上传图标：选好文件后缩放保存
  $('#iconFile').addEventListener('change', async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file || !input.dataset.site) return;
    try {
      setIconFor(input.dataset.site, { kind: 'image', data: await SiteIcon.fromFile(file) });
    } catch (err) {
      toast(err.message);
    }
  });

  // 点击操作分发
  const actions = {
    sel: (id) => { ui.sel = id; ui.pop = null; render(); },
    settings: () => chrome.runtime.openOptionsPage(),
    manageCreds: () => {
      const site = popSite();
      if (site) chrome.tabs.create({ url: chrome.runtime.getURL('options.html?q=' + encodeURIComponent(SL.hostOf(site.url)) + '#creds') });
    },
    adding: (id) => { ui.adding = id; ui.addVal = ''; ui.addBad = false; render(); focusInput(); },
    addingCat: () => { ui.addingCat = true; ui.catVal = ''; render(); focusInput(); },
    delCat: (id) => {
      const cats = data.cats.filter((c) => c.id !== id);
      if (ui.sel === id) ui.sel = 'all';
      commit({ cats });
    },
    pop: (id, el) => {
      ui.pop = { id, rect: el.getBoundingClientRect() };
      ui.draft = { name: null, url: null };
      ui.urlBad = false;
      ui.iconPicker = false;
      render();
    },
    iconToggle: () => { ui.iconPicker = !ui.iconPicker; render(); },
    iconAuto: () => setIcon(null),
    iconLetter: () => setIcon({ kind: 'letter', color: currentIconColor() }),
    iconGlyph: (name) => setIcon({ kind: 'glyph', name, color: currentIconColor() }),
    iconColor: (color) => {
      const ic = popSite() && popSite().icon;
      if (ic && (ic.kind === 'glyph' || ic.kind === 'letter')) setIcon({ ...ic, color });
    },
    iconUpload: () => {
      // 文件框放在浮层外面，选文件期间浮层重绘也不会把它冲掉
      const input = $('#iconFile');
      input.dataset.site = ui.pop.id;
      input.value = '';
      input.click();
    },
    closePop: () => { ui.pop = null; render(); },
    move: (catId) => {
      const id = ui.pop.id;
      commit({ sites: data.sites.map((s) => (s.id === id ? { ...s, cat: catId } : s)), settings: { ...data.settings, lastCat: catId } });
    },
    removeSite: () => { const id = ui.pop.id; ui.pop = null; removeWithUndo('sites', id, '已移除网址'); },
    showPw: (id) => { ui.shown.has(id) ? ui.shown.delete(id) : ui.shown.add(id); render(); },
    copyPw: (id) => {
      const c = data.creds.find((x) => x.id === id);
      if (c) navigator.clipboard.writeText(c.pass).then(() => toast('已复制密码'), () => toast('复制失败'));
    },
    delCred: (id) => removeWithUndo('creds', id, '已删除帐号'),
  };

  // 让刚出现的输入框获得焦点
  function focusInput() {
    const el = document.querySelector('[data-input="add"], [data-input="cat"], [data-input="rename"]');
    if (el) el.focus();
  }

  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { countOpen(open.dataset.open); return; }
    const b = e.target.closest('[data-act]');
    if (b && actions[b.dataset.act]) actions[b.dataset.act](b.dataset.id, b);
  });

  // 中键打开也计数
  document.addEventListener('auxclick', (e) => {
    const open = e.button === 1 && e.target.closest('[data-open]');
    if (open) countOpen(open.dataset.open);
  });

  document.addEventListener('dblclick', (e) => {
    const t = e.target.closest('[data-dbl="rename"]');
    if (!t) return;
    const cat = data.cats.find((c) => c.id === t.dataset.id);
    ui.renaming = cat.id; ui.renameVal = cat.name;
    render(); focusInput();
    document.querySelector('[data-input="rename"]').select();
  });

  // 各编辑输入框的输入、回车、Esc、失焦
  document.addEventListener('input', (e) => {
    const k = e.target.dataset.input;
    if (k === 'add') { ui.addVal = e.target.value; if (ui.addBad) { ui.addBad = false; e.target.classList.remove('bad'); } }
    if (k === 'cat') ui.catVal = e.target.value;
    if (k === 'rename') ui.renameVal = e.target.value;
    if (k === 'siteName') ui.draft.name = e.target.value;
    if (k === 'siteUrl') { ui.draft.url = e.target.value; if (ui.urlBad) { ui.urlBad = false; e.target.classList.remove('bad'); } }
  });

  // 保存网址修改：回车时网址不合法就标红留在原处，失焦时则放弃修改并提示
  function finishUrl(ok, el, blur, popId) {
    const id = popId || (ui.pop && ui.pop.id);
    const site = id && data.sites.find((s) => s.id === id);
    if (!site) return;
    const revert = (msg) => {
      ui.draft.url = null; ui.urlBad = false;
      if (msg) toast(msg);
      render();
    };
    if (!ok) return revert();
    // 没写协议时沿用原来的协议，避免把内网 http 地址改成 https
    const url = SL.normUrl(el.value, new URL(site.url).protocol.replace(':', ''));
    if (url === site.url) return revert();
    const problem = !url ? '网址无效' : data.sites.some((s) => s.id !== id && s.url === url) ? '这个网址已经收藏过了' : '';
    if (problem) {
      if (blur) return revert(problem + '，未保存');
      ui.urlBad = true;
      toast(problem);
      return render();
    }
    ui.draft.url = null; ui.urlBad = false;
    // 改对之后收起之前的错误提示
    UI.hideToast();
    commit({ sites: data.sites.map((s) => (s.id === id ? { ...s, url } : s)) });
  }

  // 结束某个编辑：ok 为 true 时保存；blur 表示由失焦触发；popId 是失焦当时浮层对应的网址
  function finish(k, ok, el, blur, popId) {
    if (k === 'siteUrl') return finishUrl(ok, el, blur, popId);
    if (k === 'add') { if (ok) return submitAdd(); ui.adding = null; ui.addVal = ''; ui.addBad = false; render(); }
    if (k === 'cat') {
      const name = ui.catVal.trim();
      ui.addingCat = false; ui.catVal = '';
      if (ok && name) commit({ cats: [...data.cats, { id: SL.uid(), name }] }); else render();
    }
    if (k === 'rename') {
      const name = ui.renameVal.trim(), id = ui.renaming;
      ui.renaming = null;
      if (ok && name) commit({ cats: data.cats.map((c) => (c.id === id ? { ...c, name } : c)) }); else render();
    }
    if (k === 'siteName') {
      const name = el.value.trim(), id = popId || (ui.pop && ui.pop.id);
      const site = id && data.sites.find((s) => s.id === id);
      ui.draft.name = null;
      // 清空名称视为放弃修改
      if (ok && name && site && name !== site.name) commit({ sites: data.sites.map((s) => (s.id === id ? { ...s, name } : s)) });
      else render();
    }
  }

  document.addEventListener('keydown', (e) => {
    const k = e.target.dataset && e.target.dataset.input;
    if (k && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(k, true, e.target); return; }
    if (k && e.key === 'Escape') { finish(k, false, e.target); return; }
    if (e.key === 'Escape' && ui.pop) { ui.pop = null; render(); return; }
    // 按 / 聚焦搜索
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
  });

  // 鼠标按下引起的失焦要等这次点击处理完再保存：保存会重绘，若立刻重绘，
  // 按下时的目标（分类标签、另一个输入框、遮罩）会被替换，这次点击就丢了
  let pressing = false;
  let pendingBlur = null;
  document.addEventListener('pointerdown', () => { pressing = true; }, true);
  const release = () => setTimeout(() => {
    pressing = false;
    const run = pendingBlur;
    pendingBlur = null;
    if (run) run();
  }, 0);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);

  document.addEventListener('focusout', (e) => {
    const k = e.target.dataset && e.target.dataset.input;
    if (!k || rendering || !e.target.isConnected) return;
    // 失焦时：添加框为空就收起；分类、改名、网址名称和网址直接保存
    if (k === 'add' && ui.addVal.trim()) return;
    const ok = k !== 'add';
    // 记下失焦当时的值和浮层，延后执行时它们可能已经变了
    const snap = { value: e.target.value };
    const popId = ui.pop && ui.pop.id;
    const run = () => finish(k, ok, snap, true, popId);
    if (pressing) { pendingBlur = run; return; }
    // 键盘（Tab）切换：重绘后把焦点交给新渲染出来的目标输入框
    const to = e.relatedTarget;
    nextFocus = (to && to.dataset && to.dataset.focus) || null;
    run();
  });

  // 搜索：输入即过滤；回车打开第一个匹配，否则当作网址打开或用默认搜索引擎搜
  const q = $('#q');
  q.addEventListener('input', () => { ui.q = q.value; render(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { q.value = ''; ui.q = ''; render(); q.blur(); return; }
    if (e.key !== 'Enter' || e.isComposing) return;
    const text = q.value.trim();
    if (!text) return;
    const first = matched()[0];
    if (first) { countOpen(first.id); window.open(first.url, '_blank', 'noopener'); return; }
    const url = SL.normUrl(text);
    if (url) window.open(url, '_blank', 'noopener');
    else chrome.search.query({ text, disposition: 'NEW_TAB' });
  });

  // 其他页面（后台一键收藏、另一个新标签页）改了数据时同步过来
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    data = await SL.load();
    if (dragId) { renderAfterDrag = true; return; }
    render();
  });

  // 启动
  SL.load().then((d) => {
    data = d;
    tick();
    setInterval(tick, 20000);
    render();
  });
})();
