/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  // Disable preflight so it doesn't conflict with antd's reset.
  corePlugins: { preflight: false },
  theme: {
    extend: {
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
        // 英文/数字: Segoe UI 高级影视平台感；中文回退到微软雅黑
        sans: ['Segoe UI', 'Microsoft YaHei', 'sans-serif'],
        // 仅保留给代码/日志/URL 等真正需要等宽的场景
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
