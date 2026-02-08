import { useState, useRef, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";

const PRESETS = {
  graphene: { label: "🔷 Graphene Lattice", n: 500, repStr: 3000, attStr: 400, eqDist: 29, sharpness: 8, torqueStr: 195, friction: 2.4, w: 800, h: 450 },
  breathing: { label: "💫 Breathing Mode", n: 1000, repStr: 3000, attStr: 680, eqDist: 16, sharpness: 8, torqueStr: 200, friction: 2.4, w: 800, h: 450 },
  liquid: { label: "💧 Liquid Phase", n: 600, repStr: 500, attStr: 200, eqDist: 20, sharpness: 1, torqueStr: 20, friction: 1.0, w: 800, h: 450 },
  gas: { label: "🔥 Hot Gas", n: 300, repStr: 1500, attStr: 100, eqDist: 25, sharpness: 2, torqueStr: 30, friction: 0.2, w: 800, h: 450 },
  clusters: { label: "🧬 Nano Clusters", n: 400, repStr: 3000, attStr: 250, eqDist: 8, sharpness: 7.5, torqueStr: 165, friction: 2.4, w: 800, h: 450 },
};

const DAMPING = 0.97, ANG_DAMP = 0.94;

function angFactor(angle, theta, sharp) {
  let mx = -1;
  for (let k = 0; k < 3; k++) {
    const c = Math.cos(angle - theta - k * 2.094395);
    if (c > mx) mx = c;
  }
  return Math.pow(Math.max(0, mx), sharp);
}

function closestAxisDelta(angle, theta) {
  let minAbs = Infinity, best = 0;
  for (let k = 0; k < 3; k++) {
    let d = angle - theta - k * 2.094395;
    while (d > Math.PI) d -= 6.283185;
    while (d < -Math.PI) d += 6.283185;
    if (Math.abs(d) < minAbs) { minAbs = Math.abs(d); best = d; }
  }
  return best;
}

function initParticles(p) {
  const pts = [], margin = Math.max(5, p.eqDist);
  for (let i = 0; i < p.n; i++) {
    pts.push({
      x: margin + Math.random() * (p.w - 2 * margin),
      y: margin + Math.random() * (p.h - 2 * margin),
      vx: (Math.random() - 0.5), vy: (Math.random() - 0.5),
      th: Math.random() * 6.283185, om: 0
    });
  }
  return pts;
}

function stepSim(pts, p) {
  const { repStr, attStr, eqDist, sharpness, torqueStr, friction, w, h } = p;
  const N = pts.length, cut = eqDist * 3;
  const fx = new Float64Array(N), fy = new Float64Array(N), tq = new Float64Array(N);
  const dt = 0.4;
  const fricMul = Math.max(0, 1 - friction * dt);

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
      const r2 = dx * dx + dy * dy;
      if (r2 < 1 || r2 > cut * cut) continue;
      const r = Math.sqrt(r2);
      const ux = dx / r, uy = dy / r;
      const aij = Math.atan2(dy, dx), aji = aij + Math.PI;

      if (r < eqDist * 1.2) {
        const overlap = (eqDist * 1.2 - r) / eqDist;
        const rf = repStr * overlap * overlap;
        fx[i] -= rf * ux; fy[i] -= rf * uy;
        fx[j] += rf * ux; fy[j] += rf * uy;
      }

      const ai = angFactor(aij, pts[i].th, sharpness);
      const aj = angFactor(aji, pts[j].th, sharpness);
      const ang = ai * aj;
      if (ang > 0.01) {
        const dr = (r - eqDist) / eqDist;
        const decay = Math.exp(-Math.max(0, dr) * Math.max(0, dr) * 2);
        const sf = attStr * ang * dr * decay;
        fx[i] += sf * ux; fy[i] += sf * uy;
        fx[j] -= sf * ux; fy[j] -= sf * uy;
      }

      const distW = Math.exp(-((r - eqDist) / eqDist) * ((r - eqDist) / eqDist) * 2);
      const di = closestAxisDelta(aij, pts[i].th);
      const dj = closestAxisDelta(aji, pts[j].th);
      tq[i] += torqueStr * Math.sin(di) * distW;
      tq[j] += torqueStr * Math.sin(dj) * distW;
    }
  }

  let ke = 0;
  for (let i = 0; i < N; i++) {
    pts[i].vx = (pts[i].vx + fx[i] * dt) * DAMPING * fricMul;
    pts[i].vy = (pts[i].vy + fy[i] * dt) * DAMPING * fricMul;
    pts[i].x += pts[i].vx * dt;
    pts[i].y += pts[i].vy * dt;
    pts[i].om = (pts[i].om + tq[i] * dt) * ANG_DAMP * fricMul;
    pts[i].th += pts[i].om * dt;
    ke += pts[i].vx * pts[i].vx + pts[i].vy * pts[i].vy;
    if (pts[i].x < 3) { pts[i].x = 3; pts[i].vx *= -0.3; }
    if (pts[i].x > w - 3) { pts[i].x = w - 3; pts[i].vx *= -0.3; }
    if (pts[i].y < 3) { pts[i].y = 3; pts[i].vy *= -0.3; }
    if (pts[i].y > h - 3) { pts[i].y = h - 3; pts[i].vy *= -0.3; }
  }
  return ke * 0.5;
}

