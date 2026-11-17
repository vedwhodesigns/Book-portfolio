import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { api, uploadFile, wallTime, todayKey, addDays, getTz, fmtDur, fmtBytes, fmtDateTime } from '../api.js';
import { useApp, Icon, PfMark, PF, KIND, Seg, Toggle, Spinner, Avatar, Empty } from '../ui.jsx';

const YT_CATEGORIES = { 1: 'Film & Animation', 2: 'Autos & Vehicles', 10: 'Music', 15: 'Pets & Animals', 17: 'Sports', 19: 'Travel & Events', 20: 'Gaming', 22: 'People & Blogs', 23: 'Comedy', 24: 'Entertainment', 25: 'News & Politics', 26: 'Howto & Style', 27: 'Education', 28: 'Science & Technology', 29: 'Nonprofits & Activism' };

const LIMITS = { instagram: 2200, youtube: 5000, tiktok: 2200 };
const TT_PRIVACY = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me',
};

function kindOptions(platform, media) {
  const vids = media.filter((m) => m.kind === 'video').length;
  if (platform === 'instagram') {
    if (media.length > 1) return ['carousel'];
    if (media.length === 1) return vids ? ['reel', 'story'] : ['image', 'story'];
    return ['reel'];
  }
  if (platform === 'youtube') return ['short', 'video'];
  return ['video'];
}
function defaultKind(platform, media) {
  const m = media[0];
  if (platform === 'youtube') return m && m.duration_s && m.duration_s <= 180 && m.height >= m.width ? 'short' : 'video';
  return kindOptions(platform, media)[0];
}
function nextSlot(dateKey) {
  if (dateKey && dateKey > todayKey()) return `${dateKey}T18:00`;
  const d = new Date(Date.now() + 60 * 60e3);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return wallTime(d);
}

/** Cover / thumbnail chooser: upload a new image or pick one from the library. */
function CoverPicker({ label, hint, value, onChange, images, onUpload, uploading }) {
  const ref = useRef();
  const chosen = images.find((m) => m.id === value);
  return (
    <div class="field">
      <label>{label}</label>
      <div class="row wrap" style={{ gap: 10, alignItems: 'center' }}>
        {chosen && <img src={chosen.poster_url || chosen.url} alt="" style={{ height: 64, borderRadius: 8, border: '1px solid var(--line)' }} />}
        <button type="button" class="btn sm" onClick={() => ref.current.click()} disabled={uploading}>{uploading ? <Spinner /> : <Icon name="upload" size={14} />} Upload image</button>
        <select class="select" style={{ width: 'auto', maxWidth: 260 }} value={value || ''} onChange={(e) => onChange(e.currentTarget.value || '')}>
          <option value="">{chosen ? 'Remove' : 'Or pick from library…'}</option>
          {images.map((m) => <option key={m.id} value={m.id}>{m.filename} ({m.width}×{m.height})</option>)}
        </select>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" class="hidden" onChange={(e) => { const f = e.currentTarget.files[0]; e.currentTarget.value = ''; if (f) onUpload(f); }} />
      </div>
      {hint && <span class="tiny faint">{hint}</span>}
    </div>
  );
}

/** Pick the reel cover frame by time (Instagram's thumb_offset). */
function FramePicker({ video, value, onChange }) {
  const ref = useRef();
  const dur = video.duration_s || 0;
  useEffect(() => { if (ref.current && value != null) ref.current.currentTime = value / 1000; }, [value]);
  return (
    <div class="field">
      <label>Cover frame</label>
      <div class="row" style={{ gap: 12, alignItems: 'center' }}>
        <video ref={ref} src={video.url} muted playsInline preload="metadata" style={{ height: 110, borderRadius: 8, background: '#000', flex: 'none' }} />
        <div class="col grow" style={{ gap: 4 }}>
          <input type="range" min={0} max={Math.max(0, Math.floor(dur * 1000) - 50)} step={100} value={value ?? 0} onInput={(e) => onChange(Number(e.currentTarget.value))} disabled={!dur} />
          <span class="tiny faint">{dur ? `Frame at ${fmtDur((value ?? 0) / 1000)} — or upload a cover image below` : "Couldn't read the video length — upload a cover image instead."}</span>
        </div>
      </div>
    </div>
  );
}

function MediaTile({ m, index, selected, onClick, onRemove }) {
  return (
    <button type="button" class={`media-tile ${selected ? 'sel' : ''}`} onClick={onClick} title={m.filename}>
      {m.poster_url ? <img src={m.poster_url} alt="" loading="lazy" /> : <span />}
      <span class="meta">{m.kind === 'video' ? fmtDur(m.duration_s) || 'Video' : m.width ? `${m.width}×${m.height}` : 'Image'}</span>
      {selected && index != null && <span class="order">{index + 1}</span>}
      {onRemove && <span class="x btn sm icon" style={{ background: 'rgb(0 0 0 / .55)', color: '#fff', border: 0, width: 22, height: 22 }} onClick={(e) => { e.stopPropagation(); onRemove(); }}><Icon name="x" size={12} /></span>}
    </button>
  );
}

