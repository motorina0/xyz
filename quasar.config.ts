import { configure } from 'quasar/wrappers';

export default configure(() => {
  return {
    css: ['app.css'],
    extras: ['material-icons'],

    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20'
      },
      vueRouterMode: 'history'
    },

    devServer: {
      open: false,
      allowedHosts: ['.ngrok-free.app', '.ngrok.app']
    },

    framework: {
      plugins: ['Dark', 'Notify', 'Dialog']
    },

    animations: []
  };
});
