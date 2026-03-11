/**
 * CRT post-processing pass for Three.js EffectComposer.
 * Based on cubed's NTSC CRT shader — adapted for rektanoid's portrait layout.
 *
 * Features: Gaussian beam scanlines (brightness-dependent), NTSC horizontal
 * bandwidth limiting, maxSample (catches thin lines), halation, aperture grille,
 * warm color temperature, saturation boost, vignette, rolling scan band,
 * analog noise, interlace flicker, power supply flicker.
 */
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import * as THREE from 'three';

const CRT_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(450, 800) },
    strength: { value: 1.0 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float strength;
    varying vec2 vUv;

    #define PI 3.14159265359
    #define BLOOM_STRENGTH 0.0
    #define HALATION_STRENGTH 0.0
    #define MASK_STRENGTH 0.12
    #define NOISE_STRENGTH 0.002
    #define FLICKER_STRENGTH 0.04
    #define CURVATURE_STRENGTH 0.03

    // Virtual CRT resolution — 400 scanlines on 800px = 2px pitch
    // Low enough for visible scanlines, high enough to not destroy thin geometry
    const float V_RES_Y = 400.0;
    const float V_RES_X = 225.0;
    const vec2 vTexel = vec2(1.0 / V_RES_X, 1.0 / V_RES_Y);

    vec3 toLinear(vec3 c) { return c * c; }
    vec3 toGamma(vec3 c) { return sqrt(c); }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    vec3 noise3(vec2 co, float t) {
      float r = fract(sin(dot(co + t, vec2(12.9898, 78.233))) * 43758.5453);
      float g = fract(sin(dot(co + t, vec2(93.9898, 67.345))) * 43758.5453);
      float b = fract(sin(dot(co + t, vec2(41.9898, 29.876))) * 43758.5453);
      return vec3(r, g, b) * 2.0 - 1.0;
    }

    vec2 curveUV(vec2 uv) {
      vec2 c = uv * 2.0 - 1.0;
      c *= 1.0 + dot(c, c) * CURVATURE_STRENGTH;
      return c * 0.5 + 0.5;
    }

    // 5-tap max-brightness sample — catches thin vector lines between virtual pixels
    vec3 maxSample(vec2 uv) {
      vec2 vs = vec2(0.0, 0.4 * vTexel.y);
      vec2 hs = vec2(0.4 * vTexel.x, 0.0);
      vec3 s0 = toLinear(texture2D(tDiffuse, uv).rgb);
      vec3 s1 = toLinear(texture2D(tDiffuse, uv - vs).rgb);
      vec3 s2 = toLinear(texture2D(tDiffuse, uv + vs).rgb);
      vec3 s3 = toLinear(texture2D(tDiffuse, uv - hs).rgb);
      vec3 s4 = toLinear(texture2D(tDiffuse, uv + hs).rgb);
      return max(max(max(s0, s1), max(s2, s3)), s4);
    }

    // 5-tap blur at virtual-pixel scale for bloom extraction
    vec3 getBlur(vec2 uv) {
      vec3 r = toLinear(texture2D(tDiffuse, uv).rgb) * 0.4;
      r += toLinear(texture2D(tDiffuse, uv + vec2(-vTexel.x, 0.0)).rgb) * 0.15;
      r += toLinear(texture2D(tDiffuse, uv + vec2( vTexel.x, 0.0)).rgb) * 0.15;
      r += toLinear(texture2D(tDiffuse, uv + vec2(0.0, -vTexel.y)).rgb) * 0.15;
      r += toLinear(texture2D(tDiffuse, uv + vec2(0.0,  vTexel.y)).rgb) * 0.15;
      return r;
    }

    void main() {
      vec2 uv = vUv;
      vec4 normalScene = texture2D(tDiffuse, uv);

      vec2 curved = uv;

      // Display density — screen pixels per virtual scanline
      float pitch = resolution.y / V_RES_Y;

      // ── 1. Virtual pixel sampling ──
      vec2 vPos = curved * vec2(V_RES_X, V_RES_Y);
      vec2 pxCenter = (floor(vPos) + 0.5) / vec2(V_RES_X, V_RES_Y);
      vec3 color = toLinear(texture2D(tDiffuse, pxCenter).rgb);

      // ── 3. Gaussian beam scanlines ──
      float virtualY = curved.y * V_RES_Y;
      float d = fract(virtualY) - 0.5;

      // Base sigma: narrow on large displays (visible gaps), wide on small
      float baseSigma = mix(0.38, 0.18, smoothstep(1.5, 3.0, pitch));

      // Bright content blooms the beam wider
      float bright = max(max(color.r, color.g), color.b);
      float sigma = baseSigma + bright * 0.06;

      float beam = exp(-0.5 * d * d / (sigma * sigma));

      // Fade scanlines out below ~2px pitch to prevent moire
      color *= mix(1.0, beam, smoothstep(1.0, 2.0, pitch));

      // ── 4. Aperture grille (Trinitron-style vertical RGB stripes) ──
      vec2 fragCoord = curved * resolution;
      float mx = mod(fragCoord.x, 3.0);
      vec3 mask;
      if (mx < 1.0) {
        mask = vec3(1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.5, 1.0 - MASK_STRENGTH * 0.5);
      } else if (mx < 2.0) {
        mask = vec3(1.0 - MASK_STRENGTH * 0.5, 1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.5);
      } else {
        mask = vec3(1.0 - MASK_STRENGTH * 0.5, 1.0 - MASK_STRENGTH * 0.5, 1.0 + MASK_STRENGTH);
      }
      float sep = smoothstep(0.0, 0.5, mx) * smoothstep(3.0, 2.5, mx);
      mask *= mix(0.88, 1.0, sep);
      color *= mix(vec3(1.0), mask, smoothstep(1.0, 2.0, pitch));

      // ── 5. Warm color temperature ──
      color *= vec3(0.96, 0.93, 0.88);

      // ── 6. Saturation boost ──
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(gray), color, 1.08);

      // ── 7. Interlace flicker ──
      float fieldPhase = mod(floor(time * 30.0), 2.0);
      float scanIdx = floor(virtualY);
      float interlace = mod(scanIdx + fieldPhase, 2.0);
      color *= 1.0 - interlace * 0.015 * smoothstep(1.5, 2.5, pitch);

      // ── 8. Vignette ──
      vec2 ctr = curved * 2.0 - 1.0;
      color *= 1.0 - dot(ctr, ctr) * 0.10;

      // ── 9. Rolling scan band ──
      float bandPos = fract(curved.y * 0.5 - time * 0.08);
      float band = smoothstep(0.0, 0.15, bandPos) * smoothstep(0.45, 0.15, bandPos);
      color *= 1.0 + band * 0.10;

      // ── 10. Power supply flicker ──
      float flicker = sin(time * 13.7) * 0.5
        + sin(time * 7.3) * 0.3
        + sin(time * 23.1) * 0.2;
      float cb = max(max(color.r, color.g), color.b);
      color *= 1.0 + flicker * FLICKER_STRENGTH * (1.0 + cb * 0.5);

      // Convert back to gamma space
      color = clamp(toGamma(color), 0.0, 1.0);

      // Mix between original and CRT
      vec4 result = mix(normalScene, vec4(color, 1.0), strength);
      result.a = 1.0;

      gl_FragColor = result;
    }
  `,
};

export function createCRTPass(): ShaderPass {
  return new ShaderPass(CRT_SHADER);
}
