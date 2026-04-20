import { useState, useRef, useCallback, useEffect } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { getAngles, getAngleStatus, POSE_CONNECTIONS } from "./poseAnalyzer";

const EXERCISES = [
  { id: "squat",  label: "Przysiad",    icon: "🏋️" },
  { id: "pushup", label: "Pompki",      icon: "💪" },
  { id: "lunge",  label: "Wykroki",     icon: "🦵" },
  { id: "plank",  label: "Deska",       icon: "🧱" },
  { id: "pullup", label: "Podciąganie", icon: "🔝" },
];

const REP_OPTIONS = [8, 10, 12, 15];

const MIN_VISIBLE_POINTS = 20;

const REP_THRESHOLDS = {
  squat:  { down: 110, up: 150, joint: "kolano_lewe" },
  pushup: { down: 90,  up: 150, joint: "łokieć_lewy" },
  lunge:  { down: 100, up: 155, joint: "kolano_lewe" },
  plank:  { down: 0,   up: 0,   joint: null },
  pullup: { down: 60,  up: 150, joint: "łokieć_lewy" },
};

const ANGLE_NORMS = {
  squat:  { kolano_lewe: [55, 125], kolano_prawe: [55, 125], biodro_lewe: [50, 130] },
  pushup: { "łokieć_lewy": [75, 115], biodro_lewe: [160, 190] },
  lunge:  { kolano_lewe: [75, 105], kolano_prawe: [75, 105] },
  plank:  { biodro_lewe: [160, 190] },
  pullup: { "łokieć_lewy": [25, 65] },
};

