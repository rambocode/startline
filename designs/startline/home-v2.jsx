// 新标签页首页：左侧分类栏 + 右侧网址列表，支持亮 / 暗 / 跟随系统

// 每 20 秒刷新一次的当前时间
function useNow() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// 搜索框：按 / 聚焦，回车打开第一个匹配，或直接打开输入的域名
function SearchField({ H, placeholder }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); ref.current && ref.current.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { H.setQ(''); e.target.blur(); }
    if (e.key === 'Enter') {
      const first = H.matched[0];
      const d = first ? first.domain : domainOf(H.q);
      if (d) { H.open(d); H.setQ(''); }
    }
  };
  return (
    <label className="search">
      <Icon name="search" size={17}></Icon>
      <input ref={ref} value={H.q} placeholder={placeholder || '搜索'} spellCheck="false"
        onChange={(e) => H.setQ(e.target.value)} onKeyDown={onKeyDown} />
      <kbd>/</kbd>
    </label>
  );
}

// 钥匙标记：该网址已存帐号时显示，多个帐号带数量
function KeyMark({ H, domain }) {
  const n = H.creds.filter((c) => c.domain === domain).length;
  if (!n) return null;
  return (
    <span className="keymark" title="已保存帐号">
      <Icon name="key" size={13}></Icon>{n > 1 && <span>{n}</span>}
    </span>
  );
}

// “更多”按钮：打开该网址的详情浮层
function MoreBtn({ H, site }) {
  return (
    <button className="more" aria-label="更多" onClick={(e) => { e.stopPropagation(); H.openPop(site.id, e.currentTarget.getBoundingClientRect()); }}>
      <Icon name="more" size={16}></Icon>
    </button>
  );
}

// 分类末尾的添加入口：点开后输入网址，回车即加入该分类
function AddSite({ H, catId, label }) {
  const [on, setOn] = React.useState(false);
  const [v, setV] = React.useState('');
  const [bad, setBad] = React.useState(false);
  if (!on) {
    return (
      <button className="add" onClick={() => setOn(true)}>
        <Icon name="plus" size={14}></Icon>{label && <span>{label}</span>}
      </button>
    );
  }
  const submit = () => {
    const d = domainOf(v);
    if (!d) { setBad(true); return; }
    H.addSite(d, catId);
    setV(''); setOn(false);
  };
  return (
    <input className={'add-input' + (bad ? ' bad' : '')} autoFocus value={v} placeholder="example.com" spellCheck="false"
      onChange={(e) => { setV(e.target.value); setBad(false); }}
      onBlur={() => { if (!v) setOn(false); }}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setV(''); setOn(false); } }} />
  );
}

// 新建分类入口
function AddCat({ H }) {
  const [on, setOn] = React.useState(false);
  const [v, setV] = React.useState('');
  if (!on) {
    return <button className="add add-cat" onClick={() => setOn(true)}><Icon name="plus" size={14}></Icon><span>分类</span></button>;
  }
  const done = () => { if (v.trim()) H.addCat(v.trim()); setV(''); setOn(false); };
  return (
    <input className="add-input add-cat" autoFocus value={v} placeholder="分类名称"
      onChange={(e) => setV(e.target.value)} onBlur={done}
      onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setV(''); setOn(false); } }} />
  );
}

// 分类标题：双击改名；分类为空时可删除
function CatTitle({ H, cat, count, tag }) {
  const [edit, setEdit] = React.useState(false);
  const [v, setV] = React.useState(cat.name);
  const Tag = tag || 'h2';
  const done = () => { if (v.trim()) H.renameCat(cat.id, v.trim()); else setV(cat.name); setEdit(false); };
  return (
    <Tag className="cat-title" id={'cat-' + cat.id}>
      {edit ? (
        <input className="cat-edit" autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={done}
          onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setV(cat.name); setEdit(false); } }} />
      ) : (
        <span title="双击改名" onDoubleClick={() => { setV(cat.name); setEdit(true); }}>{cat.name}</span>
      )}
      {count === 0 && !edit && (
        <button className="cat-del" aria-label="删除分类" onClick={() => H.deleteCat(cat.id)}><Icon name="close" size={13}></Icon></button>
      )}
    </Tag>
  );
}

