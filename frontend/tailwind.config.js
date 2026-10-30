/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Straight from the ArchPoint logo.
      colors: {
        brand: {
          blue: "#004c99", yellow: "#ffc700", orange: "#f28220"
        }
      },
      fontFamily: {
        sans: ["Source Sans 3", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        head: ["Fraunces", "Georgia", "serif"]
      }
    }
  },
  plugins: []
};
