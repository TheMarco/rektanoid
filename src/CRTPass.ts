/**
 * CRT post-processing pass for Three.js EffectComposer.
 * Ported from cubed's NTSC CRT shader — uniform across the screen.
 *
 * Features: Gaussian beam scanlines (brightness-dependent), NTSC horizontal
 * bandwidth limiting, aperture grille, warm color temperature, saturation boost,
 * analog noise, interlace flicker, power supply flicker.
 *
 * No barrel distortion, no vignette, no rolling band, no convergence error.
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
    #define MASK_STRENGTH 0.12
    #define NOISE_STRENGTH 0.0002
    #define FLICKER_STRENGTH 0.04

    // Virtual CRT resolution (scanline count)
    const float V_RES_Y = 360.0;
    const float V_RES_X = 450.0;
    const vec2 vTexel = vec2(1.0 / V_RES_X, 1.0 / V_RES_Y);

    vec3 toLinear(vec3 c) { return c * c; }
    vec3 toGamma(vec3 c) { return sqrt(c); }

    vec3 noise3(vec2 co, float t) {
      float r = fract(sin(dot(co + t, vec2(12.9898, 78.233))) * 43758.5453);
      float g = fract(sin(dot(co + t, vec2(93.9898, 67.345))) * 43758.5453);
      float b = fract(sin(dot(co + t, vec2(41.9898, 29.876))) * 43758.5453);
      return vec3(r, g, b) * 2.0 - 1.0;
    }

    void main() {
      vec2 uv = vUv;
      vec4 normalScene = texture2D(tDiffuse, uv);

      // Display density — screen pixels per virtual scanline
      float pitch = resolution.y / V_RES_Y;

      // ── 1. Virtual pixel sampling with NTSC horizontal blend ──
      vec2 vPos = uv * vec2(V_RES_X, V_RES_Y);
      vec2 pxCenter = (floor(vPos) + 0.5) / vec2(V_RES_X, V_RES_Y);

      vec3 center = toLinear(texture2D(tDiffuse, pxCenter).rgb);
      vec3 colL = toLinear(texture2D(tDiffuse, pxCenter - vec2(vTexel.x, 0.0)).rgb);
      vec3 colR = toLinear(texture2D(tDiffuse, pxCenter + vec2(vTexel.x, 0.0)).rgb);

      // NTSC horizontal bandwidth: sub-pixel blend toward neighbors
      float blendAmt = mix(0.12, 0.06, smoothstep(1.5, 3.0, pitch));
      float fx = fract(vPos.x);
      float wL = blendAmt * (1.0 - fx);
      float wR = blendAmt * fx;
      vec3 color = center * (1.0 - wL - wR) + colL * wL + colR * wR;

      // ── 2. Gaussian beam scanlines with brightness-dependent bloom ──
      float virtualY = uv.y * V_RES_Y;
      float d = fract(virtualY) - 0.5;

      // Narrow on large displays (visible gaps), wide on small (merge)
      float baseSigma = mix(0.45, 0.24, smoothstep(1.5, 3.0, pitch));

      // Bright content blooms the beam wider
      float bright = max(max(color.r, color.g), color.b);
      float sigma = baseSigma + bright * 0.08;

      float beam = exp(-0.5 * d * d / (sigma * sigma));

      // Fade scanlines out below ~2px pitch to prevent moire
      color *= mix(1.0, beam, smoothstep(1.0, 2.0, pitch));

      // ── 3. Aperture grille (Trinitron-style vertical RGB stripes) ──
      vec2 fragCoord = uv * resolution;
      float mx = mod(fragCoord.x, 3.0);
      vec3 mask;
      if (mx < 1.0) {
        mask = vec3(1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.5, 1.0 - MASK_STRENGTH * 0.5);
      } else if (mx < 2.0) {
        mask = vec3(1.0 - MASK_STRENGTH * 0.5, 1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.5);
      } else {
        mask = vec3(1.0 - MASK_STRENGTH * 0.5, 1.0 - MASK_STRENGTH * 0.5, 1.0 + MASK_STRENGTH);
      }
      // Thin dark separator between triads
      float sep = smoothstep(0.0, 0.5, mx) * smoothstep(3.0, 2.5, mx);
      mask *= mix(0.88, 1.0, sep);
      // Fade mask on small displays to avoid aliasing
      color *= mix(vec3(1.0), mask, smoothstep(1.0, 2.0, pitch));

      // ── 4. Warm color temperature (consumer NTSC TV) ──
      color *= vec3(0.96, 0.93, 0.88);

      // ── 5. Saturation boost ──
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(gray), color, 1.08);

      // ── 6. Interlace flicker ──
      float fieldPhase = mod(floor(time * 30.0), 2.0);
      float scanIdx = floor(virtualY);
      float interlace = mod(scanIdx + fieldPhase, 2.0);
      color *= 1.0 - interlace * 0.015 * smoothstep(1.5, 2.5, pitch);

      // ── 7. Analog noise at virtual pixel resolution ──
      color += noise3(floor(vPos), time) * NOISE_STRENGTH;

      // ── 8. Power supply flicker ──
      float flicker = sin(time * 13.7) * 0.5
        + sin(time * 7.3) * 0.3
        + sin(time * 23.1) * 0.2;
      float cb = max(max(color.r, color.g), color.b);
      color *= 1.0 + flicker * FLICKER_STRENGTH * (1.0 + cb * 0.5);

      // Convert back to gamma space
      color = clamp(toGamma(color), 0.0, 1.0);

      // ── Mix between original and CRT ──
      vec4 result = mix(normalScene, vec4(color, 1.0), strength);
      result.a = 1.0;

      gl_FragColor = result;
    }
  `,
};

export function createCRTPass(): ShaderPass {
  return new ShaderPass(CRT_SHADER);
}
