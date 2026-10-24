import type { ActivitySummary } from "../../app/types";

/** Visual identity of each universe, taken from the reference board (colours, banner, artwork, patch). */
export interface WorldMeta {
  id: string;
  accent: string;
  accentDark: string;
  banner: [string, string];
  tint: [string, string];
  art: string;
  /** CSS object-position so the main island stays centred when the art is cropped. */
  artPos: string;
  patch: string;
  hero?: string; // wide version of the landscape for the universe page header
  artRatio?: number; // width/height of the landscape, so panels show the whole composition
  guide: "nasj" | "papa" | "maman" | "sister" | "brother";
}

export const WORLDS: WorldMeta[] = [
  { id: "letters", accent: "#E8607A", accentDark: "#B93E58", banner: ["#F78FA3", "#E4607C"], tint: ["#FFE6EB", "#FFF4E8"],
    art: "/img/worlds/letters.webp", artPos: "62% 55%", patch: "/img/ui/patch-2.png", guide: "maman" },
  { id: "numbers", accent: "#F0983A", accentDark: "#C26F14", banner: ["#F9BC57", "#EE9234"], tint: ["#FFEDCF", "#FFF8E9"],
    art: "/img/worlds/numbers.webp", artPos: "50% 50%", artRatio: 1060 / 555, hero: "/img/worlds/numbers-wide.webp", patch: "/img/ui/button-2.png", guide: "papa" },
  { id: "forest", accent: "#4F9D5D", accentDark: "#357A44", banner: ["#80C47B", "#47985A"], tint: ["#E2F1D8", "#F5F9E9"],
    art: "/img/worlds/forest.webp", artPos: "70% 50%", patch: "/img/ui/patch-4.png", guide: "brother" },
  { id: "stories", accent: "#8E6BC1", accentDark: "#6A4A9C", banner: ["#B39BDE", "#7F5DBA"], tint: ["#EEE3F8", "#FBF1F5"],
    art: "/img/worlds/stories.webp", artPos: "50% 50%", artRatio: 980 / 460, hero: "/img/worlds/stories-wide.webp", patch: "/img/ui/patch-1.png", guide: "nasj" },
  { id: "inventors", accent: "#4A8FD6", accentDark: "#2F6CAB", banner: ["#7AB8EE", "#4082CC"], tint: ["#DDEBFA", "#F2F7FC"],
    art: "/img/worlds/inventors.webp", artPos: "50% 50%", patch: "/img/ui/patch-3.png", guide: "sister" },
];

export const worldMeta = (id: string): WorldMeta => WORLDS.find((w) => w.id === id) ?? WORLDS[0];

/** Colours of the six weft threads of a universe's woven bridge (one per activity). */
export const THREAD_COLORS = ["#F6B93B", "#17908A", "#F26B6B", "#A57BD0", "#F29B3E", "#7FD0C5"];
/** Matching yarn-ball artwork from the style guide. */
export const THREAD_YARN = ["yarn-1", "yarn-2", "yarn-4", "yarn-6", "yarn-3", "yarn-5"].map((n) => `/img/ui/${n}.png`);

// Activity artwork: the four example tiles shown on the reference board, with an emoji for the others.
const ICON_FILES: Record<string, string> = {
  "letters-1": "letters-1", "letters-2": "letters-2", "letters-3": "letters-3", "letters-4": "letters-4",
  "numbers-1": "numbers-1", "numbers-2": "numbers-2", "numbers-3": "numbers-3", "numbers-4": "numbers-4",
  "forest-1": "forest-1", "forest-2": "forest-2", "forest-3": "forest-3", "forest-4": "forest-4",
  "stories-1": "stories-1", "stories-2": "stories-2", "stories-3": "stories-3", "stories-4": "stories-4",
  "inventors-1": "inventors-1", "inventors-2": "inventors-2", "inventors-3": "inventors-3", "inventors-6": "inventors-4",
};
const ICON_EMOJI: Record<string, string> = {
  "letters-5": "🎧", "letters-6": "🔤", "numbers-5": "⚖️", "numbers-6": "❓", "forest-5": "🏡", "forest-6": "🔧",
  "stories-5": "🔀", "stories-6": "💬", "inventors-4": "🧱", "inventors-5": "🕵️",
};

export function activityIcon(a: Pick<ActivitySummary, "id">): { src?: string; emoji?: string } {
  const f = ICON_FILES[a.id];
  return f ? { src: `/img/icons/${f}.png` } : { emoji: ICON_EMOJI[a.id] ?? "✨" };
}