// 首页布局：左侧分类栏 + 右侧紧凑行列表
function HomeTool({ H }) {
  const [sel, setSel] = React.useState('all');
  const c = clockOf(H.now);
  const S = H.settings;
  const shown = H.cats.filter((cat) => sel === 'all' || sel === cat.id);
  return (
    <div className="ht" data-screen-label="首页 · 工具">
      <aside className="ht-side">
        <div className="ht-brand"><Mark size={22}></Mark><span>Startline</span></div>
        <nav className="ht-nav">
          <button className={sel === 'all' ? 'on' : ''} onClick={() => setSel('all')}>
            <span>全部</span><span className="n">{H.sites.length}</span>
          </button>
          {H.cats.map((cat) => (
            <button key={cat.id} className={sel === cat.id ? 'on' : ''} onClick={() => setSel(cat.id)}>
              <span>{cat.name}</span><span className="n">{H.sites.filter((s) => s.cat === cat.id).length}</span>
            </button>
          ))}
        </nav>
        <AddCat H={H}></AddCat>
        <ModeSwitch H={H}></ModeSwitch>
      </aside>
      <main className="ht-main">
        {S.showClock && (
          <header className="ht-hero">
            <h1>{greetOf(H.now)}</h1>
            <p><span className="ht-time">{c.time}</span>{c.date} {c.week}</p>
          </header>
        )}
        {S.showSearch && <SearchField H={H} placeholder="搜索网址或输入域名"></SearchField>}
        {S.showFrequent && !H.q && sel === 'all' && H.frequent.length > 0 && (
          <div className="ht-freq">
            {H.frequent.map((s) => (
              <button key={s.id} onClick={() => H.open(s.domain)}>
                <Letter name={s.name} domain={s.domain} size={52}></Letter>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        )}
        {H.q && H.matched.length === 0 && <p className="none">没有匹配的网址</p>}
        {shown.map((cat) => {
          const list = H.byCat(cat.id);
          if (H.q && !list.length) return null;
          return (
            <section className="ht-sec" key={cat.id}>
              <div className="ht-sec-head">
                <CatTitle H={H} cat={cat} count={list.length}></CatTitle>
                <span className="n">{list.length}</span>
              </div>
              <div className="ht-rows">
                {list.map((s) => (
                  <div className="row" key={s.id}>
                    <button className="row-main" onClick={() => H.open(s.domain)}>
                      <Letter name={s.name} domain={s.domain} size={40}></Letter>
                      <span className="row-text">
                        <span className="row-name">{s.name}</span>
                        <span className="row-domain">{s.domain}</span>
                      </span>
                    </button>
                    <KeyMark H={H} domain={s.domain}></KeyMark>
                    <MoreBtn H={H} site={s}></MoreBtn>
                  </div>
                ))}
                {!H.q && <AddSite H={H} catId={cat.id} label="添加网址"></AddSite>}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}

// 外观切换：亮 / 暗 / 跟随系统，放在侧栏底部
function ModeSwitch({ H }) {
  const modes = [['light', '亮'], ['dark', '暗'], ['system', '自动']];
  return (
    <div className="mode" role="radiogroup" aria-label="外观">
      {modes.map(([id, label]) => (
        <button key={id} role="radio" aria-checked={H.settings.mode === id} className={H.settings.mode === id ? 'on' : ''}
          onClick={() => H.setMode(id)}>{label}</button>
      ))}
    </div>
  );
}

// 网址详情浮层：改分类、查看/复制/删除已存帐号、移除网址
function SitePop({ H, site, rect, onClose }) {
  const [shown, setShown] = React.useState({});
  const list = H.creds.filter((c) => c.domain === site.domain);
  const ref = React.useRef(null);
  const [top, setTop] = React.useState(null);
  // 先渲染再量实际高度：下方放不下就翻到按钮上方，仍放不下则贴住视口上沿
  React.useLayoutEffect(() => {
    const h = ref.current.offsetHeight;
    const below = rect.bottom + 6;
    setTop(below + h > window.innerHeight - 8 ? Math.max(8, rect.top - 6 - h) : below);
  }, [list.length, H.cats.length]);
  const style = {
    left: Math.max(8, Math.min(rect.right - 280, window.innerWidth - 296)),
    top: top === null ? rect.bottom + 6 : top,
    visibility: top === null ? 'hidden' : 'visible',
  };
  return (
    <React.Fragment>
      <div className="scrim" onClick={onClose}></div>
      <div className="pop" ref={ref} style={style}>
        <div className="pop-head">
          <Letter name={site.name} domain={site.domain} size={32}></Letter>
          <div className="pop-id"><strong>{site.name}</strong><span>{site.domain}</span></div>
        </div>
        <div className="chips">
          {H.cats.map((cat) => (
            <button key={cat.id} className={'chip' + (cat.id === site.cat ? ' on' : '')} onClick={() => H.moveSite(site.id, cat.id)}>{cat.name}</button>
          ))}
        </div>
        {list.length > 0 && (
          <ul className="creds">
            {list.map((c) => (
              <li key={c.id}>
                <Icon name="key" size={14}></Icon>
                <div className="cred-id">
                  <span className="cred-user">{c.user}</span>
                  <span className="cred-pass">{shown[c.id] ? c.pass : '•'.repeat(Math.min(c.pass.length, 12))}</span>
                </div>
                <button aria-label="显示密码" onClick={() => setShown({ ...shown, [c.id]: !shown[c.id] })}><Icon name="eye" size={15}></Icon></button>
                <button aria-label="复制密码" onClick={() => H.copy(c.pass)}><Icon name="copy" size={15}></Icon></button>
                <button aria-label="删除帐号" onClick={() => H.removeCred(c.id)}><Icon name="trash" size={15}></Icon></button>
              </li>
            ))}
          </ul>
        )}
        <button className="pop-remove" onClick={() => { H.removeSite(site.id); onClose(); }}>移除网址</button>
      </div>
    </React.Fragment>
  );
}

// 首页入口：整理查询结果并按方向分发到三个布局
function Home({ app }) {
  const [q, setQ] = React.useState('');
  const [pop, setPop] = React.useState(null);
  const now = useNow();
  const kw = q.trim().toLowerCase();
  const match = (s) => !kw || s.name.toLowerCase().includes(kw) || s.domain.includes(kw);
  const matched = app.sites.filter(match);
  const H = {
    ...app, q, setQ, now, matched,
    byCat: (id) => matched.filter((s) => s.cat === id),
    frequent: [...app.sites].filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 6),
    openPop: (id, rect) => setPop({ id, rect }),
  };
  const popSite = pop && app.sites.find((s) => s.id === pop.id);
  return (
    <div className="home">
      <HomeTool H={H}></HomeTool>
      {popSite && <SitePop H={H} site={popSite} rect={pop.rect} onClose={() => setPop(null)}></SitePop>}
    </div>
  );
}

Object.assign(window, { Home });
