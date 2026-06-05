(function () {
  'use strict';

  // Skip touch devices
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const BG = '#18181A';

  function loadThree(cb) {
    if (window.THREE) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  /**
   * wrapEl   — element to overlay (will be given position:relative if static)
   * lineEls  — child elements whose text is rendered into the texture
   * textColor — CSS color string matching the page text
   */
  function makeBend(wrapEl, lineEls, textColor) {
    const T = window.THREE;

    if (getComputedStyle(wrapEl).position === 'static') {
      wrapEl.style.position = 'relative';
    }

    /* ── Opaque canvas overlay ──
       BG matches section bg → covers the HTML text without touching its opacity.
       Instant show/hide (no fade) so no double-text is ever visible. */
    const cvs = document.createElement('canvas');
    cvs.style.cssText = [
      'position:absolute', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'width:100%', 'height:100%',
      'opacity:0',
      'pointer-events:none',
      'z-index:2',
      'display:block',
    ].join(';');
    wrapEl.appendChild(cvs);

    const scene    = new T.Scene();
    const renderer = new T.WebGLRenderer({ canvas: cvs, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // Opaque bg matching site dark — hides HTML text underneath
    renderer.setClearColor(parseInt(BG.slice(1), 16), 1);

    let camera, mat, animId;

    function build() {
      const wRect = wrapEl.getBoundingClientRect();
      const W = wRect.width, H = wRect.height;
      if (!W || !H) return;

      renderer.setSize(W, H, false);

      /* Orthographic camera looking straight on — flat view, no isometric angle */
      camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 5;

      /* ── Text texture ──
         Draw each line at its exact screen position relative to the wrapper,
         so the canvas text matches the HTML text 1:1. */
      const dpr = Math.min(devicePixelRatio, 2);
      const tc  = document.createElement('canvas');
      tc.width  = Math.round(W * dpr);
      tc.height = Math.round(H * dpr);
      const ctx = tc.getContext('2d');
      ctx.scale(dpr, dpr);

      // Fill background
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle   = textColor;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';

      lineEls.forEach(lineEl => {
        const fs      = parseFloat(getComputedStyle(lineEl).fontSize);
        ctx.font      = `700 ${fs}px Lunchtype, sans-serif`;
        const lRect   = lineEl.getBoundingClientRect();
        const cy      = (lRect.top  - wRect.top)  + lRect.height / 2;
        const cx      = (lRect.left - wRect.left) + lRect.width  / 2;
        ctx.fillText(lineEl.textContent.trim(), cx, cy);
      });

      const tex = new T.CanvasTexture(tc);
      tex.minFilter = tex.magFilter = T.LinearFilter;
      tex.generateMipmaps = false;

      if (mat) { mat.uniforms.uTex.value.dispose(); mat.dispose(); }

      /* ── Shader ──
         Flat plane, straight camera.
         UV warp in the fragment shader creates the bend/push effect
         entirely in texture space — visible from a straight-on view. */
      mat = new T.ShaderMaterial({
        uniforms: {
          uTex:   { value: tex },
          uMouse: { value: new T.Vector2(-2, -2) }, // off-screen = inactive
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform sampler2D uTex;
          uniform vec2 uMouse; /* UV space [0,1]² — (-2,-2) when inactive */

          float sm(float t) { return t * t * (3.0 - 2.0 * t); }

          void main() {
            vec2 uv = vUv;

            if (uMouse.x >= 0.0) {
              float dist = length(uMouse - uv);
              float r    = 0.30;        /* influence radius in UV space  */
              if (dist < r) {
                float t   = sm(1.0 - dist / r);
                vec2  dir = dist > 0.001 ? normalize(uv - uMouse) : vec2(0.0);
                uv += dir * t * 0.06;  /* push texture away from cursor */
              }
            }

            gl_FragColor = texture2D(uTex, clamp(uv, 0.001, 0.999));
          }
        `,
        transparent: false,
        depthWrite:  false,
      });

      while (scene.children.length) scene.remove(scene.children[0]);
      /* Single full-screen quad — NDC fills the orthographic [-1,1]² frustum */
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
    }

    function onMove(e) {
      if (!mat) return;
      const r = cvs.getBoundingClientRect();
      mat.uniforms.uMouse.value.set(
        (e.clientX - r.left) / r.width,
        1.0 - (e.clientY - r.top) / r.height  // flip Y for UV space
      );
    }

    function loop() {
      animId = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    }

    function activate() {
      if (!mat) build();
      cvs.style.opacity       = '1';       // instant — no fade
      cvs.style.pointerEvents = 'auto';
      cvs.addEventListener('mousemove', onMove);
      if (!animId) loop();
    }

    function deactivate() {
      cvs.style.opacity       = '0';       // instant — no fade
      cvs.style.pointerEvents = 'none';
      cvs.removeEventListener('mousemove', onMove);
      if (mat) mat.uniforms.uMouse.value.set(-2, -2);
      if (animId) { cancelAnimationFrame(animId); animId = null; }
    }

    wrapEl.addEventListener('mouseenter', activate);
    wrapEl.addEventListener('mouseleave', deactivate);
  }

  loadThree(() => {
    const ready = document.fonts?.ready ?? Promise.resolve();
    ready.then(() => {

      /* ── index.html : DESIGN / STUDIO ── */
      const heroLines = document.querySelector('.hero-title-lines');
      if (heroLines) {
        const l1 = heroLines.querySelector('.hero-title-line1');
        const l2 = heroLines.querySelector('.hero-title-line2');
        if (l1 && l2) makeBend(heroLines, [l1, l2], '#F0EEF3');
      }

      /* ── projets.html : PORT / FO / LIO ── */
      const projTitle = document.querySelector('.proj-display-title');
      if (projTitle) {
        const spans = [...projTitle.querySelectorAll('span')];
        if (spans.length) makeBend(projTitle, spans, '#e8e6f0');
      }

    });
  });
})();
