import { useRouter } from 'vue-router';
import { useAppRelaysStore } from '../stores/appRelays';
import { useAuthStore } from '../stores/auth';
import { useFeedStore } from '../stores/feed';
import { useFollowsStore } from '../stores/follows';
import { useMyRelaysStore } from '../stores/myRelays';
import { useProfilesStore } from '../stores/profiles';
import { useUiStore } from '../stores/ui';

export function useSessionActions() {
  const router = useRouter();
  const appRelaysStore = useAppRelaysStore();
  const authStore = useAuthStore();
  const feedStore = useFeedStore();
  const followsStore = useFollowsStore();
  const myRelaysStore = useMyRelaysStore();
  const profilesStore = useProfilesStore();
  const uiStore = useUiStore();

  async function logout(): Promise<void> {
    authStore.logout();
    appRelaysStore.init();
    feedStore.reset();
    followsStore.reset();
    myRelaysStore.reset();
    profilesStore.reset();
    uiStore.reset();
    await router.replace({ name: 'login' });
  }

  return {
    logout,
  };
}