function renderCanvas(ctx, pts, p) {
  const { w, h, eqDist, sharpness } = p;
  ctx.fillStyle = "#0a0e17";
  ctx.fillRect(0, 0, w, h);

  const bondCut = eqDist * 1.4;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > bondCut) continue;
      const aij = Math.atan2(dy, dx);
      const ai = angFactor(aij, pts[i].th, sharpness);
      const aj = angFactor(aij + Math.PI, pts[j].th, sharpness);
      const ang = ai * aj;
      if (ang > 0.15) {
        const alpha = Math.min(1, ang * 0.9) * (1 - (r - eqDist * 0.7) / (bondCut - eqDist * 0.7));
        ctx.strokeStyle = `rgba(80,200,255,${Math.max(0, alpha).toFixed(2)})`;
        ctx.lineWidth = 1.5 + ang;
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
      }
    }
  }

  for (const pt of pts) {
    ctx.strokeStyle = "rgba(80,200,255,0.25)";
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const a = pt.th + k * 2.094395;
      const len = eqDist * 0.35;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x + Math.cos(a) * len, pt.y + Math.sin(a) * len);
      ctx.stroke();
    }
    const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 5);
    grad.addColorStop(0, "rgba(120,220,255,0.9)");
    grad.addColorStop(0.5, "rgba(60,160,220,0.4)");
    grad.addColorStop(1, "rgba(30,80,120,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 5, 0, 6.283185); ctx.fill();
    ctx.fillStyle = "#b0e8ff";
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 2, 0, 6.283185); ctx.fill();
  }
}

const KE_HISTORY = 200;

const Slider = ({ label, value, min, max, step, onChange, unit = "" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
    <label style={{ color: "#8ca0b8", fontSize: 12, minWidth: 120, textAlign: "right" }}>{label}</label>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ flex: 1, accentColor: "#50c8ff", height: 4 }} />
    <span style={{ color: "#b0d0e8", fontSize: 12, minWidth: 40, textAlign: "left" }}>{value}{unit}</span>
  </div>
);

