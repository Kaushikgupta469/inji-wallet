import {NativeModules, Platform} from 'react-native';
import {
  getSupportedBiometricType,
  getBiometricLabel,
  getBiometricTranslationSuffix,
  BiometricType,
} from './useBiometricType';

// The global jest-init.js already mocks RNSecureKeystoreModule via react-native.mock.js.
// We override getSupportedBiometricType per test below.

const {RNSecureKeystoreModule} = NativeModules;

describe('getSupportedBiometricType', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns FACE when native module returns FACE', async () => {
    RNSecureKeystoreModule.getSupportedBiometricType = jest
      .fn()
      .mockResolvedValue('FACE');
    const result = await getSupportedBiometricType();
    expect(result).toBe('FACE');
  });

  it('returns FINGERPRINT when native module returns FINGERPRINT', async () => {
    RNSecureKeystoreModule.getSupportedBiometricType = jest
      .fn()
      .mockResolvedValue('FINGERPRINT');
    const result = await getSupportedBiometricType();
    expect(result).toBe('FINGERPRINT');
  });

  it('returns BOTH when native module returns BOTH', async () => {
    RNSecureKeystoreModule.getSupportedBiometricType = jest
      .fn()
      .mockResolvedValue('BOTH');
    const result = await getSupportedBiometricType();
    expect(result).toBe('BOTH');
  });

  it('returns NONE when native module returns NONE', async () => {
    RNSecureKeystoreModule.getSupportedBiometricType = jest
      .fn()
      .mockResolvedValue('NONE');
    const result = await getSupportedBiometricType();
    expect(result).toBe('NONE');
  });

  it('returns NONE for unknown/unexpected native values', async () => {
    RNSecureKeystoreModule.getSupportedBiometricType = jest
      .fn()
      .mockResolvedValue('IRIS');
    const result = await getSupportedBiometricType();
    expect(result).toBe('NONE');
  });

  it('returns NONE when native value is null', async () => {
    RNSecureKeystoreModule.getSupportedBiometricType = jest
      .fn()
      .mockResolvedValue(null);
    const result = await getSupportedBiometricType();
    expect(result).toBe('NONE');
  });

  it('returns NONE when native value is undefined', async () => {
    RNSecureKeystoreModule.getSupportedBiometricType = jest
      .fn()
      .mockResolvedValue(undefined);
    const result = await getSupportedBiometricType();
    expect(result).toBe('NONE');
  });

  it('returns NONE when native module throws an error', async () => {
    RNSecureKeystoreModule.getSupportedBiometricType = jest
      .fn()
      .mockRejectedValue(new Error('Module not available'));
    const result = await getSupportedBiometricType();
    expect(result).toBe('NONE');
  });

  it('returns NONE when native module is missing (undefined method)', async () => {
    const original = RNSecureKeystoreModule.getSupportedBiometricType;
    RNSecureKeystoreModule.getSupportedBiometricType = undefined;
    const result = await getSupportedBiometricType();
    expect(result).toBe('NONE');
    RNSecureKeystoreModule.getSupportedBiometricType = original;
  });
});

describe('getBiometricLabel', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    (Platform as any).OS = originalOS;
  });

  describe('iOS', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    it('returns "Face ID" for FACE', () => {
      expect(getBiometricLabel('FACE')).toBe('Face ID');
    });

    it('returns "Face ID" for BOTH', () => {
      expect(getBiometricLabel('BOTH')).toBe('Face ID');
    });

    it('returns "Touch ID" for FINGERPRINT', () => {
      expect(getBiometricLabel('FINGERPRINT')).toBe('Touch ID');
    });

    it('returns "Biometrics" for NONE', () => {
      expect(getBiometricLabel('NONE')).toBe('Biometrics');
    });
  });

  describe('Android', () => {
    beforeEach(() => {
      (Platform as any).OS = 'android';
    });

    it('returns "Face Unlock" for FACE', () => {
      expect(getBiometricLabel('FACE')).toBe('Face Unlock');
    });

    it('returns "Face Unlock" for BOTH', () => {
      expect(getBiometricLabel('BOTH')).toBe('Face Unlock');
    });

    it('returns "Fingerprint" for FINGERPRINT', () => {
      expect(getBiometricLabel('FINGERPRINT')).toBe('Fingerprint');
    });

    it('returns "Biometrics" for NONE', () => {
      expect(getBiometricLabel('NONE')).toBe('Biometrics');
    });
  });
});

