"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { STAGES, StageConfig } from "@/stages";
import { getFrameUrl, loadFrameImage, renderFrameToCanvas } from "@/lib/frameRenderer";

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
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Cached decoded HTMLImageElements: framesCache.current[stageIndex][frameIdx0to189]
  const framesCache = useRef<(HTMLImageElement | null)[][]>([]);

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
  // Total virtual frame units across all 3 sequences (190 * 3 = 570 frames)
  const totalFramesCount = stages.reduce((acc, s) => acc + s.frameCount, 0);

  // Initialize frame cache arrays
  useEffect(() => {
    framesCache.current = stages.map((s) => new Array(s.frameCount).fill(null));
  }, [stages]);

  // Accessibility: prefers-reduced-motion check
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Frame renderer helper
  const drawFrame = useCallback(
    (stageIdx: number, frameNumber: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const stageFrames = framesCache.current[stageIdx];
      const maxFrames = stages[stageIdx]?.frameCount || 190;
      const clampedFrame = Math.max(1, Math.min(maxFrames, Math.round(frameNumber)));
      let img = stageFrames?.[clampedFrame - 1];

      // Fallback: If image hasn't finished preloading into cache, load it immediately on demand
      if (!img) {
        const url = getFrameUrl(stages[stageIdx].folderPath, clampedFrame);
        img = new Image();
        img.src = url;
        if (stageFrames) {
          stageFrames[clampedFrame - 1] = img;
        }
      }

      if (img.complete && img.naturalWidth > 0) {
        renderFrameToCanvas(canvas, ctx, img);
        activeStageRef.current = stageIdx;
        activeFrameRef.current = clampedFrame;
      } else {
        img.onload = () => {
          if (canvasRef.current) {
            const currentCtx = canvasRef.current.getContext("2d");
            if (currentCtx) {
              renderFrameToCanvas(canvasRef.current, currentCtx, img!);
              activeStageRef.current = stageIdx;
              activeFrameRef.current = clampedFrame;
            }
          }
        };
      }
    },
    [canvasRef, stages]
  );

  // Preload: Stage 1 loaded eagerly with progress, Stages 2 & 3 loaded in background
  useEffect(() => {
    let isCancelled = false;
    const stage1 = stages[0];
    const totalStage1 = stage1.frameCount;
    let loadedCount = 0;

    async function preloadAll() {
      // 1. Stage 1
      const stage1Promises: Promise<void>[] = [];
      for (let i = 1; i <= totalStage1; i++) {
        const url = getFrameUrl(stage1.folderPath, i);
        const p = loadFrameImage(url).then((img) => {
          if (isCancelled) return;
          if (framesCache.current[0]) {
            framesCache.current[0][i - 1] = img;
          }
          loadedCount++;
          if (loadedCount % 10 === 0 || loadedCount === totalStage1) {
            setLoadingProgress(Math.round((loadedCount / totalStage1) * 100));
          }
        });
        stage1Promises.push(p);
      }

      await Promise.all(stage1Promises);
      if (isCancelled) return;

      setIsStage1Loaded(true);

      // Draw initial frame 1 of stage 1
      if (canvasRef.current && framesCache.current[0]?.[0]) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          renderFrameToCanvas(canvasRef.current, ctx, framesCache.current[0][0]!);
        }
      }

      // 2. Preload remaining stages in background
      for (let sIdx = 1; sIdx < stages.length; sIdx++) {
        const st = stages[sIdx];
        for (let i = 1; i <= st.frameCount; i++) {
          if (isCancelled) return;
          const url = getFrameUrl(st.folderPath, i);
          loadFrameImage(url).then((img) => {
            if (isCancelled) return;
            if (framesCache.current[sIdx]) {
              framesCache.current[sIdx][i - 1] = img;
            }
          });
        }
      }
    }

    preloadAll();

    return () => {
      isCancelled = true;
    };
  }, [stages, canvasRef]);

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
    // Run immediately to paint initial frame
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
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
