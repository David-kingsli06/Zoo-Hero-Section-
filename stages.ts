export interface StageConfig {
  id: string;
  name: string;
  folderPath: string; // Relative to public/
  frameCount: number;
  durationMs: number;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  ctaText?: string;
  ctaLink?: string;
  secondaryCtaText?: string;
}

export const STAGES: StageConfig[] = [
  {
    id: "space-descent",
    name: "Orbital Sanctuary",
    folderPath: "/hero-frames/camera-descending-from-space-to",
    frameCount: 190,
    durationMs: 3200, // Extended duration for calm, cinematic exploration
    badge: "Stage 01 • Atmospheric Descent",
    title: "A Living Biosphere From Orbit",
    subtitle: "A Sanctuary Preserved Across Millennia",
    description: "Enter a pristine biodome engineered to protect Earth's rarest species beneath an atmospheric shield.",
    ctaText: "Discover the Habitat",
    ctaLink: "#explore",
    secondaryCtaText: "Mission Archive",
  },
  {
    id: "forest-arch",
    name: "Canopy Threshold",
    folderPath: "/hero-frames/camera-descending-into-forest-arch",
    frameCount: 190,
    durationMs: 3200, // Extended duration for calm, cinematic exploration
    badge: "Stage 02 • Canopy Ingress",
    title: "Descend Into the Primordial Forest",
    subtitle: "Sunlit Archways & Hidden Corridors",
    description: "Descend past ancient foliage where biodiversity thrives undisturbed in deep symbiotic harmony.",
    ctaText: "Explore Flora & Fauna",
    ctaLink: "#biodiversity",
    secondaryCtaText: "Conservation Field Notes",
  },
  {
    id: "ticket-gate",
    name: "Sanctuary Arrival",
    folderPath: "/hero-frames/camera-approaching-park-ticket-c",
    frameCount: 190,
    durationMs: 3200, // Extended duration for calm, cinematic exploration
    badge: "Stage 03 • Sanctuary Gate",
    title: "The Gates of the Reserve Await",
    subtitle: "Passports, Admissions & Expedition Passes",
    description: "Prepare for departure into the reserve. Book expeditions, secure your entry passport, and experience the wild.",
    ctaText: "Reserve Admission Pass",
    ctaLink: "#tickets",
    secondaryCtaText: "Visitor Expedition Guide",
  },
];
