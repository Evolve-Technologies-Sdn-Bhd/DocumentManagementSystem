module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--dms-color-bg-canvas)',
        overlay: 'var(--dms-color-bg-overlay)',
        surface: {
          DEFAULT: 'var(--dms-color-bg-surface)',
          muted: 'var(--dms-color-bg-surface-muted)',
          strong: 'var(--dms-color-bg-surface-strong)'
        },
        sidebar: {
          DEFAULT: 'var(--dms-color-bg-sidebar)',
          hover: 'var(--dms-color-bg-sidebar-hover)',
          active: 'var(--dms-color-bg-sidebar-active)',
          text: 'var(--dms-sidebar-text)'
        },
        topbar: {
          bg: 'var(--dms-color-bg-topbar)',
          border: 'var(--dms-color-border-topbar)',
          surface: 'var(--dms-color-bg-topbar-surface)',
          surfaceHover: 'var(--dms-color-bg-topbar-surface-hover)'
        },
        brand: {
          DEFAULT: 'var(--dms-color-brand-primary)',
          hover: 'var(--dms-color-brand-primary-hover)',
          secondary: 'var(--dms-color-brand-secondary)'
        },
        border: {
          DEFAULT: 'var(--dms-color-border-default)',
          strong: 'var(--dms-color-border-strong)'
        },
        ink: {
          DEFAULT: 'var(--dms-color-text-primary)',
          secondary: 'var(--dms-color-text-secondary)',
          muted: 'var(--dms-color-text-muted)',
          soft: 'var(--dms-color-text-soft)',
          inverse: 'var(--dms-color-text-inverse)',
          onBrand: 'var(--dms-color-text-on-brand)',
          onDanger: 'var(--dms-color-text-on-danger)'
        },
        primary: {
          DEFAULT: 'var(--dms-color-brand-secondary)',
          dark: 'var(--dms-color-brand-primary-hover)'
        },
        panel: 'var(--dms-color-bg-surface-muted)',
        muted: 'var(--dms-color-text-muted)'
      },
      boxShadow: {
        'dms-card': 'var(--dms-shadow-md)',
        'dms-soft': 'var(--dms-shadow-sm)',
        'dms-lg': 'var(--dms-shadow-lg)'
      },
      borderRadius: {
        'dms': 'var(--dms-radius-md)',
        'dms-sm': 'var(--dms-radius-sm)',
        'dms-lg': 'var(--dms-radius-lg)'
      },
      spacing: {
        'page-x': 'var(--dms-layout-page-gutter-desktop)'
      },
      width: {
        sidebar: 'var(--dms-layout-sidebar-width)',
        'sidebar-lg': 'var(--dms-layout-sidebar-width-lg)',
        'sidebar-collapsed': 'var(--dms-layout-sidebar-collapsed)',
        rightpanel: 'var(--dms-layout-rightpanel-width)'
      },
      height: {
        topbar: 'var(--dms-layout-topbar-height)'
      }
    }
  },
  plugins: []
}
