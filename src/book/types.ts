// Page content model. Pages are authored as data and rendered to canvas
// textures by pageArt.ts; the engine never knows what is printed on a page.

export type Tone = 'smoke' | 'leather' | 'stone' | 'night'

export interface ImageSpec {
  /** Optional real image URL. Without it a generated placeholder is drawn. */
  src?: string
  seed: number
  tone: Tone
}

export interface LinkSpec {
  label: string
  href: string
}

interface Base {
  id: string
  /** Chapter name shown in the UI while this page is open. */
  section: string
}

export type PageSpec = Base & (
  | { kind: 'cover'; eyebrow: string; titleLines: string[]; footerLeft: string; footerRight: string }
  | { kind: 'backCover'; lines: string[] }
  | { kind: 'fullImage'; image: ImageSpec; captionLines: string[] }
  | { kind: 'contents'; title: string; entries: { num: string; title: string; page: string }[]; note: string }
  | {
      kind: 'chapterTitle'
      chapter: string
      running: string
      titleLines: string[]
      sections: { label: string; page: string }[]
      overview: string
      details: { label: string; value: string; href?: string }[]
    }
  | { kind: 'opener'; chapter: string; titleLines: string[]; image: ImageSpec; captionLines: string[] }
  | { kind: 'projectText'; chapter: string; running: string; image: ImageSpec; captionLeft: string; captionRight: string; paragraphs: string[] }
  | { kind: 'projectVisual'; chapter: string; running: string; intro: string; quote: string; image: ImageSpec; captionLeft: string; captionRight: string }
  | { kind: 'grid'; chapter: string; running: string; title: string; text: string; tiles: ImageSpec[]; link?: LinkSpec }
  | {
      kind: 'list'
      chapter: string
      running: string
      title: string
      groups: { heading: string; rows: { left: string; mid?: string; right: string }[] }[]
      link?: LinkSpec
    }
  | { kind: 'closing'; titleLines: string[]; text: string; links: LinkSpec[] }
  | { kind: 'colophon'; lines: string[] }
  | { kind: 'vellum'; chapter: string; titleLines: string[]; note: string }
  | {
      kind: 'sleeve'
      /** What sits behind the items inside the pocket. 'clear' shows the page underneath. */
      backing: 'black' | 'paper' | 'clear'
      items: SleeveItem[]
      /** Items visible when the sleeve is turned over. Defaults to the backs of `items`. */
      backItems?: SleeveItem[]
    }
)

/** Something tucked inside a plastic sleeve. Position is the item's centre in page design units. */
export interface SleeveItem {
  type: 'photo' | 'polaroid' | 'note' | 'ticket' | 'clip'
  x: number
  y: number
  w: number
  /** Rotation in degrees. */
  rot: number
  image?: ImageSpec
  text?: string
}

export interface SpreadSpec {
  left: PageSpec
  right: PageSpec
  /**
   * Loose sheets lying over the right page, top first: translucent vellum
   * interleaves and clear plastic sleeves.
   */
  overlays?: PageSpec[]
}

export interface BookSpec {
  cover: PageSpec
  /** spreads[0].left is the inside front cover, the last right page is the inside back cover. */
  spreads: SpreadSpec[]
  back: PageSpec
}

/** Hotspot in page design units (0..PAGE_W, 0..PAGE_H). */
export interface Hotspot {
  x: number
  y: number
  w: number
  h: number
  href: string
}
