/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#151515",
        mist: "#f4f6f5",
        coral: "#f27059",
        teal: "#2f9c95",
        lime: "#b7d968",
      },
    },
  },
  plugins: [],
};
