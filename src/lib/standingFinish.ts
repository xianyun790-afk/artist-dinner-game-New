import * as THREE from 'three';

export function studioBackdrop() {
  const material = new THREE.MeshBasicMaterial({ color: 0xdddddc, toneMapped: false, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 studioPosition;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nstudioPosition = position;',
    );
    shader.fragmentShader = 'varying vec3 studioPosition;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', `#include <color_fragment>
      float sweep = 1.0 - smoothstep(-5.8, -1.0, studioPosition.z);
      diffuseColor.rgb *= 1.0 - 0.13 * sweep;`,
    );
  };
  return material;
}

// The meshes share a painted albedo across the face, hands, and clothes.
export function finishArtistMaterial(material: THREE.Material, artistId: string) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  if (!material.map || !['vincent', 'dali', 'georgia'].includes(artistId)) {
    material.roughness = Math.max(material.roughness, .74);
    if (material instanceof THREE.MeshPhysicalMaterial) material.clearcoat *= .45;
    return;
  }

  material.metalness = 0;
  material.roughness = .83;
  material.roughnessMap = null;
  material.normalScale.multiplyScalar(.55);

  material.onBeforeCompile = shader => {
    shader.uniforms.clothTop = { value: artistId === 'georgia' ? .81 : .675 };
    shader.uniforms.clothBottom = { value: artistId === 'georgia' ? .075 : .10 };
    shader.uniforms.softFace = { value: artistId === 'georgia' ? 1 : 0 };
    shader.vertexShader = 'varying vec3 claySurface;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nclaySurface = position;',
    );
    shader.fragmentShader = `
      varying vec3 claySurface;
      uniform float clothTop;
      uniform float clothBottom;
      uniform float softFace;
      ${shader.fragmentShader}
    `.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 painted = diffuseColor.rgb;
      float lightness = dot(painted, vec3(.2126, .7152, .0722));
      // Use the rest-space face and skin tone together so the mask follows
      // the animated head while passing over the hair and dark features.
      float skin = softFace * smoothstep(.84, .875, claySurface.y)
        * smoothstep(.035, .085, claySurface.z)
        * smoothstep(.075, .19, lightness)
        * smoothstep(.025, .095, painted.r - painted.b);
      #ifdef USE_MAP
        vec2 uvDx = dFdx(vMapUv), uvDy = dFdy(vMapUv);
        if (skin > .001) {
          vec3 blurred = textureGrad(map, vMapUv, uvDx * 2.1, uvDy * 2.1).rgb;
          // Soften the shadow baked into the atlas while retaining the warm
          // variation of the clay. Dark painted features have a low skin mask.
          vec3 softened = mix(blurred, vec3(.59, .385, .245), .33);
          diffuseColor.rgb = mix(painted, softened, .86 * skin);
        }
      #endif
      float heightMask = smoothstep(clothBottom, clothBottom + .035, claySurface.y)
        * (1.0 - smoothstep(clothTop - .025, clothTop + .012, claySurface.y));
      float hands = smoothstep(.11, .19, abs(claySurface.x))
        * (1.0 - smoothstep(.51, .64, claySurface.y))
        * smoothstep(.19, .36, lightness)
        * smoothstep(0.0, .12, painted.r - painted.b);
      float fabric = heightMask * (1.0 - hands);
      vec2 warp = vec2(claySurface.x + .53 * claySurface.z, claySurface.y + .29 * claySurface.z);
      vec2 thread = mat2(.94, .342, -.342, .94) * warp * 620.0;
      vec2 frequency = fwidth(thread);
      float weaveMask = 1.0 - smoothstep(1.35, 4.2, max(frequency.x, frequency.y));
      float weave = sin(thread.x) * sin(thread.y) + .32 * sin(thread.x * .53 + thread.y * .29);
      diffuseColor.rgb *= 1.0 + weave * fabric * weaveMask * .092;
    `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .89, skin);
    `).replace('#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1.0 - .94 * skin);')
      + `
      // Surface gradient of the fine weave in view space. The fade above
      // prevents subpixel lines from flickering as the artists walk.
      vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
      vec3 tx = cross(sy, normal), ty = cross(normal, sx);
      float determinant = dot(sx, tx);
      vec3 grad = dFdx(weave) * tx + dFdy(weave) * ty;
      vec3 threadNormal = normalize(max(abs(determinant), 1e-6) * normal - sign(determinant) * grad * .00105);
      normal = normalize(mix(normal, threadNormal, fabric * weaveMask * .78));
    `);
  };
}
