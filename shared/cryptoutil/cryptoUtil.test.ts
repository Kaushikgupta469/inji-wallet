import {NativeModules} from 'react-native';
import forge from 'node-forge';
import {Buffer} from 'buffer';

// Mock dependencies before importing
jest.mock('../constants', () => ({
  BIOMETRIC_CANCELLED: 'BIOMETRIC_CANCELLED',
  DEBUG_MODE_ENABLED: false,
  SUPPORTED_KEY_TYPES: {
    RS256: 'RS256',
    ES256: 'ES256',
    ES256K: 'ES256K',
    ED25519: 'Ed25519',
  },
  isAndroid: jest.fn(() => true),
  isIOS: jest.fn(() => false),
}));

jest.mock('../error/BiometricCancellationError', () => ({
  BiometricCancellationError: class BiometricCancellationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'BiometricCancellationError';
    }
  },
}));

jest.mock('./encryptedOutput', () => ({
  EncryptedOutput: class EncryptedOutput {
    encryptedData: string;
    iv: string;
    salt: string;
    constructor(data: string, iv: string, salt: string) {
      this.encryptedData = data;
      this.iv = iv;
      this.salt = salt;
    }
    toString() {
      return JSON.stringify({
        encryptedData: this.encryptedData,
        iv: this.iv,
        salt: this.salt,
      });
    }
    static fromString(str: string) {
      const obj = JSON.parse(str);
      return new EncryptedOutput(obj.encryptedData, obj.iv, obj.salt);
    }
  },
}));

jest.mock('./signFormatConverter', () => jest.fn(() => 'converted-signature'));

jest.mock('../openId4VCI/Utils', () => ({
  hasKeyPair: jest.fn(),
}));

jest.mock('../telemetry/TelemetryConstants', () => ({
  TelemetryConstants: {FlowType: {keyGeneration: 'keyGeneration'}},
}));

jest.mock('../telemetry/TelemetryUtils', () => ({
  sendImpressionEvent: jest.fn(),
  getImpressionEventData: jest.fn(),
}));

jest.mock('react-native-rsa-native', () => ({
  RSA: {
    generateKeys: jest.fn(() =>
      Promise.resolve({public: 'rsa-public-key', private: 'rsa-private-key'}),
    ),
  },
}));

jest.mock('base64url', () => jest.fn(() => 'base64url-encoded'));

jest.mock('@noble/secp256k1', () => ({
  utils: {randomPrivateKey: jest.fn(() => new Uint8Array(32))},
  getPublicKey: jest.fn(() => new Uint8Array(65)),
  signAsync: jest.fn(() =>
    Promise.resolve({toCompactRawBytes: () => new Uint8Array(64)}),
  ),
  etc: {
    hmacSha256Sync: null as any,
    hmacSha256Async: null as any,
    concatBytes: (...args: Uint8Array[]) => {
      const total = args.reduce((s, a) => s + a.length, 0);
      return new Uint8Array(total);
    },
  },
}));

jest.mock('@noble/curves/p256', () => ({
  p256: {
    utils: {randomPrivateKey: jest.fn(() => new Uint8Array(32))},
    getPublicKey: jest.fn(() => new Uint8Array(65)),
    sign: jest.fn(() =>
      Promise.resolve({toCompactRawBytes: () => new Uint8Array(64)}),
    ),
  },
}));

jest.mock('@noble/ed25519', () => ({
  utils: {randomPrivateKey: jest.fn(() => new Uint8Array(32))},
  getPublicKey: jest.fn(() => new Uint8Array(32)),
  signAsync: jest.fn(() => Promise.resolve(new Uint8Array(64))),
  etc: {
    sha512Sync: null as any,
    sha512Async: null as any,
    concatBytes: (...args: Uint8Array[]) => {
      const total = args.reduce((s, a) => s + a.length, 0);
      return new Uint8Array(total);
    },
  },
}));

