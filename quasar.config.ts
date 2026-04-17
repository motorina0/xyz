import { configure } from 'quasar/wrappers';

export default configure(() => {
  return {
    css: ['app.css'],
    extras: ['material-icons'],

    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node24',
      },
      vueRouterMode: 'hash',
    },

    devServer: {
      open: false,
      allowedHosts: ['.ngrok-free.app', '.ngrok.app'],
    },

    framework: {
      config: {
        dark: true,
      },
      plugins: ['Dark', 'Notify', 'Dialog'],
    },

    electron: {
      bundler: 'builder',
      builder: {
        appId: 'com.lnbits.nostrchat',
        productName: 'Nostr Chat',
        artifactName: `\${productName}-\${version}-\${os}-\${arch}.\${ext}`,
        mac: {
          category: 'public.app-category.social-networking',
          target: ['dmg', 'zip'],
        },
        win: {
          target: ['nsis'],
        },
        linux: {
          category: 'Network',
          target: ['AppImage', 'deb'],
        },
      },
    },

    animations: [],
  };
});
