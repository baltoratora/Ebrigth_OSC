"use client";

import { useEffect, useState } from "react";

// The PCM system overrides a small set of CSS variables on the document root
// (data-pcm-theme="..."). The actual colour values live in pcm-globals.css so
// the palette stays in one place. Adding a new theme = add an entry here AND
// a [data-pcm-theme="<id>"] block in the CSS file.
//
// PCM and FA each have their own theme storage so a user can pick different
// looks on each system without one overriding the other.

export type ThemeId = "default" | "vibrant" | "sunset" | "highcontrast";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  /** Three small swatch colours rendered in the picker for a quick preview. */
  swatch: [string, string, string];
}

export const FA_THEMES: ThemeOption[] = [
  {
    id: "default",
    name: "Aurora",
    description: "Cool lavender surfaces, violet accents, indigo highlights — the PCM signature.",
    swatch: ["#faf9ff", "#8b5cf6", "#4f46e5"],
  },
  {
    id: "vibrant",
    name: "Electric",
    description: "Crisp white with cyan + lime — high-energy, modern.",
    swatch: ["#ffffff", "#06b6d4", "#84cc16"],
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Peach and cream with orange + pink — playful and warm.",
    swatch: ["#fff7ed", "#fb923c", "#c026d3"],
  },
  {
    id: "highcontrast",
    name: "Midnight",
    description: "Deep navy with bright cyan and yellow — maximum number visibility.",
    swatch: ["#0f172a", "#facc15", "#dc2626"],
  },
];

const STORAGE_KEY = "pcm-theme";
const DEFAULT_THEME: ThemeId = "default";

function isThemeId(v: unknown): v is ThemeId {
  return v === "default" || v === "vibrant" || v === "sunset" || v === "highcontrast";
}

/** Reads and persists the user's chosen FA theme. Applies the
 *  `data-pcm-theme` attribute on the document root so CSS can re-skin
 *  without any component re-render. */
export function useFATheme(): { theme: ThemeId; setTheme: (id: ThemeId) => void } {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // Initial load — only runs once on the client.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && isThemeId(raw)) setThemeState(raw);
    } catch {
      // localStorage unavailable (private mode, etc.) — silently fall back to default.
    }
  }, []);

  // Apply the theme attribute on the document root whenever it changes.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-pcm-theme", theme);
  }, [theme]);

  function setTheme(id: ThemeId) {
    setThemeState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Same fallback as above — selection still applies for this session.
    }
  }

  return { theme, setTheme };
}
