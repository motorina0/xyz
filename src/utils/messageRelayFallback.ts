import type { QVueGlobals } from 'quasar';

export const CONTACT_RELAY_FALLBACK_MESSAGE =
  'No relays found for this contact. Do you want to use the application default relays?';

export function confirmUseAppRelaysDialog($q: QVueGlobals): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (value: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    $q.dialog({
      title: 'Use App Relays',
      message: CONTACT_RELAY_FALLBACK_MESSAGE,
      persistent: true,
      ok: {
        label: 'Yes',
        color: 'primary',
        noCaps: true
      },
      cancel: {
        label: 'No',
        flat: true,
        noCaps: true
      }
    })
      .onOk(() => settle(true))
      .onCancel(() => settle(false))
      .onDismiss(() => settle(false));
  });
}
