export interface ArtifactItem {
  label: string
  src?: string
}

export interface PageDecor {
  left: string
  right: string
  topLeft: ArtifactItem[]
  topRight: ArtifactItem[]
  bottomLeft: ArtifactItem[]
  bottomRight: ArtifactItem[]
}

export const PAGE_DATA: PageDecor[] = [
  // 1 — Front Cover
  {
    left:        "VEDANT PARIKH — CREATIVE DIRECTOR — 2026",
    right:       "BOOK PORTFOLIO — A VISUAL ARCHIVE OF WORK",
    topLeft:     [{ label: "VP" }, { label: "CD" }],
    topRight:    [{ label: "2026" }, { label: "BK" }],
    bottomLeft:  [{ label: "WORK" }, { label: "CRAFT" }, { label: "IDEA" }],
    bottomRight: [{ label: "DESIGN" }, { label: "ART" }, { label: "TYPE" }],
  },
  // 2–3 Spread 1
  {
    left:        "CHAPTER 01 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 01 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S01" }, { label: "CH1" }],
    topRight:    [{ label: "PG2" }, { label: "PG3" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 01 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 01 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S01" }, { label: "CH1" }],
    topRight:    [{ label: "PG2" }, { label: "PG3" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 4–5 Spread 2
  {
    left:        "CHAPTER 02 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 02 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S02" }, { label: "CH2" }],
    topRight:    [{ label: "PG4" }, { label: "PG5" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 02 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 02 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S02" }, { label: "CH2" }],
    topRight:    [{ label: "PG4" }, { label: "PG5" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 6–7 Spread 3
  {
    left:        "CHAPTER 03 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 03 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S03" }, { label: "CH3" }],
    topRight:    [{ label: "PG6" }, { label: "PG7" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 03 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 03 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S03" }, { label: "CH3" }],
    topRight:    [{ label: "PG6" }, { label: "PG7" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 8–9 Spread 4
  {
    left:        "CHAPTER 04 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 04 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S04" }, { label: "CH4" }],
    topRight:    [{ label: "PG8" }, { label: "PG9" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 04 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 04 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S04" }, { label: "CH4" }],
    topRight:    [{ label: "PG8" }, { label: "PG9" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 10–11 Spread 5
  {
    left:        "CHAPTER 05 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 05 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S05" }, { label: "CH5" }],
    topRight:    [{ label: "P10" }, { label: "P11" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 05 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 05 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S05" }, { label: "CH5" }],
    topRight:    [{ label: "P10" }, { label: "P11" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 12–13 Spread 6
  {
    left:        "CHAPTER 06 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 06 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S06" }, { label: "CH6" }],
    topRight:    [{ label: "P12" }, { label: "P13" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 06 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 06 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S06" }, { label: "CH6" }],
    topRight:    [{ label: "P12" }, { label: "P13" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 14–15 Spread 7
  {
    left:        "CHAPTER 07 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 07 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S07" }, { label: "CH7" }],
    topRight:    [{ label: "P14" }, { label: "P15" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 07 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 07 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S07" }, { label: "CH7" }],
    topRight:    [{ label: "P14" }, { label: "P15" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 16–17 Spread 8
  {
    left:        "CHAPTER 08 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 08 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S08" }, { label: "CH8" }],
    topRight:    [{ label: "P16" }, { label: "P17" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 08 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 08 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S08" }, { label: "CH8" }],
    topRight:    [{ label: "P16" }, { label: "P17" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 18–19 Spread 9
  {
    left:        "CHAPTER 09 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 09 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S09" }, { label: "CH9" }],
    topRight:    [{ label: "P18" }, { label: "P19" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 09 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 09 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S09" }, { label: "CH9" }],
    topRight:    [{ label: "P18" }, { label: "P19" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 20–21 Spread 10
  {
    left:        "CHAPTER 10 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 10 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S10" }, { label: "C10" }],
    topRight:    [{ label: "P20" }, { label: "P21" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 10 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 10 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S10" }, { label: "C10" }],
    topRight:    [{ label: "P20" }, { label: "P21" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 22–23 Spread 11
  {
    left:        "CHAPTER 11 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 11 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S11" }, { label: "C11" }],
    topRight:    [{ label: "P22" }, { label: "P23" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 11 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 11 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S11" }, { label: "C11" }],
    topRight:    [{ label: "P22" }, { label: "P23" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 24–25 Spread 12
  {
    left:        "CHAPTER 12 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 12 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S12" }, { label: "C12" }],
    topRight:    [{ label: "P24" }, { label: "P25" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  {
    left:        "CHAPTER 12 — PLACEHOLDER TITLE — REPLACE WITH YOUR COPY",
    right:       "SPREAD 12 — PROJECT DESCRIPTION OR KEY INSIGHT GOES HERE",
    topLeft:     [{ label: "S12" }, { label: "C12" }],
    topRight:    [{ label: "P24" }, { label: "P25" }],
    bottomLeft:  [{ label: "[IMG]" }, { label: "[IMG]" }, { label: "[IMG]" }],
    bottomRight: [{ label: "[IMG]" }, { label: "[IMG]" }],
  },
  // 26 — Back Cover
  {
    left:        "VEDANT PARIKH — CREATIVE DIRECTOR — END OF PORTFOLIO",
    right:       "THANK YOU — VEDWHODESIGNS@GMAIL.COM",
    topLeft:     [{ label: "VP" }],
    topRight:    [{ label: "FIN" }],
    bottomLeft:  [{ label: "2026" }],
    bottomRight: [{ label: "END" }],
  },
]
