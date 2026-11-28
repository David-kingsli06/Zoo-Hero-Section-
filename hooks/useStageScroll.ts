"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { STAGES, StageConfig } from "@/stages";
import { getFrameUrl, renderFrameToCanvas } from "@/lib/frameRenderer";
import { createFrameStore, getDecodeWindowSize } from "@/lib/frameStore";
import { useReducedMotion } from "@/lib/useReducedMotion";

export interface UseStageScrollOptions {
  stages?: StageConfig[];
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
}

export function useStageScroll({
  stages = STAGES,
  canvasRef,
  containerRef,
}: UseStageScrollOptions) {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0); // 0.0 to 1.0 overall progress
  const [isStage1Loaded, setIsStage1Loaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0); // 0 to 100 for stage 1
  const prefersReducedMotion = useReducedMotion();

  const storeRef = useRef<ReturnType<typeof createFrameStore> | null>(null);

  // Smooth scroll lerp (linear interpolation) physics
  // targetProgress: where user has scrolled to
  // currentProgress: smoothly catches up via requestAnimationFrame lerp
  const targetProgress = useRef<number>(0);
  const currentProgress = useRef<number>(0);

  const activeStageRef = useRef<number>(0);
  const activeFrameRef = useRef<number>(1);
  const rAFRef = useRef<number | null>(null);
  const isLoopRunning = useRef<boolean>(false);

  const totalStages = stages.length;

  // Position of a stage's frame in the single, global frame list (1-based frame numbers)
  const globalIndex = useCallback(
    (stageIdx: number, frameNumber: number) =>
      stages.slice(0, stageIdx).reduce((sum, st) => sum + st.frameCount, 0) + frameNumber - 1,
    [stages]
  );

  // Frame renderer helper: draws the closest decoded frame of the same stage
  const drawFrame = useCallback(
    (stageIdx: number, frameNumber: number) => {
      activeStageRef.current = stageIdx;
      activeFrameRef.current = frameNumber;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const store = storeRef.current;
      if (!canvas || !ctx || !store) return;
      const index = globalIndex(stageIdx, frameNumber);
      store.setPlayhead(index);
      const frame = store.getNearest(index);
      if (frame) renderFrameToCanvas(canvas, ctx, frame.bitmap);
    },
    [canvasRef, globalIndex]
  );

  // Download every frame once; keep only the frames near the playhead decoded
  useEffect(() => {
    const store = createFrameStore({
      scenes: stages.map((s) => ({ folder: s.folderPath, frameCount: s.frameCount })),
      getUrl: getFrameUrl,
      windowSize: getDecodeWindowSize(),
      onDecoded: () => drawFrame(activeStageRef.current, activeFrameRef.current),
      onProgress: (percent, ready) => {
        setLoadingProgress(percent);
        if (ready) setIsStage1Loaded(true);
      },
    });
    storeRef.current = store;
    store.setPlayhead(globalIndex(activeStageRef.current, activeFrameRef.current));
    store.start();
    return () => {
      store.destroy();
      storeRef.current = null;
    };
  }, [stages, drawFrame, globalIndex]);

  // Map continuous progress [0.0, 1.0] to { stageIndex, frameNumber }
  const getStageAndFrameFromProgress = useCallback(
    (progress: number) => {
      const clamped = Math.max(0, Math.min(0.999999, progress));
      // Continuous index across stages: 0.0 to totalStages (e.g. 0.0 to 3.0)
      const stageProgress = clamped * totalStages;
      const stageIndex = Math.floor(stageProgress);
      const stageFraction = stageProgress - stageIndex;

      const frameCount = stages[stageIndex]?.frameCount || 190;
      // 1-based frame number: 1 to frameCount
      const frameNumber = Math.max(1, Math.min(frameCount, Math.floor(stageFraction * frameCount) + 1));

      return { stageIndex, frameNumber };
    },
    [stages, totalStages]
  );

  // Continuous animation loop using Emil Kowalski-inspired gentle damping lerp
  const startAnimationLoop = useCallback(() => {
    if (isLoopRunning.current) return;
    isLoopRunning.current = true;

    const tick = () => {
      const diff = targetProgress.current - currentProgress.current;

      // Snappy responsiveness with smooth catch-up
      if (Math.abs(diff) > 0.0001) {
        currentProgress.current += diff * 0.15;
      } else {
        currentProgress.current = targetProgress.current;
      }

      const p = currentProgress.current;
      const { stageIndex, frameNumber } = getStageAndFrameFromProgress(p);

      // Draw whenever frame or stage changes
      if (stageIndex !== activeStageRef.current || frameNumber !== activeFrameRef.current) {
        drawFrame(stageIndex, frameNumber);
        setActiveStageIndex(stageIndex);
      }
      setScrollProgress(p);

      // Keep loop running if target and current are not settled
      if (Math.abs(targetProgress.current - currentProgress.current) > 0.0001) {
        rAFRef.current = requestAnimationFrame(tick);
      } else {
        isLoopRunning.current = false;
        rAFRef.current = null;
      }
    };

    rAFRef.current = requestAnimationFrame(tick);
  }, [drawFrame, getStageAndFrameFromProgress]);

  // Window scroll event listener to track page scroll position
  useEffect(() => {
    const handleScroll = () => {
      // Calculate scroll progress from documentElement scroll if container height is available
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

      let progress = 0;
      if (docHeight > 0) {
        progress = Math.max(0, Math.min(1, scrollY / docHeight));
      }

      targetProgress.current = progress;

      if (prefersReducedMotion) {
        currentProgress.current = progress;
        const { stageIndex, frameNumber } = getStageAndFrameFromProgress(progress);
        drawFrame(stageIndex, frameNumber);
        setActiveStageIndex(stageIndex);
        setScrollProgress(progress);
        return;
      }

      startAnimationLoop();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Paint the position the page opened at
    const first = requestAnimationFrame(handleScroll);

    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("scroll", handleScroll);
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
      rAFRef.current = null;
      isLoopRunning.current = false;
    };
  }, [containerRef, prefersReducedMotion, startAnimationLoop, drawFrame, getStageAndFrameFromProgress]);

  // Redraw on window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        drawFrame(activeStageRef.current, activeFrameRef.current);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawFrame, canvasRef]);

  // Pause when tab is hidden
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && rAFRef.current) {
        cancelAnimationFrame(rAFRef.current);
        rAFRef.current = null;
        isLoopRunning.current = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Jump to specific stage on click
  const goToStage = useCallback(
    (index: number) => {
      const targetP = (index + 0.01) / totalStages;
      const container = containerRef.current;
      if (container) {
        const scrollHeight = container.offsetHeight - window.innerHeight;
        window.scrollTo({
          top: targetP * scrollHeight,
          behavior: "smooth",
        });
      }
    },
    [containerRef, totalStages]
  );

  return {
    currentStageIndex: activeStageIndex,
    scrollProgress,
    isStage1Loaded,
    loadingProgress,
    prefersReducedMotion,
    goToStage,
  };
}
