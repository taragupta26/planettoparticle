import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        earth: {
          50: "#f3f8fc",
          100: "#e3eef8",
          200: "#c3dbef",
          300: "#92bfe2",
          400: "#5b9dd1",
          500: "#3680bd",
          600: "#27659f",
          700: "#215181",
          800: "#20466b",
          900: "#1f3c5a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
