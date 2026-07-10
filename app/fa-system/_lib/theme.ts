"use client";

import { useEffect, useState } from "react";

// The FA system overrides a small set of CSS variables on a wrapper element
// (data-fa-theme="..."). The actual colour values live in fa-globals.css so
// the palette stays in one place. Adding a new theme = add an entry here AND
// a [data-fa-theme="<id>"] block in the CSS file.

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
    name: "Ivory & Bronze",
    description: "The signature editorial look. Cream, ink, and champagne gold.",
    swatch: ["#fbfaf6", "#c9a96a", "#0c0a09"],
  },
  {
    id: "vibrant",
    name: "Vibrant Modern",
    description: "Clean white surfaces with blue and teal accents — strong contrast on numbers.",
    swatch: ["#ffffff", "#1f8af1", "#0f9f6e"],
  },
  {
    id: "sunset",
    name: "Warm Sunset",
    description: "Peach and cream with orange, pink, and purple accents — playful and warm.",
    swatch: ["#fff7ed", "#fb923c", "#c026d3"],
  },
  {
    id: "highcontrast",
    name: "High-Contrast Pro",
    description: "Deep navy with bright cyan and yellow — maximum number visibility.",
    swatch: ["#0f172a", "#facc15", "#dc2626"],
  },
];

const STORAGE_KEY = "fa-theme";
const DEFAULT_THEME: ThemeId = "default";

function isThemeId(v: unknown): v is ThemeId {
  return v === "default" || v === "vibrant" || v === "sunset" || v === "highcontrast";
}

/** Reads and persists the user's chosen FA theme. Applies the
 *  `data-fa-theme` attribute on the document root so CSS can re-skin
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
    document.documentElement.setAttribute("data-fa-theme", theme);
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
