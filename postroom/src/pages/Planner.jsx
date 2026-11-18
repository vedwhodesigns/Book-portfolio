import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, putToStorage, fmtDateTime, relTime } from '../api.js';
import { useApp, useAsync, Icon, Spinner, Empty, Drawer, Modal, Seg, PfMark } from '../ui.jsx';
import BoardView from './Board.jsx';

const STAGES = [
  ['idea', 'Idea'], ['scripting', 'Scripting'], ['producing', 'Producing'], ['ready', 'Ready'], ['scheduled', 'Scheduled'], ['posted', 'Posted'],
];
const STAGE_LABEL = Object.fromEntries([...STAGES, ['dropped', 'Dropped']]);
const TAG_SUGGEST = ['hook', 'pacing', 'edit', 'transition', 'lighting', 'colour', 'thumbnail', 'cover', 'caption', 'font', 'sound', 'format', 'story', 'set design', 'character'];

const go = (q) => { location.hash = `#/planner?${new URLSearchParams(q)}`; };

function useBrand() {
  const [brand, setBrand] = useState(() => { try { return localStorage.getItem('pr-plan-brand') || ''; } catch { return ''; } });
  const set = (b) => { setBrand(b); try { localStorage.setItem('pr-plan-brand', b); } catch { /* private mode */ } };
  return [brand, set];
}

function BrandPicker({ brands, value, onChange, all = true }) {
  return (
    <select class="select" style={{ width: 'auto', minWidth: 170 }} value={value} onChange={(e) => onChange(e.currentTarget.value)} aria-label="Brand">
      {all && <option value="">All brands</option>}
      {!all && <option value="">No brand</option>}
      {brands.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
    </select>
  );
}

/** Upload image files as references. */
async function uploadRefs(files, { brand, mode, extra = {} }) {
  const out = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const name = `ref-${Date.now().toString(36)}-${f.name.replace(/[^\w.-]+/g, '-')}`;
    const stored = await putToStorage(name, f, mode);
    out.push(await api('planner/refs', { method: 'POST', body: { kind: 'image', url: stored.url, title: f.name.replace(/\.\w+$/, ''), brand: brand || null, ...extra } }));
  }
  return out;
}

