(function () {
  'use strict';

  if (window.matchMedia('(pointer: coarse)').matches) return;

  const BG = '#18181A';

  function loadThree(cb) {
    if (window.THREE) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  function makeBend(wrapEl, lineEls, textColor) {
    const T = window.THREE;

    if (getComputedStyle(wrapEl).position === 'static') wrapEl.style.position = 'relative';

    const cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;opacity:0;pointer-events:none;z-index:2;display:block;';
    wrapEl.appendChild(cvs);

    const scene    = new T.Scene();
    const renderer = new T.WebGLRenderer({ canvas: cvs, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(parseInt(BG.slice(1), 16), 1);

    let camera, mat, animId;

    /* ── Mouse state (UV space) ── */
    let targetX = -2, targetY = -2;   // raw target
    let smoothX = -2, smoothY = -2;   // lerped position sent to shader
    let prevX   = -2, prevY   = -2;   // for velocity
    let velX    =  0, velY    =  0;

    function build() {
      const wRect = wrapEl.getBoundingClientRect();
      const W = wRect.width, H = wRect.height;
      if (!W || !H) return;

      renderer.setSize(W, H, false);
      camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 5;

      const dpr = Math.min(devicePixelRatio, 2);
      const tc  = document.createElement('canvas');
      tc.width  = Math.round(W * dpr);
      tc.height = Math.round(H * dpr);
      const ctx = tc.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle    = textColor;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      lineEls.forEach(el => {
        const fs    = parseFloat(getComputedStyle(el).fontSize);
        ctx.font    = `700 ${fs}px Lunchtype, sans-serif`;
        const lRect = el.getBoundingClientRect();
        const wR    = wrapEl.getBoundingClientRect();
        ctx.fillText(el.textContent.trim(),
          (lRect.left - wR.left) + lRect.width  / 2,
          (lRect.top  - wR.top)  + lRect.height / 2);
      });

      const tex = new T.CanvasTexture(tc);
      tex.minFilter = tex.magFilter = T.LinearFilter;
      tex.generateMipmaps = false;

      if (mat) { mat.uniforms.uTex.value.dispose(); mat.dispose(); }

      mat = new T.ShaderMaterial({
        uniforms: {
          uTex:  { value: tex },
          uMouse:{ value: new T.Vector2(-2, -2) },
          uVel:  { value: new T.Vector2(0, 0)   },
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform sampler2D uTex;
          uniform vec2  uMouse;
          uniform vec2  uVel;
          uniform float uTime;

          void main() {
            vec2 uv = vUv;

            if (uMouse.x >= 0.0) {
              vec2  delta = uv - uMouse;
              float dist  = length(delta);
              float r     = 0.48;

              if (dist < r) {
                vec2 dir = dist > 0.001 ? delta / dist : vec2(0.0);

                /* Gaussian envelope — smooth liquid spread */
                float sig = r * 0.38;
                float env = exp(-(dist * dist) / (2.0 * sig * sig));

                /* Push (centre) + pull ring (surface tension) */
                float pushSig  = r * 0.18;
                float push     = exp(-(dist * dist) / (2.0 * pushSig * pushSig));
                float ringSig  = r * 0.14;
                float ringDist = dist - r * 0.42;
                float ring     = exp(-(ringDist * ringDist) / (2.0 * ringSig * ringSig));
                uv += dir * (push * 0.16 - ring * 0.07);

                /* Velocity drag — liquid follows finger direction */
                float speed = length(uVel);
                if (speed > 0.0001) {
                  vec2 vDir   = uVel / speed;
                  float drag  = env * clamp(speed * 80.0, 0.0, 1.0);
                  uv += vDir * drag * 0.09;
                }

                /* Time ripple — surface still oscillating */
                float ripple = sin(dist * 22.0 - uTime * 5.0) * env * 0.011;
                uv += dir * ripple;
              }
            }

            gl_FragColor = texture2D(uTex, clamp(uv, 0.001, 0.999));
          }
        `,
        transparent: false,
        depthWrite:  false,
      });

      while (scene.children.length) scene.remove(scene.children[0]);
      scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), mat));
    }

    function onMove(e) {
      const r  = cvs.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = 1.0 - (e.clientY - r.top)  / r.height;
      if (prevX > -1) { velX = nx - prevX; velY = ny - prevY; }
      prevX = nx; prevY = ny;
      targetX = nx; targetY = ny;
    }

    function loop() {
      animId = requestAnimationFrame(loop);

      if (mat) {
        /* Lerp mouse — 0.09 factor = pleasant liquid lag */
        smoothX += (targetX - smoothX) * 0.09;
        smoothY += (targetY - smoothY) * 0.09;

        /* Velocity decay */
        velX *= 0.80;
        velY *= 0.80;

        mat.uniforms.uMouse.value.set(smoothX, smoothY);
        mat.uniforms.uVel.value.set(velX, velY);
        mat.uniforms.uTime.value = performance.now() / 1000;
      }

      renderer.render(scene, camera);
    }

    function activate() {
      if (!mat) build();
      targetX = -2; targetY = -2;  // reset so lerp starts fresh
      smoothX = -2; smoothY = -2;
      prevX   = -2; prevY   = -2;
      velX = 0; velY = 0;
      cvs.style.opacity       = '1';
      cvs.style.pointerEvents = 'auto';
      cvs.addEventListener('mousemove', onMove);
      if (!animId) loop();
    }

    function deactivate() {
      cvs.style.opacity       = '0';
      cvs.style.pointerEvents = 'none';
      cvs.removeEventListener('mousemove', onMove);
      targetX = -2; targetY = -2;
      if (animId) { cancelAnimationFrame(animId); animId = null; }
    }

    wrapEl.addEventListener('mouseenter', activate);
    wrapEl.addEventListener('mouseleave', deactivate);
  }

  loadThree(() => {
    const ready = document.fonts?.ready ?? Promise.resolve();
    ready.then(() => {

      const heroLines = document.querySelector('.hero-title-lines');
      if (heroLines) {
        const l1 = heroLines.querySelector('.hero-title-line1');
        const l2 = heroLines.querySelector('.hero-title-line2');
        if (l1 && l2) makeBend(heroLines, [l1, l2], '#F0EEF3');
      }

      const projTitle = document.querySelector('.proj-display-title');
      if (projTitle) {
        const spans = [...projTitle.querySelectorAll('span')];
        if (spans.length) makeBend(projTitle, spans, '#e8e6f0');
      }

    });
  });
})();
