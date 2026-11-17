import { useEffect, useState } from 'preact/hooks';
import { api, relTime } from '../api.js';
import { useApp, Icon, Spinner, Empty, Avatar } from '../ui.jsx';

const KIND = {
  published: ['check', 'good'],
  failed: ['alert', 'bad'],
  reconnect: ['alert', 'bad'],
  dm: ['inbox', 'info'],
  test: ['send', 'info'],
  soon: ['clock', 'info'],
  upcoming: ['clock', 'info'],
  reminder: ['alert', 'bad'],
};

const b64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function PhoneSetup() {
  const { toast } = useApp();
  const [status, setStatus] = useState(null);
  const [mine, setMine] = useState(null); // this device's subscription
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setStatus(await api('push/status'));
    if (supported()) {
      const reg = await navigator.serviceWorker.getRegistration();
      setMine(reg ? await reg.pushManager.getSubscription() : null);
    }
  };
  useEffect(() => { load().catch((e) => toast(e.message, 'bad')); }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings, then try again.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(status.public_key) });
      const j = sub.toJSON();
      const device = /SM-F|Fold/i.test(navigator.userAgent) ? 'Samsung Fold' : /Android/i.test(navigator.userAgent) ? 'Android phone' : /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone/iPad' : 'Computer';
      await api('push/subscribe', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys, device } });
      await api('push/test', { method: 'POST' });
      toast('Notifications on — a test one is on its way');
      await load();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      await api('push/unsubscribe', { method: 'POST', body: { endpoint: mine.endpoint } });
      await mine.unsubscribe();
      toast('Notifications off on this device');
      await load();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <section class="card pad"><Spinner /></section>;
  return (
    <section class="card pad" style={{ marginBottom: 16 }}>
      <h2 class="row" style={{ marginTop: 0 }}><Icon name="bell" size={16} /> Phone notifications</h2>
      {!supported() ? (
        <p class="small muted" style={{ margin: 0 }}>This browser can't receive notifications. On your phone, open Postroom in <b>Chrome</b>.</p>
      ) : mine ? (
        <div class="row wrap" style={{ gap: 8 }}>
          <span class="pill good"><span class="dot" />On for this device</span>
          <button class="btn sm" disabled={busy} onClick={() => api('push/test', { method: 'POST' }).then(() => toast('Test sent'))}>Send a test</button>
          <button class="btn ghost sm danger" disabled={busy} onClick={disable}>Turn off here</button>
        </div>
      ) : (
        <button class="btn primary" disabled={busy} onClick={enable}>{busy ? <Spinner /> : 'Turn on notifications on this device'}</button>
      )}
      <p class="small muted" style={{ marginBottom: 0 }}>You'll get one when a post goes live (tap it to open the post), when a post fails, when an account needs reconnecting, and when new DMs arrive.</p>
      {!isStandalone() && /Android/i.test(navigator.userAgent) && (
        <ol class="setup-steps small" style={{ marginBottom: 0 }}>
          <li>In Chrome, tap <b>⋮ → Add to Home screen → Install</b>. Postroom gets its own icon and opens full screen like an app.</li>
          <li>Open it from the new icon, sign in, come back here and turn notifications on.</li>
        </ol>
      )}
      {status.devices.length > 0 && (
        <p class="tiny faint" style={{ marginBottom: 0 }}>Receiving: {status.devices.map((d) => d.device || 'device').join(', ')}</p>
      )}
    </section>
  );
}

export default function Alerts() {
  const { accounts, refresh } = useApp();
  const [data, setData] = useState(null);
  useEffect(() => {
    api('notifications', { query: { limit: 100 } }).then((d) => {
      setData(d);
      if (d.unread) api('notifications/read', { method: 'POST' }).then(refresh).catch(() => {});
    }).catch(() => setData({ items: [] }));
  }, []);
  const acct = (id) => accounts.find((a) => a.id === id);
  return (
    <>
      <div class="page-head"><h1>Alerts</h1><span class="sub">Everything Postroom did for you, newest first.</span></div>
      <div style={{ maxWidth: 760 }}>
        <PhoneSetup />
        <section class="card">
          {!data ? <div class="empty"><Spinner /></div>
            : !data.items.length ? <Empty icon="bell" title="Nothing yet">You'll see posts going live, failures and new DMs here.</Empty>
            : data.items.map((n) => {
              const [icon, tone] = KIND[n.kind] || ['send', 'info'];
              const a = acct(n.account_id);
              const external = n.url && /^https?:/.test(n.url);
              return (
                <a key={n.id} class={`alert-item ${n.read_at ? '' : 'unread'}`} href={n.url || '#/alerts'} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
                  {a ? <Avatar src={a.profile_picture_url} name={a.username} platform={a.platform} size={32} /> : <span class={`ic ${tone}`}><Icon name={icon} size={16} /></span>}
                  <div class="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{n.title}</div>
                    {n.body && <div class="small muted" style={{ overflowWrap: 'anywhere' }}>{n.body}</div>}
                  </div>
                  {n.image && <img src={n.image} alt="" style={{ width: 40, height: 52, objectFit: 'cover', borderRadius: 6, flex: 'none' }} loading="lazy" />}
                  <span class="tiny faint" style={{ flex: 'none' }}>{relTime(n.created_at)}</span>
                </a>
              );
            })}
        </section>
      </div>
    </>
  );
}
