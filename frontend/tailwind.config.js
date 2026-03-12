/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg:      '#0a0e17',
          panel:   '#111827',
          border:  'rgba(255,255,255,0.08)',
          cyan:    '#00f0ff',
          green:   '#00ff88',
          red:     '#ff3b5c',
          amber:   '#ffaa00',
          muted:   '#4b5563',
          text:    '#e2e8f0',
          dim:     '#94a3b8',
        },
      },
      fontFamily: {
        mono:    ['"JetBrains Mono"', 'monospace'],
        sans:    ['"Space Grotesk"', 'sans-serif'],
      },
      backgroundImage: {
        'dot-pattern': 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
      },
      backgroundSize: {
        'dot': '24px 24px',
      },
      boxShadow: {
        'glow-cyan':  '0 0 12px rgba(0,240,255,0.25)',
        'glow-green': '0 0 12px rgba(0,255,136,0.25)',
        'glow-red':   '0 0 12px rgba(255,59,92,0.25)',
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':      'fadeIn 0.5s ease-out forwards',
        'slide-in':     'slideIn 0.3s ease-out forwards',
        'flash-green':  'flashGreen 0.6s ease-out',
        'flash-red':    'flashRed 0.6s ease-out',
        'ticker':       'ticker 0.3s ease-out',
      },
      keyframes: {
        fadeIn:     { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        slideIn:    { from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'none' } },
        flashGreen: { '0%,100%': { backgroundColor: 'transparent' }, '50%': { backgroundColor: 'rgba(0,255,136,0.15)' } },
        flashRed:   { '0%,100%': { backgroundColor: 'transparent' }, '50%': { backgroundColor: 'rgba(255,59,92,0.15)' } },
        ticker:     { from: { transform: 'translateY(-100%)' }, to: { transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
