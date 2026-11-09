/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      colors: {
        primary: {
          50: 'var(--wv-primary-50)',
          100: 'var(--wv-primary-100)',
          200: 'var(--wv-primary-200)',
          300: 'var(--wv-primary-300)',
          400: 'var(--wv-primary-400)',
          500: 'var(--wv-primary-500)',
          600: 'var(--wv-primary-600)',
          700: 'var(--wv-primary-700)',
          800: 'var(--wv-primary-800)',
          900: 'var(--wv-primary-900)',
          // shadcn semantic accent (app kit) — merged so the legacy
          // 50–900 scale still resolves while `bg-primary` = the terra accent.
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        // shadcn token bridge — see src/app/ui/tokens.css
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        ai: { DEFAULT: 'var(--ai)', soft: 'var(--ai-soft)', foreground: 'var(--ai-foreground)' },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-in-from-right': 'slideInFromRight 0.3s ease-out',
        'slide-in-from-bottom': 'slideInFromBottom 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInFromRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInFromBottom: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}