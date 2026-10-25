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
  DoubleSide, MeshDepthMaterial, MeshPhysicalMaterial, MeshStandardMaterial, RGBADepthPacking, ShaderChunk, Vector2,
  type IUniform, type Texture, type WebGLProgramParametersWithUniforms,
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
  }
}

// Spine at x = 0. The sheet turns about the y axis from 0 (lying right) to π
// (lying left) and curls as an arc of constant curvature, so it never
// stretches. Rows near the grabbed corner lead, the far corner lags.
const BEND_GLSL = /* glsl */ `
uniform float uProgress;
uniform float uDir;
uniform float uGrabY;
uniform float uCurl;
uniform float uFlex;
uniform vec2 uSheet;
uniform float uRestLift;
varying float vLift;

// An open book's pages rise out of the gutter, peak about 40% across, then
// settle toward the fore-edge.
float restLift(float x) {
  float t = 1.0 - min(x / 0.4, 1.0);
  float rise = sqrt(max(0.0, 1.0 - t * t));
  return uRestLift * rise * (1.0 - 0.55 * smoothstep(0.4, 1.0, x));
}

vec3 sheetPoint(vec2 st) {
  const float PI = 3.141592653589793;
  float lift = sin(PI * uProgress);
  float pr = clamp(uProgress - uDir * 0.22 * (st.y - uGrabY) * lift, 0.0, 1.0);
  float bend = uDir * uCurl * sin(PI * pr) + uFlex * (pr < 0.5 ? 1.0 : -1.0);
  float ts = clamp(PI * pr - 0.5 * bend, 0.0, PI);
  float te = clamp(PI * pr + 0.5 * bend, 0.0, PI);
  float k = (te - ts) / uSheet.x;
  float u = st.x * uSheet.x;
  vec2 xz = abs(k) < 1e-5
    ? u * vec2(cos(ts), sin(ts))
    : vec2(sin(ts + k * u) - sin(ts), cos(ts) - cos(ts + k * u)) / k;
  float atRest = 1.0 - smoothstep(0.0, 0.22, min(uProgress, 1.0 - uProgress));
  return vec3(xz.x, (st.y - 0.5) * uSheet.y, xz.y + restLift(st.x) * atRest);
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

function bendVertex(shader: WebGLProgramParametersWithUniforms, uniforms: SheetUniforms) {
  Object.assign(shader.uniforms, uniforms)
  shader.vertexShader = BEND_GLSL + shader.vertexShader
    .replace('#include <beginnormal_vertex>', BEND_NORMAL)
    .replace('#include <begin_vertex>', 'vec3 transformed = sheetP;\nvLift = sheetP.z;')
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
` + shader.fragmentShader
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
#if NUM_DIR_LIGHTS > 0
  // Diffuse transmission: a page lifted toward the light glows through.
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    float through = max(dot(-normal, directionalLights[i].direction), 0.0);
    reflectedLight.directDiffuse += directionalLights[i].color * through * uTranslucency * diffuseColor.rgb * RECIPROCAL_PI;
  }
#endif
`)
  }
  m.customProgramCacheKey = () => 'sheet-paper'
  return m
}

export function setBackMap(m: MeshStandardMaterial, tex: Texture) {
  ;(m.userData.extra as { uBackMap: IUniform<Texture> }).uBackMap.value = tex
}

/** Shadow caster that bends like the sheet it belongs to. */
export function sheetDepthMaterial(u: SheetUniforms, cutout?: Texture) {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide, map: cutout ?? null, alphaTest: cutout ? 0.5 : 0 })
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = BEND_GLSL + shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = sheetPoint(uv);')
  }
  m.customProgramCacheKey = () => `sheet-depth-${cutout ? 'cut' : 'solid'}`
  return m
}

// ---------------------------------------------------------------------------
// Transmissive sheets. three.js renders the opaque scene behind them into a
// mip-mapped buffer and samples it with a blur set by roughness; here the blur
// also grows with the sheet's height above the page (vLift).

interface ClearOptions {
  blurBase: number
  blurPerUnitLift: number
}

function blurByLift(m: MeshPhysicalMaterial, u: SheetUniforms, o: ClearOptions, key: string) {
  const extra = { uBlurBase: { value: o.blurBase }, uBlurLift: { value: o.blurPerUnitLift } }
  m.onBeforeCompile = shader => {
    bendVertex(shader, u)
    Object.assign(shader.uniforms, extra)
    shader.fragmentShader = 'uniform float uBlurBase;\nuniform float uBlurLift;\nvarying float vLift;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <transmission_fragment>',
      ShaderChunk.transmission_fragment.replace(
        'n, v, material.roughness, material.diffuseColor',
        'n, v, clamp(uBlurBase + abs(vLift) * uBlurLift, 0.0, 1.0), material.diffuseColor',
      ),
    )
  }
  m.customProgramCacheKey = () => key
}

/**
 * Tracing ("butter") paper. Most light passes through but is scattered, so
 * the page underneath reads blurred and washed out; ink on the sheet itself
 * stays crisp because it sits on the surface.
 */
export function tracingMaterial(u: SheetUniforms, print: Texture, grainNormal: Texture, env: Texture) {
  const m = new MeshPhysicalMaterial({
    map: print,
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0,
    ior: 1.53,
    transmission: 0.85,
    thickness: 0.0005,
    specularIntensity: 0.9,
    normalMap: grainNormal,
    normalScale: new Vector2(0.12, 0.12),
    envMap: env,
    envMapIntensity: 0.6,
    side: DoubleSide,
  })
  blurByLift(m, u, { blurBase: 0.28, blurPerUnitLift: 5 }, 'sheet-tracing')
  return m
}

/** Clear polypropylene film of a sheet protector, drawn over its contents. */
export function filmMaterial(u: SheetUniforms, crinkle: Texture, env: Texture) {
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
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  blurByLift(m, u, { blurBase: 0.015, blurPerUnitLift: 0.25 }, 'sheet-film')
  return m
}
