# Scroll-Controlled Hero Animation Specification & Prompt

Use this document and prompt to recreate or extend this full-screen, scroll-controlled hero section in a Next.js (App Router), TypeScript, and Tailwind CSS project without third-party animation libraries (no GSAP, Framer Motion, or Lenis).

---

## 📋 Complete Master Prompt

```markdown
Build a full-screen, scroll-controlled canvas hero section for a Next.js 15 (App Router) + TypeScript + Tailwind CSS project without any external animation or smooth-scroll libraries (zero GSAP, zero Framer Motion, zero Lenis).

### 1. ASSET SPECIFICATION & STAGE ORDER
- 3 frame sequences (190 WebP frames each, 1280x720, total 570 frames) located in public/hero-frames:
  1) Stage 1: /public/hero-frames/camera-descending-from-space-to/frame_0001.webp ... frame_0190.webp
  2) Stage 2: /public/hero-frames/camera-descending-into-forest-arch/frame_0001.webp ... frame_0190.webp
  3) Stage 3: /public/hero-frames/camera-approaching-park-ticket-c/frame_0001.webp ... frame_0190.webp
- All frames are rendered onto a single full-viewport `<canvas>` element using devicePixelRatio-aware sizing (capped at 2 for memory/sharpness balance) and aspect-ratio-preserving cover-fit math.

### 2. CONTINUOUS SCROLL-CONTROLLED SCRUBBING
- Implement a generous scroll track (e.g., 800vh) holding a sticky 100vh viewport container so the user can smoothly scrub through all 570 frames by scrolling.
- Scrubbing must be calm, steady, and cinematic:
  - Map document scroll progress (0.0 to 1.0) into the continuous sequence across stages and frame numbers.
  - Implement a requestAnimationFrame lerp loop (e.g. catch-up rate 0.08–0.15) for organic damping without frame skips or input lag.
  - Reversible in both directions: scrolling back up scrubs the frames in reverse.

### 3. TYPOGRAPHY BEHAVIOR (IMPORTANT)
- The entire scrub experience must be visual-only: NO text, badges, or controls during the descent.
- Typography is strictly revealed ONLY upon reaching the very last frame (scroll progress >= 0.95):
  - Headline, subtitle, description, and action CTAs smoothly fade and translate up.
  - Deeper vignette overlay fades in at the end to maximize text legibility.
  - Scrolling back up fades out the typography immediately to resume pure frame playback.

### 4. PERFORMANCE & PRELOADING
- Preload Stage 1 eagerly with HTMLImageElement.decode() and a minimal Tailwind loading indicator with percentage progress.
- Load Stages 2 and 3 progressively in the background.
- Provide an on-demand fallback in the renderer: if an un-cached frame is requested during fast scrolling, load and paint it immediately on onload rather than dropping the frame.
- Only trigger canvas redraws when the rounded frame integer changes.
- Pause the rAF loop on tab visibilitychange (document.hidden).
- Respect prefers-reduced-motion: jump directly to the target frame without lerp animation.

### 5. DESIGN & ARCHITECTURE DELIVERABLES
- stages.ts: Central configuration containing stage definitions, frame folder paths, frame count, copy, and duration.
- lib/frameRenderer.ts: Cover-fit calculations, DPR scaling, and canvas drawing logic.
- hooks/useStageScroll.ts: Custom hook managing scroll progress calculation, rAF lerp loop, preloading cache, and frame indexing.
- components/ScrollStageHero.tsx: Client component with sticky viewport, canvas element, loading overlay, and final-frame typography.
- app/page.tsx & app/layout.tsx: Minimal full-screen layout with font pairing (e.g., Syne display + Plus Jakarta Sans body via next/font).
```

---

## 🛠️ Architecture Overview

| File | Purpose |
| :--- | :--- |
| [`stages.ts`](file:///c:/Users/dkdav/OneDrive/Documents/Desktop/zoo_hero_section/stages.ts) | Stage definitions, frame counts, public folder paths, and overlay content. |
| [`lib/frameRenderer.ts`](file:///c:/Users/dkdav/OneDrive/Documents/Desktop/zoo_hero_section/lib/frameRenderer.ts) | DPR-aware canvas scaling, aspect ratio cover-fit math, and image decoding. |
| [`hooks/useStageScroll.ts`](file:///c:/Users/dkdav/OneDrive/Documents/Desktop/zoo_hero_section/hooks/useStageScroll.ts) | Scroll-scrub tracking, rAF damping lerp physics, stage indexing, and preloading cache. |
| [`components/ScrollStageHero.tsx`](file:///c:/Users/dkdav/OneDrive/Documents/Desktop/zoo_hero_section/components/ScrollStageHero.tsx) | Sticky canvas hero component, loading state, and typography reveal on final frame. |
| [`app/page.tsx`](file:///c:/Users/dkdav/OneDrive/Documents/Desktop/zoo_hero_section/app/page.tsx) | Clean root entry rendering the scroll hero without overflow or extra content. |
| [`app/layout.tsx`](file:///c:/Users/dkdav/OneDrive/Documents/Desktop/zoo_hero_section/app/layout.tsx) | Custom Google fonts (`Syne`, `Plus Jakarta Sans`, `JetBrains Mono`) and base styles. |

---

## 🚀 Running the Project

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Build for production
npm run build
```
