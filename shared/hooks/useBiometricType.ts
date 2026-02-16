import {useState, useEffect, useCallback} from 'react';
import {NativeModules, Platform, AppState} from 'react-native';

export type BiometricType = 'FACE' | 'FINGERPRINT' | 'BOTH' | 'NONE';

const {RNSecureKeystoreModule} = NativeModules;

/**
 * Fetches the supported biometric type from the native secure keystore module.
 * Returns "FACE", "FINGERPRINT", "BOTH", or "NONE".
 *
 * Android: Uses PackageManager features + BiometricManager enrollment heuristics
 *   to detect face unlock even on OEMs that use BIOMETRIC_WEAK class.
 * iOS: Uses LAContext.biometryType to reliably detect Face ID vs Touch ID.
 */
export async function getSupportedBiometricType(): Promise<BiometricType> {
  try {
    const type = await RNSecureKeystoreModule.getSupportedBiometricType();
    if (
      type === 'FACE' ||
      type === 'FINGERPRINT' ||
      type === 'BOTH' ||
      type === 'NONE'
    ) {
      return type;
    }
    return 'NONE';
  } catch (e) {
    return 'NONE';
  }
}

/**
 * Returns a user-friendly label for the given biometric type,
 * adapting to the device's OS.
 *
 * iOS: "Face ID" / "Touch ID"
 * Android: "Face Unlock" / "Fingerprint"
 */
export function getBiometricLabel(biometricType: BiometricType): string {
  if (Platform.OS === 'ios') {
    switch (biometricType) {
      case 'FACE':
      case 'BOTH':
        return 'Face ID';
      case 'FINGERPRINT':
        return 'Touch ID';
      default:
        return 'Biometrics';
    }
  } else {
    switch (biometricType) {
      case 'FACE':
      case 'BOTH':
        return 'Face Unlock';
      case 'FINGERPRINT':
        return 'Fingerprint';
      default:
        return 'Biometrics';
    }
  }
}

/**
 * Returns the translation key suffix for the given biometric type + platform.
 * Used to look up adaptive locale strings (e.g., "useFaceId", "unlockFingerprint").
 */
export function getBiometricTranslationSuffix(
  biometricType: BiometricType,
): string {
  if (Platform.OS === 'ios') {
    switch (biometricType) {
      case 'FACE':
      case 'BOTH':
        return 'FaceId';
      case 'FINGERPRINT':
        return 'TouchId';
      default:
        return 'Biometrics';
    }
  } else {
    switch (biometricType) {
      case 'FACE':
      case 'BOTH':
        return 'FaceUnlock';
      case 'FINGERPRINT':
        return 'Fingerprint';
      default:
        return 'Biometrics';
    }
  }
}

/**
 * React hook that fetches the device's supported biometric type on mount
 * AND re-fetches when the app returns to foreground (so icon updates
 * if the user enrolls/removes biometrics in device settings).
 */
export function useBiometricType() {
  const [biometricType, setBiometricType] =
    useState<BiometricType>('NONE');
  const [isLoading, setIsLoading] = useState(true);

  const fetchBiometricType = useCallback(() => {
    getSupportedBiometricType()
      .then(type => {
        setBiometricType(type);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Fetch on mount + fallback timeout if native call never resolves
  useEffect(() => {
    fetchBiometricType();

    // Safety net: if native call hangs or module is missing,
    // stop loading after 2s and fall back to FINGERPRINT (most common default)
    const fallbackTimer = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          setBiometricType('FINGERPRINT');
        }
        return false;
      });
    }, 2000);

    return () => clearTimeout(fallbackTimer);
  }, [fetchBiometricType]);

  // Re-fetch when the app comes back to foreground
  // (user may have enrolled/removed biometrics in device settings)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchBiometricType();
      }
    });
    return () => subscription.remove();
  }, [fetchBiometricType]);

  return {
    biometricType,
    isLoading,
    biometricLabel: getBiometricLabel(biometricType),
    translationSuffix: getBiometricTranslationSuffix(biometricType),
    isFace: biometricType === 'FACE' || biometricType === 'BOTH',
    isFingerprint: biometricType === 'FINGERPRINT',
    isNone: biometricType === 'NONE',
  };
}
