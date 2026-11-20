"use client";

import React, { useRef } from "react";
import { STAGES } from "@/stages";
import { useStageScroll } from "@/hooks/useStageScroll";

export function ScrollStageHero() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const {
    scrollProgress,
    isStage1Loaded,
    loadingProgress,
  } = useStageScroll({
    stages: STAGES,
    canvasRef,
    containerRef,
  });

  // Reveal typography ONLY on the very last frame / very end of the scroll sequence (last ~5% of scroll)
  const isAtFinalFrame = scrollProgress >= 0.95;
  const lastStage = STAGES[STAGES.length - 1];

  return (
    // Generous scroll track (800vh) gives slow, cinematic scrubbing across all frames
    <div
      ref={containerRef}
      className="relative w-full h-[800vh] bg-black"
    >
      {/* Sticky Fullscreen Viewport pinned while scrolling */}
      <div className="sticky top-0 h-screen w-full overflow-hidden select-none text-zinc-100">
        {/* Pure Canvas Frame Renderer */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block object-cover z-0 pointer-events-none"
        />

        {/* Cinematic Vignette & Ambient Overlays (Taste & Emil Polish) - fades in deeper at the end for text contrast */}
        <div
          className={`pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/30 to-black/60 mix-blend-multiply transition-opacity duration-1000 ${
            isAtFinalFrame ? "opacity-100" : "opacity-35"
          }`}
          aria-hidden="true"
        />
        <div
          className={`pointer-events-none absolute inset-0 z-10 bg-radial from-transparent via-black/20 to-black/75 transition-opacity duration-1000 ${
            isAtFinalFrame ? "opacity-100" : "opacity-25"
          }`}
          aria-hidden="true"
        />

        {/* Minimal Initial Loading State */}
        {!isStage1Loaded && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md transition-opacity duration-700">
            <div className="flex flex-col items-center gap-6 max-w-xs w-full px-6 text-center">
              <div className="w-10 h-10 rounded-full border border-emerald-400/30 border-t-emerald-400 animate-spin" />
              <div className="space-y-2 w-full">
                <div className="flex justify-between items-center text-xs uppercase tracking-widest text-zinc-400 font-mono">
                  <span>Synchronizing Sequence</span>
                  <span>{loadingProgress}%</span>
                </div>
                <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-200 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500 tracking-wide">
                Buffering high-density frames
              </p>
            </div>
          </div>
        )}

        {/* Subtle Minimal Scroll Cue - only present while scrubbing, disappears at final frame */}
        <div
          className={`absolute bottom-8 inset-x-0 z-20 flex flex-col items-center justify-center pointer-events-none transition-all duration-500 ${
            isAtFinalFrame || !isStage1Loaded ? "opacity-0 translate-y-3" : "opacity-70 translate-y-0"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400">
              Scroll
            </span>
            <svg
              className="w-3.5 h-3.5 text-zinc-400 animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </div>

        {/* TYPOGRAPHY - Strictly revealed ONLY upon reaching the very last frame */}
        <div
          className={`relative z-20 h-full flex flex-col justify-end pb-20 sm:pb-28 px-6 sm:px-16 md:px-24 max-w-5xl transition-all duration-1000 ease-out ${
            isAtFinalFrame
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-8 pointer-events-none"
          }`}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-emerald-400/20 bg-emerald-950/40 backdrop-blur-sm text-emerald-400 text-[11px] font-mono tracking-wider uppercase w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {lastStage.badge}
          </div>

          {/* Headline */}
          <h1 className="font-semibold text-white tracking-tight leading-[1.05] mb-4 text-[clamp(2.2rem,5.5vw,4.5rem)] max-w-3xl">
            {lastStage.title}
          </h1>

          {/* Subtitle */}
          <h2 className="text-zinc-300 font-medium text-lg sm:text-xl tracking-tight mb-3">
            {lastStage.subtitle}
          </h2>

          {/* Description */}
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed max-w-xl mb-8">
            {lastStage.description}
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-4">
            {lastStage.ctaText && (
              <a
                href={lastStage.ctaLink || "#"}
                className="inline-flex items-center justify-center px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm tracking-wide transition-all shadow-[0_0_24px_rgba(16,185,129,0.3)] hover:shadow-[0_0_32px_rgba(16,185,129,0.5)] active:scale-95"
              >
                {lastStage.ctaText}
              </a>
            )}
            {lastStage.secondaryCtaText && (
              <button
                type="button"
                className="inline-flex items-center justify-center px-5 py-3 rounded-full border border-zinc-700 hover:border-zinc-500 bg-zinc-900/60 hover:bg-zinc-800/80 backdrop-blur-sm text-zinc-300 text-sm font-medium transition-all active:scale-95"
              >
                {lastStage.secondaryCtaText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
