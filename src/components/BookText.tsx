import type { PageSpec } from '../book/types'
import { BOOK } from '../content/book'

// The book is drawn in WebGL, which screen readers and search engines can't
// read. This is the same content as plain, visually hidden HTML.

function pageText(p: PageSpec) {
  switch (p.kind) {
    case 'cover':
      return <h1>{p.titleLines.join(' ')} — {p.footerLeft}, {p.footerRight}</h1>
    case 'contents':
      return (
        <>
          <h2>{p.title}</h2>
          <ol>{p.entries.map(e => <li key={e.num}>{e.title}, page {e.page}</li>)}</ol>
        </>
      )
    case 'chapterTitle':
      return (
        <>
          <h2>{p.titleLines.join(' ')}</h2>
          <p>{p.overview}</p>
          <dl>
            {p.details.map(d => (
              <div key={d.label}>
                <dt>{d.label}</dt>
                <dd>{d.href ? <a href={d.href}>{d.value}</a> : d.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )
    case 'opener':
      return <h2>{p.titleLines.join(' ')}</h2>
    case 'projectText':
      return (
        <>
          <h3>{p.running}</h3>
          {p.paragraphs.map((t, i) => <p key={i}>{t}</p>)}
        </>
      )
    case 'projectVisual':
      return (
        <>
          <p>{p.intro}</p>
          <blockquote>{p.quote}</blockquote>
        </>
      )
    case 'grid':
      return (
        <>
          <h3>{p.title}</h3>
          <p>{p.text}</p>
        </>
      )
    case 'list':
      return (
        <>
          <h3>{p.title}</h3>
          {p.groups.map(g => (
            <ul key={g.heading} aria-label={g.heading}>
              {g.rows.map((r, i) => <li key={i}>{[r.left, r.mid, r.right].filter(Boolean).join(' — ')}</li>)}
            </ul>
          ))}
          {p.link && <a href={p.link.href}>{p.link.label}</a>}
        </>
      )
    case 'closing':
      return (
        <>
          <h2>{p.titleLines.join(' ')}</h2>
          <p>{p.text}</p>
          <ul>{p.links.map(l => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}</ul>
        </>
      )
    case 'vellum':
      return <h2>{p.chapter}: {p.titleLines.join(' ')}</h2>
    case 'sleeve':
      return <p>{p.items.map(i => i.text).filter(Boolean).join('. ')}</p>
    default:
      return null
  }
}

export function BookText() {
  const pages = [BOOK.cover, ...BOOK.spreads.flatMap(s => [...(s.overlays ?? []), s.left, s.right]), BOOK.back]
  return (
    <article className="sr-only">
      {pages.map(p => <section key={p.id}>{pageText(p)}</section>)}
    </article>
  )
}
