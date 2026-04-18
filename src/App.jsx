import { useState, useRef, useCallback, useEffect } from "react";
import { getAngles, getAngleStatus, POSE_CONNECTIONS } from "./poseAnalyzer";

const EXERCISES = [
  { id: "squat",  label: "Przysiad",    icon: "🏋️" },
  { id: "pushup", label: "Pompki",      icon: "💪" },
  { id: "lunge",  label: "Wykroki",     icon: "🦵" },
  { id: "plank",  label: "Deska",       icon: "🧱" },
  { id: "pullup", label: "Podciąganie", icon: "🔝" },
];

const ANALYSIS_INTERVAL = 4000;

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const lastAnalysis = useRef(0);

  const [exercise, setExercise] = useState("squat");
  const [cameraActive, setCameraActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [angles, setAngles] = useState({});
  const [mpReady, setMpReady] = useState(false);
  const [mpLoading, setMpLoading] = useState(false);
  const [error, setError] = useState(null);
  const [poseDetected, setPoseDetected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadMP() {
      setMpLoading(true);
      try {
        let attempts = 0;
        while (attempts < 50) {
          if (window.mpVision) {
            window.FilesetResolver = window.mpVision.FilesetResolver;
            window.PoseLandmarker = window.mpVision.PoseLandmarker;
          }
          if (window.FilesetResolver && window.PoseLandmarker) break;
          await new Promise(r => setTimeout(r, 200));
          attempts++;
        }
        if (!window.FilesetResolver || !window.PoseLandmarker) {
          throw new Error("MediaPipe nie załadował się w czasie.");
        }
        const vision = await window.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const detector = await window.PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (!cancelled) { detectorRef.current = detector; setMpReady(true); }
      } catch (e) {
        if (!cancelled) setError("Błąd ładowania MediaPipe: " + e.message);
      } finally {
        if (!cancelled) setMpLoading(false);
      }
    }
    loadMP();
    return () => { cancelled = true; };
  }, []);

  const drawSkeleton = useCallback((ctx, landmarks, w, h) => {
    if (!landmarks || landmarks.length === 0) return;
    const lms = landmarks[0];
    ctx.strokeStyle = "rgba(0,229,160,0.7)";
    ctx.lineWidth = 2.5;
    POSE_CONNECTIONS.forEach(([a, b]) => {
      const pa = lms[a], pb = lms[b];
      if (pa.visibility > 0.3 && pb.visibility > 0.3) {
        ctx.beginPath();
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
        ctx.stroke();
      }
    });
    lms.forEach((lm) => {
      if (lm.visibility > 0.3) {
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#00e5a0";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }, []);

  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;
    if (!video || !canvas || !detector || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(renderLoop);
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    let result;
    try {
      result = detector.detectForVideo(video, performance.now());
    } catch (_) {
      rafRef.current = requestAnimationFrame(renderLoop);
      return;
    }
    const hasLandmarks = result?.landmarks?.length > 0;
    setPoseDetected(hasLandmarks);
    if (hasLandmarks) {
      drawSkeleton(ctx, result.landmarks, w, h);
      const computed = getAngles(result.landmarks[0], exercise);
      setAngles(computed);
      const now = Date.now();
      if (now - lastAnalysis.current > ANALYSIS_INTERVAL && !loading) {
        lastAnalysis.current = now;
        const imageBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
        analyzeWithClaude(imageBase64, computed);
      }
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [exercise, loading, drawSkeleton]);

  const analyzeWithClaude = useCallback(async (imageBase64, anglesData) => {
    setLoading(true);
    try {
      const res = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, exercise, angles: anglesData }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFeedback(data.feedback);
    } catch (e) {}
    finally { setLoading(false); }
  }, [exercise]);

  const startCamera = useCallback(async () => {
    if (!mpReady) return;
    setError(null);
    setFeedback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await new Promise((r) => (videoRef.current.onloadedmetadata = r));
      videoRef.current.play();
      setCameraActive(true);
      lastAnalysis.current = 0;
      rafRef.current = requestAnimationFrame(renderLoop);
    } catch (e) {
      setError("Brak dostępu do kamery. Sprawdź uprawnienia w przeglądarce.");
    }
  }, [mpReady, renderLoop]);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setAngles({});
    setPoseDetected(false);
  }, []);

  useEffect(() => {
    if (cameraActive) {
      cancelAnimationFrame(rafRef.current);
      setFeedback(null);
      lastAnalysis.current = 0;
      rafRef.current = requestAnimationFrame(renderLoop);
    }
  }, [exercise]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); stopCamera(); }, []);

  const ex = EXERCISES.find((e) => e.id === exercise);

  return (
    <div className="app">
      <header>
        <div className="logo">
          <span className="logo-glow">⚡</span>
          <div>
            <h1>FormCoach</h1>
            <p className="tagline">AI · MediaPipe · Analiza na żywo</p>
          </div>
        </div>
        {mpLoading && <span className="badge loading">Ładowanie AI…</span>}
        {mpReady && !cameraActive && <span className="badge ready">Gotowy</span>}
        {cameraActive && <span className={`badge ${poseDetected ? "detected" : "searching"}`}>{poseDetected ? "✓ Sylwetka" : "Szukam…"}</span>}
      </header>

      <main>
        <div className="exercise-row">
          {EXERCISES.map((ex) => (
            <button key={ex.id} className={`ex-btn ${exercise === ex.id ? "active" : ""}`} onClick={() => { setExercise(ex.id); setFeedback(null); }}>
              <span className="ex-icon">{ex.icon}</span>
              <span className="ex-name">{ex.label}</span>
            </button>
          ))}
        </div>

        <div className="camera-wrap">
          <video ref={videoRef} autoPlay playsInline muted className="video-hidden" />
          <canvas ref={canvasRef} className={`main-canvas ${cameraActive ? "active" : ""}`} />
          {!cameraActive && (
            <div className="camera-placeholder">
              <span className="ph-icon">{ex.icon}</span>
              <p className="ph-title">{ex.label}</p>
              <p className="ph-sub">Włącz kamerę · ustań w kadrze · zacznij ćwiczyć</p>
            </div>
          )}
          {cameraActive && loading && (
            <div className="analyzing-badge"><span className="dot-pulse" /> Analizuję…</div>
          )}
          {cameraActive && !poseDetected && !loading && (
            <div className="no-pose-badge">Wejdź w kadr całym ciałem</div>
          )}
        </div>

        <div className="controls">
          {!cameraActive ? (
            <button className="btn-start" onClick={startCamera} disabled={!mpReady || mpLoading}>
              {mpLoading ? "⏳ Ładowanie…" : "📷 Start"}
            </button>
          ) : (
            <button className="btn-stop" onClick={stopCamera}>⏹ Stop</button>
          )}
        </div>

        {cameraActive && Object.keys(angles).length > 0 && (
          <div className="angles-grid">
            {Object.entries(angles).map(([name, val]) => {
              const status = getAngleStatus(name, val, exercise);
              return (
                <div key={name} className={`angle-card ${status}`}>
                  <span className="angle-val">{val}°</span>
                  <span className="angle-name">{name.replace(/_/g, " ")}</span>
                </div>
              );
            })}
          </div>
        )}

        {error && <div className="error-box">⚠️ {error}</div>}

        {feedback && (
          <div className="feedback-box">
            <div className="feedback-header">
              {ex.icon} <strong>Analiza Claude</strong>
              {loading && <span className="refreshing">odświeżam…</span>}
            </div>
            <div className="feedback-body">
              {feedback.split("\n").filter(Boolean).map((line, i) => (
                <p key={i} className="feedback-line">{line}</p>
              ))}
            </div>
          </div>
        )}

        {!cameraActive && !feedback && (
          <div className="tips">
            <p className="tips-title">Jak używać</p>
            <div className="tips-grid">
              <div className="tip">📐 Kamera z boku lub z przodu</div>
              <div className="tip">💡 Dobre oświetlenie</div>
              <div className="tip">🎯 Całe ciało w kadrze</div>
              <div className="tip">⏱ Analiza co ~4 sekundy</div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{--bg:#080810;--surf:#11111c;--surf2:#191926;--border:#252535;--accent:#00e5a0;--accent2:#7c3aed;--bad:#ff4d6d;--warn:#f59e0b;--text:#eeeef8;--dim:#8888aa;}
        body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh}
        .app{max-width:500px;margin:0 auto;padding-bottom:48px}
        header{display:flex;align-items:center;gap:12px;padding:20px 16px 14px;border-bottom:1px solid var(--border);}
        .logo{display:flex;align-items:center;gap:10px;flex:1}
        .logo-glow{font-size:26px;filter:drop-shadow(0 0 10px rgba(0,229,160,0.7));}
        .logo h1{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.5px}
        .tagline{font-size:10px;color:var(--dim);letter-spacing:1.5px;text-transform:uppercase;margin-top:2px}
        .badge{font-family:'DM Mono',monospace;font-size:11px;font-weight:500;padding:4px 10px;border-radius:20px;white-space:nowrap;}
        .badge.loading{background:rgba(245,158,11,0.15);color:var(--warn);border:1px solid rgba(245,158,11,0.3)}
        .badge.ready{background:rgba(0,229,160,0.1);color:var(--accent);border:1px solid rgba(0,229,160,0.3)}
        .badge.detected{background:rgba(0,229,160,0.15);color:var(--accent);border:1px solid rgba(0,229,160,0.4)}
        .badge.searching{background:rgba(136,136,170,0.1);color:var(--dim);border:1px solid var(--border)}
        main{padding:16px}
        .exercise-row{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:14px}
        .ex-btn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 4px;background:var(--surf);border:1px solid var(--border);border-radius:10px;cursor:pointer;color:var(--dim);transition:all 0.15s;}
        .ex-btn:hover{border-color:var(--accent);color:var(--text)}
        .ex-btn.active{background:rgba(0,229,160,0.08);border-color:var(--accent);color:var(--accent);box-shadow:0 0 14px rgba(0,229,160,0.12);}
        .ex-icon{font-size:18px}.ex-name{font-size:9px;font-weight:500;text-align:center;line-height:1.2}
        .camera-wrap{position:relative;background:var(--surf);border:1px solid var(--border);border-radius:14px;overflow:hidden;aspect-ratio:4/3;margin-bottom:12px;}
        .video-hidden{display:none}
        .main-canvas{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity 0.3s;}
        .main-canvas.active{opacity:1}
        .camera-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;}
        .ph-icon{font-size:56px;opacity:0.2;filter:grayscale(1)}
        .ph-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--dim)}
        .ph-sub{font-size:11px;color:var(--dim);opacity:0.5;text-align:center;padding:0 24px}
        .analyzing-badge{position:absolute;top:10px;right:10px;background:rgba(10,10,20,0.8);backdrop-filter:blur(6px);border:1px solid rgba(0,229,160,0.3);border-radius:20px;padding:5px 12px;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:6px;}
        .dot-pulse{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 1s ease-in-out infinite;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        .no-pose-badge{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);background:rgba(10,10,20,0.8);backdrop-filter:blur(6px);border:1px solid var(--border);border-radius:20px;padding:5px 14px;font-size:11px;color:var(--dim);white-space:nowrap;}
        .controls{display:flex;gap:8px;margin-bottom:12px}
        .btn-start,.btn-stop{flex:1;padding:13px;border-radius:10px;border:none;font-family:'Syne',sans-serif;font-size:15px;font-weight:800;cursor:pointer;transition:all 0.2s;}
        .btn-start{background:linear-gradient(135deg,var(--accent),#00b87a);color:#000}
        .btn-start:disabled{opacity:0.4;cursor:not-allowed}
        .btn-start:not(:disabled):hover{opacity:0.9;transform:translateY(-1px)}
        .btn-stop{background:rgba(255,77,109,0.15);color:var(--bad);border:1px solid rgba(255,77,109,0.3)}
        .btn-stop:hover{background:rgba(255,77,109,0.25)}
        .angles-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;}
        .angle-card{background:var(--surf);border:1px solid var(--border);border-radius:10px;padding:8px 6px;text-align:center;}
        .angle-card.good{border-color:rgba(0,229,160,0.4);background:rgba(0,229,160,0.06)}
        .angle-card.bad{border-color:rgba(255,77,109,0.4);background:rgba(255,77,109,0.06)}
        .angle-card.neutral{border-color:var(--border)}
        .angle-val{display:block;font-family:'DM Mono',monospace;font-size:18px;font-weight:500;color:var(--text);line-height:1;margin-bottom:3px;}
        .angle-card.good .angle-val{color:var(--accent)}
        .angle-card.bad .angle-val{color:var(--bad)}
        .angle-name{font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:0.5px}
        .error-box{background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.3);border-radius:10px;padding:12px 14px;font-size:13px;color:var(--bad);margin-bottom:12px;}
        .feedback-box{background:var(--surf);border:1px solid var(--border);border-radius:14px;overflow:hidden;animation:slideUp 0.35s ease;margin-bottom:12px;}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .feedback-header{display:flex;align-items:center;gap:8px;padding:12px 14px;background:rgba(0,229,160,0.06);border-bottom:1px solid var(--border);font-size:14px;color:var(--accent);}
        .refreshing{margin-left:auto;font-size:11px;color:var(--dim);font-style:italic}
        .feedback-body{padding:12px 14px;display:flex;flex-direction:column;gap:8px}
        .feedback-line{font-size:13px;line-height:1.6;padding:8px 10px;background:var(--surf2);border-radius:8px;border-left:3px solid var(--accent2);}
        .tips{margin-top:4px}
        .tips-title{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);margin-bottom:10px}
        .tips-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
        .tip{background:var(--surf);border:1px solid var(--border);border-radius:9px;padding:10px;font-size:12px;color:var(--dim);line-height:1.4;}
      `}</style>
    </div>
  );
}

