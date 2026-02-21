import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('pages/IndexPage.vue')
      },
      {
        path: 'contacts',
        name: 'contacts',
        component: () => import('pages/ContactsPage.vue')
      },
      {
        path: 'settings',
        component: () => import('pages/SettingsPage.vue'),
        children: [
          {
            path: '',
            redirect: { name: 'settings-profile' }
          },
          {
            path: 'profile',
            name: 'settings-profile',
            component: () => import('pages/settings/ProfileSettingsPage.vue')
          },
          {
            path: 'language',
            name: 'settings-language',
            component: () => import('pages/settings/LanguageSettingsPage.vue')
          },
          {
            path: 'notifications',
            name: 'settings-notifications',
            component: () => import('pages/settings/NotificationsSettingsPage.vue')
          }
        ]
      },
      {
        path: 'chat/:chatId',
        name: 'chat',
        component: () => import('pages/ChatPage.vue')
      }
    ]
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
];

export default routes;
