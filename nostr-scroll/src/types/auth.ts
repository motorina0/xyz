export type AuthMethod = 'nip07' | 'nsec';

export interface NostrAuthSession {
  isAuthenticated: boolean;
  method: AuthMethod | null;
  currentPubkey: string | null;
  privateKeyHex: string | null;
}

export interface PrivateKeyValidationResult {
  isValid: boolean;
  hexPrivateKey: string | null;
  format: 'hex' | 'nsec' | null;
}
