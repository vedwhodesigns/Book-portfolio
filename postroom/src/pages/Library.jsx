import { useState, useRef } from 'preact/hooks';
import { api, uploadFile, fmtDur, fmtBytes } from '../api.js';
import { useApp, useAsync, Icon, Empty, Spinner } from '../ui.jsx';

export default function Library() {
  const { config, toast } = useApp();
  const { data, loading, reload } = useAsync(() => api('media', { query: { limit: 200 } }), []);
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef();
  const add = async (files) => {
    setUploading((n) => n + files.length);
    for (const f of files) {
      try {
        await uploadFile(f, config.storage.mode);
      } catch (e) {
        toast(`${f.name}: ${e.message}`, 'bad');
      }
      setUploading((n) => n - 1);
    }
    reload();
  };
  const del = async (m) => {
    if (!confirm(`Delete ${m.filename}?`)) return;
    try {
      await api(`media/${m.id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      toast(e.message, 'bad');
    }
  };
  return (
    <>
      <div class="page-head">
        <h1>Library</h1>
        <span class="sub">Every file you've uploaded. Reuse them in new posts.</span>
        <div class="grow" />
        {uploading > 0 && <span class="row small"><Spinner /> Uploading {uploading}…</span>}
        <button class="btn primary" onClick={() => fileRef.current.click()}><Icon name="upload" size={16} /> Upload</button>
        <input ref={fileRef} type="file" multiple class="hidden" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => { add([...e.currentTarget.files]); e.currentTarget.value = ''; }} />
      </div>
      {loading ? <Spinner /> : !data?.length ? (
        <div class="card"><Empty icon="image" title="Your library is empty">Upload videos and images here or straight from the composer.</Empty></div>
      ) : (
        <div class="lib-grid">
          {data.map((m) => (
            <div class="lib-item" key={m.id}>
              {m.poster_url ? <img src={m.poster_url} alt="" loading="lazy" /> : null}
              <div class="info">
                <div style={{ minWidth: 0 }}>
                  <div class="ellipsis" style={{ fontWeight: 600 }}>{m.filename}</div>
                  <div>{m.kind === 'video' ? fmtDur(m.duration_s) : `${m.width}×${m.height}`} · {fmtBytes(m.size_bytes)}{m.used_by ? ` · used ${m.used_by}×` : ''}</div>
                </div>
                <div class="row" style={{ gap: 4 }}>
                  <button class="btn sm icon" style={{ background: 'rgb(0 0 0 / .5)', color: '#fff', border: 0 }} aria-label="Delete" onClick={() => del(m)}><Icon name="trash" size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
