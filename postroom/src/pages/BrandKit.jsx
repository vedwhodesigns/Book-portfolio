import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { useApp, Drawer, Icon, Spinner, Avatar } from '../ui.jsx';

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FIELDS = [
  ['tone', 'Voice & tone', 'e.g. Calm, factual, suspenseful. Short sentences. Never sensational.'],
  ['audience', 'Audience', 'Who this account talks to'],
  ['cta', 'Call to action', 'e.g. Follow for the next case'],
  ['signoff', 'Sign-off line', 'Added at the end of captions, e.g. — The Crime Archives'],
  ['language', 'Language', 'e.g. English, Hinglish'],
  ['dos', 'Always do', 'Rules Claude should follow'],
  ['donts', 'Never do', 'Words, topics or styles to avoid'],
  ['notes', 'Other notes', 'Anything else: series names, recurring formats, links'],
];

/** Edit one account's brand kit and posting slots. */
export default function BrandKit({ account, onClose }) {
  const { toast, refresh } = useApp();
  const [b, setB] = useState({ ...(account.brand || {}) });
  const [sets, setSets] = useState((account.brand?.hashtag_sets || []).map((s) => ({ name: s.name, tags: s.tags.join(' ') })));
  const [slots, setSlots] = useState(account.slots?.length ? account.slots : []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`accounts/${account.id}/brand`, { method: 'PATCH', body: { brand: { ...b, hashtag_sets: sets.filter((s) => s.tags.trim()) }, slots } });
      toast(`Saved brand kit for @${account.username}`);
      refresh();
      onClose();
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const setSlot = (i, patch) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <Drawer
      onClose={onClose}
      title={<span class="row" style={{ gap: 8 }}><Avatar src={account.profile_picture_url} name={account.username} platform={account.platform} size={26} /><b>@{account.username}</b><span class="muted">brand kit & slots</span></span>}
      foot={<><button class="btn primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Save'}</button><button class="btn ghost" onClick={onClose}>Cancel</button></>}
    >
      <div class="col" style={{ gap: 14 }}>
        <p class="small muted" style={{ margin: 0 }}>Claude follows this whenever it writes captions for @{account.username}, in the app and through the connector.</p>

        <h3 style={{ margin: '6px 0 0' }}>Posting slots</h3>
        <p class="tiny faint" style={{ margin: 0 }}>Posts set to "next free slot" fill these in order.</p>
        {slots.map((s, i) => (
          <div key={i} class="row wrap" style={{ gap: 6 }}>
            <input type="time" class="input" style={{ width: 120 }} value={s.time} onInput={(e) => setSlot(i, { time: e.currentTarget.value })} />
            {DAY.map((d, k) => {
              const on = (s.days || []).includes(k + 1);
              return <button key={d} type="button" class={`btn sm ${on ? 'primary' : 'ghost'}`} style={{ minWidth: 42 }} aria-pressed={on} onClick={() => setSlot(i, { days: on ? s.days.filter((x) => x !== k + 1) : [...(s.days || []), k + 1].sort() })}>{d}</button>;
            })}
            <button type="button" class="btn ghost sm icon" aria-label="Remove slot" onClick={() => setSlots(slots.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
          </div>
        ))}
        <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSlots([...slots, { time: '19:00', days: [1, 2, 3, 4, 5, 6, 7] }])}><Icon name="plus" size={14} /> Add slot</button>

        <h3 style={{ margin: '10px 0 0' }}>Brand kit</h3>
        {FIELDS.map(([k, label, ph]) => (
          <div class="field" key={k}>
            <label for={`bk-${k}`}>{label}</label>
            {['tone', 'dos', 'donts', 'notes'].includes(k)
              ? <textarea id={`bk-${k}`} class="textarea" style={{ minHeight: 64 }} placeholder={ph} value={b[k] || ''} onInput={(e) => setB({ ...b, [k]: e.currentTarget.value })} />
              : <input id={`bk-${k}`} class="input" placeholder={ph} value={b[k] || ''} onInput={(e) => setB({ ...b, [k]: e.currentTarget.value })} />}
          </div>
        ))}

        <div class="field">
          <label>Hashtag sets</label>
          {sets.map((s, i) => (
            <div key={i} class="col" style={{ gap: 4, marginBottom: 8 }}>
              <div class="row" style={{ gap: 6 }}>
                <input class="input" style={{ maxWidth: 180 }} placeholder="Set name" value={s.name} onInput={(e) => setSets(sets.map((x, j) => (j === i ? { ...x, name: e.currentTarget.value } : x)))} />
                <button type="button" class="btn ghost sm icon" aria-label="Remove set" onClick={() => setSets(sets.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
              </div>
              <textarea class="textarea" style={{ minHeight: 52 }} placeholder="#truecrime #coldcase #mystery" value={s.tags} onInput={(e) => setSets(sets.map((x, j) => (j === i ? { ...x, tags: e.currentTarget.value } : x)))} />
            </div>
          ))}
          <button type="button" class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSets([...sets, { name: sets.length ? `Set ${sets.length + 1}` : 'Default', tags: '' }])}><Icon name="plus" size={14} /> Add hashtag set</button>
        </div>
      </div>
    </Drawer>
  );
}