export default function Compose({ params }) {
  const { accounts, config, toast, go, refresh } = useApp();
  const [library, setLibrary] = useState([]);
  const [media, setMedia] = useState([]); // selected, ordered
  const [uploads, setUploads] = useState([]); // in-flight {name, progress}
  const [over, setOver] = useState(false);
  const [selected, setSelected] = useState(params.account ? [params.account] : []);
  const [caption, setCaption] = useState('');
  const [overrides, setOverrides] = useState({}); // platform -> caption
  const [ytTitle, setYtTitle] = useState('');
  const [kinds, setKinds] = useState({});
  const [opts, setOpts] = useState({
    instagram: { share_to_feed: true, collaborators: '', user_tags: '', alt_text: '', audio_name: '', trial: '', ai_generated: false, first_comment: '' },
    youtube: { privacy: 'public', made_for_kids: false, notify_subscribers: true, tags: [], category_id: '22', synthetic: false, first_comment: '' },
    tiktok: { mode: 'direct', privacy_level: '', disable_comment: false, disable_duet: false, disable_stitch: false, brand_content: false, brand_organic: false, is_aigc: false },
  });
  const [tab, setTab] = useState(null);
  const [when, setWhen] = useState(params.date ? 'schedule' : 'now');
  const [at, setAt] = useState(nextSlot(params.date));
  const [covers, setCovers] = useState({ instagram: '', youtube: '' }); // per-platform cover / thumbnail media id
  const [coverBusy, setCoverBusy] = useState(null);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState({ open: false, brief: '', tone: '', busy: false });
  const [creator, setCreator] = useState({}); // tiktok account id -> creator info
  const [importUrl, setImportUrl] = useState('');
  const [idea, setIdea] = useState(null); // research post this draft is inspired by
  const [perAcct, setPerAcct] = useState({}); // account id -> { caption?, title?, playlist_id? }
  const [playlists, setPlaylists] = useState({}); // youtube account id -> { playlists, can_manage } | { error }
  const fileRef = useRef();

  const active = accounts.filter((a) => a.status === 'active');
  const chosen = accounts.filter((a) => selected.includes(a.id));
  const platforms = [...new Set(chosen.map((a) => a.platform))];
  const allImages = media.length > 0 && media.every((m) => m.kind === 'image');
  const pfKind = (pf) => (kindOptions(pf, media).includes(kinds[pf]) ? kinds[pf] : defaultKind(pf, media));
  const setAcct = (id, k, v) => setPerAcct((s) => {
    const n = { ...(s[id] || {}) };
    if (v === undefined) delete n[k]; else n[k] = v;
    return { ...s, [id]: n };
  });

  useEffect(() => {
    api('media', { query: { limit: 40 } }).then(setLibrary).catch(() => {});
    if (params.idea) {
      api(`research/posts/${params.idea}`).then((r) => { setIdea(r); setAi((s) => ({ ...s, open: true, brief: r.brief })); }).catch((e) => toast(e.message, 'bad'));
    }
    if (params.from) {
      api(`posts/${params.from}`).then((p) => {
        setMedia(p.media);
        setSelected([p.account_id]);
        setCaption(p.caption || '');
        setYtTitle(p.title || '');
        setKinds({ [p.platform]: p.kind });
        setOpts((o) => ({ ...o, [p.platform]: { ...o[p.platform], ...p.options } }));
        if (p.cover) setCovers((c) => ({ ...c, [p.platform]: p.cover.id }));
      }).catch((e) => toast(e.message, 'bad'));
    }
  }, []);
  useEffect(() => { if (!platforms.includes(tab)) setTab(platforms[0] || null); }, [platforms.join()]);
  // Each channel has its own playlists.
  useEffect(() => {
    for (const a of chosen.filter((x) => x.platform === 'youtube' && !playlists[x.id])) {
      api(`accounts/${a.id}/playlists`).then((r) => setPlaylists((p) => ({ ...p, [a.id]: r }))).catch((e) => setPlaylists((p) => ({ ...p, [a.id]: { error: e.message } })));
    }
  }, [selected.join()]);

  // TikTok requires showing the creator's current options before a direct post.
  useEffect(() => {
    for (const a of chosen.filter((x) => x.platform === 'tiktok' && !creator[x.id])) {
      api(`accounts/${a.id}/creator-info`).then((info) => setCreator((c) => ({ ...c, [a.id]: info }))).catch((e) => setCreator((c) => ({ ...c, [a.id]: { error: e.message } })));
    }
  }, [selected.join()]);

  const targets = chosen.map((a) => {
    const pa = perAcct[a.id] || {};
    const yt = a.platform === 'youtube';
    return {
      account_id: a.id,
      kind: pfKind(a.platform),
      caption: pa.caption ?? overrides[a.platform] ?? undefined,
      title: yt ? (pa.title ?? ytTitle) || undefined : undefined,
      options: yt ? { ...opts.youtube, playlist_id: pa.playlist_id || undefined } : opts[a.platform],
      cover_media_id: covers[a.platform] || null,
    };
  });
  const payload = { media_ids: media.map((m) => m.id), caption, targets, ...(when === 'slot' ? { scheduled_at: 'next_slot' } : {}) };

  // Live rule check (debounced).
  useEffect(() => {
    if (!media.length || !targets.length) { setCheck(null); return; }
    setChecking(true);
    const t = setTimeout(() => {
      api('posts/check', { method: 'POST', body: payload }).then(setCheck).catch((e) => setCheck({ ok: false, error: e.message, targets: [] })).finally(() => setChecking(false));
    }, 450);
    return () => clearTimeout(t);
  }, [JSON.stringify(payload)]);

  const addFiles = async (files) => {
    for (const f of files) {
      const key = `${f.name}-${f.size}-${Math.random()}`;
      setUploads((u) => [...u, { key, name: f.name, progress: 0 }]);
      try {
        const m = await uploadFile(f, config.storage.mode, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))));
        setLibrary((l) => [m, ...l]);
        setMedia((s) => [...s, m]);
      } catch (e) {
        toast(`${f.name}: ${e.message}`, 'bad');
      } finally {
        setUploads((u) => u.filter((x) => x.key !== key));
      }
    }
  };
  const importLink = async () => {
    if (!importUrl) return;
    setUploads((u) => [...u, { key: 'url', name: 'link', progress: 0.5 }]);
    try {
      const m = await api('media/import', { method: 'POST', body: { url: importUrl } });
      setLibrary((l) => [m, ...l]);
      setMedia((s) => [...s, m]);
      setImportUrl('');
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setUploads((u) => u.filter((x) => x.key !== 'url'));
    }
  };
  const uploadCover = async (pf, f) => {
    setCoverBusy(pf);
    try {
      const m = await uploadFile(f, config.storage.mode);
      setLibrary((l) => [m, ...l]);
      setCovers((c) => ({ ...c, [pf]: m.id }));
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      setCoverBusy(null);
    }
  };
  const toggleMedia = (m) => setMedia((s) => (s.some((x) => x.id === m.id) ? s.filter((x) => x.id !== m.id) : [...s, m]));
  const toggleAcct = (a) => setSelected((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]));
  const setOpt = (pf, k, v) => setOpts((o) => ({ ...o, [pf]: { ...o[pf], [k]: v } }));

  const runAi = async () => {
    setAi((s) => ({ ...s, busy: true }));
    try {
      const r = await api('ai/captions', { method: 'POST', body: { brief: ai.brief, tone: ai.tone, platforms: platforms.length ? platforms : ['instagram'], media_id: media[0]?.id, current: caption, account_ids: chosen.map((a) => a.id) } });
      const list = Object.keys(r);
      setCaption(r[list[0]].caption);
      const ov = {};
      for (const p of list.slice(1)) ov[p] = r[p].caption;
      setOverrides(ov);
      if (r.youtube?.title) setYtTitle(r.youtube.title);
      toast('Claude wrote a caption for each platform — review before posting.');
      setAi((s) => ({ ...s, busy: false, open: false }));
    } catch (e) {
      toast(e.message, 'bad');
      setAi((s) => ({ ...s, busy: false }));
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const mode = when === 'now' ? 'now' : when === 'draft' ? 'draft' : 'schedule';
      const r = await api('posts', { method: 'POST', body: { ...payload, mode, scheduled_at: mode === 'now' ? 'now' : when === 'slot' ? 'next_slot' : at } });
      toast(mode === 'now' ? `Publishing to ${r.posts.length} account${r.posts.length > 1 ? 's' : ''}…` : mode === 'draft' ? 'Saved as draft' : `Scheduled ${r.posts.length} post${r.posts.length > 1 ? 's' : ''}`);
      if (mode === 'now') api('run', { method: 'POST' }).then(() => refresh()).catch(() => {});
      refresh();
      go(mode === 'now' ? 'queue' : 'calendar');
    } catch (e) {
      if (e.data?.targets) setCheck(e.data);
      toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const capFor = (pf) => overrides[pf] ?? caption;
  const libImages = library.filter((m) => m.kind === 'image');
  const errorCount = check?.targets?.reduce((n, t) => n + t.errors.length, 0) || 0;
  const canSubmit = media.length && targets.length && check?.ok && !checking && !busy && !uploads.length && (when !== 'schedule' || at);
  const ttDirect = platforms.includes('tiktok') && opts.tiktok.mode === 'direct';
  const ttOptions = useMemo(() => {
    const infos = chosen.filter((a) => a.platform === 'tiktok').map((a) => creator[a.id]?.privacy_level_options).filter(Boolean);
    if (!infos.length) return Object.keys(TT_PRIVACY);
    return Object.keys(TT_PRIVACY).filter((k) => infos.every((o) => o.includes(k)));
  }, [creator, selected.join()]);

  if (!active.length) {
    return (
      <>
        <div class="page-head"><h1>New post</h1></div>
        <div class="card"><Empty icon="users" title="No accounts connected yet" action={<button class="btn primary" onClick={() => go('accounts')}>Connect an account</button>}>Connect at least one Instagram, YouTube or TikTok account first.</Empty></div>
      </>
    );
  }

  return (
    <>
      <div class="page-head">
        <h1>New post</h1>
        <span class="sub">Upload once, post everywhere.</span>
      </div>
      {idea && (
        <div class="notice info" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
          {idea.thumb_url && <img src={idea.thumb_url} alt="" style={{ width: 44, height: 55, objectFit: 'cover', borderRadius: 8, flex: 'none' }} />}
          <div class="grow">
            <b>Inspired by @{idea.author}</b>{idea.views ? ` · ${Number(idea.views).toLocaleString('en')} views` : ''}
            <div class="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4, color: 'var(--text-2)' }}>{idea.brief}</div>
          </div>
          <div class="col" style={{ gap: 6, flex: 'none' }}>
            <button class="btn sm" onClick={() => navigator.clipboard.writeText(idea.brief).then(() => toast('Brief copied — paste it into Claude'))}><Icon name="copy" size={14} /> Copy brief</button>
            <button class="btn ghost sm" onClick={() => setIdea(null)}>Dismiss</button>
          </div>
        </div>
      )}
      <div class="compose">
        <div class="col" style={{ gap: 16 }}>
          {/* 1. media */}
          <section class="card pad">
            <div class="step"><span class="n">1</span><h2>Media</h2><span class="grow" />{media.length > 1 && <span class="tiny faint">Click to change order</span>}</div>
            {media.length > 0 && (
              <div class="media-strip" style={{ marginBottom: 12 }}>
                {media.map((m, i) => <MediaTile key={m.id} m={m} index={i} selected onClick={() => toggleMedia(m)} onRemove={() => toggleMedia(m)} />)}
              </div>
            )}
            <div
              class={`dropzone ${over ? 'over' : ''}`}
              onClick={() => fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles([...e.dataTransfer.files]); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current.click()}
            >
              <Icon name="upload" size={22} />
              <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 6 }}>Drop videos or images, or click to upload</div>
              <div class="tiny">MP4/MOV up to 4 GB · JPEG/PNG/WebP/HEIC (converted to JPEG for Instagram)</div>
              <input ref={fileRef} type="file" multiple accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/heic" class="hidden" onChange={(e) => { addFiles([...e.currentTarget.files]); e.currentTarget.value = ''; }} />
            </div>
            {uploads.map((u) => (
              <div key={u.key} class="row small" style={{ marginTop: 8 }}>
                <Spinner /><span class="grow ellipsis">{u.name}</span>
                <div class="progress" style={{ width: 120 }}><div style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>
              </div>
            ))}
            <div class="row" style={{ marginTop: 10 }}>
              <Icon name="link" size={16} class="faint" />
              <input class="input" placeholder="…or paste a direct link to a video/image file" value={importUrl} onInput={(e) => setImportUrl(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && importLink()} />
              <button class="btn" onClick={importLink} disabled={!importUrl}>Import</button>
            </div>
            {library.length > 0 && (
              <>
                <div class="label" style={{ margin: '14px 0 6px' }}>From your library</div>
                <div class="media-strip">
                  {library.filter((m) => !media.some((x) => x.id === m.id)).slice(0, 24).map((m) => <MediaTile key={m.id} m={m} onClick={() => toggleMedia(m)} />)}
                </div>
              </>
            )}
          </section>

          {/* 2. accounts */}
          <section class="card pad">
            <div class="step"><span class="n">2</span><h2>Where to post</h2><span class="grow" />{selected.length > 0 && <span class="small muted">{selected.length} selected</span>}</div>
            <div class="acct-picker">
              {['instagram', 'youtube', 'tiktok'].map((pf) => {
                const list = accounts.filter((a) => a.platform === pf);
                if (!list.length) return null;
                const allOn = list.filter((a) => a.status === 'active').every((a) => selected.includes(a.id));
                return (
                  <div key={pf}>
                    <div class="acct-group-title"><PfMark platform={pf} size={16} />{PF[pf].label}
                      {list.length > 1 && <button class="btn ghost sm" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }} onClick={() => setSelected((s) => (allOn ? s.filter((id) => !list.some((a) => a.id === id)) : [...new Set([...s, ...list.filter((a) => a.status === 'active').map((a) => a.id)])]))}>{allOn ? 'None' : 'All'}</button>}
                    </div>
                    <div class="acct-opts">
                      {list.map((a) => {
                        const on = selected.includes(a.id);
                        const off = a.status !== 'active';
                        return (
                          <button key={a.id} type="button" class={`acct-opt ${on ? 'on' : ''} ${off ? 'off' : ''}`} disabled={off} onClick={() => toggleAcct(a)} aria-pressed={on} title={off ? 'Needs reconnecting' : ''}>
                            <Avatar src={a.profile_picture_url} name={a.username} size={26} />
                            <span>@{a.username}</span>
                            <span class="check">{on && <Icon name="check" size={12} stroke={3} />}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. caption & platform settings */}
          <section class="card pad">
            <div class="step"><span class="n">3</span><h2>Caption & settings</h2><span class="grow" />
              <button class="btn sm" onClick={() => setAi((s) => ({ ...s, open: !s.open }))}><Icon name="sparkle" size={15} /> Write with Claude</button>
            </div>
            {ai.open && (
              <div class="ai-box" style={{ marginBottom: 12 }}>
                {!config.ai && <div class="notice info">Add <code>ANTHROPIC_API_KEY</code> in Vercel to turn this on — or connect Claude through MCP (Settings) and ask it there.</div>}
                <textarea class="textarea" style={{ minHeight: 70 }} placeholder="What's this post about? Key facts, the hook, who it's for…" value={ai.brief} onInput={(e) => setAi({ ...ai, brief: e.currentTarget.value })} />
                <div class="row">
                  <input class="input" placeholder="Tone (optional): e.g. cinematic, dry humour" value={ai.tone} onInput={(e) => setAi({ ...ai, tone: e.currentTarget.value })} />
                  <button class="btn primary" onClick={runAi} disabled={ai.busy || !config.ai}>{ai.busy ? <Spinner /> : <Icon name="sparkle" size={15} />} Write</button>
                </div>
                <div class="tiny faint">Writes a version for each selected platform{media[0] ? ', looking at your first image/frame' : ''}. Claude only uses facts you give it.</div>
              </div>
            )}
            <div class="field">
              <div class="row between">
                <label for="cap">Caption{platforms.length > 1 ? ' (shared)' : ''}</label>
                <span class="row" style={{ gap: 10 }}>
                  {platforms.map((pf) => {
                    const n = capFor(pf).length;
                    return <span key={pf} class={`counter ${n > LIMITS[pf] ? 'over' : ''}`}>{PF[pf].short} {n}/{LIMITS[pf]}</span>;
                  })}
                </span>
              </div>
              <textarea id="cap" class="textarea" placeholder="Write a caption… #hashtags @mentions" value={caption} onInput={(e) => setCaption(e.currentTarget.value)} />
            </div>

            {platforms.length > 0 && (
              <>
                <div class="pf-tabs" role="tablist">
                  {platforms.map((pf) => (
                    <button key={pf} class={tab === pf ? 'on' : ''} onClick={() => setTab(pf)} role="tab" aria-selected={tab === pf}>
                      <PfMark platform={pf} size={16} /> {PF[pf].label}
                      {check?.targets?.some((t) => t.platform === pf && t.errors.length) && <span class="dot" style={{ color: 'var(--bad)' }} />}
                    </button>
                  ))}
                </div>
                {tab && (
                  <div class="col" style={{ gap: 14 }}>
                    <div class="field">
                      <label>Format</label>
                      <Seg value={pfKind(tab)} onChange={(v) => setKinds({ ...kinds, [tab]: v })} options={kindOptions(tab, media).map((k) => ({ value: k, label: KIND[k] }))} />
                    </div>
                    <Toggle
                      checked={overrides[tab] != null}
                      onChange={(v) => setOverrides((o) => { const n = { ...o }; if (v) n[tab] = caption; else delete n[tab]; return n; })}
                      label={`Use a different caption on ${PF[tab].label}`}
                    />
                    {overrides[tab] != null && <textarea class="textarea" value={overrides[tab]} onInput={(e) => setOverrides({ ...overrides, [tab]: e.currentTarget.value })} />}

                    {chosen.filter((a) => a.platform === tab).length > 1 && (
                      <div class="col" style={{ gap: 8 }}>
                        <span class="label">Per account</span>
                        {chosen.filter((a) => a.platform === tab).map((a) => {
                          const pa = perAcct[a.id] || {};
                          return (
                            <div key={a.id} class="col" style={{ gap: 6 }}>
                              <Toggle checked={pa.caption != null} onChange={(v) => setAcct(a.id, 'caption', v ? capFor(tab) : undefined)} label={<span class="row" style={{ gap: 6 }}><Avatar src={a.profile_picture_url} name={a.username} size={20} />Own caption for @{a.username}</span>} />
                              {pa.caption != null && <textarea class="textarea" value={pa.caption} onInput={(e) => setAcct(a.id, 'caption', e.currentTarget.value)} />}
                              {tab === 'youtube' && pa.caption != null && (
                                <input class="input" placeholder={`Title for @${a.username} (empty = shared title)`} value={pa.title || ''} onInput={(e) => setAcct(a.id, 'title', e.currentTarget.value || undefined)} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {tab === 'instagram' && (
                      <>
                        {pfKind('instagram') === 'reel' && (
                          <>
                            <Toggle checked={opts.instagram.share_to_feed} onChange={(v) => setOpt('instagram', 'share_to_feed', v)} label="Also show in the main feed" />
                            <div class="field">
                              <label>Trial reel</label>
                              <Seg value={opts.instagram.trial || ''} onChange={(v) => setOpt('instagram', 'trial', v)} options={[{ value: '', label: 'Off' }, { value: 'manual', label: 'Non-followers first' }, { value: 'auto', label: 'Auto-share if it does well' }]} />
                              <span class="tiny faint">Trial reels are shown to non-followers first. "Auto-share" shares it with your followers if it performs well; otherwise share it yourself in the Instagram app.</span>
                            </div>
                            {!covers.instagram && media[0]?.kind === 'video' && <FramePicker video={media[0]} value={opts.instagram.thumb_offset_ms} onChange={(v) => setOpt('instagram', 'thumb_offset_ms', v)} />}
                            <CoverPicker label="Reel cover image (9:16)" hint="Shown on your profile grid and Reels tab. 1080×1920 JPEG works best; Instagram crops the middle square for the feed." value={covers.instagram} onChange={(v) => setCovers((c) => ({ ...c, instagram: v }))} images={libImages} onUpload={(f) => uploadCover('instagram', f)} uploading={coverBusy === 'instagram'} />
                            <div class="field"><label for="iga">Audio name (optional)</label><input id="iga" class="input" placeholder="e.g. The Crime Archives — original audio" value={opts.instagram.audio_name} onInput={(e) => setOpt('instagram', 'audio_name', e.currentTarget.value)} /><span class="tiny faint">Names your original audio. Can only be set once.</span></div>
                          </>
                        )}
                        {pfKind('instagram') !== 'story' && (
                          <div class="grid2">
                            <div class="field"><label for="igc">Collaborators (up to 3)</label><input id="igc" class="input" placeholder="@account1, @account2" value={opts.instagram.collaborators} onInput={(e) => setOpt('instagram', 'collaborators', e.currentTarget.value)} /><span class="tiny faint">They get an invite; once accepted the post shows on both profiles.</span></div>
                            <div class="field"><label for="igt">Tag people</label><input id="igt" class="input" placeholder="@person1, @person2" value={opts.instagram.user_tags} onInput={(e) => setOpt('instagram', 'user_tags', e.currentTarget.value)} /></div>
                          </div>
                        )}
                        {pfKind('instagram') === 'story' && (
                          <div class="field"><label for="igt">Mention people</label><input id="igt" class="input" placeholder="@person1, @person2" value={opts.instagram.user_tags} onInput={(e) => setOpt('instagram', 'user_tags', e.currentTarget.value)} /><span class="tiny faint">Stickers (links, polls, location) can't be added through Instagram's API.</span></div>
                        )}
                        {['image', 'carousel'].includes(pfKind('instagram')) && (
                          pfKind('instagram') === 'carousel' ? (
                            <div class="field">
                              <label>Alt text (for screen readers)</label>
                              {media.filter((m) => m.kind === 'image').map((m) => (
                                <div key={m.id} class="row" style={{ gap: 8 }}>
                                  {m.poster_url && <img src={m.poster_url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, flex: 'none' }} />}
                                  <input class="input" placeholder={`Describe ${m.filename || 'this image'}`} value={opts.instagram.alt_texts?.[m.id] || ''} onInput={(e) => setOpt('instagram', 'alt_texts', { ...(opts.instagram.alt_texts || {}), [m.id]: e.currentTarget.value })} />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div class="field"><label for="igalt">Alt text (for screen readers)</label><input id="igalt" class="input" placeholder="Describe the image" value={opts.instagram.alt_text} onInput={(e) => setOpt('instagram', 'alt_text', e.currentTarget.value)} /></div>
                          )
                        )}
                        {pfKind('instagram') !== 'story' && (
                          <>
                            <div class="field"><label for="igfc">First comment (optional)</label><textarea id="igfc" class="textarea" style={{ minHeight: 60 }} placeholder="Posted as a comment right after publishing — e.g. extra hashtags or a link to the full story" value={opts.instagram.first_comment} onInput={(e) => setOpt('instagram', 'first_comment', e.currentTarget.value)} /></div>
                            <Toggle checked={opts.instagram.ai_generated} onChange={(v) => setOpt('instagram', 'ai_generated', v)} label="Label as made with AI" hint="Adds Instagram's AI info label" />
                          </>
                        )}
                      </>
                    )}

                    {tab === 'youtube' && (
                      <>
                        {allImages && <div class="notice warn"><Icon name="alert" size={16} /><span>YouTube only accepts videos. Untick the YouTube channel for photo posts, or add a video.</span></div>}
                        <div class="field">
                          <div class="row between"><label for="ytt">Title</label><span class={`counter ${ytTitle.length > 100 ? 'over' : ''}`}>{ytTitle.length}/100</span></div>
                          <input id="ytt" class="input" placeholder={(caption.split('\n')[0] || 'Video title').slice(0, 100)} value={ytTitle} onInput={(e) => setYtTitle(e.currentTarget.value)} />
                          <span class="tiny faint">Leave empty to use the caption's first line. The caption becomes the description{pfKind('youtube') === 'short' ? ' (#Shorts is added for you)' : ''}.</span>
                        </div>
                        <div class="grid2">
                          <div class="field"><label>Visibility</label><Seg value={opts.youtube.privacy} onChange={(v) => setOpt('youtube', 'privacy', v)} options={[{ value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'private', label: 'Private' }]} /></div>
                          <div class="field"><label>Made for kids?</label><Seg value={opts.youtube.made_for_kids ? 'y' : 'n'} onChange={(v) => setOpt('youtube', 'made_for_kids', v === 'y')} options={[{ value: 'n', label: 'No' }, { value: 'y', label: 'Yes' }]} /></div>
                        </div>
                        <div class="field">
                          <label for="ytg">Tags</label>
                          <input id="ytg" class="input" placeholder="comma, separated, tags" value={(opts.youtube.tags || []).join(', ')} onInput={(e) => setOpt('youtube', 'tags', e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean))} />
                        </div>
                        <div class="field">
                          <label for="ytc">Category</label>
                          <select id="ytc" class="select" value={opts.youtube.category_id} onChange={(e) => setOpt('youtube', 'category_id', e.currentTarget.value)}>
                            {Object.entries(YT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        <CoverPicker label="Thumbnail (16:9)" hint="1280×720 recommended. Postroom crops and compresses it to YouTube's limits. Needs a phone-verified channel (youtube.com/verify)." value={covers.youtube} onChange={(v) => setCovers((c) => ({ ...c, youtube: v }))} images={libImages} onUpload={(f) => uploadCover('youtube', f)} uploading={coverBusy === 'youtube'} />
                        {chosen.filter((a) => a.platform === 'youtube').map((a) => {
                          const pl = playlists[a.id];
                          return (
                            <div key={a.id} class="field">
                              <label>Playlist · @{a.username}</label>
                              {pl?.error ? <span class="tiny" style={{ color: 'var(--bad)' }}>{pl.error}</span> : (
                                <select class="select" value={perAcct[a.id]?.playlist_id || ''} onChange={(e) => setAcct(a.id, 'playlist_id', e.currentTarget.value || undefined)} disabled={!pl}>
                                  <option value="">{pl ? 'No playlist' : 'Loading…'}</option>
                                  {(pl?.playlists || []).map((x) => <option key={x.id} value={x.id}>{x.title}{x.privacy !== 'public' ? ` (${x.privacy})` : ''}</option>)}
                                </select>
                              )}
                              {pl && !pl.error && !pl.can_manage && <span class="tiny faint">To add to playlists and post the first comment, reconnect this channel once (Accounts → Reconnect).</span>}
                            </div>
                          );
                        })}
                        <div class="field"><label for="ytfc">First comment (optional)</label><textarea id="ytfc" class="textarea" style={{ minHeight: 60 }} placeholder="Posted under the video right after upload" value={opts.youtube.first_comment} onInput={(e) => setOpt('youtube', 'first_comment', e.currentTarget.value)} /></div>
                        <Toggle checked={opts.youtube.notify_subscribers} onChange={(v) => setOpt('youtube', 'notify_subscribers', v)} label="Notify subscribers" />
                        <Toggle checked={opts.youtube.synthetic} onChange={(v) => setOpt('youtube', 'synthetic', v)} label="Altered or synthetic content" hint="Required by YouTube when realistic-looking content was made or changed with AI" />
                        {!config.audited.youtube && opts.youtube.privacy !== 'private' && <div class="notice warn"><Icon name="alert" size={16} /><span>Until Google approves your project's YouTube audit, YouTube makes API uploads <b>private</b>. Switch it to public in YouTube Studio, or apply for the audit (SETUP.md).</span></div>}
                      </>
                    )}

                    {tab === 'tiktok' && (
                      <>
                        <div class="field">
                          <label>How to post</label>
                          <Seg value={opts.tiktok.mode} onChange={(v) => setOpt('tiktok', 'mode', v)} options={[{ value: 'direct', label: 'Post directly' }, { value: 'inbox', label: 'Send to TikTok inbox' }]} />
                          <span class="tiny faint">{opts.tiktok.mode === 'inbox' ? 'The video lands in your TikTok inbox as a draft. Open TikTok, add sounds/caption, tap Post. Works publicly before the app audit.' : 'Publishes straight to the profile.'}</span>
                        </div>
                        {opts.tiktok.mode === 'direct' && (
                          <>
                            {chosen.filter((a) => a.platform === 'tiktok').map((a) => (
                              <div key={a.id} class="row small"><Avatar src={a.profile_picture_url} name={a.username} size={22} platform="tiktok" /><span>Posting as <b>@{creator[a.id]?.creator_username || a.username}</b></span>
                                {creator[a.id]?.error && <span class="pill bad">{creator[a.id].error}</span>}
                                {creator[a.id]?.max_video_post_duration_sec && <span class="faint">· up to {fmtDur(creator[a.id].max_video_post_duration_sec)}</span>}
                              </div>
                            ))}
                            <div class="field">
                              <label for="ttp">Who can watch this video</label>
                              <select id="ttp" class="select" value={opts.tiktok.privacy_level} onChange={(e) => setOpt('tiktok', 'privacy_level', e.currentTarget.value)}>
                                <option value="" disabled>Choose…</option>
                                {ttOptions.map((k) => <option key={k} value={k}>{TT_PRIVACY[k]}</option>)}
                              </select>
                            </div>
                            <div class="grid2">
                              <Toggle checked={!opts.tiktok.disable_comment} onChange={(v) => setOpt('tiktok', 'disable_comment', !v)} label="Allow comments" />
                              <Toggle checked={!opts.tiktok.disable_duet} onChange={(v) => setOpt('tiktok', 'disable_duet', !v)} label="Allow Duet" />
                              <Toggle checked={!opts.tiktok.disable_stitch} onChange={(v) => setOpt('tiktok', 'disable_stitch', !v)} label="Allow Stitch" />
                              <Toggle checked={opts.tiktok.is_aigc} onChange={(v) => setOpt('tiktok', 'is_aigc', v)} label="AI-generated content" />
                            </div>
                            <Toggle checked={opts.tiktok.brand_organic || opts.tiktok.brand_content} onChange={(v) => setOpts((o) => ({ ...o, tiktok: { ...o.tiktok, brand_organic: v, brand_content: false } }))} label="Disclose commercial content" hint="Promoting yourself, a brand or a product" />
                            {(opts.tiktok.brand_organic || opts.tiktok.brand_content) && (
                              <div class="col" style={{ paddingLeft: 44 }}>
                                <Toggle checked={opts.tiktok.brand_organic} onChange={(v) => setOpt('tiktok', 'brand_organic', v)} label="Your brand" hint='Labelled "Promotional content"' />
                                <Toggle checked={opts.tiktok.brand_content} onChange={(v) => setOpt('tiktok', 'brand_content', v)} label="Branded content (paid partnership)" hint='Labelled "Paid partnership"' />
                              </div>
                            )}
                            <p class="tiny faint" style={{ margin: 0 }}>By posting, you agree to TikTok's <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>{opts.tiktok.brand_content ? <> and <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a></> : null}.</p>
                            {!config.audited.tiktok && opts.tiktok.privacy_level && opts.tiktok.privacy_level !== 'SELF_ONLY' && <div class="notice warn"><Icon name="alert" size={16} /><span>Until TikTok audits your app, direct posts are visible only to you. Use <b>Send to TikTok inbox</b> to post publicly today.</span></div>}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {/* right column */}
        <div class="sticky-col">
          <section class="card pad">
            <div class="step"><span class="n">4</span><h2>When</h2></div>
            <div class="when-box">
              <Seg value={when} onChange={setWhen} options={[{ value: 'now', label: 'Now' }, { value: 'slot', label: 'Next slot' }, { value: 'schedule', label: 'Pick time' }, { value: 'draft', label: 'Draft' }]} />
              {when === 'slot' && <span class="tiny faint">Each account's next free posting slot (set under Accounts → brand kit & slots).</span>}
              {when === 'schedule' && (
                <>
                  <input type="datetime-local" class="input" value={at} min={wallTime(new Date())} onInput={(e) => setAt(e.currentTarget.value)} />
                  <div class="row wrap">
                    {[['Tonight 7pm', `${todayKey()}T19:00`], ['Tomorrow 9am', `${addDays(todayKey(), 1)}T09:00`], ['Tomorrow 6pm', `${addDays(todayKey(), 1)}T18:00`]].filter(([, v]) => v > wallTime(new Date())).map(([l, v]) => (
                      <button key={l} class="btn sm" onClick={() => setAt(v)}>{l}</button>
                    ))}
                  </div>
                  <span class="tiny faint">{fmtDateTime(`${at}:00${tzOffsetGuess()}`)} · {getTz()}</span>
                </>
              )}
            </div>
          </section>

          <section class="card pad">
            <div class="row between" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Checks</h2>{checking && <Spinner />}</div>
            {!media.length ? <p class="small muted" style={{ margin: 0 }}>Add media to check it against each platform's rules.</p>
              : !targets.length ? <p class="small muted" style={{ margin: 0 }}>Choose where to post.</p>
              : check?.error ? <div class="notice bad">{check.error}</div>
              : check ? (
                <div class="check-list">
                  {check.targets.map((t) => (
                    <div class="check-item" key={t.account_id}>
                      <Avatar src={accounts.find((a) => a.id === t.account_id)?.profile_picture_url} name={t.account} platform={t.platform} size={28} />
                      <div class="grow">
                        <div class="row between"><b class="small">{t.account}</b><span class="pill">{KIND[t.kind]}</span></div>
                        {!t.errors.length && !t.warnings.length && <div class="small" style={{ color: 'var(--good)' }}>Ready</div>}
                        {(t.errors.length > 0 || t.warnings.length > 0) && (
                          <ul>
                            {t.errors.map((e) => <li key={e} class="e">{e}</li>)}
                            {t.warnings.map((w) => <li key={w} class="w">{w}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            <button class="btn primary block" style={{ marginTop: 14, height: 42 }} disabled={!canSubmit} onClick={submit}>
              {busy ? <Spinner /> : <Icon name={when === 'now' ? 'send' : when === 'draft' ? 'layers' : 'clock'} size={16} />}
              {when === 'now' ? `Post now${targets.length > 1 ? ` to ${targets.length} accounts` : ''}` : when === 'draft' ? `Save ${targets.length > 1 ? `${targets.length} drafts` : 'draft'}` : `Schedule${targets.length > 1 ? ` ${targets.length} posts` : ''}`}
            </button>
            {errorCount > 0 && <p class="tiny" style={{ color: 'var(--bad)', margin: '8px 0 0', textAlign: 'center' }}>Fix {errorCount} problem{errorCount > 1 ? 's' : ''} above first.</p>}
            {ttDirect && !opts.tiktok.privacy_level && <p class="tiny" style={{ color: 'var(--warn)', margin: '8px 0 0', textAlign: 'center' }}>Choose who can watch the TikTok.</p>}
          </section>

          {media[0] && tab && (
            <section class="card pad">
              <h2>Preview · {PF[tab].label}</h2>
              <div class="preview-phone" style={{ aspectRatio: media[0].width && media[0].height && pfKind(tab) !== 'reel' && pfKind(tab) !== 'short' && tab !== 'tiktok' ? `${media[0].width} / ${media[0].height}` : '9 / 16' }}>
                {media[0].poster_url && <img src={media[0].poster_url} alt="" />}
                <div class="cap">
                  {tab === 'youtube' && <div class="ttl">{ytTitle || caption.split('\n')[0]}</div>}
                  {(capFor(tab) || '').slice(0, 220)}{capFor(tab).length > 220 ? '…' : ''}
                </div>
              </div>
              <p class="tiny faint" style={{ marginBottom: 0 }}>{media.length > 1 ? `${media.length} items` : media[0].kind === 'video' ? `${fmtDur(media[0].duration_s)} · ${fmtBytes(media[0].size_bytes)}` : `${media[0].width}×${media[0].height}`}</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// Only for the human-readable label under the picker.
function tzOffsetGuess() {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: getTz(), timeZoneName: 'longOffset' }).format(new Date());
    const m = /GMT([+-]\d{2}:\d{2})/.exec(s);
    return m ? m[1] : 'Z';
  } catch {
    return 'Z';
  }
}
