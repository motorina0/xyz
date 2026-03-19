export interface ContactProfileForm {
  name: string;
  about: string;
  picture: string;
  nip05: string;
  lud06: string;
  lud16: string;
  display_name: string;
  website: string;
  banner: string;
  bot: boolean;
  group: boolean;
  birthday: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  relays: string[];
  sendMessagesToAppRelays: boolean;
}

export function createEmptyContactProfileForm(): ContactProfileForm {
  return {
    name: '',
    about: '',
    picture: '',
    nip05: '',
    lud06: '',
    lud16: '',
    display_name: '',
    website: '',
    banner: '',
    bot: false,
    group: false,
    birthday: {
      year: null,
      month: null,
      day: null
    },
    relays: [],
    sendMessagesToAppRelays: false
  };
}
