// 扩展自有页面（新标签页、Popup、设置页）共用的界面工具：转义、图标、外观、提示条、单选组键盘、整行开关
const UI = (() => {
  // 24×24 线条图标路径
  const ICONS = {
    plus: 'M12 5v14M5 12h14',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    key: 'M8 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11 12l9-9M17 6l3 3M14 9l2 2',
    eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zm10 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    copy: 'M9 9h10v11H9zM5 15V4h10',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
    close: 'M6 6l12 12M18 6 6 18',
    folder: 'M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    out: 'M14 5h5v5M19 5l-8 8M17 14v5H5V7h5',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.2-4.2',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
    eyeOff: 'M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 6.5 10 6.5a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    archive: 'M3.5 5h17v4h-17zM5 9v10h14V9M10 13h4',
  };

  // HTML 转义，所有用户数据进模板前都要过一遍
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 线性小图标；未知名称回退到地球，不留空白
  function icon(name, size = 16) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ICONS.globe}"></path></svg>`;
  }

  // Chrome 自带接口取到的网站图标（不向外部发送域名）
  function fav(url, size) {
    const img = Math.round(size * 0.6);
    return `<span class="fav" style="width:${size}px;height:${size}px"><img src="${esc(SiteIcon.favSrc(url))}" width="${img}" height="${img}" alt="" draggable="false"></span>`;
  }

  // ---------- 外观：所有扩展页面都调这一个函数 ----------
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  let mode = 'light';

  // 按设置写入亮暗与动效开关，并回写首帧脚本读取的缓存
  function applyAppearance(settings) {
    mode = settings.mode || 'light';
    const motion = settings.motion === 'off' ? 'off' : 'on';
    const root = document.documentElement;
    root.dataset.theme = mode === 'system' ? (darkMq.matches ? 'dark' : 'light') : mode;
    root.dataset.motion = motion;
    try {
      localStorage.setItem('sl-mode', mode);
      localStorage.setItem('sl-motion', motion);
    } catch (e) { /* 缓存写不进去只影响下次首帧 */ }
  }
  darkMq.addEventListener('change', () => {
    if (mode === 'system') document.documentElement.dataset.theme = darkMq.matches ? 'dark' : 'light';
  });

  // ---------- 提示条 ----------
  let box = null;
  let timer = 0;
  let deadline = 0;
  let actionFn = null;

  // 关掉当前提示条
  function hideToast() {
    clearTimeout(timer);
    actionFn = null;
    if (box) box.innerHTML = '';
  }

  // 从现在起 ms 毫秒后自动关闭
  function schedule(ms) {
    clearTimeout(timer);
    deadline = Date.now() + ms;
    timer = setTimeout(hideToast, ms);
  }

  // 首次使用时绑定提示条容器的交互：悬停或聚焦时暂停，离开后至少再留 1.5 秒
  function bindBox() {
    box = document.getElementById('toast');
    box.addEventListener('pointerenter', () => clearTimeout(timer));
    box.addEventListener('focusin', () => clearTimeout(timer));
    const resume = () => { if (box.firstChild) schedule(Math.max(deadline - Date.now(), 1500)); };
    box.addEventListener('pointerleave', resume);
    box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) resume(); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-toast]');
      if (!b) return;
      const run = b.dataset.toast === 'act' ? actionFn : null;
      hideToast();
      if (run) run();
    });
  }

  // 显示一条提示；同一时间只有一条，新的原地替换旧的。
  // opts: { undo: 撤销函数, action: { label, run } 其他操作（如重试）, error: 是否失败 }
  function toast(text, opts = {}) {
    if (!box) bindBox();
    const action = opts.undo ? { label: '撤销', run: opts.undo } : opts.action || null;
    actionFn = action && action.run;
    box.innerHTML = `<div class="toast${opts.error ? ' toast-error' : ''}"><span>${esc(text)}</span>`
      + (action ? `<button type="button" data-toast="act">${esc(action.label)}</button>` : '')
      + `<button type="button" class="toast-x" data-toast="close" aria-label="关闭">${icon('close', 14)}</button></div>`;
    // 带操作的给足时间；失败比成功多留一会儿
    schedule(action ? 6500 : opts.error ? 4000 : 2400);
  }

  // ---------- 单选组：方向键移动选中项，只有选中项进 Tab 序 ----------
  // 选项点击后可能整块重绘，所以按 data-focus 找回新节点再聚焦
  document.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const radio = step && e.target.closest && e.target.closest('[role="radio"]');
    const group = radio && radio.closest('[role="radiogroup"]');
    if (!group) return;
    const items = [...group.querySelectorAll('[role="radio"]:not(:disabled)')];
    const next = items[(items.indexOf(radio) + step + items.length) % items.length];
    e.preventDefault();
    const key = next.dataset.focus;
    next.click();
    const el = (key && document.querySelector(`[data-focus="${CSS.escape(key)}"]`)) || next;
    el.focus({ preventScroll: true });
  });

  // ---------- 整行开关：点文案区等于点开关；点在其他控件上或正在选文字时不转发 ----------
  document.addEventListener('click', (e) => {
    const row = e.target.closest && e.target.closest('[data-switch-row]');
    if (!row || e.target.closest('button, a, input, select, label')) return;
    if (String(getSelection())) return;
    const sw = row.querySelector('[role="switch"]:not(:disabled)');
    if (sw) sw.click();
  });

  // 重绘一块界面，并保住带 data-focus 的输入框的焦点和光标
  function keepFocus(fn) {
    const a = document.activeElement;
    const key = a && a.dataset && a.dataset.focus;
    let sel = null;
    try { sel = key && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch (e) { /* 部分输入类型不支持 */ }
    fn();
    if (!key || (document.activeElement && document.activeElement.dataset.focus === key)) return;
    const el = document.querySelector(`[data-focus="${CSS.escape(key)}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* 同上 */ }
  }

  return { esc, icon, fav, applyAppearance, toast, hideToast, keepFocus };
})();
