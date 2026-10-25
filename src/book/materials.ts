// Sheet materials and the GPU bend.
//
// Every sheet is a flat grid; the vertex shader bends it from a handful of
// uniforms, so a turning page costs a few numbers per frame instead of a
// geometry upload. The same bend runs in the shadow (depth) pass.
//
// Physical reference values. Sizes are relative to a 210 mm page width = 1 unit.
//   Paper    cellulose fibres, n ≈ 1.47–1.55; opaque and white only because of
//            the air between fibres. 120 g/m² ≈ 0.12 mm. Opacity ≈ 92%, so the
//            reverse print shows through faintly, more when lit from behind.
//   Tracing  the same cellulose refined until the air is gone: dense, smooth,
//            translucent with very high haze. 42–280 g/m², ≈ 0.08–0.13 mm.
//            Detail under it blurs, and the blur grows as the sheet lifts away.
//   Sleeve   clear polypropylene film, n ≈ 1.49–1.51, ≈ 50–80 µm per layer,
//            glass-clear with a few percent haze; crinkles bend reflections.

import {
  DoubleSide, FrontSide, MeshDepthMaterial, MeshPhysicalMaterial, MeshStandardMaterial, RGBADepthPacking, ShaderChunk, Vector2,
  type IUniform, type Side, type Texture, type WebGLProgramParametersWithUniforms,
} from 'three'

export interface SheetUniforms {
  [name: string]: IUniform
  uProgress: IUniform<number>
  uDir: IUniform<number>
  uGrabY: IUniform<number>
  uCurl: IUniform<number>
  uFlex: IUniform<number>
  uSheet: IUniform<Vector2>
  uRestLift: IUniform<number>
  /** Folded-magazine mode: extra turn past π at the end (0 in a flat book). */
  uWrap: IUniform<number>
  /** Length of sheet that carries the curve once fully wrapped (the roll at the fold). */
  uWrapLen: IUniform<number>
}

export function sheetUniforms(w: number, h: number, curl: number, progress: number): SheetUniforms {
  return {
    uProgress: { value: progress },
    uDir: { value: 1 },
    uGrabY: { value: 0.5 },
    uCurl: { value: curl },
    uFlex: { value: 0 },
    uSheet: { value: new Vector2(w, h) },
    uRestLift: { value: 0 },
    uWrap: { value: 0 },
    uWrapLen: { value: w },
  }
}

// Spine at x = 0. The sheet turns about the y axis from 0 (lying right) to π
// (lying left) and curls as an arc of constant curvature, so it never
// stretches. Rows near the grabbed corner lead, the far corner lags. A folded
// magazine keeps going: past halfway the free end wraps on round the spine
// (uWrap) while the curve gathers into a short roll at the fold (uWrapLen),
// so the sheet ends tucked behind the open page.
const BEND_GLSL = /* glsl */ `
uniform float uProgress;
uniform float uDir;
uniform float uGrabY;
uniform float uCurl;
uniform float uFlex;
uniform vec2 uSheet;
uniform float uRestLift;
uniform float uWrap;
uniform float uWrapLen;
varying float vLift;

// An open book's pages rise out of the gutter, peak about 40% across, then
// settle toward the fore-edge.
float restLift(float x) {
  float t = 1.0 - min(x / 0.4, 1.0);
  float rise = sqrt(max(0.0, 1.0 - t * t));
  return uRestLift * rise * (1.0 - 0.55 * smoothstep(0.4, 1.0, x));
}

// The bow a resting sheet shares with the stack under it (fades while turning).
float sheetRest(vec2 st) {
  float atRest = 1.0 - smoothstep(0.0, 0.22, min(uProgress, 1.0 - uProgress));
  return restLift(st.x) * atRest;
}

vec3 sheetPoint(vec2 st) {
  const float PI = 3.141592653589793;
  float lift = sin(PI * uProgress);
  float pr = clamp(uProgress - uDir * 0.22 * (st.y - uGrabY) * lift, 0.0, 1.0);
  float bend = uDir * uCurl * sin(PI * pr) + uFlex * (pr < 0.5 ? 1.0 : -1.0);
  float ts = clamp(PI * pr - 0.5 * bend, 0.0, PI);
  float wrap = smoothstep(0.5, 1.0, pr);
  float te = clamp(PI * pr + 0.5 * bend, 0.0, PI) + uWrap * wrap;
  // Curved length; beyond it the sheet runs straight on at angle te.
  float len = mix(uSheet.x, uWrapLen, wrap);
  float k = (te - ts) / len;
  float u = min(st.x * uSheet.x, len);
  // The arc from the spine to u, written as its chord: length u*sinc(h), at
  // the mid angle ts + h. Subtracting sin/cos of nearby angles and dividing by
  // a small k instead loses all precision as a sheet settles (k -> 0), which
  // jitters vertices by more than the gap between sheets: the stripes seen
  // while a landed page's flex dies away.
  float h = 0.5 * k * u;
  float h2 = h * h;
  float sinc = abs(h) < 0.5
    ? 1.0 - h2 / 6.0 * (1.0 - h2 / 20.0 * (1.0 - h2 / 42.0))
    : sin(h) / h;
  vec2 xz = u * sinc * vec2(cos(ts + h), sin(ts + h)) + max(st.x * uSheet.x - len, 0.0) * vec2(cos(te), sin(te));
  return vec3(xz.x, (st.y - 0.5) * uSheet.y, xz.y + sheetRest(st));
}
`

