/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  // Disable preflight so it doesn't conflict with antd's reset.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      // 统一圆角：xs2 / sm4 / md6 / lg8；pill 仅用于筛选胶囊
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
        full: '9999px',
      },
      colors: {
        ph: {
          orange: '#FF9900',
          'orange-light': '#ffaa22',
          bg: '#050505',
          header: '#0A0A0A',
          card: '#121212',
          elevated: '#1A1A1A',
          panel: '#141416',
          panelAlt: '#1a1a1e',
          border: 'rgba(255,255,255,0.10)',
          'border-light': 'rgba(255,255,255,0.05)',
          'text-primary': '#e6e6e6',
          'text-secondary': '#cccccc',
          'text-tertiary': '#999999',
          'text-muted': '#777777',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'Microsoft YaHei', 'sans-serif'],
        mono: ['Consolas', 'Courier New', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
