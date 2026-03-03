jest.mock('../../shared/CloudBackupAndRestoreUtils', () => ({
  isSignedInResult: {},
}));
jest.mock('../../shared/openId4VCI/Utils', () => ({
  ErrorMessage: {
    NO_INTERNET: 'NO_INTERNET',
    REQUEST_TIMEDOUT: 'REQUEST_TIMEDOUT',
  },
  OIDCErrors: {
    OIDC_CONFIG_ERROR_PREFIX: 'OIDC_CONFIG_ERROR',
  },
}));
jest.mock('../../shared/error/BiometricCancellationError', () => ({
  BiometricCancellationError: class BiometricCancellationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'BiometricCancellationError';
    }
  },
}));
jest.mock('../../shared/vcjs/verifyCredential', () => ({
  VerificationErrorType: {NETWORK_ERROR: 'NETWORK_ERROR'},
}));
jest.mock('../../shared/constants', () => ({
  AuthorizationType: {
    OPENID4VP_PRESENTATION: 'OPENID4VP_PRESENTATION',
    IMPLICIT: 'IMPLICIT',
  },
}));

import {IssuersGuards} from './IssuersGuards';
import {BiometricCancellationError} from '../../shared/error/BiometricCancellationError';

describe('IssuersGuards', () => {
  let guards: ReturnType<typeof IssuersGuards>;

  beforeAll(() => {
    guards = IssuersGuards();
  });

  describe('isVerificationPendingBecauseOfNetworkIssue', () => {
    it('should return true when error is NETWORK_ERROR', () => {
      const event = {data: new Error('NETWORK_ERROR')};
      expect(guards.isVerificationPendingBecauseOfNetworkIssue({}, event)).toBe(
        true,
      );
    });

    it('should return false for other errors', () => {
      const event = {data: new Error('OTHER_ERROR')};
      expect(guards.isVerificationPendingBecauseOfNetworkIssue({}, event)).toBe(
        false,
      );
    });
  });

  describe('isSignedIn', () => {
    it('should return true when signed in', () => {
      expect(guards.isSignedIn({}, {data: {isSignedIn: true}})).toBe(true);
    });

    it('should return false when not signed in', () => {
      expect(guards.isSignedIn({}, {data: {isSignedIn: false}})).toBe(false);
    });
  });

  describe('hasKeyPair', () => {
    it('should return true when publicKey exists', () => {
      expect(guards.hasKeyPair({publicKey: 'key123'})).toBe(true);
    });

    it('should return false when publicKey is empty', () => {
      expect(guards.hasKeyPair({publicKey: ''})).toBe(false);
    });

    it('should return false when publicKey is undefined', () => {
      expect(guards.hasKeyPair({})).toBe(false);
    });
  });

  describe('isKeyTypeNotFound', () => {
    it('should return true when keyType is empty', () => {
      expect(guards.isKeyTypeNotFound({keyType: ''})).toBe(true);
    });

    it('should return false when keyType is set', () => {
      expect(guards.isKeyTypeNotFound({keyType: 'RS256'})).toBe(false);
    });
  });

  describe('isInternetConnected', () => {
    it('should return true when connected', () => {
      expect(guards.isInternetConnected({}, {data: {isConnected: true}})).toBe(
        true,
      );
    });

    it('should return false when not connected', () => {
      expect(guards.isInternetConnected({}, {data: {isConnected: false}})).toBe(
        false,
      );
    });
  });

  describe('canSelectIssuerAgain', () => {
    it('should return true for OIDC config error', () => {
      const ctx = {errorMessage: 'OIDC_CONFIG_ERROR: something went wrong'};
      expect(guards.canSelectIssuerAgain(ctx)).toBe(true);
    });

    it('should return true for timeout error', () => {
      const ctx = {errorMessage: 'REQUEST_TIMEDOUT'};
      expect(guards.canSelectIssuerAgain(ctx)).toBe(true);
    });

    it('should return false for other errors', () => {
      const ctx = {errorMessage: 'GENERIC_ERROR'};
      expect(guards.canSelectIssuerAgain(ctx)).toBe(false);
    });
  });

  describe('shouldFetchIssuersAgain', () => {
    it('should return true when issuers list is empty', () => {
      expect(guards.shouldFetchIssuersAgain({issuers: []})).toBe(true);
    });

    it('should return false when issuers exist', () => {
      expect(guards.shouldFetchIssuersAgain({issuers: [{id: '1'}]})).toBe(
        false,
      );
    });
  });

  describe('hasUserCancelledBiometric', () => {
    it('should return true for BiometricCancellationError', () => {
      const error = new BiometricCancellationError('cancelled');
      expect(guards.hasUserCancelledBiometric({}, {data: error})).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(
        guards.hasUserCancelledBiometric({}, {data: new Error('other')}),
      ).toBe(false);
    });
  });

  describe('isCredentialOfferFlow', () => {
    it('should return true when isCredentialOfferFlow is true', () => {
      expect(guards.isCredentialOfferFlow({isCredentialOfferFlow: true})).toBe(
        true,
      );
    });

    it('should return false when isCredentialOfferFlow is false', () => {
      expect(guards.isCredentialOfferFlow({isCredentialOfferFlow: false})).toBe(
        false,
      );
    });
  });

  describe('isIssuerIdInTrustedIssuers', () => {
    it('should return the event data', () => {
      expect(guards.isIssuerIdInTrustedIssuers({}, {data: true})).toBe(true);
      expect(guards.isIssuerIdInTrustedIssuers({}, {data: false})).toBe(false);
    });
  });

  describe('isPresentationAuthorization', () => {
    it('should return true for OPENID4VP_PRESENTATION', () => {
      expect(
        guards.isPresentationAuthorization({
          authorizationType: 'OPENID4VP_PRESENTATION',
        }),
      ).toBe(true);
    });

    it('should return false for IMPLICIT', () => {
      expect(
        guards.isPresentationAuthorization({authorizationType: 'IMPLICIT'}),
      ).toBe(false);
    });
  });
});
