"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  return stored === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const initialTheme = getStoredTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem("theme", nextTheme);
  };

  const isLight = theme === "light";

  return (
    <button
      type='button'
      className='theme-toggle'
      onClick={toggleTheme}
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      title={isLight ? "Use dark mode" : "Use light mode"}
    >
      <span className='theme-toggle-track'>
        <span className='theme-toggle-icon theme-toggle-icon-moon' aria-hidden>
          🌙
        </span>
        <span className='theme-toggle-icon theme-toggle-icon-sun' aria-hidden>
          ☀️
        </span>
        <span className={`theme-toggle-thumb${isLight ? " is-light" : ""}`} />
      </span>
    </button>
  );
}