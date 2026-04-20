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

const ANALYSIS_INTERVAL = 5000;
const MIN_VISIBLE_POINTS = 20;

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
  const lastAnalysis = useRef(0);
  const wasInFrame = useRef(false);

  const [exercise, setExercise] = useState("squat");
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
  const [facingMode, setFacingMode] = useState("user");
  const [volume, setVolume] = useState(1);
  const [inFrame, setInFrame] = useState(false);

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

  const analyzeWithClaude = useCallback(async (imageBase64, anglesData, mode = "live", vCount = 0, prevFeedback = null) => {
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, exercise, angles: anglesData, mode, visiblePoints: vCount, previousFeedback: prevFeedback }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFeedback(data.feedback);
      setPreviousFeedback(data.feedback);
      speak(data.feedback, volume);
    } catch (e) {}
    finally { setLoading(false); }
  }, [exercise, volume]);

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
      const lms = result.landmarks[0];
      const vCount = lms.filter(lm => lm.visibility > 0.5).length;
      setVisibleCount(vCount);
      const nowInFrame = vCount >= MIN_VISIBLE_POINTS;
      setInFrame(nowInFrame);

      // Komunikat "Jesteś w kadrze" gdy wchodzi w kadr
      if (nowInFrame && !wasInFrame.current) {
        speak("Jesteś w kadrze, zaczynam analizę.", volume);
        lastAnalysis.current = Date.now() + 2000; // daj 2 sekundy przed pierwszą analizą
      }
      wasInFrame.current = nowInFrame;

      const now = Date.now();
      if (now - lastAnalysis.current > ANALYSIS_INTERVAL && !loading) {
        lastAnalysis.current = now;
        const imageBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
        analyzeWithClaude(imageBase64, computed, "live", vCount, previousFeedback);
      }
    } else {
      wasInFrame.current = false;
      setInFrame(false);
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [exercise, loading, drawSkeleton, analyzeWithClaude, volume, previousFeedback]);

  const startCamera = useCallback(async (facing) => {
    if (!mpReady) return;
    setError(null);
    setFeedback(null);
    setPreviousFeedback(null);
    wasInFrame.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.st