function speak(text, volume = 1) {
  if (!text) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "pl-PL";
  utt.rate = 0.95;
  utt.pitch = 1;
  utt.volume = volume;
  window.speechSynthesis.speak(utt);
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const wasInFrame = useRef(false);
  const repPhase = useRef("up");
  const lastFeedbackTime = useRef(0);
  const lastErrorTime = useRef(0);
  const repCountRef = useRef(0);
  const loadingRef = useRef(false);
  const previousFeedbackRef = useRef(null);
  const sessionPhaseRef = useRef("waiting");
  const exerciseRef = useRef("squat");
  const volumeRef = useRef(1);
  const targetRepsRef = useRef(10);
  const announcedRepsRef = useRef(new Set());

  const [exercise, setExercise] = useState("squat");
  const [targetReps, setTargetReps] = useState(10);
  const [cameraActive, setCameraActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [previousFeedback, setPreviousFeedback] = useState(null);
  const [angles, setAngles] = useState({});
  const [mpReady, setMpReady] = useState(false);
  const [mpLoading, setMpLoading] = useState(false);
  const [error, setError] = useState(null);
  const [poseDetected, setPoseDetected] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [inFrame, setInFrame] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [volume, setVolume] = useState(1);
  const [sessionPhase, setSessionPhase] = useState("waiting");

  useEffect(() => { exerciseRef.current = exercise; }, [exercise]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { targetRepsRef.current = targetReps; }, [targetReps]);

  useEffect(() => {
    let cancelled = false;
    async function loadMP() {
      setMpLoading(true);
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const detector = await PoseLandmarker.createFromOptions(vision, {
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

  const analyzeWithClaude = useCallback(async (imageBase64, anglesData, mode, vCount, prevFeedback, reps, phase) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          exercise: exerciseRef.current,
          angles: anglesData,
          mode,
          visiblePoints: vCount,
          previousFeedback: prevFeedback,
          repCount: reps,
          phase,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFeedback(data.feedback);
      setPreviousFeedback(data.feedback);
      previousFeedbackRef.current = data.feedback;
      speak(data.feedback, volumeRef.current);
    } catch (e) {}
    finally { loadingRef.current = false; setLoading(false); }
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

  const checkForErrors = useCallback((anglesData) => {
    const norms = ANGLE_NORMS[exerciseRef.current];
    if (!norms) return false;
    for (const [joint, [min, max]] of Object.entries(norms)) {
      if (anglesData[joint] !== undefined) {
        if (anglesData[joint] < min - 10 || anglesData[joint] > max + 10) return true;
      }
    }
    return false;
  }, []);

  const announceRep = useCallback((rep, target) => {
    if (announcedRepsRef.current.has(rep)) return;
    announcedRepsRef.current.add(rep);
    const remaining = target - rep;
    if (rep % 2 === 0 && rep < target - 3) {
      speak(`${rep}`, volumeRef.current);
    } else if (remaining === 3) {
      speak("Jeszcze trzy powtórzenia.", volumeRef.current);
    } else if (remaining === 2) {
      speak("Jeszcze dwa.", volumeRef.current);
    } else if (remaining === 1) {
      speak("Ostatnie powtórzenie!", volumeRef.current);
    }
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
      const computed = getAngles(result.landmarks[0], exerciseRef.current);
      setAngles(computed);
      const lms = result.landmarks[0];
      const vCount = lms.filter(lm => lm.visibility > 0.5).length;
      setVisibleCount(vCount);
      const nowInFrame = vCount >= MIN_VISIBLE_POINTS;
      setInFrame(nowInFrame);

      if (nowInFrame && !wasInFrame.current) {
        speak("Jesteś w kadrze, zaczynam analizę.", volumeRef.current);
        repCountRef.current = 0;
        setRepCount(0);
        repPhase.current = "up";
        announcedRepsRef.current = new Set();
        sessionPhaseRef.current = "analyzing";
        setSessionPhase("analyzing");
        lastFeedbackTime.current = Date.now() + 3000;
      }
      wasInFrame.current = nowInFrame;

      if (nowInFrame) {
        const thresh = REP_THRESHOLDS[exerciseRef.current];
        if (thresh.joint && computed[thresh.joint] !== undefined) {
          const angle = computed[thresh.joint];
          if (repPhase.current === "up" && angle < thresh.down) {
            repPhase.current = "down";
          } else if (repPhase.current === "down" && angle > thresh.up) {
            repPhase.current = "up";
            repCountRef.current += 1;
            const newRep = repCountRef.current;
            setRepCount(newRep);
            const target = targetRepsRef.current;

            // Odliczanie głosowe
            announceRep(newRep, target);

            const now = Date.now();

            // Feedback po 2 powtórzeniach
            if (newRep === 2 && sessionPhaseRef.current === "analyzing" && now - lastFeedbackTime.current > 2000) {
              lastFeedbackTime.current = now;
              sessionPhaseRef.current = "monitoring";
              setSessionPhase("monitoring");
              const imageBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
              analyzeWithClaude(imageBase64, computed, "live", vCount, null, newRep, "early");
            }

            // Feedback po 4 powtórzeniach
            else if (newRep === 4 && now - lastFeedbackTime.current > 2000) {
              lastFeedbackTime.current = now;
              const imageBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
              analyzeWithClaude(imageBase64, computed, "live", vCount, previousFeedbackRef.current, newRep, "check");
            }

            // Koniec serii
            else if (newRep >= target) {
              lastFeedbackTime.current = now;
              repCountRef.current = 0;
              setRepCount(0);
              announcedRepsRef.current = new Set();
              sessionPhaseRef.current = "analyzing";
              setSessionPhase("analyzing");
              const imageBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
              analyzeWithClaude(imageBase64, {}, "summary", vCount, null, target, null);
            }
          }
        }

        // Detekcja błędów po 4 powtórzeniach
        const now = Date.now();
        if (repCountRef.current > 4 && now - lastErrorTime.current > 8000 && !loadingRef.current) {
          if (checkForErrors(computed)) {
            lastErrorTime.current = now;
            const imageBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
            analyzeWithClaude(imageBase64, computed, "error", vCount, null, repCountRef.current, null);
          }
        }
      }
    } else {
      wasInFrame.current = false;
      setInFrame(false);
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, [drawSkeleton, analyzeWithClaude, checkForErrors, announceRep]);

  const startCamera = useCallback(async (facing) => {
    if (!mpReady) return;
    setError(null);
    setFeedback(null);
    setPreviousFeedback(null);
    previousFeedbackRef.current = null;
    wasInFrame.current = false;
    repCountRef.current = 0;
    setRepCount(0);
    repPhase.current = "up";
    announcedRepsRef.current = new Set();
    sessionPhaseRef.current = "waiting";
    setSessionPhase("waiting");
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing || "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await new Promise((r) => (videoRef.current.onloadedmetadata = r));
      videoRef.current.play();
      setCameraActive(true);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(renderLoop);
    } catch (e) {
      setError("Brak dostępu do kamery. Sprawdź uprawnienia w przeglądarce.");
    }
  }, [mpReady, renderLoop]);

  const stopCamera = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    if (canvasRef.current && repCountRef.current > 0) {
      const imageBase64 = canvasRef.current.toDataURL("image/jpeg", 0.8).split(",")[1];
      await analyzeWithClaude(imageBase64, {}, "summary", 0, null, repCountRef.current, null);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setAngles({});
    setPoseDetected(false);
    setVisibleCount(0);
    setInFrame(false);
    setRepCount(0);
    repCountRef.current = 0;
    wasInFrame.current = false;
    sessionPhaseRef.current = "waiting";
    setSessionPhase("waiting");
  }, [analyzeWithClaude]);

  const flipCamera = useCallback(() => {
    startCamera("environment");
  }, [startCamera]);

  useEffect(() => {
    if (cameraActive) {
      cancelAnimationFrame(rafRef.current);
      setFeedback(null);
      setPreviousFeedback(null);
      previousFeedbackRef.current = null;
      wasInFrame.current = false;
      repCountRef.current = 0;
      setRepCount(0);
      repPhase.current = "up";
      announcedRepsRef.current = new Set();
      sessionPhaseRef.current = "waiting";
      setSessionPhase("waiting");
      rafRef.current = requestAnimationFrame(renderLoop);
    }
  }, [exercise]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

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
        {mpLoading && <span className="badge loading">Ładowanie…</span>}
        {mpReady && !cameraActive && <span className="badge ready">Gotowy</span>}
        {cameraActive && (
          <span className={`badge ${inFrame ? "detected" : "searching"}`}>
            {inFrame ? `${repCount}/${targetReps}` : poseDetected ? "Odejdź dalej" : "Szukam…"}
          </span>
        )}
      </header>

      <main>
        <div className="exercise-row">
          {EXERCISES.map((ex) => (
            <button key={ex.id} className={`ex-btn ${exercise === ex.id ? "active" : ""}`}
              onClick={() => { setExercise(ex.id); setFeedback(null); }}>
              <span className="ex-icon">{ex.icon}</span>
              <span className="ex-name">{ex.label}</span>
            </button>
          ))}
        </div>

        {/* Wybór liczby powtórzeń */}
        {!cameraActive && (
          <div className="reps-row">
            <p className="reps-label">Liczba powtórzeń</p>
            <div className="reps-options">
              {REP_OPTIONS.map(r => (
                <button
                  key={r}
                  className={`rep-btn ${targetReps === r ? "active" : ""}`}
                  onClick={() => setTargetReps(r)}
                >{r}</button>
              ))}
            </div>
          </div>
        )}

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
          {cameraActive && poseDetected && !inFrame && (
            <div className="no-pose-badge">Odejdź dalej — pokaż całe ciało</div>
          )}
          {cameraActive && !poseDetected && (
            <div className="no-pose-badge">Wejdź w kadr całym ciałem</div>
          )}
          {feedback && cameraActive && (
            <div className="feedback-overlay">{feedback}</div>
          )}
          {cameraActive && inFrame && (
            <div className="rep-counter">{repCount}/{targetReps}</div>
          )}
        </div>

        <div className="controls">
          {!cameraActive ? (
            <button className="btn-start" onClick={() => startCamera()} disabled={!mpReady || mpLoading}>
              {mpLoading ? "⏳ Ładowanie…" : "📷 Start"}
            </button>
          ) : (
            <>
              <button className="btn-flip" onClick={flipCamera}>🔄</button>
              <button className="btn-stop" onClick={stopCamera}>⏹ Stop</button>
            </>
          )}
        </div>

        <div className="volume-row">
          <span className="volume-icon">🔈</span>
          <input type="range" min="0" max="1" step="0.1" value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="volume-slider" />
          <span className="volume-icon">🔊</span>
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

        {feedback && !cameraActive && (
          <div className="feedback-box">
            <div className="feedback-header">{ex.icon} <strong>Podsumowanie serii</strong></div>
            <div className="feedback-body">
              <p className="feedback-line">{feedback}</p>
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
              <div className="tip">🔊 Feedback co 2 powtórzenia</div>
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
        .reps-row{margin-bottom:14px}
        .reps-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
        .reps-options{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .rep-btn{padding:10px;background:var(--surf);border:1px solid var(--border);border-radius:10px;cursor:pointer;color:var(--dim);font-family:'Syne',sans-serif;font-size:16px;font-weight:800;transition:all 0.15s;}
        .rep-btn:hover{border-color:var(--accent);color:var(--text)}
        .rep-btn.active{background:rgba(0,229,160,0.08);border-color:var(--accent);color:var(--accent);box-shadow:0 0 14px rgba(0,229,160,0.12);}
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
        .feedback-overlay{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);padding:12px 16px;font-size:15px;font-weight:500;color:#fff;text-align:center;line-height:1.4;}
        .rep-counter{position:absolute;top:10px;left:10px;background:rgba(0,229,160,0.2);backdrop-filter:blur(6px);border:2px solid var(--accent);border-radius:12px;padding:6px 14px;font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--accent);}
        .controls{display:flex;gap:8px;margin-bottom:12px}
        .btn-start,.btn-stop,.btn-flip{padding:13px;border-radius:10px;border:none;font-family:'Syne',sans-serif;font-size:15px;font-weight:800;cursor:pointer;transition:all 0.2s;}
        .btn-start{flex:1;background:linear-gradient(135deg,var(--accent),#00b87a);color:#000}
        .btn-start:disabled{opacity:0.4;cursor:not-allowed}
        .btn-start:not(:disabled):hover{opacity:0.9;transform:translateY(-1px)}
        .btn-stop{flex:1;background:rgba(255,77,109,0.15);color:var(--bad);border:1px solid rgba(255,77,109,0.3)}
        .btn-stop:hover{background:rgba(255,77,109,0.25)}
        .btn-flip{background:var(--surf2);color:var(--text);border:1px solid var(--border);font-size:20px;padding:13px 16px;}
        .btn-flip:hover{border-color:var(--accent)}
        .volume-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;background:var(--surf);border:1px solid var(--border);border-radius:10px;}
        .volume-icon{font-size:16px}
        .volume-slider{flex:1;-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:var(--border);outline:none;cursor:pointer;}
        .volume-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:var(--accent);cursor:pointer;}
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
        .feedback-body{padding:12px 14px;}
        .feedback-line{font-size:16px;line-height:1.6;padding:10px 12px;background:var(--surf2);border-radius:8px;border-left:3px solid var(--accent);color:var(--text);}
        .tips{margin-top:4px}
        .tips-title{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);margin-bottom:10px}
        .tips-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
        .tip{background:var(--surf);border:1px solid var(--border);border-radius:9px;padding:10px;font-size:12px;color:var(--dim);line-height:1.4;}
      `}</style>
    </div>
  );
}
