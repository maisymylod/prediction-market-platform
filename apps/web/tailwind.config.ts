import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Calm terminal-ish palette for a risk console.
        ink: '#0b0e14',
        panel: '#11151f',
        edge: '#1e2533',
        muted: '#8b95a7',
        live: '#22c55e',
        warn: '#f59e0b',
        stale: '#9ca3af',
        danger: '#ef4444',
        accent: '#38bdf8',
      },
      keyframes: {
        flash: {
          '0%': { backgroundColor: 'rgba(56,189,248,0.35)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        flash: 'flash 0.8s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
