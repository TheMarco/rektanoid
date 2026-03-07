/**
 * CRT post-processing pass for Three.js EffectComposer (WebGL).
 * Ported from scramble's TSL-based CRT to GLSL ShaderPass.
 *
 * Features: scanlines, aperture grille, beam simulation, vignette,
 * interlace flicker, rolling scan band, power supply flicker, warm tint.
 */
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import * as THREE from 'three';

const CRT_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(800, 600) },
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

    const float V_RES_Y = 360.0;
    const float HARD_SCAN = -11.0;
    const float MASK_STR = 0.14;

    void main() {
      vec2 uv = vUv;

      // ── CRT beam simulation ──
      // Snap to scanline center vertically, smooth horizontally
      float quantizedY = (floor(uv.y * V_RES_Y) + 0.5) / V_RES_Y;
      vec2 scanUV = vec2(uv.x, quantizedY);

      // 5-tap horizontal Gaussian blur (electron beam spread)
      float beamStep = 2.5 / resolution.x;
      vec4 tap0 = texture2D(tDiffuse, vec2(scanUV.x - beamStep * 2.0, scanUV.y));
      vec4 tap1 = texture2D(tDiffuse, vec2(scanUV.x - beamStep, scanUV.y));
      vec4 tap2 = texture2D(tDiffuse, scanUV);
      vec4 tap3 = texture2D(tDiffuse, vec2(scanUV.x + beamStep, scanUV.y));
      vec4 tap4 = texture2D(tDiffuse, vec2(scanUV.x + beamStep * 2.0, scanUV.y));
      vec4 beamColor = tap0 * 0.06 + tap1 * 0.24 + tap2 * 0.40 + tap3 * 0.24 + tap4 * 0.06;

      vec4 normalScene = texture2D(tDiffuse, uv);
      // 88% toward scanline-quantized beam sample
      vec4 blendedScene = mix(normalScene, beamColor, 0.88);
      vec4 inputColor = mix(normalScene, blendedScene, strength);

      // ── Scanlines (CRT-Lottes inspired) ──
      float pitch = resolution.y / V_RES_Y;
      float virtualY = uv.y * V_RES_Y;
      float scanPhase = fract(virtualY) - 0.5;
      float bright = max(max(inputColor.r, inputColor.g), inputColor.b);
      // Soften scanlines in dark areas
      float scanH = mix(HARD_SCAN * 0.32, HARD_SCAN * 0.65, bright);
      float scanWeight = exp(scanPhase * scanPhase * scanH);
      float pitchFade = smoothstep(1.0, 2.0, pitch);
      vec4 c = mix(inputColor, inputColor * scanWeight, pitchFade);

      // ── Aperture grille (Trinitron vertical RGB stripes) ──
      vec2 fragCoord = uv * resolution;
      float mx = mod(fragCoord.x, 3.0);
      float maskR = mx < 1.0 ? 1.0 + MASK_STR : 1.0 - MASK_STR * 0.5;
      float maskG = (mx >= 1.0 && mx < 2.0) ? 1.0 + MASK_STR : 1.0 - MASK_STR * 0.5;
      float maskB = mx >= 2.0 ? 1.0 + MASK_STR : 1.0 - MASK_STR * 0.5;
      float grilleSep = smoothstep(0.0, 0.5, mx) * smoothstep(3.0, 2.5, mx);
      vec3 grilleMask = vec3(maskR, maskG, maskB) * mix(0.92, 1.0, grilleSep);
      vec3 grilleBlend = mix(vec3(1.0), grilleMask, pitchFade);
      c.rgb *= grilleBlend;

      // ── Warm color temperature (consumer CRT TV) ──
      c.rgb *= vec3(0.98, 0.95, 0.93);

      // ── Vignette ──
      vec2 ctr = uv * 2.0 - 1.0;
      float vignette = 1.0 - dot(ctr, ctr) * 0.15;
      c.rgb *= vignette;

      // ── Interlace flicker ──
      float fieldPhase = mod(floor(time * 30.0), 2.0);
      float scanIdx = floor(virtualY);
      float interlace = mod(scanIdx + fieldPhase, 2.0);
      float interlaceMul = 1.0 - interlace * 0.02 * smoothstep(1.5, 2.5, pitch);
      c.rgb *= interlaceMul;

      // ── Rolling scan band ──
      float bandPos = fract(uv.y * 0.5 - time * 0.08);
      float band = smoothstep(0.0, 0.15, bandPos) * smoothstep(0.45, 0.15, bandPos);
      c.rgb *= band * 0.15 + 1.0;

      // ── Power supply flicker ──
      float psFlicker = sin(time * 13.7) * 0.5
        + sin(time * 7.3) * 0.3
        + sin(time * 23.1) * 0.2;
      c.rgb *= psFlicker * 0.01 + 1.0;

      // ── Mix between original and CRT ──
      vec4 result = mix(normalScene, max(c, vec4(0.0)), strength);
      result.a = 1.0;

      gl_FragColor = result;
    }
  `,
};

export function createCRTPass(): ShaderPass {
  return new ShaderPass(CRT_SHADER);
}
