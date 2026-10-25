// Synthesised paper sounds that follow the gesture: a crackle when a page is
// picked up, a rustle that tracks drag speed, and a soft landing. No audio
// files — everything is shaped noise, so it never sounds like a loop.

import type { LeafKind } from './layout'

const VOICE: Record<LeafKind, { band: number; thump: number; crackle: number; level: number }> = {
  paper: { band: 3800, thump: 320, crackle: 1, level: 1 },
  cover: { band: 2300, thump: 190, crackle: 0.6, level: 1.25 },
  vellum: { band: 6200, thump: 520, crackle: 1.4, level: 0.55 },
  // Polypropylene: bright, crinkly, with a slappy little landing.
  sleeve: { band: 7200, thump: 680, crackle: 2.6, level: 0.85 },
}

export class PaperSound {
  enabled = true
  private ctx?: AudioContext
  private master?: GainNode
  private noise?: AudioBuffer
  private rustle?: { gain: GainNode; band: BiquadFilterNode }
  private kind: LeafKind = 'paper'

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = 0.32
      this.master.connect(ctx.destination)
      const len = ctx.sampleRate * 2
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      // Slightly pink noise: paper has more body than white noise.
      let last = 0
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1
        last = 0.86 * last + 0.14 * white
        d[i] = white * 0.55 + last * 1.6
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private noiseSource(loop = false) {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noise!
    src.loop = loop
    if (!loop) src.playbackRate.value = 0.9 + Math.random() * 0.3
    return src
  }

  private crackle(t: number, gain: number, center: number) {
    const ctx = this.ctx!
    const src = this.noiseSource()
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = center * (0.7 + Math.random() * 0.9)
    bp.Q.value = 1.2 + Math.random() * 2
    const g = ctx.createGain()
    const dur = 0.006 + Math.random() * 0.018
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.001)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp).connect(g).connect(this.master!)
    src.start(t, Math.random() * 1.5, dur + 0.02)
  }

  grab(kind: LeafKind) {
    if (!this.enabled || !this.ctx) return
    this.kind = kind
    const v = VOICE[kind]
    const t = this.ctx.currentTime
    const n = 2 + Math.floor(Math.random() * 4 * v.crackle)
    for (let i = 0; i < n; i++) this.crackle(t + Math.random() * 0.07, 0.35 * v.level, v.band * 1.3)
    this.ensureRustle()
  }

  private ensureRustle() {
    if (this.rustle || !this.ctx) return
    const ctx = this.ctx
    const src = this.noiseSource(true)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 900
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 0.6
    band.frequency.value = VOICE[this.kind].band
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(hp).connect(band).connect(gain).connect(this.master!)
    src.start()
    this.rustle = { gain, band }
  }

  /** Called every frame while a page moves. `speed` is turn progress per second. */
  move(speed: number, kind: LeafKind) {
    if (!this.enabled || !this.ctx) return
    this.ensureRustle()
    const v = VOICE[kind]
    const s = Math.min(1, Math.abs(speed) / 3)
    const t = this.ctx.currentTime
    this.rustle!.gain.gain.setTargetAtTime(s * 0.5 * v.level, t, 0.04)
    this.rustle!.band.frequency.setTargetAtTime(v.band * (0.75 + s * 0.6), t, 0.05)
    if (Math.random() < s * 0.35 * v.crackle) this.crackle(t, 0.22 * s * v.level, v.band * 1.4)
  }

  quiet() {
    if (!this.rustle || !this.ctx) return
    this.rustle.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06)
  }

  land(kind: LeafKind, strength: number) {
    if (!this.enabled || !this.ctx) return
    const ctx = this.ctx
    const v = VOICE[kind]
    const t = ctx.currentTime
    const src = this.noiseSource()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = v.thump
    const g = ctx.createGain()
    const peak = 0.9 * v.level * Math.min(1, 0.35 + strength)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
    src.connect(lp).connect(g).connect(this.master!)
    src.start(t, Math.random(), 0.2)
    for (let i = 0; i < 2; i++) this.crackle(t + 0.01 + Math.random() * 0.04, 0.18 * v.level, v.band)
    this.quiet()
  }
}
