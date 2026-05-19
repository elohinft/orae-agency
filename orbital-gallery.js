(function () {
  'use strict';

  // ─── Règles strictes ───────────────────────────────────────────────────────
  // • Tailles L/M/S strictement alternées (cycle L→M→S × 7 sur 21 images)
  // • Jamais même famille ni même image adjacente (y compris le wrap 20→0)
  // • Aucune image web design — aroma uniquement en S (peu mis en avant)
  // • Images prioritaires en L : lueur-1, reborn, affiche-chrys, reflexiongue, affiche-oxytocin
  // • Doublons espacés ≥ 8 positions
  // ──────────────────────────────────────────────────────────────────────────
  const IMAGES = [
    { src: 'images/lueur-1.png',         s: 1.20 }, //  0 L  lueur      ★
    { src: 'images/reborn-goute.png',     s: 1.00 }, //  1 M  reborn
    { src: 'images/affiche-goth.png',     s: 0.82 }, //  2 S  affiche
    { src: 'images/reborn.png',           s: 1.20 }, //  3 L  reborn     ★
    { src: 'images/lueur-coq.png',        s: 1.00 }, //  4 M  lueur
    { src: 'images/aroma2.png',           s: 0.82 }, //  5 S  aroma      (petit)
    { src: 'images/affiche-chrys.png',    s: 1.20 }, //  6 L  affiche    ★
    { src: 'images/reborn2-0.png',        s: 1.00 }, //  7 M  reborn
    { src: 'images/delta.png',            s: 0.82 }, //  8 S  delta
    { src: 'images/reflexiongue.png',     s: 1.20 }, //  9 L  reflexiongue ★
    { src: 'images/armanoid.png',         s: 1.00 }, // 10 M  armanoid
    { src: 'images/aroma1.png',           s: 0.82 }, // 11 S  aroma      (petit)
    { src: 'images/affiche-oxytocin.png', s: 1.20 }, // 12 L  affiche    ★
    { src: 'images/brand-drop.png',       s: 1.00 }, // 13 M  brand-drop
    { src: 'images/lueur-coq.png',        s: 0.82 }, // 14 S  lueur      (doublon pos 4, écart 10)
    { src: 'images/reborne-smile.png',    s: 1.20 }, // 15 L  reborn
    { src: 'images/lueur-1.png',          s: 1.00 }, // 16 M  lueur      (doublon pos 0, écart 16)
    { src: 'images/reborn-goute.png',     s: 0.82 }, // 17 S  reborn     (doublon pos 1, écart 16)
    { src: 'images/lueur-2.png',          s: 1.20 }, // 18 L  lueur
    { src: 'images/affiche-goth.png',     s: 1.00 }, // 19 M  affiche    (doublon pos 2, écart 17)
    { src: 'images/delta.png',            s: 0.82 }, // 20 S  delta      (doublon pos 8, écart 12)
    { src: 'images/droplogo.png',         s: 1.20 }, // 21 L  brand-drop (écart 8 de brand-drop pos 13)
  ];

  const N      = IMAGES.length; // 21
  const TAU    = 2 * Math.PI;
  const PERIOD = 42000;

  // Ratio fixe largeur/hauteur appliqué à TOUTES les images (portrait)
  // → écart horizontal identique quelle que soit l'image d'origine
  const CELL_RATIO = 0.68; // w = h × 0.68

  function init() {
    const hero = document.getElementById('hero');
    if (!hero) return;

    const outer = document.createElement('div');
    outer.id = 'orbital-gallery';
    outer.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;';
    hero.appendChild(outer);

    const stage = document.createElement('div');
    stage.style.cssText = [
      'position:absolute',
      'left:50%', 'top:48%',
      'width:0', 'height:0',
      'transform-style:preserve-3d',
      'transform:rotateX(-12deg)',
    ].join(';');
    outer.appendChild(stage);

    const items = IMAGES.map((imgData) => {
      const el = document.createElement('img');
      el.src       = imgData.src;
      el.draggable = false;
      el.style.cssText = [
        'position:absolute',
        'object-fit:cover',       // recadre sans déformer
        'object-position:center', // centre le contenu visible
        'border-radius:0',
        'pointer-events:auto',
        'cursor:none',
        'user-select:none',
        'will-change:transform',
        'backface-visibility:visible',
      ].join(';');
      stage.appendChild(el);
      return { el, imgData, hovered: false };
    });

    items.forEach(item => {
      item.el.addEventListener('mouseenter', () => { item.hovered = true;  });
      item.el.addEventListener('mouseleave', () => { item.hovered = false; });
    });

    let containerHovered = false;
    hero.addEventListener('mouseenter', () => { containerHovered = true;  });
    hero.addEventListener('mouseleave', () => { containerHovered = false; });

    let R = 0;

    function resize() {
      const W = hero.offsetWidth;
      const H = hero.offsetHeight;
      R = Math.min(Math.round(W * 0.82), Math.round(H * 0.70), 1100);

      // Taille par hauteur : toutes les images ont le même CELL_RATIO w/h
      // → les gaps horizontaux sont identiques pour toutes les tailles
      // Arc entre 2 images = 2πR/21 ≈ 0.299R
      // baseH calibré pour que les images soient grandes mais non chevauchantes au S
      const baseH = Math.round(R * 0.44);

      // Perspective haute → moins de compression en profondeur → espacement plus homogène
      outer.style.perspective       = `${Math.round(R * 9.0)}px`;
      outer.style.perspectiveOrigin = '50% 48%';

      items.forEach(item => {
        const h = Math.round(baseH * item.imgData.s);
        const w = Math.round(h * CELL_RATIO);
        item.el.style.width      = w + 'px';
        item.el.style.height     = h + 'px';
        item.el.style.marginLeft = (-w / 2) + 'px';
        item.el.style.marginTop  = (-h / 2) + 'px';
      });
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    let lastTs = 0, elapsed = 0;

    function frame(ts) {
      requestAnimationFrame(frame);
      const dt  = Math.min(ts - (lastTs || ts), 64);
      lastTs    = ts;
      elapsed  += dt * (containerHovered ? 0.3 : 1.0);

      items.forEach((item, i) => {
        const angleRad = (i / N) * TAU + (elapsed / PERIOD) * TAU;
        const angleDeg = angleRad * 180 / Math.PI;
        const sc = item.hovered ? 1.07 : 1.0;

        // Billboard : contre-rotation pour que chaque image fasse toujours face
        // à la caméra — élimine le miroir sur les images du fond
        item.el.style.transform = [
          `rotateY(${angleDeg.toFixed(2)}deg)`,
          `translateZ(${R}px)`,
          `rotateY(${(-angleDeg).toFixed(2)}deg)`,
          `scale(${sc})`,
        ].join(' ');
      });
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
