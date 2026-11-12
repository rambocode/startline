// 网址图标：自动（网站自己的图标，Chrome 取不到时用字母头像）、内置图标、字母、上传图片
const SiteIcon = (() => {
  // 可选颜色
  const COLORS = ['#2563eb', '#4f46e5', '#9333ea', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#475569'];

  // 内置图标（24×24 线条路径）及其名称
  const GLYPHS = {
    globe: ['网站', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9'],
    home: ['首页', 'M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5'],
    server: ['服务器', 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01'],
    database: ['数据库', 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
    terminal: ['终端', 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3'],
    code: ['代码', 'M9 7l-5 5 5 5M15 7l5 5-5 5'],
    cloud: ['云', 'M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9.5z'],
    monitor: ['监控', 'M4 5h16v11H4zM9 20h6M12 16v4M7 12l3-3 2 2 4-4'],
    chart: ['图表', 'M4 20h16M7 16v-5M12 16V7M17 16v-8'],
    doc: ['文档', 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5'],
    book: ['知识库', 'M5 5a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2zM5 19V5'],
    folder: ['文件', 'M4 7a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z'],
    mail: ['邮件', 'M4 6h16v12H4zM4 7l8 6 8-6'],
    chat: ['沟通', 'M5 5h14v10H10l-4 4v-4H5z'],
    calendar: ['日程', 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4'],
    lock: ['安全', 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
    sliders: ['设置', 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4'],
    cart: ['购物', 'M4 5h2l2 10h10l2-7H7M10 19h.01M17 19h.01'],
    play: ['影音', 'M8 5v14l11-7z'],
    star: ['收藏', 'M12 4l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z'],
  };

  // 只接受常见位图格式的 data URL，防止存进奇怪的内容
  const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

  // HTML 转义
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 字符串 → 稳定色相
  function hueOf(str) {
    let h = 0;
    for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  // 名称的第一个字（按字符而不是 UTF-16 单元取，兼容中文和 emoji）
  function firstChar(name) {
    return ([...String(name || '').trim()][0] || '?').toUpperCase();
  }

  // 为网址挑一个默认颜色，同一网址每次都一样
  function defaultColor(url) {
    return COLORS[hueOf(SL.hostOf(url)) % COLORS.length];
  }

  // 图标颜色，只认调色板里的值
  function colorOf(ic, url) {
    return ic && COLORS.includes(ic.color) ? ic.color : defaultColor(url);
  }

  // Chrome 自带的网站图标接口地址，不向外部发送域名
  function favSrc(url) {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', url);
    u.searchParams.set('size', '64');
    return u.href;
  }

  // 内置图标的 SVG
  function glyphSvg(name, size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${GLYPHS[name][1]}"></path></svg>`;
  }

  // ---------- 识别 Chrome 的默认地球图标 ----------
  // Chrome 对没有图标记录的网址统一返回同一张地球图。先用一个不存在的网址取到这张图作基准，
  // 网址的图标和它字节相同就说明没有真实图标。结果存在本地，下次打开首页直接用，不闪
  const STORE_KEY = 'sl-fav-default';
  const isDefault = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  const checked = new Set(); // 本次打开首页已检查过的网址
  let baseHash = null;

  // 取图片并算哈希
  async function digest(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // 检查这些网址是否只有默认图标；结果有变化时调用 onChange 重绘
  async function check(urls, onChange) {
    const todo = [...new Set(urls)].filter((u) => !checked.has(u));
    if (!todo.length) return;
    todo.forEach((u) => checked.add(u));
    try {
      baseHash = baseHash || (await digest(favSrc('https://startline-no-icon.invalid/')));
      let changed = false;
      await Promise.all(todo.map(async (u) => {
        const v = (await digest(favSrc(u))) === baseHash;
        if (isDefault[u] !== v) { isDefault[u] = v; changed = true; }
      }));
      if (changed) {
        localStorage.setItem(STORE_KEY, JSON.stringify(isDefault));
        onChange();
      }
    } catch (e) {
      // 取不到就保持显示网站图标
    }
  }

  // ---------- 渲染 ----------
  // 网址图标
  function html(site, size) {
    const ic = site.icon;
    const box = `width:${size}px;height:${size}px`;
    if (ic && ic.kind === 'image' && IMG_RE.test(ic.data)) {
      return `<span class="fav fav-img" style="${box}"><img src="${ic.data}" alt="" draggable="false"></span>`;
    }
    if (ic && ic.kind === 'glyph' && GLYPHS[ic.name]) {
      return `<span class="fav fav-solid" style="${box};background:${colorOf(ic, site.url)}">${glyphSvg(ic.name, Math.round(size * 0.5))}</span>`;
    }
    if (ic && ic.kind === 'letter') {
      return `<span class="fav fav-solid" style="${box};background:${colorOf(ic, site.url)};font-size:${Math.round(size * 0.46)}px">${esc(firstChar(site.name))}</span>`;
    }
    // 自动：Chrome 只有默认地球图标时，改用按网址配色的字母头像；
    // 名称首字不是文字（如 IP 地址开头的数字）时字母没有辨识度，改用内置图形：IP / localhost 用服务器，其余用网站
    if (isDefault[site.url]) {
      const host = SL.hostOf(site.url);
      const ch = firstChar(site.name);
      const style = `${box};--h:${hueOf(host)};font-size:${Math.round(size * 0.46)}px`;
      if (/\p{L}/u.test(ch)) return `<span class="fav fav-letter" style="${style}">${esc(ch)}</span>`;
      const g = /^(localhost|\d+(\.\d+){3})$/.test(host) || host.includes(':') ? 'server' : 'globe';
      return `<span class="fav fav-letter" style="${style}">${glyphSvg(g, Math.round(size * 0.5))}</span>`;
    }
    const img = Math.round(size * 0.6);
    return `<span class="fav" style="${box}"><img src="${esc(favSrc(site.url))}" width="${img}" height="${img}" alt="" draggable="false"></span>`;
  }

  // 图标选择面板：自动 / 字母 / 上传，内置图标，颜色（仅内置图标和字母可选颜色）
  function picker(site) {
    const ic = site.icon || null;
    const kind = ic ? ic.kind : 'auto';
    const seg = (k, label, act) => `<button class="${kind === k ? 'on' : ''}" data-act="${act}">${label}</button>`;
    const glyphs = Object.entries(GLYPHS).map(([n, [label]]) =>
      `<button class="glyph${kind === 'glyph' && ic.name === n ? ' on' : ''}" data-act="iconGlyph" data-id="${n}" title="${label}" aria-label="${label}">${glyphSvg(n, 16)}</button>`
    ).join('');
    const current = colorOf(ic, site.url);
    const swatches = kind === 'glyph' || kind === 'letter'
      ? `<div class="swatches">${COLORS.map((c) =>
          `<button class="swatch${c === current ? ' on' : ''}" style="background:${c}" data-act="iconColor" data-id="${c}" aria-label="颜色 ${c}"></button>`).join('')}</div>`
      : '';
    return `<div class="icon-picker">
      <div class="seg">${seg('auto', '自动', 'iconAuto')}${seg('letter', '字母', 'iconLetter')}${seg('image', '上传', 'iconUpload')}</div>
      <div class="glyphs">${glyphs}</div>
      ${swatches}
    </div>`;
  }

  // 读取上传的图片：等比缩放后居中放进 128px 透明方形画布，转成 PNG data URL
  function fromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('请选择图片文件'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('图片不能超过 5MB'));
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const S = 128;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        // 没有固有尺寸的 SVG 直接铺满
        const iw = img.naturalWidth || S;
        const ih = img.naturalHeight || S;
        const k = Math.min(S / iw, S / ih);
        g.drawImage(img, (S - iw * k) / 2, (S - ih * k) / 2, iw * k, ih * k);
        URL.revokeObjectURL(src);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('图片无法读取')); };
      img.src = src;
    });
  }

  // 校验并规整一份图标设置（导入备份时用）；不合法返回 undefined，按自动图标处理
  function clean(ic) {
    if (!ic || typeof ic !== 'object') return undefined;
    if (ic.kind === 'image') return IMG_RE.test(ic.data) && ic.data.length < 400000 ? { kind: 'image', data: ic.data } : undefined;
    const color = COLORS.includes(ic.color) ? ic.color : undefined;
    if (ic.kind === 'glyph') return Object.hasOwn(GLYPHS, ic.name) ? { kind: 'glyph', name: ic.name, color } : undefined;
    if (ic.kind === 'letter') return { kind: 'letter', color };
    return undefined;
  }

  return { COLORS, favSrc, html, picker, check, colorOf, fromFile, clean };
})();
