/*
 * @Author: wangjie
 * @Date: 2026-07-13 23:00:16
 * @LastEditTime: 2026-07-13 23:01:23
 * @LastEditors: wangjie
 * @Description: 
 * @FilePath: \Scrape\frontend\tailwind.config.js
 * @
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  // Disable preflight so it doesn't conflict with antd's reset.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ph: {
          orange: '#ff9000',
          'orange-light': '#ffa026',
          bg: '#1b1b1b',
          header: '#000000',
          card: '#232323',
          elevated: '#262626',
          border: '#2a2a2a',
          'border-light': '#3a3a3a',
          'text-primary': '#e6e6e6',
          'text-secondary': '#ccc',
          'text-tertiary': '#999',
          'text-muted': '#777',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['Consolas', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
};