jest.mock('@noble/hashes/hmac', () => ({
  hmac: jest.fn(() => new Uint8Array(32)),
}));
jest.mock('@noble/hashes/sha256', () => ({
  sha256: jest.fn(() => new Uint8Array(32)),
}));
jest.mock('@noble/hashes/sha512', () => ({
  sha512: jest.fn(() => new Uint8Array(64)),
}));

jest.mock('./KeyTypes', () => ({
  KeyTypes: {
    RS256: 'RS256',
    ES256: 'ES256',
    ES256K: 'ES256K',
    ED25519: 'Ed25519',
  },
}));

import {
  AUTH_TIMEOUT,
  ENCRYPTION_ID,
  HMAC_ALIAS,
  DUMMY_KEY_FOR_BIOMETRIC_ALIAS,
  generateKeyPairRSA,
  generateKeyPairECK1,
  generateKeyPairECR1,
  generateKeyPairED,
  generateKeyPair,
  checkAllKeyPairs,
  generateKeyPairsAndStoreOrder,
  getJWT,
  createSignature,
  createSignatureRSA,
  createSignatureECK1,
  createSignatureED,
  createSignatureECR1,
  replaceCharactersInB64,
  encodeB64,
  encryptJson,
  decryptJson,
  hmacSHA,
  fetchKeyPair,
  isHardwareKeystoreExists,
} from './cryptoUtil';
import {isAndroid, isIOS} from '../constants';
import {hasKeyPair} from '../openId4VCI/Utils';

