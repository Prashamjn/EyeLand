// Safe expression evaluator and unit conversion tables (no eval).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CalcEngine = api;
})(this, function () {
  const FN = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, log2: Math.log2,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  };
  const TRIG = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan };
  const INVERSE = new Set(['asin', 'acos', 'atan']);
  const CONST = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

  function tokenize(src) {
    const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/,/g, '.').toLowerCase();
    const out = []; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i)))) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = /^[a-z][a-z0-9]*/.exec(s.slice(i)))) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      if ('+-*/^%()!'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
      throw new Error('Unexpected "' + ch + '"');
    }
    return out;
  }

  function evaluate(src, deg = true) {
    const toks = tokenize(src); let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    const rad = (x) => (deg ? (x * Math.PI) / 180 : x), fromRad = (x) => (deg ? (x * 180) / Math.PI : x);
    function expr() {
      let v = term();
      while (isOp('+') || isOp('-')) v = next().v === '+' ? v + term() : v - term();
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        if (isOp('*')) { next(); v *= unary(); }
        else if (isOp('/')) { next(); v /= unary(); }
        else if (peek() && peek().t === 'id' && peek().v === 'mod') { next(); v %= unary(); }
        else if (peek() && (peek().t === 'num' || peek().t === 'id' || isOp('('))) v *= unary();   // implicit multiplication: 2pi, 3(4)
        else return v;
      }
    }
    function unary() {
      if (isOp('-')) { next(); return -unary(); }
      if (isOp('+')) { next(); return unary(); }
      return power();
    }
    function power() {
      const b = postfix();
      if (isOp('^')) { next(); return Math.pow(b, unary()); }
      return b;
    }
    function postfix() {
      let v = primary();
      for (;;) {
        if (isOp('%')) { next(); v /= 100; }
        else if (isOp('!')) { next(); v = factorial(v); }
        else return v;
      }
    }
    function primary() {
      const t = next();
      if (!t) throw new Error('Incomplete expression');
      if (t.t === 'num') return t.v;
      if (t.t === 'op' && t.v === '(') { const v = expr(); if (!isOp(')')) throw new Error('Missing )'); next(); return v; }
      if (t.t === 'id') {
        if (t.v in CONST) return CONST[t.v];
        if (t.v in FN || t.v in TRIG) {
          let arg;
          if (isOp('(')) { next(); arg = expr(); if (!isOp(')')) throw new Error('Missing )'); next(); }
          else arg = unary();
          if (t.v in FN) return FN[t.v](arg);
          return INVERSE.has(t.v) ? fromRad(TRIG[t.v](arg)) : TRIG[t.v](rad(arg));
        }
        throw new Error('Unknown "' + t.v + '"');
      }
      throw new Error('Unexpected "' + t.v + '"');
    }
    function factorial(n) { if (n < 0 || n !== Math.floor(n) || n > 170) throw new Error('Invalid factorial'); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
    const v = expr();
    if (p < toks.length) throw new Error('Unexpected "' + toks[p].v + '"');
    if (!isFinite(v)) throw new Error(isNaN(v) ? 'Not a number' : 'Cannot divide by zero');
    return v;
  }

  const format = (v) => { const r = Number(v.toPrecision(12)); return Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-9 && r !== 0) ? r.toExponential(6) : String(r); };

  const UNITS = {
    Length: { base: 'm', u: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
    Mass: { base: 'kg', u: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318 } },
    Temperature: { special: true, u: { 'C': 1, 'F': 1, 'K': 1 } },
    Volume: { base: 'L', u: { ml: 0.001, L: 1, tsp: 0.00492892, tbsp: 0.0147868, 'fl oz': 0.0295735, cup: 0.236588, pt: 0.473176, qt: 0.946353, gal: 3.78541 } },
    Area: { base: 'm2', u: { 'cm2': 0.0001, 'm2': 1, 'ha': 10000, 'km2': 1e6, 'in2': 0.00064516, 'ft2': 0.09290304, 'ac': 4046.8564224 } },
    Speed: { base: 'm/s', u: { 'm/s': 1, 'km/h': 0.277777778, 'mph': 0.44704, 'kn': 0.514444444, 'ft/s': 0.3048 } },
    Time: { base: 's', u: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 } },
    Data: { base: 'B', u: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 } },
  };
  function convertUnit(cat, v, from, to) {
    const c = UNITS[cat];
    if (c.special) {
      const k = from === 'C' ? v + 273.15 : from === 'F' ? ((v - 32) * 5) / 9 + 273.15 : v;
      return to === 'C' ? k - 273.15 : to === 'F' ? ((k - 273.15) * 9) / 5 + 32 : k;
    }
    return (v * c.u[from]) / c.u[to];
  }
  return { evaluate, format, UNITS, convertUnit };
});