export default function GrapheneSim() {
  const canvasRef = useRef(null);
  const ptsRef = useRef(null);
  const rafRef = useRef(null);
  const runRef = useRef(false);
  const keRef = useRef([]);
  const frameRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [p, setP] = useState({ ...PRESETS.graphene });
  const [keData, setKeData] = useState([]);
  const [activePreset, setActivePreset] = useState("graphene");
  const pRef = useRef(p);

  useEffect(() => { pRef.current = p; }, [p]);

  const reset = useCallback(() => {
    ptsRef.current = initParticles(pRef.current);
    keRef.current = [];
    frameRef.current = 0;
    setKeData([]);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderCanvas(ctx, ptsRef.current, pRef.current);
  }, []);

  useEffect(() => { reset(); }, [reset]);

  const loop = useCallback(() => {
    if (!runRef.current) return;
    const pp = pRef.current;
    if (!ptsRef.current) ptsRef.current = initParticles(pp);
    while (ptsRef.current.length < pp.n) {
      ptsRef.current.push({
        x: Math.max(5, pp.eqDist) + Math.random() * (pp.w - 2 * Math.max(5, pp.eqDist)),
        y: Math.max(5, pp.eqDist) + Math.random() * (pp.h - 2 * Math.max(5, pp.eqDist)),
        vx: (Math.random() - 0.5), vy: (Math.random() - 0.5),
        th: Math.random() * 6.283185, om: 0
      });
    }
    while (ptsRef.current.length > pp.n) ptsRef.current.pop();

    let ke = 0;
    for (let s = 0; s < 3; s++) ke = stepSim(ptsRef.current, pp);

    frameRef.current++;
    if (frameRef.current % 3 === 0) {
      keRef.current.push({ t: frameRef.current, ke: Math.round(ke) });
      if (keRef.current.length > KE_HISTORY) keRef.current.shift();
      if (frameRef.current % 9 === 0) setKeData([...keRef.current]);
    }

    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderCanvas(ctx, ptsRef.current, pp);
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const toggleRun = useCallback(() => {
    if (runRef.current) {
      runRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setRunning(false);
    } else {
      runRef.current = true;
      setRunning(true);
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [loop]);

  useEffect(() => () => { runRef.current = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const upd = (key, val) => { setActivePreset(null); setP(prev => ({ ...prev, [key]: val })); };

  const applyPreset = (key) => {
    setActivePreset(key);
    setP({ ...PRESETS[key] });
    pRef.current = { ...PRESETS[key] };
    ptsRef.current = initParticles(PRESETS[key]);
    keRef.current = [];
    frameRef.current = 0;
    setKeData([]);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) renderCanvas(ctx, ptsRef.current, PRESETS[key]);
  };

  const btnStyle = (key) => ({
    background: activePreset === key ? "#1a5a8a" : "#1a2636",
    color: activePreset === key ? "#e0f0ff" : "#7090a8",
    border: `1px solid ${activePreset === key ? "#3090d0" : "#2a3a4a"}`,
    borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 500,
    transition: "all 0.2s"
  });

  return (
    <div style={{ background: "#0d1117", padding: 16, borderRadius: 12, fontFamily: "system-ui, sans-serif", maxWidth: 832 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ color: "#e0f0ff", margin: 0, fontSize: 16, fontWeight: 600 }}>Carbon sp² Self-Assembly Simulation</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={toggleRun}
            style={{ background: running ? "#c04040" : "#2a7a4a", color: "#fff", border: "none",
              borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            {running ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={reset}
            style={{ background: "#2a3a50", color: "#b0d0e8", border: "1px solid #3a5060",
              borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>
            ↺ Reset
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {Object.entries(PRESETS).map(([key, val]) => (
          <button key={key} onClick={() => applyPreset(key)} style={btnStyle(key)}>{val.label}</button>
        ))}
      </div>

      <canvas ref={canvasRef} width={p.w} height={p.h}
        style={{ display: "block", borderRadius: 8, border: "1px solid #1a2a3a", width: "100%", maxWidth: p.w }} />

      <div style={{ marginTop: 10, height: 90, background: "#0a0e17", borderRadius: 8, border: "1px solid #1a2a3a", padding: "8px 4px 0 4px" }}>
        <div style={{ color: "#5a7a90", fontSize: 10, marginLeft: 12, marginBottom: 2 }}>Kinetic Energy</div>
        <ResponsiveContainer width="100%" height={65}>
          <LineChart data={keData}>
            <XAxis dataKey="t" hide />
            <YAxis hide domain={[0, "auto"]} />
            <Line type="monotone" dataKey="ke" stroke="#50c8ff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
        <Slider label="Particles" value={p.n} min={100} max={1000} step={10} onChange={v => upd("n", v)} />
        <Slider label="Bond Distance" value={p.eqDist} min={5} max={50} step={1} onChange={v => upd("eqDist", v)} unit="px" />
        <Slider label="Repulsion" value={p.repStr} min={100} max={3000} step={50} onChange={v => upd("repStr", v)} />
        <Slider label="Attraction" value={p.attStr} min={50} max={1000} step={10} onChange={v => upd("attStr", v)} />
        <Slider label="Angular Sharpness" value={p.sharpness} min={1} max={8} step={0.5} onChange={v => upd("sharpness", v)} />
        <Slider label="Torque Strength" value={p.torqueStr} min={10} max={200} step={5} onChange={v => upd("torqueStr", v)} />
        <Slider label="Friction" value={p.friction} min={0} max={5} step={0.1} onChange={v => upd("friction", v)} />
        <Slider label="Width" value={p.w} min={400} max={1200} step={50} onChange={v => upd("w", v)} unit="px" />
        <Slider label="Height" value={p.h} min={300} max={800} step={50} onChange={v => upd("h", v)} unit="px" />
      </div>
    </div>
  );
}
