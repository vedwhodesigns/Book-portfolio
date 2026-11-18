import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api.js';
import { useApp, Icon, Spinner, Modal, PfMark } from '../ui.jsx';
import { RefsTab, uploadRefs } from './Planner.jsx';

const NOTE_COLORS = ['#fff3b0', '#ffd6e0', '#d6f5e3', '#d9e8ff', '#ece0ff', '#f1f0ec'];
const back = () => { location.hash = '#/planner?tab=boards'; };

/** One thing on the canvas. Drag anywhere to move, the corner to resize. */
function Item({ it, onMove, onResize, onFront, onDelete, onEdit, zoom }) {
  const start = useRef(null);
  const down = (e, mode) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('textarea, input, a, button.no-drag')) return;
    e.preventDefault();
    e.stopPropagation();
    onFront(it);
    start.current = { mode, px: e.clientX, py: e.clientY, x: it.x, y: it.y, w: it.w, h: it.h };
    const move = (ev) => {
      const s = start.current;
      if (!s) return;
      const dx = (ev.clientX - s.px) / zoom;
      const dy = (ev.clientY - s.py) / zoom;
      if (s.mode === 'move') onMove(it, Math.max(0, Math.round(s.x + dx)), Math.max(0, Math.round(s.y + dy)), false);
      else onResize(it, Math.max(80, Math.round(s.w + dx)), Math.max(60, Math.round(s.h + dy)), false);
    };
    const up = (ev) => {
      const s = start.current;
      start.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!s) return;
      const dx = (ev.clientX - s.px) / zoom;
      const dy = (ev.clientY - s.py) / zoom;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      if (s.mode === 'move') onMove(it, Math.max(0, Math.round(s.x + dx)), Math.max(0, Math.round(s.y + dy)), true);
      else onResize(it, Math.max(80, Math.round(s.w + dx)), Math.max(60, Math.round(s.h + dy)), true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const r = it.ref;
  const c = it.content || {};
  let body;
  if (it.kind === 'note') {
    body = <textarea class="b-note" style={{ background: c.color || NOTE_COLORS[0] }} defaultValue={c.text || ''} placeholder="Note…" onBlur={(e) => e.currentTarget.value !== (c.text || '') && onEdit(it, { text: e.currentTarget.value })} />;
  } else if (it.kind === 'color' || r?.kind === 'color') {
    const col = c.color || r?.color;
    body = <div class="b-color" style={{ background: col }}><span>{col}</span></div>;
  } else {
    const img = r?.thumb_url || c.thumb_url || (it.kind === 'image' ? c.url : null);
    const title = r?.title || c.title;
    const href = r?.url || c.url;
    body = (
      <div class="b-ref">
        {img ? <img src={img} alt="" draggable={false} /> : <div class="b-txt">{r?.note || title || href}</div>}
        {(title || r?.platform) && it.kind !== 'image' && (
          <div class="b-cap">
            {r?.platform && !['web', 'upload'].includes(r.platform) && <PfMark platform={r.platform} size={14} />}
            <span class="ellipsis">{title || href}</span>
            {href && r?.kind === 'link' && <a class="no-drag" href={href} target="_blank" rel="noreferrer" aria-label="Open link"><Icon name="external" size={12} /></a>}
          </div>
        )}
        {r?.tags?.length > 0 && <div class="b-tags">{r.tags.slice(0, 3).map((t) => <span key={t}>{t}</span>)}</div>}
      </div>
    );
  }
  return (
    <div class="b-item" style={{ left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.z }} onPointerDown={(e) => down(e, 'move')}>
      {body}
      <button class="b-del no-drag" aria-label="Remove from board" onPointerDown={(e) => e.stopPropagation()} onClick={() => onDelete(it)}><Icon name="x" size={12} /></button>
      {it.kind === 'note' && (
        <div class="b-swatches no-drag" onPointerDown={(e) => e.stopPropagation()}>
          {NOTE_COLORS.map((col) => <button key={col} class="no-drag" style={{ background: col }} aria-label="Note colour" onClick={() => onEdit(it, { color: col })} />)}
        </div>
      )}
      <span class="b-resize" onPointerDown={(e) => down(e, 'resize')} />
    </div>
  );
}

