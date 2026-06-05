(function () {
  'use strict';

  // Skip touch devices
  if (window.matchMedia('(pointer: coarse)').matches) return;

  function loadThree(cb) {
    if (window.THREE) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  /**
   * wrapEl   — element to overlay (will receive position:relative if needed)
   * lineEls  — spans to hide while canvas is active
   * lines    — text strings to render
   * color    — CSS fill color matching the page text
   */
  function makeBend(wrapEl, lineEls, lines, color) {
    const T = window.THREE;

    if (getComputedStyle(wrapEl).position === 'static') {
      wrapEl.style.position = 'relative';
    }

    /* ── Canvas overlay (covers wrapEl exactly) ── */
    const cvs = document.createElement('canvas');
    cvs.style.cssText = [
      'position:absolute',
      'top:0', 'left:0', 'right:0', 'bottom:0',
      'width:100%', 'height:100%',
      'opacity:0',
      'transition:opacity .18s',
      'pointer-events:none',
      'z-index:2',
      'display:block',
    ].join(';');
    wrapEl.appendChild(cvs);

    const scene    = new T.Scene();
    const renderer = new T.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true });
    renderer.setClearColor(0, 0);

    let camera, mat, hitPlane, animId;

    function build() {
      const rect = wrapEl.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      if (!W || !H) return;

      renderer.setSize(W, H, false);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

      /* Camera: orthographic, angled (same as reference) so Z-displacement is visible */
      const aspect = W / H;
      const camH   = 10;
      const camW   = camH * aspect;
      camera = new T.OrthographicCamera(-camW / 2, camW / 2, camH / 2, -camH / 2, 0.1, 1000);
      camera.position.set(5, 5, 5);
      camera.lookAt(0, 0, 0);

      /* Text texture — canvas sized to element in physical pixels */
      const dpr = Math.min(devicePixelRatio, 2);
      const tc  = document.createElement('canvas');
      tc.width  = Math.round(W * dpr);
      tc.height = Math.round(H * dpr);
      const ctx = tc.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle   = color;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';

      const lh = H / lines.length;
      /* Scale 1.18 compensates for the ~35° isometric foreshortening */
      ctx.font = `700 ${Math.round(lh * 1.18)}px Lunchtype, sans-serif`;
      lines.forEach((t, i) => ctx.fillText(t, W / 2, lh * (i + 0.5)));

      const tex = new T.CanvasTexture(tc);
      tex.minFilter = tex.magFilter = T.LinearFilter;
      tex.generateMipmaps = false;

      /* Dispose previous resources */
      if (mat) { mat.uniforms.uTex.value.dispose(); mat.dispose(); }

      mat = new T.ShaderMaterial({
        uniforms: {
          uTex:   { value: tex },
          uMouse: { value: new T.Vector3(9999, 9999, 9999) },
        },
        vertexShader: `
          varying vec2 vUv;
          uniform vec3 uMouse;
          float smooth3(float t){ return t*t*(3.0-2.0*t); }
          void main(){
            vUv = uv;
            vec3 pos = position;
            vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
            float dist = length(uMouse - world);
            float r = 2.4;
            if(dist < r){
              float t = smooth3(1.0 - dist / r);
              pos.z += t * 1.9;
            }
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform sampler2D uTex;
          void main(){ gl_FragColor = texture2D(uTex, vUv); }
        `,
        transparent: true,
        side: T.DoubleSide,
        depthWrite: false,
      });

      /* Clear previous meshes */
      while (scene.children.length) scene.remove(scene.children[0]);

      /* Text plane — fills camera frustum exactly */
      scene.add(new T.Mesh(new T.PlaneGeometry(camW, camH, 120, 70), mat));

      /* Invisible hit plane for raycasting (same size/orientation) */
      hitPlane = new T.Mesh(
        new T.PlaneGeometry(camW * 2, camH * 2),
        new T.MeshBasicMaterial({ visible: false })
      );
      scene.add(hitPlane);
    }

    const raycaster = new T.Raycaster();
    const ptr = new T.Vector2();

    function onMove(e) {
      if (!mat || !hitPlane) return;
      const r = cvs.getBoundingClientRect();
      ptr.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
      ptr.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
      raycaster.setFromCamera(ptr, camera);
      const hits = raycaster.intersectObject(hitPlane);
      if (hits.length) mat.uniforms.uMouse.value.copy(hits[0].point);
    }

    function loop() {
      animId = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    }

    function activate() {
      if (!mat) build();
      /* Freeze original spans — no transition so the swap is instant */
      lineEls.forEach(el => { el.style.transition = 'none'; el.style.opacity = '0'; });
      cvs.style.opacity       = '1';
      cvs.style.pointerEvents = 'auto';
      cvs.addEventListener('mousemove', onMove);
      if (!animId) loop();
    }

    function deactivate() {
      cvs.style.opacity       = '0';
      cvs.style.pointerEvents = 'none';
      cvs.removeEventListener('mousemove', onMove);
      if (mat) mat.uniforms.uMouse.value.set(9999, 9999, 9999);
      lineEls.forEach(el => { el.style.opacity = ''; el.style.transition = ''; });
      if (animId) { cancelAnimationFrame(animId); animId = null; }
    }

    wrapEl.addEventListener('mouseenter', activate);
    wrapEl.addEventListener('mouseleave', deactivate);
  }

  /* ── Wait for fonts to be ready before building textures ── */
  function init() {
    /* index.html — DESIGN / STUDIO */
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
      const l1 = heroTitle.querySelector('.hero-title-line1');
      const l2 = heroTitle.querySelector('.hero-title-line2');
      if (l1 && l2) makeBend(heroTitle, [l1, l2], ['DESIGN', 'STUDIO'], '#F0EEF3');
    }

    /* projets.html — PORT / FO / LIO */
    const projTitle = document.querySelector('.proj-display-title');
    if (projTitle) {
      const spans = [...projTitle.querySelectorAll('span')];
      if (spans.length) makeBend(projTitle, spans, spans.map(s => s.textContent.trim()), '#e8e6f0');
    }
  }

  loadThree(() => {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(init);
    } else {
      init();
    }
  });
})();
