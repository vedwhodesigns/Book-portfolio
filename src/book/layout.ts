// Turns authored spreads into physical leaves for each viewing mode, and
// decides which mode fits the screen.
import { PAGE_ASPECT, type Side } from './pageArt'
import type { BookSpec, PageSpec } from './types'

export type Mode = 'spread' | 'single'
export type LeafKind = 'cover' | 'paper' | 'vellum' | 'sleeve'

export const isOverlay = (k: LeafKind) => k === 'vellum' || k === 'sleeve'

export interface Face {
  spec: PageSpec
  side: Side
  folio: number
}

export interface Leaf {
  kind: LeafKind
  front: Face
  /** null: the blank reverse of a single-sided page (shows the front through faintly). */
  back: Face | null
}

/**
 * Spread mode: a real book. Each leaf carries the right page of one spread on
 * its front and the left page of the next spread on its back.
 * Single mode: a magazine folded back on itself — one page per leaf, so every
 * page (left and right) gets its turn on the phone.
 */
export function buildLeaves(book: BookSpec, mode: Mode): Leaf[] {
  const folios = new Map<string, number>()
  const ordered = [book.cover, ...book.spreads.flatMap(s => [s.left, s.right]), book.back]
  ordered.forEach((p, i) => folios.set(p.id, i + 1))
  const face = (spec: PageSpec, side: Side): Face => ({ spec, side, folio: folios.get(spec.id) ?? 0 })
  // Overlays (vellum, sleeves) are loose single sheets: both faces print the same spec.
  const overlay = (spec: PageSpec): Leaf => ({
    kind: spec.kind === 'sleeve' ? 'sleeve' : 'vellum',
    front: face(spec, 'recto'),
    back: face(spec, 'verso'),
  })

  const leaves: Leaf[] = []
  if (mode === 'spread') {
    leaves.push({ kind: 'cover', front: face(book.cover, 'recto'), back: face(book.spreads[0].left, 'verso') })
    book.spreads.forEach((s, i) => {
      for (const o of s.overlays ?? []) leaves.push(overlay(o))
      const last = i === book.spreads.length - 1
      const next = last ? book.back : book.spreads[i + 1].left
      leaves.push({ kind: last ? 'cover' : 'paper', front: face(s.right, 'recto'), back: face(next, 'verso') })
    })
  } else {
    leaves.push({ kind: 'cover', front: face(book.cover, 'recto'), back: null })
    for (const s of book.spreads) {
      leaves.push({ kind: 'paper', front: face(s.left, 'recto'), back: null })
      for (const o of s.overlays ?? []) leaves.push(overlay(o))
      leaves.push({ kind: 'paper', front: face(s.right, 'recto'), back: null })
    }
    leaves.push({ kind: 'cover', front: face(book.back, 'recto'), back: null })
  }
  return leaves
}

/** Highest valid "turned leaves" count. In single mode the back cover stays put. */
export function maxTurned(leaves: Leaf[], mode: Mode) {
  return mode === 'spread' ? leaves.length : leaves.length - 1
}

/** Pages visible at a given state (ignoring overlays lying on top). */
export function visibleFaces(leaves: Leaf[], mode: Mode, turned: number): { left: Face | null; right: Face | null } {
  if (mode === 'single') return { left: null, right: leaves[turned]?.front ?? null }
  let r = turned
  while (leaves[r] && isOverlay(leaves[r].kind)) r++
  let l = turned - 1
  while (leaves[l] && isOverlay(leaves[l].kind)) l--
  return { left: leaves[l]?.back ?? null, right: leaves[r]?.front ?? null }
}

/** State that shows a given page (used for chapter jumps and mode switches). */
export function stateForPage(leaves: Leaf[], mode: Mode, pageId: string): number {
  for (let k = 0; k < leaves.length; k++) {
    if (leaves[k].front.spec.id === pageId) return k
    if (mode === 'spread' && leaves[k].back?.spec.id === pageId) return k + 1
  }
  return 0
}

/** The page that best represents a state, to carry across a mode switch. */
export function anchorPage(leaves: Leaf[], mode: Mode, turned: number): string {
  const top = leaves[turned]
  if (top && isOverlay(top.kind)) return top.front.spec.id
  const { left, right } = visibleFaces(leaves, mode, turned)
  return (right ?? left)?.spec.id ?? leaves[0].front.spec.id
}

/**
 * Two-page spread when it keeps pages reasonably large; otherwise one page.
 * Decided by the shape of the screen, not by device names, so phones, the
 * Fold's cover and inner screens, tablets and desktops each land correctly.
 */
export function chooseMode(width: number, height: number, chromeY: number): Mode {
  const availH = (height - chromeY) * 0.92
  const singleH = Math.min(availH, (width * 0.84) / PAGE_ASPECT)
  const spreadH = Math.min(availH, (width * 0.92) / (2 * PAGE_ASPECT))
  return width >= 600 && spreadH >= singleH * 0.62 ? 'spread' : 'single'
}
