import { render } from 'preact';
import { useEffect, useState, useCallback, useMemo } from 'preact/hooks';
import './styles.css';
import { api, setTz } from './api.js';
import { AppCtx, Icon, Spinner } from './ui.jsx';
import Calendar from './pages/Calendar.jsx';
import Compose from './pages/Compose.jsx';
import Queue from './pages/Queue.jsx';
import Plans from './pages/Plans.jsx';
import Analytics from './pages/Analytics.jsx';
import Accounts from './pages/Accounts.jsx';
import Library from './pages/Library.jsx';
import Settings from './pages/Settings.jsx';
import Research from './pages/Research.jsx';
import Inbox from './pages/Inbox.jsx';
import Alerts from './pages/Alerts.jsx';
import { backfillPosters } from './posters.js';
import PostDrawer from './pages/PostDrawer.jsx';

const NAV = [
  { path: 'calendar', label: 'Calendar', icon: 'calendar' },
  { path: 'queue', label: 'Queue', icon: 'list' },
  { path: 'inbox', label: 'Inbox', icon: 'inbox' },
  { path: 'alerts', label: 'Alerts', icon: 'bell' },
  { path: 'plans', label: 'Plans', icon: 'sparkle' },
  { path: 'analytics', label: 'Analytics', icon: 'chart' },
  { path: 'accounts', label: 'Accounts', icon: 'users' },
  { path: 'library', label: 'Library', icon: 'image' },
  { path: 'research', label: 'Research', icon: 'layers', ext: true },
  { path: 'settings', label: 'Settings', icon: 'settings' },
];
const PAGES = { calendar: Calendar, compose: Compose, queue: Queue, plans: Plans, analytics: Analytics, accounts: Accounts, library: Library, settings: Settings, research: Research, inbox: Inbox, alerts: Alerts };

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { path: PAGES[path] ? path : 'calendar', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('login', { method: 'POST', body: { password: pw } });
      onDone();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="login">
      <form class="card" onSubmit={submit}>
        <div class="logo-mark" style={{ width: 40, height: 40, borderRadius: 12 }}><Icon name="send" size={20} /></div>
        <h1>Postroom</h1>
        <p class="muted" style={{ marginTop: 0 }}>Schedule Instagram, YouTube and TikTok from one place.</p>
        <div class="field" style={{ marginTop: 18 }}>
          <label for="pw">Password</label>
          <input id="pw" class="input" type="password" autoFocus value={pw} onInput={(e) => setPw(e.currentTarget.value)} autoComplete="current-password" />
        </div>
        {err && <div class="notice bad" style={{ marginTop: 12 }}>{err}</div>}
        <button class="btn primary block" style={{ marginTop: 16, height: 40 }} disabled={busy || !pw}>{busy ? <Spinner /> : 'Sign in'}</button>
      </form>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(null);
  const [route, setRoute] = useState(parseHash());
  const [config, setConfig] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [plansCount, setPlansCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [bump, setBump] = useState(0);

  const toast = useCallback((msg, kind = '') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'bad' ? 6000 : 3200);
  }, []);

  const loadBasics = useCallback(async () => {
    const [cfg, accs, plans] = await Promise.all([api('config'), api('accounts'), api('plans')]);
    setTz(cfg.timezone);
    setConfig(cfg);
    setAccounts(accs);
    setPlansCount(plans.length);
    api('inbox/status').then((s) => setUnread(s.unread || 0)).catch(() => {});
    api('notifications', { query: { limit: 1 } }).then((n) => setAlerts(n.unread || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    api('session').then((s) => setAuthed(s.authed)).catch(() => setAuthed(false));
    // Keep the service worker registered so phone notifications work once turned on (Alerts page).
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const onHash = () => setRoute(parseHash());
    const onOut = () => setAuthed(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('postroom:signedout', onOut);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('postroom:signedout', onOut); };
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadBasics().then(() => api('config')).then((cfg) => {
      // quietly make preview images for videos that arrived without one
      setTimeout(() => backfillPosters(cfg.storage?.mode, () => setBump((b) => b + 1)), 2500);
    }).catch((e) => toast(e.message, 'bad'));
    // OAuth round-trip messages
    const q = new URLSearchParams(location.search);
    if (q.get('connected')) toast(`Connected ${q.get('connected').replace(':', ' @')}`);
    if (q.get('error')) toast(q.get('error'), 'bad');
    if (q.get('connected') || q.get('error')) history.replaceState(null, '', `/${location.hash}`);
  }, [authed]);

  const ctx = useMemo(() => ({
    config,
    accounts,
    toast,
    openPost: setOpenId,
    refresh: () => { setBump((b) => b + 1); loadBasics().catch(() => {}); },
    bump,
    go: (path) => { location.hash = `#/${path}`; },
  }), [config, accounts, toast, bump, loadBasics]);

  if (authed === null) return <div class="login"><Spinner /></div>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  if (!config) return <div class="login"><Spinner /></div>;

  const Page = PAGES[route.path];
  const needsAttention = accounts.filter((a) => a.status !== 'active').length;
  return (
    <AppCtx.Provider value={ctx}>
      <div class="shell">
        <nav class="side" aria-label="Main">
          <div class="logo"><span class="logo-mark"><Icon name="send" size={15} /></span>Postroom</div>
          <a href="#/compose" class="btn primary compose-btn"><Icon name="plus" size={16} /> New post</a>
          <div class="nav col" style={{ gap: 2 }}>
            {NAV.map((n) => [
              n.ext && <div key={`${n.path}-h`} class="tiny faint" style={{ padding: '14px 10px 4px', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Extensions</div>,
              <a key={n.path} href={`#/${n.path}`} class={route.path === n.path ? 'on' : ''}>
                <Icon name={n.icon} />
                {n.label}
                {n.path === 'plans' && plansCount > 0 && <span class="badge">{plansCount}</span>}
                {n.path === 'inbox' && unread > 0 && <span class="badge">{unread}</span>}
                {n.path === 'alerts' && alerts > 0 && <span class="badge">{alerts}</span>}
                {n.path === 'accounts' && needsAttention > 0 && <span class="badge" title="Needs attention">!</span>}
              </a>,
            ])}
          </div>
          <div class="side-foot tiny faint">Times in {config.timezone}</div>
        </nav>
        <main class="main" id="main">
          <Page params={route.params} key={route.path} />
        </main>
        <nav class="tabbar" aria-label="Main">
          {[['calendar', 'Calendar', 'calendar'], ['queue', 'Queue', 'list'], ['compose', 'New', 'plus'], ['alerts', 'Alerts', 'bell'], ['settings', 'More', 'more']].map(([p, l, i]) => (
            <a key={p} href={`#/${p}`} class={`${route.path === p || (p === 'settings' && ['accounts', 'plans', 'library', 'research', 'inbox', 'analytics'].includes(route.path)) ? 'on' : ''} ${p === 'compose' ? 'plus' : ''}`}>
              <span class="ic"><Icon name={i} size={20} /></span>{l}
              {p === 'settings' && (plansCount > 0 || needsAttention > 0 || unread > 0) && <span class="badge">{plansCount + needsAttention + unread}</span>}
              {p === 'alerts' && alerts > 0 && <span class="badge">{alerts}</span>}
            </a>
          ))}
        </nav>
      </div>
      {openId && <PostDrawer id={openId} onClose={() => setOpenId(null)} />}
      <div class="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} class={`toast ${t.kind}`}>{t.kind === 'bad' && <Icon name="alert" size={16} />}{t.msg}</div>)}
      </div>
    </AppCtx.Provider>
  );
}

render(<App />, document.getElementById('app'));