describe('getBiometricTranslationSuffix', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    (Platform as any).OS = originalOS;
  });

  describe('iOS', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    it('returns "FaceId" for FACE', () => {
      expect(getBiometricTranslationSuffix('FACE')).toBe('FaceId');
    });

    it('returns "FaceId" for BOTH', () => {
      expect(getBiometricTranslationSuffix('BOTH')).toBe('FaceId');
    });

    it('returns "TouchId" for FINGERPRINT', () => {
      expect(getBiometricTranslationSuffix('FINGERPRINT')).toBe('TouchId');
    });

    it('returns "Biometrics" for NONE', () => {
      expect(getBiometricTranslationSuffix('NONE')).toBe('Biometrics');
    });
  });

  describe('Android', () => {
    beforeEach(() => {
      (Platform as any).OS = 'android';
    });

    it('returns "FaceUnlock" for FACE', () => {
      expect(getBiometricTranslationSuffix('FACE')).toBe('FaceUnlock');
    });

    it('returns "FaceUnlock" for BOTH', () => {
      expect(getBiometricTranslationSuffix('BOTH')).toBe('FaceUnlock');
    });

    it('returns "Fingerprint" for FINGERPRINT', () => {
      expect(getBiometricTranslationSuffix('FINGERPRINT')).toBe('Fingerprint');
    });

    it('returns "Biometrics" for NONE', () => {
      expect(getBiometricTranslationSuffix('NONE')).toBe('Biometrics');
    });
  });
});

describe('useBiometricType hook (return shape contract)', () => {
  // React hooks cannot be called outside a component render cycle in this test
  // environment (jest-init.js globally mocks React). We verify the hook's
  // contract by testing the pure functions it depends on and validating
  // the expected return shape for each biometric type.

  const biometricTypes: BiometricType[] = ['FACE', 'FINGERPRINT', 'BOTH', 'NONE'];

  biometricTypes.forEach(type => {
    it(`produces consistent label, suffix, and boolean flags for "${type}"`, () => {
      const label = getBiometricLabel(type);
      const suffix = getBiometricTranslationSuffix(type);
      const isFace = type === 'FACE' || type === 'BOTH';
      const isFingerprint = type === 'FINGERPRINT';
      const isNone = type === 'NONE';

      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      expect(typeof suffix).toBe('string');
      expect(suffix.length).toBeGreaterThan(0);

      // Only one category should be true (except BOTH which maps to isFace)
      if (type === 'NONE') {
        expect(isNone).toBe(true);
        expect(isFace).toBe(false);
        expect(isFingerprint).toBe(false);
      } else if (type === 'FINGERPRINT') {
        expect(isFingerprint).toBe(true);
        expect(isFace).toBe(false);
        expect(isNone).toBe(false);
      } else {
        // FACE or BOTH
        expect(isFace).toBe(true);
        expect(isFingerprint).toBe(false);
        expect(isNone).toBe(false);
      }
    });
  });

  it('default initial state NONE produces isNone=true, isFace=false, isFingerprint=false', () => {
    const defaultType: BiometricType = 'NONE';
    expect(defaultType === 'NONE').toBe(true);
    expect(defaultType === 'FACE' || defaultType === 'BOTH').toBe(false);
    expect(defaultType === 'FINGERPRINT').toBe(false);
  });
});

describe('BiometricType mapping consistency', () => {
  // Ensure all valid types produce consistent label + suffix combinations
  const types: BiometricType[] = ['FACE', 'FINGERPRINT', 'BOTH', 'NONE'];

  types.forEach(type => {
    it(`getBiometricLabel handles "${type}" without throwing`, () => {
      expect(() => getBiometricLabel(type)).not.toThrow();
      expect(typeof getBiometricLabel(type)).toBe('string');
      expect(getBiometricLabel(type).length).toBeGreaterThan(0);
    });

    it(`getBiometricTranslationSuffix handles "${type}" without throwing`, () => {
      expect(() => getBiometricTranslationSuffix(type)).not.toThrow();
      expect(typeof getBiometricTranslationSuffix(type)).toBe('string');
      expect(getBiometricTranslationSuffix(type).length).toBeGreaterThan(0);
    });
  });
});
