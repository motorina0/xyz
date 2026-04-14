import { nip19 } from '@nostr-dev-kit/ndk';
import { inputSanitizerService } from 'src/services/inputSanitizerService';
import { describe, expect, it } from 'vitest';

describe('inputSanitizerService', () => {
  it('normalizes contact metadata by trimming fields, normalizing owner keys, and deduplicating group members', () => {
    expect(
      inputSanitizerService.normalizeContactMetadata({
        name: ' Alice ',
        about: '  Launch squad  ',
        picture: '   ',
        private_contact_list_member: true,
        owner_public_key: 'A'.repeat(64),
        group_private_key_encrypted: ' encrypted-secret ',
        group_members: [
          {
            public_key: 'B'.repeat(64),
            name: ' Bob ',
          },
          {
            public_key: 'b'.repeat(64),
            name: ' Robert ',
            given_name: ' Rob ',
            about: ' Builder ',
            nprofile: ' nprofile1member ',
          },
          {
            public_key: 'not-a-pubkey',
            name: 'Ignored',
          },
        ],
      })
    ).toEqual({
      name: 'Alice',
      about: 'Launch squad',
      private_contact_list_member: true,
      owner_public_key: 'a'.repeat(64),
      group_private_key_encrypted: 'encrypted-secret',
      group_members: [
        {
          public_key: 'b'.repeat(64),
          name: 'Robert',
          given_name: 'Rob',
          about: 'Builder',
          nprofile: 'nprofile1member',
        },
      ],
    });
  });

  it('validates nsec and npub identifiers and rejects the wrong bech32 type', () => {
    const hexKey = '1'.repeat(64);
    const nsec = nip19.nsecEncode(Uint8Array.from(Buffer.from(hexKey, 'hex')));
    const npub = nip19.npubEncode(hexKey);

    expect(inputSanitizerService.validateNsec(nsec)).toEqual({
      isValid: true,
      hexPrivateKey: hexKey,
      format: 'nsec',
    });
    expect(inputSanitizerService.validateNpub(npub)).toEqual({
      isValid: true,
      normalizedPubkey: hexKey,
    });
    expect(inputSanitizerService.validateNsec(npub)).toEqual({
      isValid: false,
      hexPrivateKey: null,
      format: null,
    });
    expect(inputSanitizerService.validateNpub('npub1notreal')).toEqual({
      isValid: false,
      normalizedPubkey: null,
    });
  });
});