const BEND_NORMAL = /* glsl */ `
vec3 sheetP = sheetPoint(uv);
vec3 sheetDx = sheetPoint(uv + vec2(0.004, 0.0)) - sheetP;
vec3 sheetDy = sheetPoint(uv + vec2(0.0, 0.004)) - sheetP;
vec3 objectNormal = normalize(cross(sheetDx, sheetDy));
#ifdef USE_TANGENT
  vec3 objectTangent = normalize(sheetDx);
#endif
`

/**
 * Light reaching the back of a sheet from the key light (a spotlight) and a
 * little sky fill: what makes paper and tracing paper glow when lifted toward
 * the light. Evaluated after the standard lighting (needs geometryPosition).
 */
const BACKLIGHT_GLSL = /* glsl */ `
vec3 sheetBacklight(vec3 n, vec3 pos) {
  vec3 light = vec3(0.0);
  #if NUM_SPOT_LIGHTS > 0
    for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
      vec3 L = normalize(spotLights[i].position - pos);
      light += spotLights[i].color * max(dot(-n, L), 0.0);
    }
  #endif
  #if NUM_DIR_LIGHTS > 0
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      light += directionalLights[i].color * max(dot(-n, directionalLights[i].direction), 0.0);
    }
  #endif
  return light;
}
`

function bendVertex(shader: WebGLProgramParametersWithUniforms, uniforms: SheetUniforms) {
  Object.assign(shader.uniforms, uniforms)
  shader.vertexShader = BEND_GLSL + shader.vertexShader
    .replace('#include <beginnormal_vertex>', BEND_NORMAL)
    .replace('#include <begin_vertex>', 'vec3 transformed = sheetP;\nvLift = sheetP.z - sheetRest(uv);')
}

// ---------------------------------------------------------------------------

export interface PaperOptions {
  roughness: number
  /** Sheen of fibres at grazing angles (Paper Mono uses a little metalness for this). */
  metalness: number
  /** How much of the reverse side's print is visible (1 − opacity). */
  showThrough: number
  /** Light scattered through the sheet when lit from behind. */
  translucency: number
  /** Printed ink is glossier than the stock. */
  inkGloss: number
  grainNormal: Texture
  grainRoughness: Texture
  /** Cut-out for sleeve contents; 0 for solid sheets. */
  alphaTest?: number
}