// ======================= References =======================
function RefCard({ r, onChanged, onPick, picking, boards }) {
  const { toast } = useApp();
  const [edit, setEdit] = useState(false);
  const [tags, setTags] = useState(r.tags.join(', '));
  const [note, setNote] = useState(r.note || '');
  const save = async (patch) => {
    try { await api(`planner/refs/${r.id}`, { method: 'PATCH', body: patch }); onChanged(); } catch (e) { toast(e.message, 'bad'); }
  };
  const toBoard = async (boardId) => {
    if (!boardId) return;
    try { await api(`planner/boards/${boardId}/items`, { method: 'POST', body: { kind: 'ref', ref_id: r.id } }); toast('Pinned on the board'); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <div class={`ref-card ${picking ? 'picking' : ''}`} onClick={picking ? () => onPick(r) : undefined}>
      <div class={`ref-thumb ${r.kind === 'note' && !r.thumb_url ? 'is-note' : ''}`} style={r.kind === 'color' ? { background: r.color } : undefined}>
        {r.thumb_url ? <img src={r.thumb_url} alt="" loading="lazy" /> : r.kind === 'color' ? <span class="hex">{r.color}</span> : r.kind === 'note' ? <span class="note-txt">{r.note || r.title}</span> : <Icon name="link" size={22} />}
        {r.platform && r.platform !== 'upload' && r.platform !== 'web' && <span class="pf"><PfMark platform={r.platform} size={18} /></span>}
        {r.status === 'suggested' && <span class="sug">Suggested</span>}
      </div>
      <div class="ref-body">
        {(r.title || r.author) && <div class="small ellipsis2" style={{ fontWeight: 600 }}>{r.title || r.url}</div>}
        {r.author && <div class="tiny faint">@{r.author}</div>}
        {!edit && r.note && r.kind !== 'note' && <div class="tiny muted ellipsis2">{r.note}</div>}
        {!edit && r.tags.length > 0 && <div class="row wrap" style={{ gap: 4 }}>{r.tags.map((t) => <span key={t} class="tag">{t}</span>)}</div>}
        {edit && (
          <div class="col" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <input class="input" placeholder="tags, comma separated" value={tags} onInput={(e) => setTags(e.currentTarget.value)} />
            <textarea class="textarea" style={{ minHeight: 60 }} placeholder="What to take from it" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
            <div class="row"><button class="btn sm primary" onClick={() => { save({ tags, note }); setEdit(false); }}>Save</button><button class="btn sm ghost" onClick={() => setEdit(false)}>Cancel</button></div>
          </div>
        )}
        {!picking && !edit && (
          <div class="row ref-actions" onClick={(e) => e.stopPropagation()}>
            {r.status === 'suggested' ? (
              <>
                <button class="btn sm primary" onClick={() => save({ status: 'kept' })}><Icon name="check" size={14} /> Keep</button>
                <button class="btn sm ghost" onClick={() => api(`planner/refs/${r.id}`, { method: 'DELETE' }).then(onChanged)}>Discard</button>
              </>
            ) : (
              <>
                {r.url && r.kind === 'link' && <a class="btn sm ghost icon" href={r.url} target="_blank" rel="noreferrer" aria-label="Open"><Icon name="external" size={14} /></a>}
                <button class="btn sm ghost" onClick={() => setEdit(true)}>Edit</button>
                {boards?.length > 0 && (
                  <select class="select sm-select" value="" onChange={(e) => toBoard(e.currentTarget.value)} aria-label="Pin on board">
                    <option value="">Pin on…</option>
                    {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                <button class="btn sm ghost icon danger" aria-label="Delete" onClick={() => confirm('Delete this reference?') && api(`planner/refs/${r.id}`, { method: 'DELETE' }).then(onChanged)}><Icon name="trash" size={14} /></button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddRefBar({ brand, onAdded, extra = {} }) {
  const { config, toast } = useApp();
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const add = async (body) => {
    setBusy(true);
    try {
      const r = await api('planner/refs', { method: 'POST', body: { brand: brand || null, tags, note: note || undefined, ...extra, ...body } });
      setUrl(''); setNote(''); onAdded(r);
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const upload = async (files) => {
    setBusy(true);
    try { const rs = await uploadRefs(files, { brand, mode: config.storage.mode, extra: { tags, note: note || undefined, ...extra } }); rs.forEach(onAdded); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const isColor = /^#?[0-9a-f]{6}$/i.test(url.trim());
  return (
    <div class="card pad col" style={{ gap: 8, marginBottom: 14 }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload([...e.dataTransfer.files]); }}
      onPaste={(e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); upload(fs); } }}>
      <div class="row wrap" style={{ gap: 8 }}>
        <input class="input grow" style={{ minWidth: 220 }} placeholder="Paste an Instagram / YouTube / TikTok / web link, a #colour — or drop or paste images here" value={url} onInput={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && add(isColor ? { kind: 'color', color: url.trim() } : { kind: 'link', url: url.trim() })} />
        <button class="btn primary" disabled={busy || !url.trim()} onClick={() => add(isColor ? { kind: 'color', color: url.trim() } : { kind: 'link', url: url.trim() })}>{busy ? <Spinner /> : 'Save'}</button>
        <button class="btn" disabled={busy} onClick={() => fileRef.current.click()}><Icon name="upload" size={15} /> Images</button>
        <button class="btn ghost" disabled={busy || !note.trim()} onClick={() => add({ kind: 'note', note })} title="Save the note on its own">Note only</button>
        <input ref={fileRef} type="file" multiple accept="image/*" class="hidden" onChange={(e) => { upload([...e.currentTarget.files]); e.currentTarget.value = ''; }} />
      </div>
      <div class="row wrap" style={{ gap: 8 }}>
        <input class="input" style={{ flex: '1 1 200px' }} placeholder="Tags: hook, lighting, thumbnail…" value={tags} onInput={(e) => setTags(e.currentTarget.value)} list="ref-tags" />
        <input class="input" style={{ flex: '2 1 260px' }} placeholder="Why it's a good reference (optional)" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
        <datalist id="ref-tags">{TAG_SUGGEST.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
    </div>
  );
}

function RefsTab({ brand, picking, onPick, ideaId }) {
  const { bump } = useApp();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const refs = useAsync(() => api('planner/refs', { query: { brand, q, tag, idea_id: ideaId, status: 'kept' } }), [brand, q, tag, ideaId, bump]);
  const sugg = useAsync(() => (picking || ideaId ? Promise.resolve([]) : api('planner/refs', { query: { brand, status: 'suggested' } })), [brand, bump]);
  const tags = useAsync(() => api('planner/tags'), [bump]);
  const boards = useAsync(() => (picking ? Promise.resolve([]) : api('planner/boards', { query: { brand } })), [brand]);
  const reload = () => { refs.reload(); sugg.reload(); tags.reload(); };
  return (
    <>
      {!picking && <AddRefBar brand={brand} onAdded={reload} extra={ideaId ? { idea_id: ideaId } : {}} />}
      {sugg.data?.length > 0 && (
        <section class="card pad" style={{ marginBottom: 14 }}>
          <h2 class="row"><Icon name="sparkle" size={15} /> Suggested by Claude <span class="pill info">{sugg.data.length}</span></h2>
          <div class="ref-grid">{sugg.data.map((r) => <RefCard key={r.id} r={r} onChanged={reload} />)}</div>
        </section>
      )}
      <div class="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <input class="input" style={{ maxWidth: 260 }} placeholder="Search references" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <div class="row wrap" style={{ gap: 4 }}>
          <button class={`tag-btn ${!tag ? 'on' : ''}`} onClick={() => setTag('')}>All</button>
          {(tags.data || []).slice(0, 18).map((t) => <button key={t.tag} class={`tag-btn ${tag === t.tag ? 'on' : ''}`} onClick={() => setTag(tag === t.tag ? '' : t.tag)}>{t.tag} <span class="faint">{t.n}</span></button>)}
        </div>
      </div>
      {refs.loading && !refs.data ? <div class="empty"><Spinner /></div>
        : !refs.data?.length ? <div class="card"><Empty icon="image" title="No references yet">Paste a link to a reel, Short or TikTok you like, drop in screenshots, or ask Claude to "save this as a hook reference".</Empty></div>
        : <div class="ref-grid">{refs.data.map((r) => <RefCard key={r.id} r={r} onChanged={reload} picking={picking} onPick={onPick} boards={boards.data} />)}</div>}
    </>
  );
}

// ======================= Ideas =======================
function IdeaDrawer({ id, brands, series, onClose, onChanged }) {
  const { toast, accounts } = useApp();
  const { data: idea, reload } = useAsync(() => (id === 'new' ? Promise.resolve(null) : api(`planner/ideas/${id}`)), [id]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  useEffect(() => { if (idea) setF({ ...idea, formats: (idea.formats || []).join(', ') }); }, [idea]);
  if (!f) return <Drawer onClose={onClose} title="Idea"><Spinner /></Drawer>;
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async (extra = {}) => {
    setBusy(true);
    try {
      const body = { title: f.title, brand: f.brand || null, series_id: f.series_id || null, episode: f.episode ?? null, stage: f.stage, hook: f.hook, notes: f.notes,
        choice_a: f.choice_a, choice_b: f.choice_b, choice_result: f.choice_result, due_date: f.due_date || null, formats: f.formats, ...extra };
      await api(`planner/ideas/${id}`, { method: 'PATCH', body });
      toast('Saved'); onChanged(); reload();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const makeBoard = async () => {
    try {
      const b = await api('planner/boards', { method: 'POST', body: { name: f.title, brand: f.brand || null, series_id: f.series_id || null, idea_id: id } });
      onChanged(); go({ tab: 'boards', board: b.id });
    } catch (e) { toast(e.message, 'bad'); }
  };
  const attach = async (r) => {
    try { await api(`planner/refs/${r.id}`, { method: 'PATCH', body: { idea_id: id } }); setPicker(false); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const brandSeries = series.filter((s) => !f.brand || s.brand === f.brand);
  const isWwyd = /what would you do/i.test(series.find((s) => s.id === f.series_id)?.name || '') || f.choice_a || f.choice_b;
  return (
    <Drawer onClose={onClose} title={<b>{f.title || 'Idea'}</b>}
      foot={<>
        <button class="btn primary" disabled={busy} onClick={() => save()}>{busy ? <Spinner /> : 'Save'}</button>
        <a class="btn" href="#/compose"><Icon name="plus" size={15} /> New post</a>
        <span class="grow" />
        <button class="btn ghost danger icon" aria-label="Delete idea" onClick={() => confirm('Delete this idea?') && api(`planner/ideas/${id}`, { method: 'DELETE' }).then(() => { onChanged(); onClose(); })}><Icon name="trash" size={16} /></button>
      </>}>
      <div class="col" style={{ gap: 12 }}>
        <div class="field"><label>Title</label><input class="input" value={f.title} onInput={(e) => set('title', e.currentTarget.value)} /></div>
        <div class="field"><label>Stage</label><Seg value={f.stage} onChange={(v) => set('stage', v)} options={[...STAGES, ['dropped', 'Dropped']].map(([v, l]) => ({ value: v, label: l }))} /></div>
        <div class="grid2">
          <div class="field"><label>Brand</label><BrandPicker brands={brands} value={f.brand || ''} onChange={(v) => set('brand', v)} all={false} /></div>
          <div class="field"><label>Series & episode</label>
            <div class="row"><select class="select" value={f.series_id || ''} onChange={(e) => set('series_id', e.currentTarget.value)}>
              <option value="">No series</option>{brandSeries.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select><input class="input" style={{ width: 70 }} type="number" min="1" placeholder="Ep" value={f.episode ?? ''} onInput={(e) => set('episode', e.currentTarget.value === '' ? null : Number(e.currentTarget.value))} /></div>
          </div>
        </div>
        <div class="grid2">
          <div class="field"><label>Formats</label><input class="input" placeholder="reel, short, carousel" value={f.formats} onInput={(e) => set('formats', e.currentTarget.value)} /></div>
          <div class="field"><label>Due</label><input class="input" type="date" value={f.due_date ? String(f.due_date).slice(0, 10) : ''} onInput={(e) => set('due_date', e.currentTarget.value)} /></div>
        </div>
        <div class="field"><label>Hook (first 2 seconds)</label><textarea class="textarea" style={{ minHeight: 60 }} value={f.hook || ''} onInput={(e) => set('hook', e.currentTarget.value)} /></div>
        <div class="field"><label>Script / beats / shot list</label><textarea class="textarea" style={{ minHeight: 140 }} value={f.notes || ''} onInput={(e) => set('notes', e.currentTarget.value)} /></div>
        {isWwyd && (
          <div class="card pad col" style={{ gap: 8, background: 'var(--surface-2)' }}>
            <b class="small">What Would You Do</b>
            <div class="grid2">
              <div class="field"><label>Choice A</label><input class="input" value={f.choice_a || ''} onInput={(e) => set('choice_a', e.currentTarget.value)} /></div>
              <div class="field"><label>Choice B</label><input class="input" value={f.choice_b || ''} onInput={(e) => set('choice_b', e.currentTarget.value)} /></div>
            </div>
            <div class="field"><label>What the comments chose → next episode</label><input class="input" placeholder="e.g. A — 68% of comments" value={f.choice_result || ''} onInput={(e) => set('choice_result', e.currentTarget.value)} /></div>
          </div>
        )}
        {!isWwyd && <button class="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set('choice_a', ' ')}>+ Add "What would you do" choices</button>}

        <div class="field">
          <div class="row between"><label>Mood board</label></div>
          {f.board_id ? <button class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go({ tab: 'boards', board: f.board_id })}><Icon name="layers" size={14} /> Open the board</button>
            : <button class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={makeBoard}><Icon name="plus" size={14} /> Create a board for this idea</button>}
        </div>
        <div class="field">
          <div class="row between"><label>References ({idea?.refs?.length || 0})</label><button class="btn sm ghost" onClick={() => setPicker(true)}>+ From library</button></div>
          {idea?.refs?.length > 0 && <div class="mini-refs">{idea.refs.map((r) => (
            <a key={r.id} href={r.url || r.thumb_url || '#'} target="_blank" rel="noreferrer" class="mini-ref" title={r.title || r.note || ''} style={r.kind === 'color' ? { background: r.color } : undefined}>
              {r.thumb_url ? <img src={r.thumb_url} alt="" /> : <span class="tiny">{r.kind === 'color' ? r.color : (r.note || r.title || '').slice(0, 40)}</span>}
            </a>
          ))}</div>}
          <AddRefBar brand={f.brand} extra={{ idea_id: id }} onAdded={reload} />
        </div>
        {idea?.posts?.length > 0 && (
          <div class="field"><label>Posts</label>
            {idea.posts.map((p) => <div key={p.id} class="row small"><PfMark platform={p.platform} size={16} /> @{p.username} · {p.kind} · <b>{p.status}</b> · {fmtDateTime(p.scheduled_at)}{p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer">open</a>}</div>)}
          </div>
        )}
        {idea && <p class="tiny faint" style={{ margin: 0 }}>Added by {idea.created_by} · updated {relTime(idea.updated_at)}. Postroom moves this to Scheduled and Posted by itself when posts are created from it.</p>}
        {!accounts.length && null}
      </div>
      {picker && (
        <Modal onClose={() => setPicker(false)}>
          <div class="modal-head row between"><b>Attach a reference</b><button class="btn ghost icon" onClick={() => setPicker(false)} aria-label="Close"><Icon name="x" /></button></div>
          <div style={{ maxHeight: '70vh', overflow: 'auto', padding: 4 }}><RefsTab brand={f.brand || ''} picking onPick={attach} /></div>
        </Modal>
      )}
    </Drawer>
  );
}

function IdeasTab({ brand, brands, series, openId, setOpenId }) {
  const { toast, bump } = useApp();
  const { data, loading, reload } = useAsync(() => api('planner/ideas', { query: { brand } }), [brand, bump]);
  const [adding, setAdding] = useState(null); // stage
  const [title, setTitle] = useState('');
  const [drag, setDrag] = useState(null);
  const [showDropped, setShowDropped] = useState(false);
  const create = async (stage) => {
    if (!title.trim()) return;
    try {
      const i = await api('planner/ideas', { method: 'POST', body: { title, stage, brand: brand || null } });
      setTitle(''); setAdding(null); reload(); setOpenId(i.id);
    } catch (e) { toast(e.message, 'bad'); }
  };
  const move = async (idea, stage) => {
    if (idea.stage === stage) return;
    try { await api(`planner/ideas/${idea.id}`, { method: 'PATCH', body: { stage } }); reload(); } catch (e) { toast(e.message, 'bad'); }
  };
  const cols = showDropped ? [...STAGES, ['dropped', 'Dropped']] : STAGES;
  if (loading && !data) return <div class="empty"><Spinner /></div>;
  return (
    <>
      <div class="row" style={{ marginBottom: 10 }}><span class="small muted grow">Drag cards between columns (or open one and change its stage). Postroom moves cards to Scheduled and Posted by itself.</span>
        <label class="row small"><input type="checkbox" checked={showDropped} onChange={(e) => setShowDropped(e.currentTarget.checked)} /> Show dropped</label></div>
      <div class="kanban">
        {cols.map(([stage, label]) => {
          const list = (data || []).filter((i) => i.stage === stage);
          return (
            <div key={stage} class={`kcol ${drag ? 'can-drop' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) move(drag, stage); setDrag(null); }}>
              <div class="kcol-head"><b>{label}</b><span class="faint small">{list.length}</span><span class="grow" />
                {['idea', 'scripting', 'producing', 'ready'].includes(stage) && <button class="btn ghost sm icon" aria-label={`Add to ${label}`} onClick={() => { setAdding(stage); setTitle(''); }}><Icon name="plus" size={15} /></button>}
              </div>
              {adding === stage && (
                <div class="kcard" style={{ cursor: 'default' }}>
                  <input class="input" autoFocus placeholder="Idea title" value={title} onInput={(e) => setTitle(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(stage); if (e.key === 'Escape') setAdding(null); }} />
                  <div class="row" style={{ marginTop: 6 }}><button class="btn sm primary" onClick={() => create(stage)}>Add</button><button class="btn sm ghost" onClick={() => setAdding(null)}>Cancel</button></div>
                </div>
              )}
              {list.map((i) => (
                <div key={i.id} class="kcard" draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} onClick={() => setOpenId(i.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(i.id)}>
                  {i.thumb && <img class="kthumb" src={i.thumb} alt="" loading="lazy" />}
                  <div class="small" style={{ fontWeight: 600 }}>{i.title}</div>
                  <div class="row wrap tiny faint" style={{ gap: 6, marginTop: 4 }}>
                    {!brand && i.brand && <span>{i.brand}</span>}
                    {i.series_name && <span class="tag">{i.series_name}{i.episode ? ` · Ep ${i.episode}` : ''}</span>}
                    {i.refs > 0 && <span><Icon name="image" size={11} /> {i.refs}</span>}
                    {i.board_id && <span><Icon name="layers" size={11} /> board</span>}
                    {i.due_date && <span><Icon name="clock" size={11} /> {String(i.due_date).slice(5, 10)}</span>}
                    {i.post_at && <span>{fmtDateTime(i.post_at)}</span>}
                    {i.created_by === 'claude' && <Icon name="sparkle" size={11} />}
                  </div>
                  {i.choice_result && <div class="tiny" style={{ marginTop: 4 }}>Chosen: <b>{i.choice_result}</b></div>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {openId && <IdeaDrawer id={openId} brands={brands} series={series} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}

// ======================= Series =======================
function SeriesForm({ s, brands, onDone, onCancel }) {
  const { toast } = useApp();
  const [f, setF] = useState(s || { brand: brands[0]?.name || '', name: '', description: '', format: '', cadence: '', next_note: '', status: 'active' });
  const save = async () => {
    try {
      if (s?.id) await api(`planner/series/${s.id}`, { method: 'PATCH', body: f });
      else await api('planner/series', { method: 'POST', body: f });
      onDone();
    } catch (e) { toast(e.message, 'bad'); }
  };
  const set = (k, v) => setF({ ...f, [k]: v });
  return (
    <div class="card pad col" style={{ gap: 10 }}>
      <div class="grid2">
        <div class="field"><label>Brand</label><BrandPicker brands={brands} value={f.brand} onChange={(v) => set('brand', v)} all={false} /></div>
        <div class="field"><label>Name</label><input class="input" value={f.name} onInput={(e) => set('name', e.currentTarget.value)} placeholder="What Would You Do" /></div>
        <div class="field"><label>Format</label><input class="input" value={f.format || ''} onInput={(e) => set('format', e.currentTarget.value)} placeholder="Reel + YouTube Short" /></div>
        <div class="field"><label>Cadence</label><input class="input" value={f.cadence || ''} onInput={(e) => set('cadence', e.currentTarget.value)} placeholder="Daily" /></div>
      </div>
      <div class="field"><label>What it is</label><textarea class="textarea" style={{ minHeight: 60 }} value={f.description || ''} onInput={(e) => set('description', e.currentTarget.value)} /></div>
      <div class="field"><label>Next episode / what the audience chose</label><input class="input" value={f.next_note || ''} onInput={(e) => set('next_note', e.currentTarget.value)} /></div>
      {s?.id && <div class="field"><label>Status</label><Seg value={f.status} onChange={(v) => set('status', v)} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'ended', label: 'Ended' }]} /></div>}
      <div class="row"><button class="btn primary" onClick={save}>Save series</button><button class="btn ghost" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function SeriesTab({ brand, brands, series, reloadSeries, openIdea }) {
  const { toast, bump } = useApp();
  const ideas = useAsync(() => api('planner/ideas', { query: { brand } }), [brand, bump]);
  const [editing, setEditing] = useState(null);
  const list = series.filter((s) => !brand || s.brand === brand);
  const addEpisode = async (s) => {
    try {
      const i = await api('planner/ideas', { method: 'POST', body: { title: `${s.name} — new episode`, series_id: s.id, brand: s.brand } });
      ideas.reload(); reloadSeries(); openIdea(i.id);
    } catch (e) { toast(e.message, 'bad'); }
  };
  const groups = [...new Set(list.map((s) => s.brand))];
  return (
    <>
      <div class="row" style={{ marginBottom: 12 }}><button class="btn primary" onClick={() => setEditing({})}><Icon name="plus" size={15} /> New series</button></div>
      {editing && !editing.id && <div style={{ marginBottom: 14 }}><SeriesForm brands={brands} onDone={() => { setEditing(null); reloadSeries(); }} onCancel={() => setEditing(null)} /></div>}
      {!list.length && <div class="card"><Empty icon="layers" title="No series yet">Group episodes into series — e.g. What Would You Do, Real Cases, Old vs New.</Empty></div>}
      {groups.map((g) => (
        <section key={g} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>{g}</h2>
          <div class="series-grid">
            {list.filter((s) => s.brand === g).map((s) => editing?.id === s.id
              ? <SeriesForm key={s.id} s={s} brands={brands} onDone={() => { setEditing(null); reloadSeries(); }} onCancel={() => setEditing(null)} />
              : (
                <div key={s.id} class="card pad col" style={{ gap: 8 }}>
                  <div class="row"><b class="grow">{s.name}</b><span class={`pill ${s.status === 'active' ? 'good' : ''}`}>{s.status}</span><button class="btn ghost sm" onClick={() => setEditing(s)}>Edit</button></div>
                  <div class="tiny muted">{[s.format, s.cadence, `${s.posted}/${s.episodes} posted`].filter(Boolean).join(' · ')}</div>
                  {s.description && <div class="small">{s.description}</div>}
                  {s.next_note && <div class="notice info small" style={{ padding: '7px 10px' }}><b>Next:</b>&nbsp;{s.next_note}</div>}
                  <div class="col" style={{ gap: 4 }}>
                    {(ideas.data || []).filter((i) => i.series_id === s.id).sort((a, b) => (a.episode || 0) - (b.episode || 0)).map((i) => (
                      <button key={i.id} class="ep-row" onClick={() => openIdea(i.id)}>
                        <span class="num faint" style={{ width: 34 }}>{i.episode ? `Ep ${i.episode}` : '—'}</span>
                        <span class="grow ellipsis">{i.title}</span>
                        {i.choice_result && <span class="tiny" title="What the comments chose">→ {i.choice_result}</span>}
                        <span class={`pill ${i.stage === 'posted' ? 'good' : i.stage === 'scheduled' ? 'info' : ''}`}>{STAGE_LABEL[i.stage]}</span>
                      </button>
                    ))}
                  </div>
                  <button class="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => addEpisode(s)}><Icon name="plus" size={14} /> Episode</button>
                </div>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

// ======================= Boards =======================
function BoardsTab({ brand, brands, series }) {
  const { toast, bump } = useApp();
  const { data, loading, reload } = useAsync(() => api('planner/boards', { query: { brand } }), [brand, bump]);
  const [form, setForm] = useState(null);
  const create = async () => {
    try {
      const b = await api('planner/boards', { method: 'POST', body: form });
      setForm(null); reload(); go({ tab: 'boards', board: b.id });
    } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <>
      <div class="row" style={{ marginBottom: 12 }}><button class="btn primary" onClick={() => setForm({ name: '', brand: brand || brands[0]?.name || '', series_id: '' })}><Icon name="plus" size={15} /> New mood board</button></div>
      {form && (
        <div class="card pad row wrap" style={{ gap: 8, marginBottom: 14 }}>
          <input class="input" style={{ flex: '2 1 220px' }} autoFocus placeholder="Board name, e.g. 'WWYD — night look'" value={form.name} onInput={(e) => setForm({ ...form, name: e.currentTarget.value })} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <BrandPicker brands={brands} value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} all={false} />
          <select class="select" style={{ width: 'auto' }} value={form.series_id} onChange={(e) => setForm({ ...form, series_id: e.currentTarget.value })}>
            <option value="">No series</option>{series.filter((s) => !form.brand || s.brand === form.brand).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button class="btn primary" onClick={create} disabled={!form.name.trim()}>Create</button><button class="btn ghost" onClick={() => setForm(null)}>Cancel</button>
        </div>
      )}
      {loading && !data ? <div class="empty"><Spinner /></div>
        : !data?.length ? <div class="card"><Empty icon="layers" title="No mood boards yet">A board collects the look and feel: frames you like, colours, fonts, notes and references.</Empty></div>
        : (
          <div class="board-grid">
            {data.map((b) => (
              <button key={b.id} class="board-card" onClick={() => go({ tab: 'boards', board: b.id })}>
                <div class="board-prev">{(b.previews || []).slice(0, 4).map((p, i) => <img key={i} src={p} alt="" loading="lazy" />)}{!(b.previews || []).length && <Icon name="layers" size={26} />}</div>
                <div style={{ padding: '10px 12px', textAlign: 'left' }}>
                  <b class="small">{b.name}</b>
                  <div class="tiny faint">{[b.brand, b.series_name, `${b.items} item${b.items === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</div>
                </div>
              </button>
            ))}
          </div>
        )}
    </>
  );
}

// ======================= Page =======================
export default function Planner({ params }) {
  const tab = params.tab || 'ideas';
  const [brand, setBrand] = useBrand();
  const brands = useAsync(() => api('planner/brands'), []);
  const series = useAsync(() => api('planner/series'), []);
  const [openIdea, setOpenIdea] = useState(params.idea || null);
  if (params.board) return <BoardView id={params.board} />;
  const bs = brands.data || [];
  const openIdeaFromSeries = (id) => { go({ tab: 'ideas', idea: id }); setOpenIdea(id); };
  return (
    <>
      <div class="page-head">
        <h1>Planner</h1>
        <span class="sub">Ideas, series, mood boards and references, all in one place.</span>
        <span class="grow" />
        <BrandPicker brands={bs} value={brand} onChange={setBrand} />
      </div>
      <div class="row" style={{ marginBottom: 16 }}>
        <Seg value={tab} onChange={(v) => go({ tab: v })} options={[{ value: 'ideas', label: 'Ideas' }, { value: 'series', label: 'Series' }, { value: 'boards', label: 'Mood boards' }, { value: 'refs', label: 'References' }]} />
      </div>
      {tab === 'ideas' && <IdeasTab brand={brand} brands={bs} series={series.data || []} openId={openIdea} setOpenId={setOpenIdea} />}
      {tab === 'series' && <SeriesTab brand={brand} brands={bs} series={series.data || []} reloadSeries={series.reload} openIdea={openIdeaFromSeries} />}
      {tab === 'boards' && <BoardsTab brand={brand} brands={bs} series={series.data || []} />}
      {tab === 'refs' && <RefsTab brand={brand} />}
    </>
  );
}

export { RefsTab, uploadRefs };