export default function BoardView({ id }) {
  const { config, toast } = useApp();
  const [board, setBoard] = useState(null);
  const [items, setItems] = useState([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(() => (window.innerWidth < 700 ? 0.6 : 1));
  const [link, setLink] = useState('');
  const fileRef = useRef();
  const canvasRef = useRef();

  const load = async () => {
    const b = await api(`planner/boards/${id}`);
    setBoard(b);
    setItems(b.items);
  };
  useEffect(() => { load().catch((e) => toast(e.message, 'bad')); }, [id]);

  const patchLocal = (it, patch) => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, ...patch, content: patch.content ? { ...x.content, ...patch.content } : x.content } : x)));
  const save = (it, patch) => api(`planner/boards/${id}/items/${it.id}`, { method: 'PATCH', body: patch }).catch((e) => toast(e.message, 'bad'));
  const onMove = (it, x, y, done) => { patchLocal(it, { x, y }); if (done) save(it, { x, y }); };
  const onResize = (it, w, h, done) => { patchLocal(it, { w, h }); if (done) save(it, { w, h }); };
  const onFront = (it) => {
    const top = Math.max(0, ...items.map((x) => x.z)) + 1;
    if (it.z < top - 1 || items.filter((x) => x.z === it.z).length > 1) { patchLocal(it, { z: top }); save(it, { z: top }); }
  };
  const onEdit = (it, content) => { patchLocal(it, { content }); save(it, { content }); };
  const onDelete = async (it) => {
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    await api(`planner/boards/${id}/items/${it.id}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'bad'));
  };
  /** Where the visible middle of the canvas is, in board coordinates. */
  const center = () => {
    const el = canvasRef.current;
    if (!el) return { x: 40, y: 40 };
    return { x: Math.round((el.scrollLeft + el.clientWidth / 2) / zoom) - 110, y: Math.round((el.scrollTop + el.clientHeight / 3) / zoom) - 60 };
  };
  const add = async (body, at = center()) => {
    try {
      const it = await api(`planner/boards/${id}/items`, { method: 'POST', body: { ...at, ...body } });
      if (it.ref_id) await load(); else setItems((xs) => [...xs, it]);
    } catch (e) { toast(e.message, 'bad'); }
  };
  const addImages = async (files, at) => {
    setBusy(true);
    try {
      const refs = await uploadRefs(files, { brand: board?.brand, mode: config.storage.mode });
      let i = 0;
      for (const r of refs) {
        const pos = at || center();
        await api(`planner/boards/${id}/items`, { method: 'POST', body: { kind: 'ref', ref_id: r.id, x: pos.x + i * 30, y: pos.y + i * 30 } });
        i++;
      }
      await load();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const addLink = async () => {
    const v = link.trim();
    if (!v) return;
    setBusy(true);
    try {
      if (/^#?[0-9a-f]{6}$/i.test(v)) await add({ kind: 'color', color: v.startsWith('#') ? v : `#${v}` });
      else {
        const r = await api('planner/refs', { method: 'POST', body: { kind: 'link', url: v, brand: board?.brand || null } });
        await add({ kind: 'ref', ref_id: r.id });
      }
      setLink('');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const drop = (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    const rect = canvasRef.current.getBoundingClientRect();
    const at = { x: Math.round((e.clientX - rect.left + canvasRef.current.scrollLeft) / zoom), y: Math.round((e.clientY - rect.top + canvasRef.current.scrollTop) / zoom) };
    if (files.length) return addImages(files, at);
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
    if (url && /^https?:\/\//.test(url)) api('planner/refs', { method: 'POST', body: { kind: 'link', url, brand: board?.brand || null } }).then((r) => add({ kind: 'ref', ref_id: r.id }, at)).catch((er) => toast(er.message, 'bad'));
  };
  useEffect(() => {
    const paste = (e) => {
      if (e.target.closest?.('textarea, input')) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addImages(files); return; }
      const t = e.clipboardData?.getData('text');
      if (t && /^https?:\/\//.test(t.trim())) { e.preventDefault(); setLink(t.trim()); }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });

  const fit = () => {
    const el = canvasRef.current;
    if (!el || !items.length) return;
    const maxX = Math.max(...items.map((x) => x.x + x.w)) + 40;
    const maxY = Math.max(...items.map((x) => x.y + x.h)) + 40;
    const z = Math.max(0.2, Math.min(1.2, el.clientWidth / maxX, el.clientHeight / maxY));
    setZoom(+z.toFixed(2));
    el.scrollTo(0, 0);
  };
  useEffect(() => { if (window.innerWidth < 700 && items.length) fit(); }, [board?.id]);
  if (!board) return <div class="empty"><Spinner /></div>;
  const rename = async () => {
    const name = prompt('Board name', board.name);
    if (!name) return;
    await api(`planner/boards/${id}`, { method: 'PATCH', body: { name } });
    setBoard({ ...board, name });
  };
  const w = Math.max(2400, ...items.map((x) => x.x + x.w + 400));
  const h = Math.max(1600, ...items.map((x) => x.y + x.h + 400));
  return (
    <div class="board-page">
      <div class="board-bar">
        <button class="btn ghost sm" onClick={back}><Icon name="list" size={15} /> Boards</button>
        <b class="board-title" onClick={rename} title="Rename">{board.name}</b>
        {board.brand && <span class="tiny faint hide-sm">{board.brand}</span>}
        <span class="grow" />
        <input class="input board-link" placeholder="Paste a link or #colour" value={link} onInput={(e) => setLink(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
        <button class="btn sm" disabled={busy || !link.trim()} onClick={addLink}>Add</button>
        <button class="btn sm" disabled={busy} onClick={() => fileRef.current.click()}>{busy ? <Spinner /> : <Icon name="upload" size={14} />} Images</button>
        <button class="btn sm" onClick={() => add({ kind: 'note', text: '' })}>Note</button>
        <button class="btn sm" onClick={() => setPicker(true)}>From library</button>
        <div class="seg"><button onClick={() => setZoom(Math.max(0.3, +(zoom - 0.1).toFixed(1)))} aria-label="Zoom out">−</button><button class="on" onClick={() => setZoom(1)} title="Back to 100%">{Math.round(zoom * 100)}%</button><button onClick={fit} title="Fit everything on screen">Fit</button><button onClick={() => setZoom(Math.min(1.6, +(zoom + 0.1).toFixed(1)))} aria-label="Zoom in">+</button></div>
        <button class="btn ghost sm icon danger" aria-label="Delete board" onClick={() => confirm(`Delete the board "${board.name}"? References stay in the library.`) && api(`planner/boards/${id}`, { method: 'DELETE' }).then(back)}><Icon name="trash" size={14} /></button>
        <input ref={fileRef} type="file" multiple accept="image/*" class="hidden" onChange={(e) => { addImages([...e.currentTarget.files]); e.currentTarget.value = ''; }} />
      </div>
      <div class="board-canvas" ref={canvasRef} onDragOver={(e) => e.preventDefault()} onDrop={drop}>
        <div class="board-plane" style={{ width: w * zoom, height: h * zoom }}>
          <div style={{ width: w, height: h, transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'relative' }}>
            {items.map((it) => <Item key={it.id} it={it} zoom={zoom} onMove={onMove} onResize={onResize} onFront={onFront} onDelete={onDelete} onEdit={onEdit} />)}
            {!items.length && <div class="board-empty">Drop images here, paste a screenshot or a link (Ctrl+V), or use the buttons above.</div>}
          </div>
        </div>
      </div>
      {picker && (
        <Modal onClose={() => setPicker(false)}>
          <div class="modal-head row between"><b>Pin from the reference library</b><button class="btn ghost icon" onClick={() => setPicker(false)} aria-label="Close"><Icon name="x" /></button></div>
          <div style={{ maxHeight: '70vh', overflow: 'auto', padding: 4 }}>
            <RefsTab brand={board.brand || ''} picking onPick={(r) => { setPicker(false); add({ kind: 'ref', ref_id: r.id }); }} />
          </div>
        </Modal>
      )}
    </div>
  );
}