export const PAPER: Omit<PaperOptions, 'grainNormal' | 'grainRoughness'> = {
  roughness: 0.58, metalness: 0.1, showThrough: 0.06, translucency: 0.35, inkGloss: 0.35,
}
export const COVER: Omit<PaperOptions, 'grainNormal' | 'grainRoughness'> = {
  roughness: 0.42, metalness: 0.12, showThrough: 0, translucency: 0, inkGloss: 0.25,
}
export const SLEEVE_CONTENTS: Omit<PaperOptions, 'grainNormal' | 'grainRoughness'> = {
  roughness: 0.5, metalness: 0.08, showThrough: 0, translucency: 0.1, inkGloss: 0.3, alphaTest: 0.5,
}

/**
 * Opaque two-sided sheet: front artwork on `map`, back artwork on `backMap`
 * (both in reading orientation). Fine fibre relief comes from tiled maps so
 * it stays sharp at any zoom.
 */
export function paperMaterial(u: SheetUniforms, o: PaperOptions, front: Texture, back: Texture) {
  const m = new MeshStandardMaterial({
    map: front,
    roughness: o.roughness,
    metalness: o.metalness,
    roughnessMap: o.grainRoughness,
    normalMap: o.grainNormal,
    normalScale: new Vector2(0.22, 0.22),
    side: DoubleSide,
    alphaTest: o.alphaTest ?? 0,
  })
  const extra = {
    uBackMap: { value: back },
    uShowThrough: { value: o.showThrough },
    uTranslucency: { value: o.translucency },
    uInkGloss: { value: o.inkGloss },
  }
  m.userData.extra = extra
  m.onBeforeCompile = shader => {
    bendVertex(shader, u)
    Object.assign(shader.uniforms, extra)
    shader.fragmentShader = /* glsl */ `
uniform sampler2D uBackMap;
uniform float uShowThrough;
uniform float uTranslucency;
uniform float uInkGloss;
float inkAmount = 0.0;
` + shader.fragmentShader.replace('#include <lights_pars_begin>', '#include <lights_pars_begin>\n' + BACKLIGHT_GLSL)
      .replace('#include <map_fragment>', /* glsl */ `
#ifdef USE_MAP
  vec4 frontTex = texture2D(map, vMapUv);
  vec4 backTex = texture2D(uBackMap, vec2(1.0 - vMapUv.x, vMapUv.y));
  vec4 faceTex = gl_FrontFacing ? frontTex : backTex;
  vec4 otherTex = gl_FrontFacing ? backTex : frontTex;
  // Print on the other side, seen through the stock (mirrored by the uv flip).
  faceTex.rgb *= mix(vec3(1.0), otherTex.rgb, uShowThrough);
  diffuseColor *= faceTex;
  inkAmount = clamp(1.0 - dot(faceTex.rgb, vec3(0.299, 0.587, 0.114)) * 1.15, 0.0, 1.0);
#endif
`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (1.0 - inkAmount * uInkGloss), 0.05, 1.0);
`)
      .replace('#include <lights_fragment_end>', /* glsl */ `
#include <lights_fragment_end>
// Diffuse transmission: a page lifted toward the light glows through.
reflectedLight.directDiffuse += sheetBacklight(normal, geometryPosition) * uTranslucency * diffuseColor.rgb * RECIPROCAL_PI;
`)
  }
  m.customProgramCacheKey = () => 'sheet-paper'
  return m
}

export function setBackMap(m: MeshStandardMaterial, tex: Texture) {
  ;(m.userData.extra as { uBackMap: IUniform<Texture> }).uBackMap.value = tex
}

/**
 * Shadow caster that bends like the sheet it belongs to. `cutout` casts only
 * where the artwork is opaque (sleeve contents). `dither` casts from a share of
 * points only, which the soft shadow filter turns into a lighter shadow: how a
 * translucent sheet like tracing paper casts.
 */
export function sheetDepthMaterial(u: SheetUniforms, cutout?: Texture, dither?: Texture) {
  const m = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
    side: DoubleSide,
    map: cutout ?? null,
    alphaMap: dither ?? null,
    alphaTest: cutout || dither ? 0.5 : 0,
  })
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = BEND_GLSL + shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = sheetPoint(uv);')
  }
  m.customProgramCacheKey = () => `sheet-depth-${cutout ? 'cut' : dither ? 'dither' : 'solid'}`
  return m
}

// ---------------------------------------------------------------------------
// Transmissive sheets. three.js renders the opaque scene behind them into a
// mip-mapped buffer and samples it with a blur set by roughness; here the blur
// also grows with the sheet's height above the page (vLift).

interface ClearOptions {
  blurBase: number
  blurPerUnitLift: number
  /**
   * Blur ceiling. The buffer's mip level is log2(width) × roughness, so at 1
   * the whole screen is averaged and a sheet over a white page turns the grey
   * of the room. 0.55 keeps the blur near 3% of the screen width.
   */
  blurMax?: number
  /** Share of light from behind that comes through as a diffuse glow. */
  glow?: number
}

function blurByLift(m: MeshPhysicalMaterial, u: SheetUniforms, o: ClearOptions, key: string) {
  const extra = { uBlurBase: { value: o.blurBase }, uBlurLift: { value: o.blurPerUnitLift }, uBlurMax: { value: o.blurMax ?? 1 } }
  m.onBeforeCompile = shader => {
    bendVertex(shader, u)
    Object.assign(shader.uniforms, extra)
    shader.fragmentShader = 'uniform float uBlurBase;\nuniform float uBlurLift;\nuniform float uBlurMax;\nvarying float vLift;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <transmission_fragment>',
      ShaderChunk.transmission_fragment.replace(
        'n, v, material.roughness, material.diffuseColor',
        'n, v, min(uBlurBase + abs(vLift) * uBlurLift, uBlurMax), material.diffuseColor',
      ) + (o.glow ? `\ntotalDiffuse += sheetGlow;` : ''),
    )
    if (o.glow) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <lights_pars_begin>', '#include <lights_pars_begin>\n' + BACKLIGHT_GLSL)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
vec3 sheetGlow = sheetBacklight(normal, geometryPosition) * ${o.glow.toFixed(3)} * diffuseColor.rgb * RECIPROCAL_PI;`)
    }
  }
  m.customProgramCacheKey = () => key
}

