import { Notify } from 'quasar';

function resolveErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) {
      return message;
    }
  }

  return fallbackMessage;
}

export function reportUiError(
  context: string,
  error: unknown,
  fallbackMessage = 'Something went wrong. Please try again.'
): void {
  console.error(context, error);

  Notify.create({
    type: 'negative',
    message: resolveErrorMessage(error, fallbackMessage),
    position: 'top',
    timeout: 3200,
  });
}
