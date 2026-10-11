/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        navy: {
          900: "#0b1329",
          800: "#101d3f",
          700: "#162854",
        },
        brand: {
          blue: "#3b82f6",
          cyan: "#06b6d4",
          indigo: "#6366f1",
          emerald: "#10b981",
        },
      },
    },
  },
  plugins: [],
};