describe('cryptoUtil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constants', () => {
    it('should export AUTH_TIMEOUT as 300', () => {
      expect(AUTH_TIMEOUT).toBe(300);
    });

    it('should export ENCRYPTION_ID', () => {
      expect(ENCRYPTION_ID).toBe('c7c22a6c-9759-4605-ac88-46f4041d863k');
    });

    it('should export HMAC_ALIAS', () => {
      expect(HMAC_ALIAS).toBe('860cc320-4248-11ee-be56-0242ac120002');
    });

    it('should export DUMMY_KEY_FOR_BIOMETRIC_ALIAS', () => {
      expect(DUMMY_KEY_FOR_BIOMETRIC_ALIAS).toBe(
        '9a6cfc0e-4248-11ee-be56-0242ac120002',
      );
    });
  });

  describe('replaceCharactersInB64', () => {
    it('should replace + with -', () => {
      expect(replaceCharactersInB64('abc+def')).toBe('abc-def');
    });

    it('should replace / with _', () => {
      expect(replaceCharactersInB64('abc/def')).toBe('abc_def');
    });

    it('should remove trailing =', () => {
      expect(replaceCharactersInB64('abc==')).toBe('abc');
    });

    it('should handle all replacements together', () => {
      expect(replaceCharactersInB64('a+b/c==')).toBe('a-b_c');
    });

    it('should return empty string for empty input', () => {
      expect(replaceCharactersInB64('')).toBe('');
    });

    it('should not modify strings without special chars', () => {
      expect(replaceCharactersInB64('abcdef')).toBe('abcdef');
    });
  });

  describe('encodeB64', () => {
    it('should encode and replace characters', () => {
      const result = encodeB64('test');
      expect(typeof result).toBe('string');
      expect(result).not.toContain('+');
      expect(result).not.toContain('/');
      expect(result).not.toMatch(/=+$/);
    });
  });

  describe('generateKeyPairECK1', () => {
    it('should generate a key pair object', () => {
      const result = generateKeyPairECK1();
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('privateKey');
      expect(typeof result.publicKey).toBe('string');
      expect(typeof result.privateKey).toBe('string');
    });
  });

  describe('generateKeyPairED', () => {
    it('should generate an ED key pair', async () => {
      const result = await generateKeyPairED();
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('privateKey');
      expect(typeof result.publicKey).toBe('string');
      expect(typeof result.privateKey).toBe('string');
    });
  });

  describe('generateKeyPairRSA', () => {
    it('should use RSA.generateKeys when hardware keystore not available', async () => {
      (isAndroid as jest.Mock).mockReturnValue(false);
      const result = await generateKeyPairRSA();
      expect(result).toEqual({
        publicKey: 'rsa-public-key',
        privateKey: 'rsa-private-key',
      });
    });
  });

  describe('generateKeyPairECR1', () => {
    it('should generate ECR1 keys on non-Android', async () => {
      (isAndroid as jest.Mock).mockReturnValue(false);
      const result = await generateKeyPairECR1();
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('privateKey');
      expect(typeof result.publicKey).toBe('string');
    });
  });

  describe('generateKeyPair', () => {
    beforeEach(() => {
      (isAndroid as jest.Mock).mockReturnValue(false);
    });

    it('should generate RS256 key pair', async () => {
      const result = await generateKeyPair('RS256');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('publicKey');
    });

    it('should generate ES256 key pair', async () => {
      const result = await generateKeyPair('ES256');
      expect(result).toBeDefined();
    });

    it('should generate ES256K key pair', async () => {
      const result = await generateKeyPair('ES256K');
      expect(result).toBeDefined();
    });

    it('should generate Ed25519 key pair', async () => {
      const result = await generateKeyPair('Ed25519');
      expect(result).toBeDefined();
    });

    it('should return undefined for unknown key type', async () => {
      const result = await generateKeyPair('UNKNOWN');
      expect(result).toBeUndefined();
    });
  });

  describe('checkAllKeyPairs', () => {
    it('should not throw when all key pairs exist', async () => {
      (hasKeyPair as jest.Mock).mockResolvedValue(true);
      await expect(checkAllKeyPairs()).resolves.not.toThrow();
    });

    it('should throw when RS256 key pair missing', async () => {
      (hasKeyPair as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);
      await expect(checkAllKeyPairs()).rejects.toThrow('Keys not present');
    });

    it('should throw when any key pair missing', async () => {
      (hasKeyPair as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);
      await expect(checkAllKeyPairs()).rejects.toThrow('Keys not present');
    });
  });

  describe('generateKeyPairsAndStoreOrder', () => {
    it('should generate all key pairs and store order', async () => {
      (isAndroid as jest.Mock).mockReturnValue(false);
      (isIOS as jest.Mock).mockReturnValue(true);
      NativeModules.RNSecureKeystoreModule.storeData = jest.fn();
      NativeModules.RNSecureKeystoreModule.storeGenericKey = jest.fn();
      await generateKeyPairsAndStoreOrder();
      expect(NativeModules.RNSecureKeystoreModule.storeData).toHaveBeenCalled();
      expect(
        NativeModules.RNSecureKeystoreModule.storeGenericKey,
      ).toHaveBeenCalled();
    });

    it('should not store RSA/ECR1 via storeGenericKey on Android', async () => {
      (isAndroid as jest.Mock).mockReturnValue(false);
      (isIOS as jest.Mock).mockReturnValue(false);
      NativeModules.RNSecureKeystoreModule.storeData = jest.fn();
      NativeModules.RNSecureKeystoreModule.storeGenericKey = jest.fn();
      await generateKeyPairsAndStoreOrder();
      // On non-iOS, storeGenericKey should be called only for ECK1 and ED
      expect(
        NativeModules.RNSecureKeystoreModule.storeGenericKey,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('createSignature', () => {
    it('should call createSignatureECK1 for ES256K', async () => {
      const result = await createSignature(
        new Uint8Array(32),
        'payload',
        'ES256K',
      );
      expect(result).toBe('base64url-encoded');
    });

    it('should call createSignatureED for Ed25519', async () => {
      const result = await createSignature(
        new Uint8Array(32),
        'payload',
        'Ed25519',
      );
      expect(typeof result).toBe('string');
    });

    it('should return undefined for unknown key type', async () => {
      const result = await createSignature('key', 'payload', 'UNKNOWN');
      expect(result).toBeUndefined();
    });
  });

  describe('createSignatureECK1', () => {
    it('should sign with secp256k1', async () => {
      const result = await createSignatureECK1(new Uint8Array(32), 'payload');
      expect(result).toBe('base64url-encoded');
    });
  });

  describe('createSignatureED', () => {
    it('should sign with ed25519', async () => {
      const result = await createSignatureED(
        new Uint8Array(32),
        new Uint8Array(10),
      );
      expect(typeof result).toBe('string');
    });
  });

  describe('getJWT', () => {
    it('should construct a JWT string', async () => {
      const header = {alg: 'ES256K'};
      const payload = {sub: 'test'};
      const result = await getJWT(
        header,
        payload,
        'alias',
        new Uint8Array(32),
        'ES256K',
      );
      expect(typeof result).toBe('string');
      const parts = result.split('.');
      expect(parts.length).toBe(3);
    });

    it('should throw BiometricCancellationError on biometric cancel', async () => {
      jest.spyOn(forge.util, 'encode64').mockImplementation(() => {
        throw new Error('BIOMETRIC_CANCELLED');
      });
      await expect(
        getJWT({alg: 'ES256K'}, {}, 'alias', null, 'ES256K'),
      ).rejects.toThrow();
      jest.restoreAllMocks();
    });
  });

  describe('hmacSHA', () => {
    it('should compute HMAC SHA256', () => {
      const result = hmacSHA('key', 'data');
      expect(typeof result).toBe('string');
    });
  });

  describe('encryptJson', () => {
    it('should encrypt data', async () => {
      const result = await encryptJson('key', 'test-data');
      expect(typeof result).toBe('string');
    });
  });

  describe('decryptJson', () => {
    it('should return empty string for null input', async () => {
      const result = await decryptJson('key', null as any);
      expect(result).toBe('');
    });

    it('should return empty string for undefined input', async () => {
      const result = await decryptJson('key', undefined as any);
      expect(result).toBe('');
    });

    it('should decrypt data', async () => {
      const result = await decryptJson('key', 'encryptedData');
      expect(typeof result).toBe('string');
    });
  });

  describe('fetchKeyPair', () => {
    it('should fetch RS256 key pair on Android', async () => {
      (isAndroid as jest.Mock).mockReturnValue(true);
      NativeModules.RNSecureKeystoreModule.retrieveKey = jest.fn(() =>
        Promise.resolve('mock-public-key'),
      );
      const result = await fetchKeyPair('RS256');
      expect(result).toEqual({
        publicKey: 'mock-public-key',
        privateKey: '',
      });
    });

    it('should fetch generic key pair on non-Android', async () => {
      (isAndroid as jest.Mock).mockReturnValue(false);
      NativeModules.RNSecureKeystoreModule.retrieveGenericKey = jest.fn(() =>
        Promise.resolve(['private-key', 'public-key']),
      );
      const result = await fetchKeyPair('RS256');
      expect(result.publicKey).toBe('public-key');
      expect(result.privateKey).toBe('private-key');
    });

    it('should fetch ES256K generic key pair', async () => {
      NativeModules.RNSecureKeystoreModule.retrieveGenericKey = jest.fn(() =>
        Promise.resolve([
          Buffer.from('privkey').toString('base64'),
          Buffer.from('pubkey').toString('base64'),
        ]),
      );
      const result = await fetchKeyPair('ES256K');
      expect(result.publicKey).toBeDefined();
      expect(result.privateKey).toBeDefined();
    });

    it('should throw BiometricCancellationError on biometric cancel', async () => {
      NativeModules.RNSecureKeystoreModule.retrieveKey = jest.fn(() =>
        Promise.reject(new Error('BIOMETRIC_CANCELLED')),
      );
      (isAndroid as jest.Mock).mockReturnValue(true);
      await expect(fetchKeyPair('RS256')).rejects.toThrow();
    });

    it('should throw other errors', async () => {
      NativeModules.RNSecureKeystoreModule.retrieveKey = jest.fn(() =>
        Promise.reject(new Error('some-other-error')),
      );
      (isAndroid as jest.Mock).mockReturnValue(true);
      await expect(fetchKeyPair('RS256')).rejects.toThrow('some-other-error');
    });
  });
});
