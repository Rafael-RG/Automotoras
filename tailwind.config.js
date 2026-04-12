/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#D32F2F",
        "secondary": "#FFB3AC",
        "surface": "#0E0E0F",
        "on-surface": "#E5E2E3",
        "on-primary": "#FFFFFF",
        "outline": "#353436",
        "outline-variant": "#49454F",
        "surface-container": "#1C1B1F",
        "surface-container-high": "#2B2930",
        "surface-container-highest": "#36343B",
        "surface-container-lowest": "#0E0E0F",
        "on-surface-variant": "#CAC4D0",
        "accent-red": "#FF3D3D",
        "text-muted": "#A19EA0",
        "text-dim": "#A19EA0",
        "metallic-black": "#05070a",
        "deep-blue": "#00122e",
        "background": "#0E0E0F",
        "text": "#E5E2E3"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "sm": "0.0625rem",
        "md": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "9999px"
      },
      fontFamily: {
        "headline": ["Manrope", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Manrope", "sans-serif"],
        "inter": ["Inter", "sans-serif"]
      }
    },
  },
  plugins: [],
}
