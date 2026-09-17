import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["Rubik", "system-ui", "Segoe UI", "Arial", "sans-serif"],
        display: ['"Frank Ruhl Libre"', "Georgia", "serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          deep: "hsl(var(--primary-deep))",
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
        gold: {
          DEFAULT: "hsl(var(--gold))",
          deep: "hsl(var(--gold-deep))",
        },
        success: "hsl(var(--success))",
        ice: "hsl(var(--ice))",
        /** צבע השחקן/ית של המסך הזה — מוגדר כמשתנה על עטיפת הרכיב */
        pc: "hsl(var(--pc))",
        /** צבע בן/בת הזוג */
        po: "hsl(var(--po))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      keyframes: {
        shine: { to: { backgroundPosition: "200% center" } },
        heartbeat: {
          "0%, 100%": { transform: "scale(1)" },
          "14%": { transform: "scale(1.13)" },
          "28%": { transform: "scale(1)" },
          "42%": { transform: "scale(1.08)" },
          "70%": { transform: "scale(1)" },
        },
        "float-up": {
          "0%": { transform: "translate3d(0,0,0) scale(.5)", opacity: "0" },
          "12%": { opacity: "1" },
          "100%": {
            transform: "translate3d(var(--dx, 0px), -62vh, 0) scale(1.15) rotate(var(--rot, 0deg))",
            opacity: "0",
          },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(-4deg)" },
          "75%": { transform: "rotate(4deg)" },
        },
        "pop-in": {
          "0%": { transform: "scale(.6)", opacity: "0" },
          "70%": { transform: "scale(1.05)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "count-in": {
          "0%": { transform: "scale(2.4)", opacity: "0", filter: "blur(10px)" },
          "28%": { transform: "scale(1)", opacity: "1", filter: "blur(0)" },
          "78%": { transform: "scale(.96)", opacity: "1" },
          "100%": { transform: "scale(.7)", opacity: "0" },
        },
        "rise-in": {
          "0%": { transform: "translateY(18px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: ".45" },
        },
        "ring-out": {
          "0%": { transform: "scale(.8)", opacity: ".9" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
      },
      animation: {
        shine: "shine 6s linear infinite",
        heartbeat: "heartbeat 1.6s ease-in-out infinite",
        "float-up": "float-up 2.8s cubic-bezier(.2,.7,.3,1) forwards",
        wiggle: "wiggle .3s ease-in-out 2",
        "pop-in": "pop-in .5s cubic-bezier(.2,.9,.3,1.25) both",
        "count-in": "count-in 1s cubic-bezier(.2,.8,.2,1) forwards",
        "rise-in": "rise-in .5s cubic-bezier(.2,.8,.2,1) both",
        "soft-pulse": "soft-pulse 1.8s ease-in-out infinite",
        "ring-out": "ring-out 1.6s ease-out infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