/**
 * Tracing ("butter") paper, matched to the reference footage. Measured there:
 * a page's white seen through the sheet reads ≈#cfcfcb and its black ≈#757575,
 * i.e. ≈59% of light passes and ≈16% scatters back as a milky veil. Solving
 * color·transmission = 0.59 and color·(1 − transmission) ≈ 0.16 gives the
 * values below. Lying flat it only softens detail by a pixel or two; as it
 * lifts away the page beneath dissolves quickly. Ink on the sheet stays crisp.
 * One material per face (FrontSide / BackSide).
 */
export function tracingMaterial(u: SheetUniforms, print: Texture, env: Texture, side: Side = FrontSide) {
  const m = new MeshPhysicalMaterial({
    map: print,
    color: 0xe1e1de,
    roughness: 0.42,
    metalness: 0,
    ior: 1.53,
    transmission: 0.79,
    thickness: 0.0005,
    specularIntensity: 0.8,
    envMap: env,
    envMapIntensity: 0.5,
    side,
  })
  // Even a few millimetres of air under the sheet blurs the page heavily.
  blurByLift(m, u, { blurBase: 0.16, blurPerUnitLift: 16, blurMax: 0.55, glow: 0.55 }, `sheet-tracing-${side}`)
  return m
}

/** Clear polypropylene film of a sheet protector, drawn over its contents. */
export function filmMaterial(u: SheetUniforms, crinkle: Texture, env: Texture, side: Side = FrontSide) {
  const m = new MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0,
    ior: 1.49,
    // Real sleeves scatter 2–5% of light: a faint milky veil.
    transmission: 0.98,
    thickness: 0.0008,
    specularIntensity: 1,
    normalMap: crinkle,
    normalScale: new Vector2(0.22, 0.22),
    envMap: env,
    envMapIntensity: 1,
    side,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  blurByLift(m, u, { blurBase: 0.015, blurPerUnitLift: 0.25 }, `sheet-film-${side}`)
  return m
}
