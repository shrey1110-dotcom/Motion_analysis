import React, { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { Chart } from "chart.js/auto"; // Ensure Chart.js is imported
import {
  COLORS,
  NAV_ITEMS,
  ACTIVITY_OPTIONS,
  BOWLING_SPEED,
  ACTIVITY_BACKEND_HINT,
} from "./utils/constants";
import {
  loadScript,
  clamp,
  scoreColor,
  severityRank,
  angleABC,
  torsoLeanFromVertical,
  gradeDeviation,
  distanceToRange,
  pickWorseSeverity,
  statusPill,
  stabilizePose,
  drawAnatomyCore,
  clonePose,
  fitPoseToCanvas,
  poseBounds,
  confidence,
  inferLiveSquatPhase,
  sleep,
} from "./utils/poseUtils";
import { activityConfig, getWorstFrame } from "./config/activityConfig";
import { getTechnicalAdvice } from "./utils/coachingCues";
import { useCricketSimulation } from "./hooks/useCricketSimulation";
import { Navigate, Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut, SignIn, SignUp, useAuth, useUser } from "@clerk/clerk-react";
import { MainLayout } from "./components/layout/MainLayout";
import { HomeView } from "./views/HomeView";
import { LiveAnalyzeView } from "./views/LiveAnalyzeView";
import { UploadAnalyzeView } from "./views/UploadAnalyzeView";
import { DashboardView } from "./views/DashboardView";
import { AboutView } from "./views/AboutView";

const FULL_SKELETON_EDGES = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
];

const KEYPOINT_INDEX = {
  nose: 0,
  left_shoulder: 5,
  right_shoulder: 6,
  left_hip: 11,
  right_hip: 12,
  left_knee: 13,
  right_knee: 14,
  left_ankle: 15,
  right_ankle: 16,
  left_wrist: 9,
  right_wrist: 10,
};

const CRICKET_ACTIVITY_KEYS = new Set(["coverDrive", "bowling"]);

// We redefine drawSkeleton here since it relies on FULL_SKELETON_EDGES and statusPill etc.
// But it's part of App.jsx in the old file anyway.

