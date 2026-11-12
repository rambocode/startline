// 内容脚本：网页登录时自动收集帐号密码，再次打开时自动填充；多个帐号时在帐号框下给出选择
(() => {
  if (window.__startlineLoaded) return;
  window.__startlineLoaded = true;

  const USER_HINT = /user|login|email|mail|account|acct|phone|mobile|tel|名|帐|账|手机|邮箱/i;
  const LONE_USER_HINT = /user|login|account|identifier|帐号|账号|用户名/i;
  const SKIP_HINT = /search|captcha|code|otp|verify|token|coupon|搜索|验证码/i;
  const SUBMIT_TEXT = /登录|登入|登陆|sign\s*in|log\s*in|login|继续|下一步|next|continue|submit|确定|提交/i;

  // 所有监听器共用一个信号：扩展被重载、上下文失效时一次注销
  const life = new AbortController();
  const listen = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal: life.signal });

  let saved = [];        // 当前网站已存帐号（新的在前）
  let off = false;       // 用户在 Popup 里关掉了本站的帐号保存与填充
  let look = { mode: 'light', motion: 'on' }; // 页内浮层跟随扩展的外观设置
  let pendingUser = '';  // 分步登录时上一步填的帐号
  let lastSent = '';     // 防止同一次提交被多个事件重复上报
  const handled = new WeakSet(); // 已做过自动填充的输入框

  // 扩展被重载或更新后，旧内容脚本还在跑但已和后台失联
  function alive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  // 请求后台；上下文失效时整体自毁，不再报错
  function ask(msg) {
    if (!alive()) { dispose(); return Promise.resolve(null); }
    try {
      return chrome.runtime.sendMessage(msg).catch(() => { if (!alive()) dispose(); return null; });
    } catch (e) {
      dispose();
      return Promise.resolve(null);
    }
  }

  // 输入框是否可见可用
  function visible(el) {
    if (el.disabled || !(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }

  // 拼出用于判断字段用途的文本
  function hintOf(el) {
    return [el.name, el.id, el.autocomplete, el.placeholder, el.getAttribute('aria-label')].join(' ');
  }

  // 文本类输入框（可能是帐号框）
  function isTextLike(el) {
    return el.tagName === 'INPUT' && ['text', 'email', 'tel'].includes(el.type) && !el.readOnly && !SKIP_HINT.test(hintOf(el));
  }

  // 页面上可见的密码框
  function passwordFields() {
    return [...document.querySelectorAll('input[type="password"]')].filter(visible);
  }

  // 找密码框对应的帐号框：优先标注为 username/email 的，其次取密码框之前最近的一个
  function userFieldFor(pw) {
    const pick = (scope) => {
      const list = [...scope.querySelectorAll('input')].filter(
        (el) => isTextLike(el) && visible(el) && el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      const tagged = list.find((el) => /\b(username|email)\b/.test(el.autocomplete));
      if (tagged) return tagged;
      const before = list.slice().reverse();
      return before.find((el) => USER_HINT.test(hintOf(el))) || before[0] || null;
    };
    // 有些网站把帐号框放在 form 外面，form 内找不到时再全页找
    return (pw.form && pick(pw.form)) || pick(document);
  }

  // 分步登录第一步的帐号框（页面上还没有密码框），只认明确标注的字段，避免误填普通邮箱框
  function loneUserField() {
    return [...document.querySelectorAll('input')].find(
      (el) => isTextLike(el) && visible(el) && (/\busername\b/.test(el.autocomplete) || LONE_USER_HINT.test(el.name + ' ' + el.id))
    ) || null;
  }

  // 是否“像提交”的按钮
  function isSubmitLike(b) {
    if (b.matches('input[type="submit"]')) return true;
    if (b.tagName === 'BUTTON' && b.type === 'submit' && b.form) return true;
    const t = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
    return t.length > 0 && t.length <= 20 && SUBMIT_TEXT.test(t);
  }

  // 登录提交时收集帐号密码；只有帐号框时记住帐号，供下一步密码页使用
  function capture() {
    if (off) return;
    const pws = passwordFields().filter((p) => p.value);
    if (!pws.length) {
      const u = loneUserField();
      if (u && u.value.trim()) {
        pendingUser = u.value.trim();
        ask({ type: 'rememberUser', user: pendingUser });
      }
      return;
    }
    // 注册 / 改密页取新密码框，否则取第一个有值的密码框
    const pw = pws.find((p) => p.autocomplete === 'new-password') || pws[0];
    const uField = userFieldFor(pw);
    const user = (uField && uField.value.trim()) || pendingUser;
    if (!user) return;
    const key = user + '\n' + pw.value;
    if (key === lastSent) return;
    lastSent = key;
    ask({ type: 'saveCred', user, pass: pw.value }).then((r) => {
      if (!r || !r.id) return;
      refresh();
      const text = r.status === 'updated' ? '已更新 ' + user + ' 的密码' : '已保存 ' + user;
      toast(text, () => ask({ type: 'undoCred', id: r.id, prev: r.prev }).then(refresh));
    });
  }

  // 只读不拦：这三个监听都不阻止网页自己的处理
  listen(document, 'submit', capture, { capture: true });
  listen(document, 'click', (e) => {
    if (!e.isTrusted) return;
    const b = e.target.closest && e.target.closest('button, input[type="submit"], input[type="button"], [role="button"], a');
    if (b && isSubmitLike(b)) capture();
  }, { capture: true });
  listen(document, 'keydown', (e) => {
    if (e.isTrusted && e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') capture();
  }, { capture: true });

  // 以框架能感知的方式写入输入框，并加浅蓝底提示是自动填充的
  function setValue(el, v) {
    if (el.value === v) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const prev = el.style.getPropertyValue('background-color');
    const prevPri = el.style.getPropertyPriority('background-color');
    el.style.setProperty('background-color', '#e8f0fe', 'important');
    // 用户自己改动后恢复原样
    const restore = (e) => {
      if (!e.isTrusted) return;
      el.style.setProperty('background-color', prev, prevPri);
      el.removeEventListener('input', restore);
    };
    el.addEventListener('input', restore);
  }

  // 用一个帐号填好帐号框和密码框
  function fill(cred, pw, u) {
    if (u) setValue(u, cred.user);
    if (pw) setValue(pw, cred.pass);
  }

  // 自动填充：每个密码框只处理一次；注册 / 改密表单不填
  function autoFill() {
    if (off || !saved.length) return;
    const pws = passwordFields();
    for (const pw of pws) {
      if (handled.has(pw)) continue;
      handled.add(pw);
      if (pw.autocomplete === 'new-password') continue;
      if (pw.form && pw.form.querySelectorAll('input[type="password"]').length > 1) continue;
      const u = userFieldFor(pw);
      bindPicker(u || pw, pw, u);
      if (pw.value) continue;
      const typed = u && u.value.trim();
      const c = typed
        ? saved.find((x) => x.user === typed)
        : saved.find((x) => x.user === pendingUser) || saved[0];
      if (c) fill(c, pw, u);
    }
    if (!pws.length) {
      const u = loneUserField();
      if (u && !handled.has(u)) {
        handled.add(u);
        bindPicker(u, null, u);
        if (!u.value) setValue(u, saved[0].user);
      }
    }
  }

  // ---------- 页面内 UI：closed Shadow DOM，挂在 <html> 下，不受网页样式影响也不影响网页 ----------
  const CSS_TEXT = `
    :host { all: initial !important; display: block !important; position: fixed !important; top: 0 !important; left: 0 !important;
      width: 0 !important; height: 0 !important; overflow: visible !important; contain: none !important; }
    .root { --brand: #2563eb; --ink: #172033; --muted: #687185; --line: #e5e8ef; --surface: #fff; --soft: color-mix(in oklch, #2563eb 8%, white);
      --shadow: 0 8px 28px rgba(27, 36, 57, .14), 0 2px 6px rgba(27, 36, 57, .05);
      font: 13px/1.45 -apple-system, "SF Pro Text", "PingFang SC", "Noto Sans SC", system-ui, sans-serif; color: var(--ink); text-align: start; }
    .root.dark { --brand: color-mix(in oklch, #2563eb 72%, white); --ink: #f4f5f8; --muted: #b7bdc9; --line: #363a45; --surface: #252830;
      --soft: color-mix(in oklch, #2563eb 22%, #14161b); --shadow: 0 10px 32px rgba(0, 0, 0, .4); }
    .root *, .root *::before, .root *::after { box-sizing: border-box; }
    button { all: unset; cursor: pointer; }
    .toast { position: fixed; z-index: 2147483647; top: 14px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
      width: max-content; max-width: min(440px, calc(100vw - 24px)); min-height: 40px; padding: 6px 8px 6px 14px; border-radius: 12px;
      background: var(--surface); box-shadow: 0 0 0 1px var(--line), var(--shadow); animation: in .18s cubic-bezier(.2, .8, .2, 1); }
    .toast span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mark { flex: none; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 6px; background: var(--brand); }
    .mark i { width: 6px; height: 6px; border-radius: 2px; background: var(--surface); }
    .toast button { flex: none; padding: 5px 8px; border-radius: 8px; color: var(--brand); font-weight: 600; }
    .toast button:hover { background: var(--soft); }
    .toast button:focus-visible, .menu [role="option"]:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
    .menu { position: fixed; z-index: 2147483646; min-width: 220px; padding: 4px; border-radius: 12px; background: var(--surface);
      box-shadow: 0 0 0 1px var(--line), var(--shadow); animation: in .14s cubic-bezier(.2, .8, .2, 1); }
    .menu [role="option"] { display: block; padding: 8px 10px; border-radius: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .menu [role="option"]:hover, .menu [role="option"].on { background: var(--soft); color: var(--brand); }
    .by { display: flex; align-items: center; gap: 6px; padding: 6px 10px 4px; margin-top: 4px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11.5px; }
    .by .mark { width: 12px; height: 12px; border-radius: 4px; }
    .by .mark i { width: 4px; height: 4px; border-radius: 1px; }
    @keyframes in { from { opacity: 0; translate: 0 -4px; } }
    .still * { animation: none !important; }
    @media (prefers-reduced-motion: reduce) { .root * { animation: none !important; } }
    @media print { .root { display: none !important; } }
  `;
  let host = null;
  let root = null;
  let box = null;

  // 首次需要时才创建并挂载；挂到 <html> 下，网页软导航替换 body 时还在。
  // 锚点在原生模态 <dialog> 里时挂进那个 dialog，否则任何 z-index 都盖不过它
  function mount(anchor) {
    if (!alive()) { dispose(); return false; }
    if (!host) {
      host = document.createElement('startline-overlay');
      root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = CSS_TEXT;
      box = document.createElement('div');
      root.append(style, box);
      // 浮层里的按键不冒泡到网页，避免触发网页快捷键
      for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, (e) => e.stopPropagation());
    }
    const dlg = anchor && anchor.closest && anchor.closest('dialog');
    const parent = dlg && dlg.matches(':modal') ? dlg : document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
    const dark = look.mode === 'dark' || (look.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    box.className = 'root' + (dark ? ' dark' : '') + (look.motion === 'off' ? ' still' : '');
    return true;
  }

  // 浮层显示期间主动检查上下文：可见时每秒一次，隐藏时每 5 秒一次；浮层都收起后停止。
  // 必须在浮层元素建好之后调用，否则这里看到的是「没有浮层」，不会开始检查
  let aliveTimer = 0;
  function watchAlive() {
    clearTimeout(aliveTimer);
    if (!toastEl && !menuEl) return;
    aliveTimer = setTimeout(() => {
      if (!alive()) dispose(); else watchAlive();
    }, document.hidden ? 5000 : 1000);
  }

  // 统一的小图标：品牌色方块，不依赖扩展资源（扩展刚被重载时取不到图片）
  function markEl() {
    const m = document.createElement('span');
    m.className = 'mark';
    m.appendChild(document.createElement('i'));
    return m;
  }

  // ---------- 顶部提示条：同一时间一条，新的原地替换；悬停或聚焦时暂停，离开后至少再留 1.5 秒 ----------
  let toastEl = null;
  let toastTimer = 0;
  let toastDeadline = 0;

  // 收起提示条
  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl) { toastEl.remove(); toastEl = null; }
    watchAlive();
  }

  // ms 毫秒后收起
  function scheduleToast(ms) {
    clearTimeout(toastTimer);
    toastDeadline = Date.now() + ms;
    toastTimer = setTimeout(hideToast, ms);
  }

  // 显示提示，可带「撤销」。子 frame 里只显示带撤销的（登录框常在 iframe 里）
  function toast(text, undo) {
    if (window !== window.top && !undo) return;
    if (!mount()) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.addEventListener('pointerenter', () => clearTimeout(toastTimer));
      toastEl.addEventListener('focusin', () => clearTimeout(toastTimer));
      const resume = () => scheduleToast(Math.max(toastDeadline - Date.now(), 1500));
      toastEl.addEventListener('pointerleave', resume);
      toastEl.addEventListener('focusout', resume);
      box.appendChild(toastEl);
    }
    toastEl.replaceChildren(markEl(), Object.assign(document.createElement('span'), { textContent: text }));
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '撤销';
      // 只接受用户真实的点击（键盘回车 / 空格触发的 click 也是可信的），网页脚本伪造的不算
      b.addEventListener('click', (e) => {
        if (!e.isTrusted) return;
        hideToast();
        undo();
      });
      toastEl.appendChild(b);
    }
    scheduleToast(undo ? 6500 : 3500);
    watchAlive();
  }

  // ---------- 帐号选择：多帐号时帐号框获得焦点就在下方列出，↑↓ 选择、回车填入、Esc 收起 ----------
  let menuEl = null;
  let menuItems = [];
  let active = -1;
  let menuFor = null; // { anchor, pw, u }

  // 给帐号框绑定一次焦点、失焦和键盘处理
  function bindPicker(anchor, pw, u) {
    listen(anchor, 'focus', () => { if (!off && saved.length > 1) showPicker(anchor, pw, u); });
    listen(anchor, 'blur', () => setTimeout(hidePicker, 150));
    // 只在菜单打开时拦截自己用到的键；输入法选词中一律让行
    listen(anchor, 'keydown', (e) => {
      if (!menuEl || menuFor.anchor !== anchor || !e.isTrusted || e.isComposing || e.keyCode === 229) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + menuItems.length) % menuItems.length);
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        e.stopPropagation();
        pick(saved[active]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hidePicker();
      }
    });
  }

  // 高亮第 i 个帐号
  function setActive(i) {
    active = i;
    menuItems.forEach((el, k) => el.classList.toggle('on', k === i));
  }

  // 用选中的帐号填表并收起
  function pick(c) {
    const { pw, u } = menuFor;
    fill(c, pw || passwordFields()[0] || null, u);
    hidePicker();
  }

  // 在输入框正下方显示帐号列表；下方放不下时翻到上方
  function showPicker(anchor, pw, u) {
    if (!mount(anchor)) return;
    hidePicker();
    menuFor = { anchor, pw, u };
    active = -1;
    menuEl = document.createElement('div');
    menuEl.className = 'menu';
    menuEl.setAttribute('role', 'listbox');
    menuEl.setAttribute('aria-label', 'Startline 已存帐号');
    menuItems = saved.map((c) => {
      const b = document.createElement('div');
      b.setAttribute('role', 'option');
      b.textContent = c.user;
      // 用 mousedown 并阻止默认，避免输入框先失焦把菜单关掉
      b.addEventListener('mousedown', (e) => {
        if (!e.isTrusted) return;
        e.preventDefault();
        pick(c);
      });
      menuEl.appendChild(b);
      return b;
    });
    const by = document.createElement('div');
    by.className = 'by';
    by.append(markEl(), 'Startline');
    menuEl.appendChild(by);
    box.appendChild(menuEl);
    const r = anchor.getBoundingClientRect();
    const vv = window.visualViewport;
    const vw = vv ? vv.width : innerWidth;
    const vh = vv ? vv.height : innerHeight;
    const w = Math.min(Math.max(220, r.width), vw - 16);
    const h = menuEl.offsetHeight;
    menuEl.style.width = w + 'px';
    menuEl.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
    menuEl.style.top = (r.bottom + 4 + h > vh - 8 && r.top - 4 - h > 8 ? r.top - 4 - h : r.bottom + 4) + 'px';
    watchAlive();
  }

  // 收起帐号列表
  function hidePicker() {
    if (menuEl) { menuEl.remove(); menuEl = null; menuItems = []; menuFor = null; }
    watchAlive();
  }
  listen(window, 'scroll', hidePicker, { capture: true, passive: true });

  // 重新拉取本站帐号和外观
  function refresh() {
    return ask({ type: 'getCreds' }).then((r) => {
      if (!r) return;
      saved = r.creds || [];
      off = !!r.off;
      look = { mode: r.mode || 'light', motion: r.motion || 'on' };
      pendingUser = r.pending || pendingUser;
      if (off) hidePicker();
    });
  }

  // 后台的提示（右键收藏后）；Popup 改了本站开关后让各 frame 重新拉取
  function onMessage(msg) {
    if (!msg) return;
    if (msg.type === 'toast') toast(msg.text);
    if (msg.type === 'refresh') refresh().then(autoFill);
  }
  chrome.runtime.onMessage.addListener(onMessage);

  // 监听单页应用后续出现的登录框
  let mutateTimer = 0;
  const observer = new MutationObserver(() => {
    if (off || !saved.length) return;
    clearTimeout(mutateTimer);
    mutateTimer = setTimeout(autoFill, 300);
  });

  // ---------- 生命周期 ----------
  // 上下文失效时整体自毁：注销监听、计时器、观察器，移除节点；新注入的脚本可以重新接手
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    life.abort();
    observer.disconnect();
    clearTimeout(mutateTimer);
    clearTimeout(toastTimer);
    clearTimeout(aliveTimer);
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (e) { /* 上下文已失效 */ }
    if (host) host.remove();
    host = root = box = toastEl = menuEl = null;
    window.__startlineLoaded = false;
  }

  // 进入往返缓存前收起菜单；从缓存回来先确认上下文还在，再重新拉取帐号
  listen(window, 'pagehide', hidePicker);
  listen(window, 'pageshow', (e) => {
    if (!e.persisted) return;
    if (!alive()) dispose(); else refresh();
  });
  listen(document, 'visibilitychange', () => { if (!alive()) dispose(); });

  // 启动：拿到帐号后填充，并开始观察页面变化
  refresh().then(() => {
    if (disposed) return;
    autoFill();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
})();
