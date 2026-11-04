// Styled QR renderer. Works on any 2D canvas (browser or node-canvas). Needs the vendored qrcode-generator.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QRRender = api;
})(this, function () {
  // Rounded rectangle path with per-corner radii [tl, tr, br, bl]
  function rr(ctx, x, y, w, h, r) {
    const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  }

  const OUTER = { square: [0, 0, 0, 0], round: [1.8, 1.8, 1.8, 1.8], circle: [3.5, 3.5, 3.5, 3.5], leaf: [3.4, 0, 3.4, 0] };
  const INNER = { square: [0, 0, 0, 0], round: [0.9, 0.9, 0.9, 0.9], circle: [1.5, 1.5, 1.5, 1.5], leaf: [1.5, 0, 1.5, 0] };

  const hexToRgb = (hex) => { const v = hex.replace('#', ''); const n = parseInt(v.length === 3 ? v.split('').map((x) => x + x).join('') : v, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lum = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  function contrast(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

  /**
   * o: { text, dot: square|rounded|dots|liquid|lines, corner: square|round|circle|leaf, fg, bg,
   *      logo: HTMLImageElement|null, label: string, labelPos: 'below'|'center' }
   * Returns { modules }.
   */
  function render(cv, o, qrcode, size = 640) {
    const ctx = cv.getContext('2d');
    const hasCenterText = !o.logo && o.label && o.labelPos === 'center';
    const qr = qrcode(0, o.logo || hasCenterText ? 'H' : 'M');
    qr.addData(o.text); qr.make();
    const n = qr.getModuleCount(), quiet = 3, total = n + quiet * 2, m = size / total;
    const labelH = o.label && o.labelPos !== 'center' ? Math.round(size * 0.14) : 0;
    cv.width = size; cv.height = size + labelH;
    ctx.fillStyle = o.bg; ctx.fillRect(0, 0, cv.width, cv.height);

    const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    let plate = 0;
    if (o.logo || hasCenterText) { plate = Math.round(n * 0.2); if ((n - plate) % 2) plate++; }
    const p0 = Math.floor((n - plate) / 2);
    const inPlate = (r, c) => plate && r >= p0 - 0 && r < p0 + plate && c >= p0 && c < p0 + plate;
    // alignment patterns (version 2+) are drawn as solid blocks in every style so scanners can always lock on
    const ver = (n - 17) / 4, align = new Set();
    if (ver >= 2) {
      const cnt = Math.floor(ver / 7) + 2, last = n - 7, step = ver === 32 ? 26 : Math.ceil((last - 6) / (cnt - 1) / 2) * 2;
      const pos = [6]; for (let i = cnt - 1; i >= 1; i--) pos.splice(1, 0, last - (cnt - 1 - i) * step);
      pos.sort((x, y) => x - y);
      pos.forEach((pr) => pos.forEach((pc) => {
        if ((pr === 6 && pc === 6) || (pr === 6 && pc === last) || (pr === last && pc === 6)) return;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) align.add((pr + dr) * 1000 + (pc + dc));
      }));
    }
    const isAlign = (r, c) => align.has(r * 1000 + c);
    const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c) && !inFinder(r, c) && !inPlate(r, c) && !isAlign(r, c);
    const X = (c) => (c + quiet) * m, Y = (r) => (r + quiet) * m;

    ctx.fillStyle = o.fg;
    ctx.beginPath();
    if (o.dot === 'lines') {
      for (let c = 0; c < n; c++) {
        let r = 0;
        while (r < n) {
          if (!dark(r, c)) { r++; continue; }
          let r1 = r; while (dark(r1 + 1, c)) r1++;
          rr(ctx, X(c) + m * 0.13, Y(r), m * 0.74, (r1 - r + 1) * m, m * 0.37);
          r = r1 + 1;
        }
      }
      ctx.fill();
    } else {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!dark(r, c)) continue;
        const x = X(c), y = Y(r);
        if (o.dot === 'dots') { ctx.moveTo(x + m / 2 + m * 0.44, y + m / 2); ctx.arc(x + m / 2, y + m / 2, m * 0.44, 0, Math.PI * 2); }
        else if (o.dot === 'rounded') rr(ctx, x + m * 0.06, y + m * 0.06, m * 0.88, m * 0.88, m * 0.3);
        else if (o.dot === 'liquid') {
          const up = dark(r - 1, c), dn = dark(r + 1, c), lf = dark(r, c - 1), rt = dark(r, c + 1), R = m * 0.5;
          rr(ctx, x, y, m, m, [!up && !lf ? R : 0, !up && !rt ? R : 0, !dn && !rt ? R : 0, !dn && !lf ? R : 0]);
        } else ctx.rect(x - 0.2, y - 0.2, m + 0.4, m + 0.4);
      }
      ctx.fill();
    }

    ctx.beginPath();
    align.forEach((k) => { const r = Math.floor(k / 1000), c = k % 1000; if (r < n && c < n && qr.isDark(r, c) && !inPlate(r, c)) ctx.rect(X(c) - 0.2, Y(r) - 0.2, m + 0.4, m + 0.4); });
    ctx.fill();

    // finder patterns (the three big corner squares)
    const shape = OUTER[o.corner] ? o.corner : 'square';
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r, c]) => {
      const x = X(c), y = Y(r), ro = OUTER[shape].map((v) => v * m), ri = OUTER[shape].map((v) => Math.max(0, v - 1) * m), rc = INNER[shape].map((v) => v * m);
      ctx.beginPath(); rr(ctx, x, y, 7 * m, 7 * m, ro); rr(ctx, x + m, y + m, 5 * m, 5 * m, ri); ctx.fill('evenodd');
      ctx.beginPath(); rr(ctx, x + 2 * m, y + 2 * m, 3 * m, 3 * m, rc); ctx.fill();
    });

    // center badge: logo image or short text
    if (plate) {
      const px = X(p0), py = Y(p0), ps = plate * m;
      ctx.fillStyle = o.bg; ctx.beginPath(); rr(ctx, px, py, ps, ps, ps * 0.18); ctx.fill();
      if (o.logo) {
        const iw = o.logo.naturalWidth || o.logo.width, ih = o.logo.naturalHeight || o.logo.height, k = Math.min((ps * 0.82) / iw, (ps * 0.82) / ih);
        ctx.drawImage(o.logo, px + (ps - iw * k) / 2, py + (ps - ih * k) / 2, iw * k, ih * k);
      } else {
        const t = o.label.slice(0, 6); let fs = ps * 0.5;
        ctx.fillStyle = o.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `700 ${fs}px "Segoe UI", Arial, sans-serif`;
        while (ctx.measureText(t).width > ps * 0.84 && fs > 8) { fs -= 2; ctx.font = `700 ${fs}px "Segoe UI", Arial, sans-serif`; }
        ctx.fillText(t, px + ps / 2, py + ps / 2 + fs * 0.04);
      }
    }

    // label under the code
    if (labelH) {
      let fs = labelH * 0.46, t = o.label.slice(0, 60);
      ctx.fillStyle = o.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${fs}px "Segoe UI", Arial, sans-serif`;
      while (ctx.measureText(t).width > size * 0.86 && fs > 10) { fs -= 2; ctx.font = `600 ${fs}px "Segoe UI", Arial, sans-serif`; }
      ctx.fillText(t, size / 2, size + labelH * 0.42);
    }
    return { modules: n };
  }

  return { render, contrast };
});
