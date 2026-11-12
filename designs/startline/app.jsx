// 应用入口：持有全部状态（分类 / 网址 / 帐号 / 设置），并提供 Tweaks 面板

const LS_KEY = 'startline-proto-v2';

// 读取本地保存的原型状态
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}

// 跟随系统时监听系统深浅色变化，返回最终生效的 light / dark
function useResolvedMode(mode) {
  const mq = React.useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [sysDark, setSysDark] = React.useState(mq.matches);
  React.useEffect(() => {
    const on = (e) => setSysDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mq]);
  if (mode === 'system') return sysDark ? 'dark' : 'light';
  return mode;
}

// 提示条：操作后的短暂反馈，可带撤销等动作
function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id}>
      <Mark size={14}></Mark>
      <span className="toast-text">{toast.text}</span>
      {(toast.actions || []).map((a) => (
        <button key={a.label} onClick={() => { a.fn(); onClose(); }}>{a.label}</button>
      ))}
    </div>
  );
}

// Tweaks 面板：首页模块开关，自带显示/隐藏开关
function Tweaks({ settings, setSettings, onReset }) {
  const [open, setOpen] = React.useState(false);
  const toggle = (k) => setSettings({ ...settings, [k]: !settings[k] });
  return (
    <div className="tweaks">
      {open && (
        <div className="tweaks-panel">
          <label><input type="checkbox" checked={settings.showSearch} onChange={() => toggle('showSearch')} />搜索框</label>
          <label><input type="checkbox" checked={settings.showFrequent} onChange={() => toggle('showFrequent')} />常用</label>
          <label><input type="checkbox" checked={settings.showClock} onChange={() => toggle('showClock')} />时间</label>
          <button className="tweaks-reset" onClick={onReset}>重置数据</button>
        </div>
      )}
      <button className="tweaks-toggle" onClick={() => setOpen(!open)}>Tweaks</button>
    </div>
  );
}

// 根组件：所有共享状态的唯一持有者
function App() {
  const saved = React.useMemo(loadSaved, []);
  const [cats, setCats] = React.useState(saved.cats || SEED_CATS);
  const [sites, setSites] = React.useState(saved.sites || SEED_SITES);
  const [creds, setCreds] = React.useState(saved.creds || SEED_CREDS);
  // 默认明亮主题；mode 可为 light / dark / system
  const [settings, setSettings] = React.useState({
    mode: 'light', showSearch: true, showFrequent: true, showClock: true, lastCat: 'dev',
    ...saved.settings,
  });
  const [toast, setToast] = React.useState(null);
  const resolved = useResolvedMode(settings.mode);

  React.useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ cats, sites, creds, settings }));
  }, [cats, sites, creds, settings]);
  React.useEffect(() => { document.documentElement.dataset.theme = resolved; }, [resolved]);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const say = (text, actions) => setToast({ id: uid(), text, actions });

  // 收藏网址；cat 为空时落到上次使用的分类
  const addSite = (domain, cat) => {
    if (sites.some((s) => s.domain === domain)) { say('已经收藏过了'); return; }
    const catId = cats.some((c) => c.id === (cat || settings.lastCat)) ? (cat || settings.lastCat) : cats[0].id;
    setSites([...sites, { id: 's' + uid(), name: nameOf(domain), domain, cat: catId, hits: 0 }]);
    setSettings({ ...settings, lastCat: catId });
  };

  // 打开网址：直接交给浏览器开新标签，收藏过的累计点击次数
  const open = (domain) => {
    setSites(sites.map((s) => (s.domain === domain ? { ...s, hits: s.hits + 1 } : s)));
    window.open('https://' + domain, '_blank', 'noopener');
  };

  const app = {
    cats, sites, creds, settings, open, addSite,
    setMode: (mode) => setSettings({ ...settings, mode }),
    removeSite: (id) => {
      const before = sites;
      setSites(sites.filter((s) => s.id !== id));
      say('已移除', [{ label: '撤销', fn: () => setSites(before) }]);
    },
    moveSite: (id, cat) => { setSites(sites.map((s) => (s.id === id ? { ...s, cat } : s))); setSettings({ ...settings, lastCat: cat }); },
    addCat: (name) => setCats([...cats, { id: 'k' + uid(), name }]),
    renameCat: (id, name) => setCats(cats.map((c) => (c.id === id ? { ...c, name } : c))),
    deleteCat: (id) => setCats(cats.filter((c) => c.id !== id)),
    removeCred: (id) => {
      const before = creds;
      setCreds(creds.filter((c) => c.id !== id));
      say('已删除帐号', [{ label: '撤销', fn: () => setCreds(before) }]);
    },
    copy: (text) => { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); say('已复制密码'); },
  };

  const reset = () => { localStorage.removeItem(LS_KEY); location.href = location.pathname; };

  return (
    <React.Fragment>
      <Home app={app}></Home>
      <Toast toast={toast} onClose={() => setToast(null)}></Toast>
      <Tweaks settings={settings} setSettings={setSettings} onReset={reset}></Tweaks>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App></App>);
