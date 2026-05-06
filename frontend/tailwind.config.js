/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 利用 CSS 变量代理默认颜色，实现无痛零成本一键换肤
        base: 'var(--color-bg-base)',
        teal: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
        },
        gray: {
          50: 'var(--color-surface-50)',
          100: 'var(--color-surface-100)',
          200: 'var(--color-surface-200)',
          300: 'var(--color-surface-300)',
          400: 'var(--color-surface-400)',
          500: 'var(--color-surface-500)',
          600: 'var(--color-surface-600)',
          700: 'var(--color-surface-700)',
          800: 'var(--color-surface-800)',
          900: 'var(--color-surface-900)',
        }
      },
      borderRadius: {
        'lg': 'var(--base-radius)',
        'xl': 'calc(var(--base-radius) + 4px)',
        '2xl': 'calc(var(--base-radius) + 8px)'
      }
    },
  },
  plugins: [],
}
