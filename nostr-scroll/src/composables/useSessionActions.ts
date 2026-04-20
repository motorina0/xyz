import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useFeedStore } from '../stores/feed';
import { useProfilesStore } from '../stores/profiles';
import { useUiStore } from '../stores/ui';

export function useSessionActions() {
  const router = useRouter();
  const authStore = useAuthStore();
  const feedStore = useFeedStore();
  const profilesStore = useProfilesStore();
  const uiStore = useUiStore();

  async function logout(): Promise<void> {
    authStore.logout();
    feedStore.reset();
    profilesStore.reset();
    uiStore.reset();
    await router.replace({ name: 'login' });
  }

  return {
    logout,
  };
}
