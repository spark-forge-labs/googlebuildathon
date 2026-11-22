import * as THREE from 'three';

/**
 * Final "shot on a real camera" pass (display space, after tone mapping and SMAA):
 * slight lens chromatic aberration towards the edges, gentle filmic contrast with
 * split toning (cool shadows, warm highlights), a soft vignette and fine animated grain.
 */
export const CameraLookShader = {
  name: 'CameraLookShader',
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.32 },
    grain: { value: 0.024 },
    aberration: { value: 0.006 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float vignette;
    uniform float grain;
    uniform float aberration;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * aberration;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + off).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - off).b
      );
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.16);
      col += vec3(-0.010, 0.003, 0.014) * (1.0 - l) + vec3(0.016, 0.006, -0.010) * l;
      float v = smoothstep(0.86, 0.22, length(c * vec2(1.0, 0.88)));
      col *= mix(1.0, v, vignette);
      float n = hash(floor(vUv * resolution) + fract(time * 7.13) * vec2(41.0, 17.0)) - 0.5;
      col += n * grain * (1.0 - 0.5 * l);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
