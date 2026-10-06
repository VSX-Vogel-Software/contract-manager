/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // Mobilunterstuetzung: `touch:` fuer Geraete ohne Mauszeiger, Safe-Area-
    // Abstaende fuer Notch/Home-Indikator, Scrollleiste ausblenden.
    // Achtung: `pb-safe` & Co. stehen im CSS nach den Core-Utilities und
    // ueberschreiben ein gleichzeitig gesetztes `p-3`/`px-2`. Fuer
    // "Abstand, mindestens Safe Area" stattdessen pb-[max(0.75rem,env(...))].
    function ({ addVariant, addUtilities }) {
      addVariant("touch", "@media (hover: none) and (pointer: coarse)")
      addUtilities({
        ".pt-safe": { paddingTop: "env(safe-area-inset-top)" },
        ".pb-safe": { paddingBottom: "env(safe-area-inset-bottom)" },
        ".pl-safe": { paddingLeft: "env(safe-area-inset-left)" },
        ".pr-safe": { paddingRight: "env(safe-area-inset-right)" },
        ".scrollbar-none": {
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        },
      })
    },
  ],
}
