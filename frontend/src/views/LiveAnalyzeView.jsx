import React, { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { ACTIVITY_OPTIONS, BOWLING_SPEED } from "../utils/constants";
import { MetricsCard } from "../components/shared/MetricsCard";

export function LiveAnalyzeView() {
  const {
    activity, setActivity,
    ensureDetector, startLiveCapture, stopLiveCapture,
    cricketModeEnabled,
    hasGoldenSkeleton, compareMode, setCompareMode, compareScore,
    repCount, liveConfidence, liveFeedback, liveMetrics, referenceMetrics, coachingLog, metricStatus, trend,
    isLoading, analysis,
    liveVideoRef, liveCanvasRef, pipVideoRef, pipCanvasRef, uploadedVideoUrl,
    cricketSceneMountRef, framesRef, analyzeFrames,
    cricketSceneReady, deliveryCount, hitCount, cricketResult, cricketSpeed, setCricketSpeed, startDelivery
  } = useOutletContext();

  // Robust initialization of the reference video source
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

  const cricketOutcome = cricketResult?.outcome || "idle";
  const cricketOutcomeLabel =
    cricketOutcome === "idle"
      ? "WAITING..."
      : cricketOutcome === "in_queue"
        ? "RUN-UP"
        : cricketOutcome === "in_flight"
          ? "BALL IN FLIGHT"
          : cricketOutcome.toUpperCase();
  const cricketOutcomeCardClass =
    cricketOutcome === "PERFECT"
      ? "bg-secondary/20 shadow-secondary/10"
      : cricketOutcome === "EARLY" || cricketOutcome === "LATE"
        ? "bg-yellow-500/15 shadow-yellow-500/10"
        : cricketOutcome === "MISS"
          ? "bg-warn/20 shadow-warn/10"
          : "bg-black/60";
  const cricketOutcomeTextClass =
    cricketOutcome === "MISS"
      ? "text-warn"
      : cricketOutcome === "in_flight"
        ? "animate-pulse text-primary"
        : cricketOutcome === "EARLY" || cricketOutcome === "LATE"
          ? "text-yellow-300"
          : cricketOutcome === "PERFECT"
            ? "text-secondary"
            : "text-white";
  const cricketTimingMs =
    typeof cricketResult?.timing === "number"
      ? Math.round(Math.abs(cricketResult.timing))
      : null;
  const cricketReactionMs =
    typeof cricketResult?.reactionMs === "number"
      ? cricketResult.reactionMs
      : null;
  const cricketTimingLabel =
    cricketOutcome === "PERFECT"
      ? "ON TIME"
      : cricketOutcome === "EARLY"
        ? "EARLY"
        : cricketOutcome === "LATE"
          ? "LATE"
          : cricketOutcome === "MISS"
            ? "MISSED"
            : "WAITING";
  const cricketTimingClass =
    cricketOutcome === "PERFECT"
      ? "text-secondary border-secondary/30 bg-secondary/10"
      : cricketOutcome === "EARLY" || cricketOutcome === "LATE"
        ? "text-yellow-300 border-yellow-400/30 bg-yellow-500/10"
        : cricketOutcome === "MISS"
          ? "text-warn border-warn/30 bg-warn/10"
          : "text-subtxt border-white/10 bg-white/5";
  const showComparePanel = compareMode && hasGoldenSkeleton;
  const showCricketPanel = cricketModeEnabled && !compareMode;

  return (
    <div className="flex flex-col gap-6 animate-content">
      {/* HEADER COMMAND BAR */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/5 bg-card/50 p-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <span className="text-primary text-xl font-bold">◉</span>
          </div>
          <div>
            <h2 className="font-heading text-lg leading-tight uppercase tracking-tight">Command Center</h2>
            <div className="flex items-center gap-2 text-[11px] text-subtxt uppercase tracking-widest font-bold">
              <span className="flex h-1.5 w-1.5 rounded-full bg-secondary pulse-dot" />
              Live Biomechanical Stream
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {hasGoldenSkeleton && (
            <button
              className={`group relative flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${compareMode
                  ? "bg-secondary text-black shadow-[0_0_20px_rgba(0,255,157,0.4)]"
                  : "border border-secondary/30 text-secondary hover:bg-secondary/10"
                }`}
              onClick={() => setCompareMode(!compareMode)}
            >
              {compareMode ? "★ PRO-COMPARE ACTIVE" : "ENABLE PRO-COMPARE"}
            </button>
          )}
          <div className="h-8 w-px bg-white/10 mx-1 hidden sm:block" />
          <select
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            className="rounded-xl border border-white/10 bg-bg/80 px-4 py-2.5 text-xs font-bold text-txt outline-none hover:border-primary/50 transition-colors"
          >
            {ACTIVITY_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label.toUpperCase()}</option>
            ))}
          </select>
          <button
            className="btn-press rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-black shadow-[0_0_15px_rgba(0,229,255,0.4)] active:scale-95"
            onClick={ensureDetector}
          >
            INIT AI
          </button>
        </div>
        <div className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-subtxt">
          {showComparePanel
            ? "Pro-compare active. Live stream synced with elite reference."
            : cricketModeEnabled
            ? "Cricket simulation active with live analysis."
            : "Select a cricket activity to activate simulation with live analysis."}
        </div>
      </section>

      {/* LIVE + CRICKET WORKSPACE */}
      <section
        className={`grid grid-cols-1 items-start gap-6 ${showCricketPanel ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,430px)]" : showComparePanel ? "lg:grid-cols-2" : ""}`}
      >
        <div className="min-w-0 grid grid-cols-1 gap-6">
          <div className={`monitor-glow group relative w-full aspect-video overflow-hidden rounded-[2rem] border border-white/5 bg-black ${showCricketPanel ? "min-h-[320px] xl:min-h-[360px] 2xl:min-h-[420px]" : "min-h-[400px] xl:min-h-[500px]"}`}>
            <video
              ref={liveVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
            />
            <canvas
              ref={liveCanvasRef}
              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            />

            <div className="absolute left-6 top-6 z-20 flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-primary/90 px-4 py-1.5 text-[10px] font-black text-black shadow-2xl backdrop-blur-md">
                <span className="h-1 w-1 rounded-full bg-black animate-pulse" />
                {(ACTIVITY_OPTIONS.find((x) => x.key === activity)?.label || activity).split(':').pop().toUpperCase()}
              </div>
              <div className="rounded-full bg-black/60 px-4 py-1.5 text-[10px] font-black text-white shadow-2xl backdrop-blur-md border border-white/10">
                REP {repCount}
              </div>
            </div>

            <div className="absolute right-6 top-6 z-20 flex items-center gap-2 rounded-full bg-card/80 px-4 py-1.5 text-[10px] font-bold text-white shadow-2xl backdrop-blur-md border border-white/10">
              <span className="pulse-dot h-2 w-2 rounded-full bg-secondary" />
              LIVE FEED
            </div>

            <div className="absolute bottom-6 left-6 right-auto z-20 w-[min(680px,calc(100%-3rem))] overflow-hidden rounded-2xl border border-white/10 bg-card/60 p-5 backdrop-blur-xl shadow-2xl ring-1 ring-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Biomechanical Feedback</span>
                {compareScore !== null && (
                  <div className="flex items-center gap-2 rounded bg-secondary/20 px-3 py-1 border border-secondary/30">
                    <span className="text-[11px] font-black text-secondary">FORM: {Math.round(compareScore)}%</span>
                  </div>
                )}
              </div>
              <p className="text-lg font-semibold leading-tight text-white mb-4 line-clamp-2">{liveFeedback}</p>
              <div className="flex items-center gap-4">
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/5 shadow-inner">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-warn via-primary to-secondary transition-all duration-700 ease-out"
                    style={{ width: `${liveConfidence}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] font-bold text-subtxt">{Math.round(liveConfidence)}% CONF</span>
              </div>
              {analysis?.ml_label && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 border border-primary/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-[10px] font-black uppercase text-primary tracking-widest">ML Prediction: {analysis.ml_label}</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {showCricketPanel && (
          <div className="min-w-0 monitor-glow w-full rounded-[2rem] border border-primary/20 bg-[#060c14] p-4 shadow-2xl flex flex-col gap-4 min-h-[420px] xl:min-h-[480px]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/60 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-subtxt mb-1">Stadium Status</p>
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white">
                  <span className={`h-2.5 w-2.5 rounded-full ${cricketSceneReady ? "bg-secondary pulse-dot" : "bg-warn"}`} />
                  {cricketSceneReady ? "Engine Ready" : "Initializing"}
                </div>
              </div>
              <div className={`rounded-2xl border border-white/10 p-3 ${cricketOutcomeCardClass}`}>
                <p className="text-[9px] font-black uppercase tracking-widest text-subtxt mb-1">Ball Outcome</p>
                <p className={`text-lg font-black uppercase tracking-wider ${cricketOutcomeTextClass}`}>
                  {cricketOutcomeLabel}
                </p>
              </div>
            </div>

            <div ref={cricketSceneMountRef} className="flex-1 min-h-[260px] overflow-hidden rounded-2xl border border-primary/20 bg-[#05101e] xl:min-h-[300px]" />

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-subtxt">Deliveries</p>
                <p className="mt-1 text-2xl font-black text-white tabular-nums">{deliveryCount}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-subtxt">Perfect Hits</p>
                <p className="mt-1 text-2xl font-black text-secondary tabular-nums">{hitCount}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black text-subtxt uppercase tracking-widest">Velocity</span>
                <select
                  value={cricketSpeed}
                  onChange={(e) => setCricketSpeed(e.target.value)}
                  className="ml-auto w-full rounded-lg border border-white/10 bg-bg/70 px-3 py-1.5 text-xs font-black text-white outline-none sm:w-auto"
                >
                  {Object.entries(BOWLING_SPEED).map(([k, v]) => (
                    <option key={k} value={k} className="bg-card text-white">{v.label.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <button
                className="btn-press mt-3 w-full rounded-xl bg-secondary px-5 py-3 text-xs font-black tracking-[0.2em] text-black shadow-[0_0_30px_rgba(0,255,157,0.5)] hover:bg-[#00e68a] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={startDelivery}
                disabled={!cricketSceneReady}
              >
                {cricketSceneReady ? "BOWL NOW" : "LOADING STADIUM..."}
              </button>
            </div>
          </div>
        )}

        {showComparePanel && (
          <div className="monitor-glow group relative aspect-video min-h-[400px] overflow-hidden rounded-[2rem] border border-secondary/20 bg-black xl:min-h-[500px]">
            <video
              ref={pipVideoRef}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover opacity-80"
            />
            <canvas
              ref={pipCanvasRef}
              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
            />
            <div className="absolute top-6 left-6 z-20 flex items-center gap-2 rounded-full bg-secondary/90 px-5 py-2 text-[10px] font-black text-black shadow-2xl backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-black pulse-dot" />
              ELITE REFERENCE
            </div>
          </div>
        )}
      </section>

      {/* LOWER HUB: THE INTELLIGENCE GRID */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr_300px] xl:grid-cols-[340px_1fr_340px]">
        {/* COLUMN 1: SKELETON DATA */}
        <div className="flex flex-col gap-4 intelligence-hub-glass rounded-3xl p-5 border border-white/5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-subtxt mb-2">Kinematic Stream</h3>
          <div className="space-y-4">
            <MetricsCard label="Knee Flexion" value={liveMetrics.knee.toFixed(1)} referenceValue={referenceMetrics?.knee.toFixed(1)} unit="°" status={metricStatus.knee} sparkValues={trend.knee} />
            <MetricsCard label="Hip Extension" value={liveMetrics.hip.toFixed(1)} referenceValue={referenceMetrics?.hip.toFixed(1)} unit="°" status={metricStatus.hip} sparkValues={trend.hip} />
            <MetricsCard label="Trunk Lean" value={liveMetrics.back.toFixed(1)} referenceValue={referenceMetrics?.back.toFixed(1)} unit="°" status={metricStatus.back} sparkValues={trend.back} />
          </div>
        </div>

        {/* COLUMN 2: MASTER COACHING LOG */}
        <div className="flex flex-col intelligence-hub-glass rounded-3xl p-5 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-secondary flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(0,255,157,0.8)]" />
              Intelligence Log
            </h3>
            <span className="text-[10px] font-mono text-subtxt uppercase">Real-time Cues</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar max-h-[360px]">
            {coachingLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 pt-10">
                <div className="h-12 w-12 rounded-full border border-dashed border-white/20 mb-3" />
                <p className="text-xs font-semibold text-subtxt uppercase tracking-tighter italic">Initializing telemetry...</p>
              </div>
            ) : (
              coachingLog.map((log) => (
                <div key={log.id} className={`p-4 rounded-2xl border transition-all animate-slide-in ${log.type === 'error' ? 'bg-warn/5 border-warn/20 shadow-[inset_0_0_20px_rgba(255,77,79,0.05)]' :
                    log.type === 'warning' ? 'bg-yellow-500/5 border-yellow-500/20 shadow-[inset_0_0_20px_rgba(255,200,87,0.05)]' :
                      log.type === 'success' ? 'bg-secondary/5 border-secondary/20 shadow-[inset_0_0_20px_rgba(0,255,157,0.05)]' :
                        'bg-white/5 border-white/10 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]'
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-subtxt bg-black/40 px-2 py-0.5 rounded border border-white/5">{log.time}</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${log.type === 'error' ? 'text-warn' :
                        log.type === 'warning' ? 'text-yellow-400' :
                          log.type === 'success' ? 'text-secondary' :
                            'text-primary'
                      }`}>
                      {log.type === 'success' ? 'Mastery' : log.type === 'error' ? 'Critical' : 'Insight'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white/90 leading-normal">{log.msg}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMN 3: STABILITY & ACTION */}
        <div className="flex flex-col gap-6 intelligence-hub-glass rounded-3xl p-5 border border-white/5">
          {showCricketPanel && (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-inner">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-subtxt">Shot Timing</span>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${cricketTimingClass}`}>
                  {cricketTimingLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-subtxt">Timing Delta</p>
                  <p className="mt-1 text-xl font-black text-white tabular-nums">
                    {cricketTimingMs !== null ? `${cricketTimingMs} ms` : "--"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-subtxt">Reaction</p>
                  <p className="mt-1 text-xl font-black text-white tabular-nums">
                    {cricketReactionMs !== null ? `${cricketReactionMs} ms` : "--"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-subtxt">
                {cricketOutcome === "EARLY"
                  ? "Contact is too early. Delay swing initiation slightly."
                  : cricketOutcome === "LATE"
                    ? "Contact is late. Start downswing sooner."
                    : cricketOutcome === "PERFECT"
                      ? "Excellent timing. Maintain this bat path and tempo."
                      : cricketOutcome === "MISS"
                        ? "Track ball entry and trigger swing inside hit zone."
                        : "Press BOWL NOW and play a shot to get timing feedback."}
              </p>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-subtxt mb-2">Stability Center</h3>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex flex-col rounded-2xl bg-black/40 p-4 border border-white/5 shadow-inner">
                <span className="text-[10px] text-subtxt uppercase font-black tracking-widest mb-1">Balance Drift</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-white">{liveMetrics.balance}<span className="text-xs text-subtxt ml-1">%</span></span>
                  <div className="h-1 w-24 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: `${Math.min(100, liveMetrics.balance * 5)}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex flex-col rounded-2xl bg-black/40 p-4 border border-white/5 shadow-inner">
                <span className="text-[10px] text-subtxt uppercase font-black tracking-widest mb-1">Timing Variance</span>
                <span className="text-2xl font-black text-white">{liveMetrics.timing}<span className="text-xs text-subtxt ml-1">ms</span></span>
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-3 pt-4 border-t border-white/5">
            <button
              className="btn-press group relative w-full overflow-hidden rounded-2xl bg-secondary py-4 text-sm font-black text-black shadow-xl"
              onClick={startLiveCapture}
            >
              <span className="relative z-10">START STREAM</span>
              <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300" />
            </button>
            <button
              className="btn-press w-full rounded-2xl border border-white/10 bg-white/5 py-4 text-sm font-black text-white hover:bg-white/10"
              onClick={() => { stopLiveCapture(); analyzeFrames(framesRef.current); }}
            >
              END SESSION
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