function App() {
  const { getToken } = useAuth();
  const { isSignedIn, user } = useUser();
  const [activeNav, setActiveNav] = useState("analyze");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activity, setActivity] = useState("auto");
  const [analysisMode, setAnalysisMode] = useState("standard");
  const [status, setStatus] = useState("idle");
  const [isLoading, setIsLoading] = useState(false);

  const [liveMetrics, setLiveMetrics] = useState({
    knee: 0,
    hip: 0,
    back: 0,
    timing: 0,
    balance: 0,
    path: 0,
  });
  const [referenceMetrics, setReferenceMetrics] = useState(null);
  const [trend, setTrend] = useState({ knee: [], hip: [], back: [] });
  const [liveFeedback, setLiveFeedback] = useState(
    "Ready when you are. Start live analysis to get coaching cues.",
  );
  const [liveConfidence, setLiveConfidence] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [coachingLog, setCoachingLog] = useState([]);

  const [analysis, setAnalysis] = useState(null);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  const [sessions, setSessions] = useState([]);

  const [coachMode, setCoachMode] = useState(false);
  const [rawPreview, setRawPreview] = useState("");
  const [timelineMeta, setTimelineMeta] = useState({
    total: 0,
    current: 0,
    worst: 0,
    phase: "n/a",
    playing: false,
  });

  const liveVideoRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const uploadVideoRef = useRef(null);
  const uploadCanvasRef = useRef(null);
  const timelineCanvasRef = useRef(null);
  const timelineSliderRef = useRef(null);
  const cricketSceneMountRef = useRef(null);
  const fileInputRef = useRef(null);

  const detectorRef = useRef(null);
  const tfRef = useRef(null);
  const poseRef = useRef(null);
  const streamRef = useRef(null);
  const liveRunningRef = useRef(false);
  const framesRef = useRef([]);
  const trailRef = useRef([]);
  const idealGhostRef = useRef(null);
  const lastSampleTsRef = useRef(0);
  const startTsRef = useRef(0);
  const lastRtRef = useRef(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);

  const uploadedFramesRef = useRef(null);
  const [hasGoldenSkeleton, setHasGoldenSkeleton] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareScore, setCompareScore] = useState(null);
  const pipVideoRef = useRef(null);
  const pipCanvasRef = useRef(null);
  const timelineDataRef = useRef([]);
  const timelinePlayRef = useRef(false);
  const timelineRafRef = useRef(null);
  const timelineFrameIdxRef = useRef(0);
  const timelineLastRenderTsRef = useRef(0);
  const timelineTickRef = useRef(0);
  const swingRef = useRef({
    prev: null,
    smoothVel: 0,
    lastSwingTs: 0,
    lastTriggerTs: 0,
  });

  useEffect(() => {
    if (compareMode && hasGoldenSkeleton && pipVideoRef.current && uploadedVideoUrl) {
      if (pipVideoRef.current.src !== uploadedVideoUrl) {
        pipVideoRef.current.src = uploadedVideoUrl;
        pipVideoRef.current.load();
      }
      pipVideoRef.current.currentTime = 0;
      pipVideoRef.current.play().catch(() => { });
    }
  }, [compareMode, hasGoldenSkeleton, uploadedVideoUrl]);

  const kneeChartRef = useRef(null);
  const trunkChartRef = useRef(null);
  const kneeChartInstRef = useRef(null);
  const trunkChartInstRef = useRef(null);

  const cricketModeEnabled =
    analysisMode === "cricket" || CRICKET_ACTIVITY_KEYS.has(activity);
  const {
    sceneReady: cricketSceneReady,
    speedKey: cricketSpeed,
    setSpeedKey: setCricketSpeed,
    startDelivery,
    result: cricketResult,
    deliveryCount,
    hitCount,
  } = useCricketSimulation({
    enabled: cricketModeEnabled,
    mountRef: cricketSceneMountRef,
    swingRef,
  });

  const homeSummary = useMemo(() => {
    if (!sessions.length) {
      return { performance: "--", consistency: "--", risk: "--" };
    }
    const latest = sessions[0];
    return {
      performance: `${latest.score}/100`,
      consistency: latest.consistency,
      risk: latest.risk,
    };
  }, [sessions]);

  useEffect(() => {
    const shouldEnableCricket = CRICKET_ACTIVITY_KEYS.has(activity);
    setAnalysisMode((prev) => {
      if (shouldEnableCricket) return "cricket";
      if (prev === "cricket") return "standard";
      return prev;
    });
  }, [activity]);

  useEffect(() => {
    if (analysisMode === "cricket" && !CRICKET_ACTIVITY_KEYS.has(activity)) {
      setActivity("coverDrive");
    }
  }, [analysisMode, activity]);

  async function getAuthHeaders() {
    const token = await getToken().catch(() => null);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (user?.id) headers["X-Clerk-User-Id"] = user.id;
    return headers;
  }

  useEffect(() => {
    let active = true;
    async function loadSessions() {
      if (!isSignedIn) {
        setSessions([]);
        return;
      }
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch("/api/sessions", { headers: authHeaders });
        if (!res.ok) return;
        const rows = await res.json();
        if (active) {
          setSessions(
            rows.map((r) => ({
              ...r,
              createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
              date: r.created_at || new Date().toISOString(),
              mlLabel: r.ml_label || "AI Heuristics",
            })),
          );
        }
      } catch {
        if (active) setSessions([]);
      }
    }
    loadSessions();
    return () => {
      active = false;
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (!analysis?.timeline) return;

    const labels = (analysis.timeline.avg_knee || []).map((_, i) => i + 1);

    if (kneeChartInstRef.current) kneeChartInstRef.current.destroy();
    if (trunkChartInstRef.current) trunkChartInstRef.current.destroy();

    if (kneeChartRef.current) {
      kneeChartInstRef.current = new Chart(kneeChartRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Knee Angle",
              data: analysis.timeline.avg_knee || [],
              borderColor: COLORS.primary,
              pointRadius: 0,
              tension: 0.28,
            },
            {
              label: "Hip Velocity",
              data: analysis.timeline.hip_velocity || [],
              borderColor: COLORS.secondary,
              pointRadius: 0,
              tension: 0.28,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: COLORS.subtxt } } },
          scales: {
            x: {
              ticks: { color: COLORS.subtxt },
              grid: { color: "rgba(155,163,175,.14)" },
            },
            y: {
              ticks: { color: COLORS.subtxt },
              grid: { color: "rgba(155,163,175,.14)" },
            },
          },
        },
      });
    }

    if (trunkChartRef.current) {
      trunkChartInstRef.current = new Chart(trunkChartRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Back Angle",
              data: analysis.timeline.trunk || [],
              borderColor: "#88a9ff",
              pointRadius: 0,
              tension: 0.28,
            },
            {
              label: "Hip Acceleration",
              data: analysis.timeline.hip_acceleration || [],
              borderColor: COLORS.warn,
              pointRadius: 0,
              tension: 0.28,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: COLORS.subtxt } } },
          scales: {
            x: {
              ticks: { color: COLORS.subtxt },
              grid: { color: "rgba(155,163,175,.14)" },
            },
            y: {
              ticks: { color: COLORS.subtxt },
              grid: { color: "rgba(155,163,175,.14)" },
            },
          },
        },
      });
    }

    return () => {
      if (kneeChartInstRef.current) kneeChartInstRef.current.destroy();
      if (trunkChartInstRef.current) trunkChartInstRef.current.destroy();
    };
  }, [analysis]);

  useEffect(
    () => () => {
      stopTimelinePlayback();
      liveRunningRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    },
    [],
  );

  async function ensurePoseLibs() {
    if (!window.tf) {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.19.0/dist/tf.min.js",
      );
    }
    if (!window.poseDetection) {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection",
      );
    }
    tfRef.current = window.tf;
    poseRef.current = window.poseDetection;
    if (!tfRef.current || !poseRef.current) {
      throw new Error("Pose libraries failed to initialize.");
    }
  }

  async function ensureDetector() {
    if (detectorRef.current) return detectorRef.current;
    setStatus("loading model");
    await ensurePoseLibs();
    await tfRef.current.ready();
    detectorRef.current = await poseRef.current.createDetector(
      poseRef.current.SupportedModels.MoveNet,
      {
        modelType: poseRef.current.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
      },
    );
    setStatus("model ready");
    return detectorRef.current;
  }

  function normalizeKeypoints(kps, w, h) {
    return kps.slice(0, 17).map((k) => ({
      x: Number((k.x / Math.max(w, 1)).toFixed(6)),
      y: Number((k.y / Math.max(h, 1)).toFixed(6)),
      score: Number((k.score ?? 0).toFixed(6)),
    }));
  }

  function getAngle(pose, a, b, c) {
    if (!pose?.keypoints) return 180;
    return angleABC(
      pose.keypoints[KEYPOINT_INDEX[a]],
      pose.keypoints[KEYPOINT_INDEX[b]],
      pose.keypoints[KEYPOINT_INDEX[c]],
    );
  }

  function evaluateRealtime(pose) {
    if (!pose?.keypoints) {
      return {
        knee: 0,
        hip: 0,
        back: 0,
        path: 0,
        timing: 0,
        balance: 0,
        feedback: "Keep full body visible for tracking.",
        phase: "n/a",
        jointSeverity: {},
        status: { knee: "neutral", hip: "neutral", back: "neutral" },
      };
    }

    const selectedActivity = activity === "auto" ? "squat" : activity;
    const cfg = activityConfig[selectedActivity] || activityConfig.squat;
    const kp = pose.keypoints;

    const hipY = (kp[11].y + kp[12].y) / 2;
    const phase =
      selectedActivity === "squat"
        ? inferLiveSquatPhase(
          (getAngle(pose, "left_hip", "left_knee", "left_ankle") +
            getAngle(pose, "right_hip", "right_knee", "right_ankle")) /
          2,
          lastRtRef.current?.hipY,
          hipY,
        )
        : "work";

    const baselineHeelY =
      lastRtRef.current?.baselineHeelY ?? (kp[15].y + kp[16].y) / 2;
    const angleCache = {
      leftKneeAngle: angleABC(kp[11], kp[13], kp[15]),
      rightKneeAngle: angleABC(kp[12], kp[14], kp[16]),
      torsoLean: torsoLeanFromVertical(kp[5], kp[6], kp[11], kp[12]),
    };
    const evaluated = cfg.evaluateFrame(
      { keypoints: kp },
      { phase, baselineHeelY, angleCache },
    );

    const leftKnee = getAngle(pose, "left_hip", "left_knee", "left_ankle");
    const rightKnee = getAngle(pose, "right_hip", "right_knee", "right_ankle");
    const knee = (leftKnee + rightKnee) / 2;
    const hip = getAngle(pose, "left_shoulder", "left_hip", "left_knee");
    const back = torsoLeanFromVertical(kp[5], kp[6], kp[11], kp[12]);
    const hipX = (kp[11].x + kp[12].x) / 2;
    const path = Math.abs(kp[9].x - kp[10].x);
    const timing = Math.round(Math.abs(hipX - 0.5) * 1000);
    const balance = Number((Math.abs(hipX - 0.5) * 100).toFixed(1));

    let feedback = "Movement detected. Maintain controlled tempo.";
    if (evaluated.reasons.length) {
      feedback = `Phase: ${phase}. ${evaluated.reasons[0]}.`;
    } else if (selectedActivity === "squat") {
      feedback =
        "Strong squat pattern. Keep depth and knee tracking consistent.";
    }

    const kneeStatus = pickWorseSeverity(
      evaluated.checks.kneeGrade?.level || "neutral",
      evaluated.checks.trackGrade?.level || "neutral",
    );
    const hipStatus = evaluated.checks.depthGrade?.level || "neutral";
    const backStatus = evaluated.checks.torsoGrade?.level || "neutral";

    return {
      knee,
      hip,
      back,
      path,
      timing,
      balance,
      feedback,
      phase,
      hipY,
      baselineHeelY,
      jointSeverity: evaluated.jointSeverity,
      status: { knee: kneeStatus, hip: hipStatus, back: backStatus },
    };
  }

  function drawSkeleton(ctx, pose, alpha, jointSeverityMap, pulse = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;

    drawAnatomyCore(ctx, pose, Math.min(alpha * 0.95, 1));

    for (const [a, b] of FULL_SKELETON_EDGES) {
      const p1 = pose.keypoints[a];
      const p2 = pose.keypoints[b];
      if ((p1.score ?? 0) <= 0.08 || (p2.score ?? 0) <= 0.08) continue;

      const s1 = jointSeverityMap[a] || "neutral";
      const s2 = jointSeverityMap[b] || "neutral";
      const edgeSeverity = pickWorseSeverity(s1, s2);
      const edgeColor = statusPill(edgeSeverity);

      ctx.shadowBlur = edgeSeverity === "bad" ? 12 : 0;
      ctx.shadowColor =
        edgeSeverity === "bad" ? "rgba(255,77,79,0.75)" : "transparent";
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = edgeSeverity === "bad" ? 3.4 : 2.8;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (let i = 0; i < 17; i += 1) {
      const kp = pose.keypoints[i];
      if ((kp.score ?? 0) <= 0.08) continue;
      const st = jointSeverityMap[i] || "neutral";
      const r = st === "bad" ? 4 + pulse : 4;
      ctx.fillStyle = statusPill(st);
      ctx.shadowBlur = st === "bad" ? 10 : 0;
      ctx.shadowColor = st === "bad" ? "rgba(255,77,79,0.7)" : "transparent";
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (st === "bad") {
        ctx.strokeStyle = "rgba(255,77,79,0.38)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawPose(videoEl, canvasEl, pose, jointSeverity) {
    const ctx = canvasEl.getContext("2d");
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;
    canvasEl.width = w;
    canvasEl.height = h;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(videoEl, 0, 0, w, h);

    if (!pose?.keypoints) return;

    const stablePose = stabilizePose(
      pose,
      trailRef.current.length
        ? trailRef.current[trailRef.current.length - 1]
        : null,
    );

    if (idealGhostRef.current) {
      drawSkeleton(ctx, idealGhostRef.current, 0.22, {});
    }

    const trail = trailRef.current;
    for (let i = 0; i < trail.length; i += 1) {
      const alpha = 0.08 + ((i + 1) / Math.max(trail.length, 1)) * 0.2;
      drawSkeleton(ctx, trail[i], alpha, {});
    }

    const pulse = (Math.sin(performance.now() / 240) + 1) * 1.2;
    drawSkeleton(ctx, stablePose, 1, jointSeverity, pulse);
  }

  function drawReferencePose(videoEl, canvasEl, frame) {
    if (!videoEl || !canvasEl || !frame?.keypoints) return;
    const ctx = canvasEl.getContext("2d");
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w;
      canvasEl.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(videoEl, 0, 0, w, h);

    const scaledPose = {
      keypoints: frame.keypoints.map(k => ({
        x: k.x * w,
        y: k.y * h,
        score: k.score
      }))
    };
    drawSkeleton(ctx, scaledPose, 1, {}, 0);
  }
  function preprocessActivityFrames(frames, selectedActivity) {
    if (!frames?.length) return [];
    const cfg = activityConfig[selectedActivity] || activityConfig.squat;
    const phaseData = cfg.detectPhases(frames);
    const baselineHeelY =
      frames
        .slice(0, Math.min(frames.length, 10))
        .reduce(
          (acc, f) => acc + (f.keypoints[15].y + f.keypoints[16].y) / 2,
          0,
        ) / Math.min(frames.length, 10);

    const smoothed = frames.map((frame, i) => {
      if (i === 0) return frame;
      const prev = frames[i - 1];
      return {
        ...frame,
        keypoints: frame.keypoints.map((kp, idx) => ({
          ...kp,
          x: prev.keypoints[idx].x * 0.35 + kp.x * 0.65,
          y: prev.keypoints[idx].y * 0.35 + kp.y * 0.65,
        })),
      };
    });

    const prepared = smoothed.map((frame, i) => {
      const phase = phaseData.phases[i] || "work";
      const angleCache = {
        leftKneeAngle: angleABC(
          frame.keypoints[11],
          frame.keypoints[13],
          frame.keypoints[15],
        ),
        rightKneeAngle: angleABC(
          frame.keypoints[12],
          frame.keypoints[14],
          frame.keypoints[16],
        ),
        torsoLean: torsoLeanFromVertical(
          frame.keypoints[5],
          frame.keypoints[6],
          frame.keypoints[11],
          frame.keypoints[12],
        ),
      };
      const evalResult = cfg.evaluateFrame(frame, {
        phase,
        baselineHeelY,
        frameIndex: i,
        bottomIndex: phaseData.bottomIdx,
        angleCache,
      });
      return {
        ...frame,
        phase,
        frameError: evalResult.frameError,
        jointSeverity: evalResult.jointSeverity,
        metrics: evalResult.metrics,
        reasons: evalResult.reasons,
      };
    });

    return prepared;
  }

  function drawTimelineFrame(idx, shouldSetState = true) {
    const frames = timelineDataRef.current;
    const canvas = timelineCanvasRef.current;
    if (!frames.length || !canvas) return;
    const frame = frames[clamp(idx, 0, frames.length - 1)];
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#070d15";
    ctx.fillRect(0, 0, w, h);

    const rawPose = {
      keypoints: frame.keypoints.map((k) => ({
        x: k.x,
        y: k.y,
        score: k.score,
      })),
    };

    const prevFrame = frames[Math.max(0, idx - 1)];
    const prevRawPose = prevFrame
      ? {
        keypoints: prevFrame.keypoints.map((k) => ({
          x: k.x,
          y: k.y,
          score: k.score,
        })),
      }
      : null;
    const stable = stabilizePose(rawPose, prevRawPose);
    const fitted = fitPoseToCanvas(stable, w, h, 26);

    drawSkeleton(ctx, fitted, 1, frame.jointSeverity, 0);

    ctx.fillStyle = "rgba(230,237,243,0.9)";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText(`t=${frame.timestamp.toFixed(2)}s`, 10, 18);
    ctx.fillText(`phase=${frame.phase}`, 10, 34);
    if (frame.reasons?.length) {
      ctx.fillStyle = "rgba(255,200,87,0.95)";
      ctx.fillText(frame.reasons[0], 10, 50);
    }

    timelineFrameIdxRef.current = idx;
    if (timelineSliderRef.current)
      timelineSliderRef.current.value = String(idx);
    if (shouldSetState) {
      setTimelineMeta((prev) => ({
        ...prev,
        current: idx,
        phase: frame.phase,
      }));
    }
  }

  function stopTimelinePlayback() {
    timelinePlayRef.current = false;
    if (timelineRafRef.current) cancelAnimationFrame(timelineRafRef.current);
    timelineRafRef.current = null;
    setTimelineMeta((prev) => ({ ...prev, playing: false }));
  }

  function playTimeline() {
    const frames = timelineDataRef.current;
    if (!frames.length) return;

    timelinePlayRef.current = true;
    timelineTickRef.current = 0;
    setTimelineMeta((prev) => ({ ...prev, playing: true }));
    timelineLastRenderTsRef.current = 0;

    const fpsInterval = 1000 / 27;
    const tick = (ts) => {
      if (!timelinePlayRef.current) return;

      if (!timelineLastRenderTsRef.current)
        timelineLastRenderTsRef.current = ts;
      if (ts - timelineLastRenderTsRef.current >= fpsInterval) {
        timelineLastRenderTsRef.current = ts;
        const next = (timelineFrameIdxRef.current + 1) % frames.length;
        timelineTickRef.current += 1;
        const syncState = timelineTickRef.current % 6 === 0;
        drawTimelineFrame(next, syncState);
      }
      timelineRafRef.current = requestAnimationFrame(tick);
    };

    timelineRafRef.current = requestAnimationFrame(tick);
  }
  async function openCameraStream() {
    const constraints = [
      {
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
      { video: { facingMode: "environment" }, audio: false },
      { video: true, audio: false },
    ];

    let lastErr = null;
    for (const c of constraints) {
      try {
        return await navigator.mediaDevices.getUserMedia(c);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Could not access camera.");
  }

  function updateTrends(rt) {
    setTrend((prev) => {
      const push = (arr, v) => [...arr.slice(-24), Number(v.toFixed(2))];
      return {
        knee: push(prev.knee, rt.knee),
        hip: push(prev.hip, rt.hip),
        back: push(prev.back, rt.back),
      };
    });
  }

  function updateConfidence(statusObj) {
    const vals = Object.values(statusObj);
    const ratio = vals.length
      ? vals.reduce(
        (acc, v) => acc + (v === "good" ? 1 : v === "warning" ? 0.5 : 0),
        0,
      ) / vals.length
      : 0;
    setLiveConfidence((prev) => {
      const next = Math.max(0, Math.min(100, prev * 0.75 + ratio * 100 * 0.25));
      return next;
    });
  }

  function updateRepCounter(knee) {
    if (activity !== "squat") return;
    const prev = lastRtRef.current;
    if (!prev) return;
    if (prev.knee > 125 && knee < 95) {
      setRepCount((r) => r + 1);
    }
  }

  function updateSwingDetection(pose, nowTs) {
    const wrist = pose?.keypoints?.[10];
    if (!wrist) return;

    const s = swingRef.current;
    if (!s.prev) {
      s.prev = { x: wrist.x, y: wrist.y, ts: nowTs };
      return;
    }

    const dt = Math.max((nowTs - s.prev.ts) / 1000, 1 / 120);
    const dx = wrist.x - s.prev.x;
    const dy = wrist.y - s.prev.y;
    const vel = Math.hypot(dx, dy) / dt;
    s.smoothVel = s.smoothVel * 0.72 + vel * 0.28;

    const threshold = 250;
    if (s.smoothVel > threshold && nowTs - s.lastTriggerTs > 320) {
      s.lastTriggerTs = nowTs;
      s.lastSwingTs = nowTs;
    }

    s.prev = { x: wrist.x, y: wrist.y, ts: nowTs };

    // New 3D Bat Tracking Data
    const leftWrist = pose?.keypoints?.[9];
    const rightWrist = pose?.keypoints?.[10];
    if (leftWrist && rightWrist) {
      // Calculate normalized center position (assuming 640x480 default TFJS video feed, will refine in Three.js)
      const cx = (leftWrist.x + rightWrist.x) / 2;
      const cy = (leftWrist.y + rightWrist.y) / 2;

      const videoEl = liveVideoRef.current;
      const vw = videoEl ? videoEl.videoWidth || 640 : 640;
      const vh = videoEl ? videoEl.videoHeight || 480 : 480;

      s.batPos = {
        x: (cx / vw) * 2 - 1, // Normalized -1 to 1
        y: -((cy / vh) * 2 - 1), // Normalized -1 to 1, flipped Y for 3D
      };

      // Calculate angle
      s.batAngle = Math.atan2(
        rightWrist.y - leftWrist.y,
        rightWrist.x - leftWrist.x,
      );
    }
  }

  async function startLiveCapture() {
    try {
      await ensureDetector();
      const videoEl = liveVideoRef.current;
      const canvasEl = liveCanvasRef.current;

      streamRef.current = await openCameraStream();
      videoEl.srcObject = streamRef.current;
      await videoEl.play();

      framesRef.current = [];
      trailRef.current = [];
      idealGhostRef.current = null;
      lastSampleTsRef.current = 0;
      startTsRef.current = performance.now();
      lastRtRef.current = null;
      setRepCount(0);
      setLiveConfidence(0);
      setCompareScore(null);
      setCoachingLog([]);

      if (compareMode && pipVideoRef.current && uploadedVideoUrl) {
        pipVideoRef.current.src = uploadedVideoUrl;
        pipVideoRef.current.currentTime = 0;
        pipVideoRef.current.play().catch(() => { });
      }
      setStatus("live running");
      liveRunningRef.current = true;

      while (liveRunningRef.current) {
        const poses = await detectorRef.current.estimatePoses(videoEl, {
          maxPoses: 1,
          flipHorizontal: false,
        });
        const pose = poses[0];

        if (pose?.keypoints) {
          const rt = evaluateRealtime(pose);
          drawPose(videoEl, canvasEl, pose, rt.jointSeverity);

          const statusVals = Object.values(rt.status);
          if (!statusVals.includes("bad") && !idealGhostRef.current) {
            idealGhostRef.current = {
              keypoints: pose.keypoints.map((k) => ({ ...k })),
            };
          }

          const now = performance.now();
          if (cricketModeEnabled) {
            updateSwingDetection(pose, now);
          }
          if (now - lastSampleTsRef.current >= 100) {
            lastSampleTsRef.current = now;
            updateTrends(rt);
            updateConfidence(rt.status);
            updateRepCounter(rt.knee);

            setLiveMetrics({
              knee: rt.knee,
              hip: rt.hip,
              back: rt.back,
              timing: rt.timing,
              balance: rt.balance,
              path: rt.path,
            });

            let finalFeedback = rt.feedback;

            if (
              compareMode &&
              uploadedFramesRef.current &&
              pipVideoRef.current
            ) {
              const uploadTime = pipVideoRef.current.currentTime || 0;
              const goldenFrames = uploadedFramesRef.current;

              let nearest = goldenFrames[0];
              let minDiff = Infinity;
              for (const gf of goldenFrames) {
                const diff = Math.abs(gf.timestamp - uploadTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  nearest = gf;
                }
              }

              if (nearest && nearest.angles) {
                let diffs = [];
                if (nearest.angles.knee != null)
                  diffs.push(Math.abs(rt.knee - nearest.angles.knee));
                if (nearest.angles.hip != null)
                  diffs.push(Math.abs(rt.hip - nearest.angles.hip));
                if (nearest.angles.back != null)
                  diffs.push(Math.abs(rt.back - nearest.angles.back));

                setReferenceMetrics({
                  knee: nearest.angles.knee || 0,
                  hip: nearest.angles.hip || 0,
                  back: nearest.angles.back || 0,
                });

                if (nearest.keypoints && pipCanvasRef.current) {
                  drawReferencePose(pipVideoRef.current, pipCanvasRef.current, nearest);
                }

                if (diffs.length > 0) {
                  const avgDiff =
                    diffs.reduce((a, b) => a + b, 0) / diffs.length;
                  const simScore = Math.max(0, 100 - avgDiff * 2);
                  setCompareScore(simScore);

                  if (simScore > 85) {
                    finalFeedback = `[PRO MATCH] Excellent alignment (${Math.round(simScore)}%)`;
                  } else {
                    finalFeedback = `[PRO COMPARE] Adjust form to match video. Similarity: ${Math.round(simScore)}%`;
                  }
                }
              }
            } else {
              setCompareScore(null);
              setReferenceMetrics(null);
            }

            setLiveFeedback(finalFeedback);

            // Update Coaching Log with realistic feedback
            const coachingActivity = activity === "auto" ? "squat" : activity;
            const advice = getTechnicalAdvice(coachingActivity, rt, rt.phase);
            if (advice && advice.msg !== lastRtRef.current?.lastAdvice) {
              setCoachingLog(prev => [{
                id: Date.now(),
                time: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
                msg: advice.msg,
                type: advice.type
              }, ...prev].slice(0, 30)); // Keep last 30 entries
              rt.lastAdvice = advice.msg;
            }

            if (framesRef.current.length < 350) {
              framesRef.current.push({
                timestamp: Number(
                  ((now - startTsRef.current) / 1000).toFixed(3),
                ),
                keypoints: normalizeKeypoints(
                  pose.keypoints,
                  videoEl.videoWidth,
                  videoEl.videoHeight,
                ),
              });
            }

            trailRef.current.push(
              stabilizePose(
                { keypoints: pose.keypoints.map((k) => ({ ...k })) },
                trailRef.current.length
                  ? trailRef.current[trailRef.current.length - 1]
                  : null,
              ),
            );
            if (trailRef.current.length > 14) trailRef.current.shift();
          }

          lastRtRef.current = rt;
        }

        await sleep(16);
      }
    } catch (err) {
      setStatus("live start failed");
      alert(String(err?.message || err));
    }
  }

  function stopLiveCapture() {
    liveRunningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }

  function deriveRisk(score, balance = 0) {
    if (score < 60 || balance > 0.06) return "High";
    if (score < 80 || balance > 0.04) return "Medium";
    return "Low";
  }

  function deriveConsistency(timeline = {}) {
    const arr = timeline.avg_knee || [];
    if (arr.length < 3) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance =
      arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length;
    const std = Math.sqrt(variance);
    return Math.max(0, Math.min(100, 100 - std));
  }

  function buildFeedbackCards(result) {
    const cards = [];
    (result.feedback || []).forEach((f) => {
      const low = f.toLowerCase();
      let severity = "low";
      if (low.includes("off") || low.includes("late") || low.includes("deviat"))
        severity = "high";
      else if (low.includes("adjust") || low.includes("focus"))
        severity = "medium";
      cards.push({ msg: f, severity });
    });

    (result.coaching_explanations || []).forEach((f) =>
      cards.push({ msg: f, severity: "medium" }),
    );
    if (cricketModeEnabled) {
      const outcome = cricketResult.outcome;
      const isConnectedShot =
        outcome === "PERFECT" || outcome === "EARLY" || outcome === "LATE";
      const cricketMessage =
        outcome === "PERFECT"
          ? `Cricket delivery result: PERFECT${cricketResult.reactionMs != null ? ` • Reaction ${cricketResult.reactionMs} ms` : ""}.`
          : outcome === "EARLY" || outcome === "LATE"
            ? `Cricket delivery result: ${outcome}.${cricketResult.reactionMs != null ? ` Reaction ${cricketResult.reactionMs} ms.` : ""} Keep swing timing tighter.`
            : outcome === "MISS"
              ? "Cricket delivery result: MISS. Swing earlier as ball enters the hitting zone."
              : "Cricket mode active: press BOWL NOW and swing through the hit zone.";
      cards.unshift({
        msg: cricketMessage,
        severity: isConnectedShot ? "low" : outcome === "MISS" ? "high" : "medium",
      });
    }
    return cards.slice(0, 6);
  }

  async function analyzeFrames(frames) {
    if (!frames || frames.length < 10) {
      alert("Capture longer movement before analysis.");
      return;
    }

    setIsLoading(true);
    setStatus("analyzing");

    try {
      const backendHint = ACTIVITY_BACKEND_HINT[activity] || "auto";
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ activity_hint: backendHint, fps: 10, frames }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      setAnalysis(data);
      setRawPreview(JSON.stringify(data, null, 2));
      setStatus("analysis complete");

      const resolvedActivity =
        activity === "auto"
          ? data.activity === "cricket_cover_drive"
            ? "coverDrive"
            : "squat"
          : activity;
      const preparedFrames = preprocessActivityFrames(frames, resolvedActivity);
      timelineDataRef.current = preparedFrames;
      const worstIdx = getWorstFrame(preparedFrames);
      const worstFrameReason = preparedFrames[worstIdx]?.reasons?.[0];
      const cards = buildFeedbackCards(data);
      if (worstFrameReason) {
        cards.unshift({
          msg: `Worst frame at ${preparedFrames[worstIdx].timestamp.toFixed(2)}s: ${worstFrameReason}`,
          severity: "high",
        });
      }
      setFeedbackItems(cards.slice(0, 6));
      setTimelineMeta({
        total: preparedFrames.length,
        current: worstIdx,
        worst: worstIdx,
        phase: preparedFrames[worstIdx]?.phase || "n/a",
        playing: false,
      });
      if (timelineSliderRef.current) {
        timelineSliderRef.current.max = String(
          Math.max(0, preparedFrames.length - 1),
        );
        timelineSliderRef.current.value = String(worstIdx);
      }
      drawTimelineFrame(worstIdx);

      const consistency = deriveConsistency(data.timeline);
      const risk = deriveRisk(
        data.overall_score,
        data.biomechanics?.balance_index || 0,
      );
      const session = {
        createdAt: Date.now(),
        activity: data.activity,
        score: Math.round(data.overall_score),
        date: new Date().toISOString(),
        mlLabel: data.ml_label || "AI Heuristics",
        consistency: Number(consistency.toFixed(1)),
        risk,
        power: Number((data.biomechanics?.power_estimate_w || 0).toFixed(0)),
      };
      setSessions((prev) => [session, ...prev].slice(0, 20));
      if (isSignedIn) {
        try {
          await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              activity: session.activity,
              score: session.score,
              ml_label: session.mlLabel,
              consistency: session.consistency,
              risk: session.risk,
              power: session.power,
              raw_analysis: {
                overall_score: data.overall_score,
                ml_label: data.ml_label,
                metrics: data.metrics,
                biomechanics: data.biomechanics,
              },
            }),
          });
        } catch {
          // Keep UX smooth even when persistence fails.
        }
      }

      setSummaryData(session);
      setShowSummary(true);
    } catch (err) {
      setStatus("analysis failed");
      alert(String(err?.message || err));
    } finally {
      setIsLoading(false);
    }
  }

  async function analyzeUploadedVideo() {
    const videoEl = uploadVideoRef.current;
    const canvasEl = uploadCanvasRef.current;
    if (!videoEl?.src) {
      alert("Upload a video first.");
      return;
    }

    await ensureDetector();
    await videoEl.play();
    videoEl.muted = true;

    const frames = [];
    let lastSample = 0;
    const start = performance.now();
    trailRef.current = [];

    setStatus("processing upload");

    while (!videoEl.ended) {
      const poses = await detectorRef.current.estimatePoses(videoEl, {
        maxPoses: 1,
        flipHorizontal: false,
      });
      const pose = poses[0];
      if (pose?.keypoints) {
        const rt = evaluateRealtime(pose);
        drawPose(videoEl, canvasEl, pose, rt.jointSeverity);

        const now = performance.now();
        if (now - lastSample >= 100) {
          lastSample = now;
          if (frames.length < 350) {
            frames.push({
              timestamp: Number(((now - start) / 1000).toFixed(3)),
              keypoints: normalizeKeypoints(
                pose.keypoints,
                videoEl.videoWidth,
                videoEl.videoHeight,
              ),
            });
          }
          trailRef.current.push({
            keypoints: pose.keypoints.map((k) => ({ ...k })),
          });
          if (trailRef.current.length > 14) trailRef.current.shift();
        }
      }
      await sleep(16);
    }

    videoEl.pause();
    videoEl.currentTime = 0;
    await analyzeFrames(frames);

    if (timelineDataRef.current && timelineDataRef.current.length > 0) {
      uploadedFramesRef.current = timelineDataRef.current;
      setHasGoldenSkeleton(true);
    }
  }

  function exportJSON() {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `synapse-analysis-${Date.now()}.json`;
    a.click();
  }


  function exportCSV() {
    if (!analysis?.kinematics_stream?.length) return;
    const headers = [
      "timestamp",
      "knee_angle",
      "trunk_angle",
      "hip_y",
      "hip_velocity",
      "hip_acceleration",
    ];
    const rows = analysis.kinematics_stream.map((row) =>
      headers.map((h) => row[h]).join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `synapse-kinematics-${Date.now()}.csv`;
    a.click();
  }

  const avgScore = useMemo(() => {
    if (!sessions.length) return 0;
    return sessions.reduce((a, b) => a + b.score, 0) / sessions.length;
  }, [sessions]);

  const sidebarClass = sidebarCollapsed ? "w-20" : "w-64";

  const metricStatus = {
    knee: gradeDeviation(distanceToRange(liveMetrics.knee, 80, 100), 0, 10).level,
    hip: gradeDeviation(distanceToRange(liveMetrics.hip, 20, 45), 0, 12).level,
    back: gradeDeviation(distanceToRange(liveMetrics.back, 20, 45), 0, 12).level,
  };

  const contextValue = {
    status, setStatus,
    activity, setActivity,
    ACTIVITY_OPTIONS, BOWLING_SPEED,
    cricketModeEnabled,
    analysisMode, setAnalysisMode,
    uploadedVideoUrl, setUploadedVideoUrl,
    sessions, setSessions,
    coachMode, setCoachMode,
    liveFeedback, setLiveFeedback,
    coachingLog,
    liveConfidence, setLiveConfidence,
    liveMetrics, setLiveMetrics,
    referenceMetrics,
    metricStatus, trend,
    repCount, setRepCount,
    avgScore,
    timelineMeta, setTimelineMeta,
    compareMode, setCompareMode,
    hasGoldenSkeleton, setHasGoldenSkeleton,
    compareScore, setCompareScore,
    isLoading, setIsLoading,
    liveVideoRef, liveCanvasRef, pipVideoRef, pipCanvasRef,
    uploadVideoRef, uploadCanvasRef, fileInputRef,
    timelineCanvasRef, timelineSliderRef, cricketSceneMountRef,
    kneeChartRef, trunkChartRef,
    framesRef, analyzeFrames,
    ensureDetector, startLiveCapture, stopLiveCapture, analyzeUploadedVideo,
    stopTimelinePlayback, playTimeline, drawTimelineFrame,
    cricketSceneReady, deliveryCount, hitCount, cricketResult, cricketSpeed, setCricketSpeed, startDelivery,
    exportJSON, exportCSV
  };

  function AuthPageFrame({ title, children }) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-bg text-txt">
        <div className="pointer-events-none absolute inset-0 bg-grid" />
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/20 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-secondary/20 blur-[120px]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-[1300px] items-center p-5 md:p-8">
          <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-card/75 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative border-b border-white/10 p-8 md:p-12 lg:border-b-0 lg:border-r">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                <span className="h-2 w-2 rounded-full bg-primary pulse-dot" />
                Synapse Sports Intelligence
              </div>

              <h2 className="max-w-xl text-4xl font-heading font-black leading-[1.05] md:text-5xl">
                Elite AI Coaching
                <span className="block bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Built For Athletes
                </span>
              </h2>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-subtxt">
                Real-time biomechanics stream, pro-motion comparison, and cricket simulation analytics in one professional training stack.
              </p>

              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-subtxt">Pose Points</p>
                  <p className="mt-1 text-2xl font-black text-white">17</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-subtxt">Latency</p>
                  <p className="mt-1 text-2xl font-black text-white">&lt;120ms</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-subtxt">Cloud Store</p>
                  <p className="mt-1 text-2xl font-black text-white">Neon</p>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm">Live kinematic scoring with ML feedback and confidence tracking</div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm">Pro-compare mode for side-by-side elite form alignment</div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm">Personalized athlete timeline and session intelligence dashboard</div>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-secondary">
                  AI Biomechanics
                </span>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
                  Performance Analytics
                </span>
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                  Real-Time Coaching
                </span>
              </div>
            </div>

            <div className="p-7 md:p-10 lg:p-12">
              <div className="mb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-subtxt">Athlete Access</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight">{title}</h3>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/35 p-4 md:p-5">
                {children}
              </div>
              <p className="mt-4 text-xs text-subtxt">
                Continue with Google to sync your training profile and cloud session history.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ProtectedLayout() {
    return (
      <>
        <SignedIn>
          <MainLayout status={status} context={contextValue} />
        </SignedIn>
        <SignedOut>
          <Navigate to="/sign-in" replace />
        </SignedOut>
      </>
    );
  }

  return (
    <Routes>
      <Route
        path="/sign-in/*"
        element={(
          <AuthPageFrame title="Sign in to your training workspace">
            <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
          </AuthPageFrame>
        )}
      />
      <Route
        path="/sign-up/*"
        element={(
          <AuthPageFrame title="Create your athlete account">
            <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
          </AuthPageFrame>
        )}
      />

      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomeView />} />
        <Route path="/live" element={<LiveAnalyzeView />} />
        <Route path="/upload" element={<UploadAnalyzeView />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/about" element={<AboutView />} />
      </Route>
    </Routes>
  );
}

export default App;
