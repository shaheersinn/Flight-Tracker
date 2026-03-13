/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          500: "#4361ee",
          600: "#3a56e0",
          700: "#2f4bc0",
          900: "#1a2d7a",
        },
        surface: {
          0: "#0a0e1a",
          1: "#0f1528",
          2: "#151c35",
          3: "#1c2442",
        },
      },
    },
  },
  plugins: [],
};
