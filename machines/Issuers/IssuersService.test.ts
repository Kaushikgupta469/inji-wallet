jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({isConnected: true})),
}));
jest.mock('../../shared/CloudBackupAndRestoreUtils', () => ({
  __esModule: true,
  default: {
    isSignedInAlready: jest.fn(() =>
      Promise.resolve({
        isSignedIn: true,
        profileInfo: {email: 'test@test.com'},
      }),
    ),
  },
}));
jest.mock('../../shared/api', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({})),
  CACHED_API: {
    fetchIssuers: jest.fn(() => Promise.resolve([{issuer_id: 'issuer1'}])),
  },
}));
jest.mock('../../shared/cryptoutil/cryptoUtil', () => ({
  fetchKeyPair: jest.fn(() =>
    Promise.resolve({publicKey: 'pub', privateKey: 'priv'}),
  ),
  generateKeyPair: jest.fn(() =>
    Promise.resolve({publicKey: 'pub', privateKey: 'priv'}),
  ),
}));
jest.mock('../../shared/openId4VCI/Utils', () => ({
  constructProofJWT: jest.fn(() => Promise.resolve('proof-jwt')),
  hasKeyPair: jest.fn(() => Promise.resolve(true)),
  updateCredentialInformation: jest.fn((ctx, cred) => ({
    ...cred,
    updated: true,
  })),
  verifyCredentialData: jest.fn(() =>
    Promise.resolve({isVerified: true, verificationErrorCode: ''}),
  ),
}));
jest.mock('../../shared/vciClient/VciClient', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      getIssuerMetadata: jest.fn(() =>
        Promise.resolve({
          credential_endpoint: 'https://cred.endpoint',
          credential_configurations_supported: {config1: {format: 'ldp_vc'}},
        }),
      ),
      requestCredentialFromTrustedIssuer: jest.fn(() =>
        Promise.resolve({
          credential: {credential: 'cred-data'},
          credentialConfigurationId: 'config1',
          credentialIssuer: 'https://issuer.example.com',
        }),
      ),
      requestCredentialByOffer: jest.fn(() =>
        Promise.resolve({
          credential: {credential: 'cred-data'},
          credentialConfigurationId: 'config1',
          credentialIssuer: 'https://issuer.example.com',
        }),
      ),
      sendProof: jest.fn(() => Promise.resolve()),
      sendTxCode: jest.fn(() => Promise.resolve()),
      sendIssuerConsent: jest.fn(() => Promise.resolve()),
      sendTokenResponse: jest.fn(() => Promise.resolve()),
    })),
  },
}));
jest.mock('../store', () => ({
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../shared/constants', () => ({
  API_CACHED_STORAGE_KEYS: {
    fetchIssuerWellknownConfig: (key: string) => `wk_${key}`,
  },
  AuthorizationType: {
    IMPLICIT: 'IMPLICIT',
    OPENID4VP_PRESENTATION: 'OPENID4VP_PRESENTATION',
  },
}));
jest.mock('../../shared/Utils', () => ({
  createCacheObject: jest.fn(data => ({
    response: data,
    cachedTime: Date.now(),
  })),
}));
jest.mock('../../shared/vcjs/verifyCredential', () => ({
  VerificationResult: {},
}));
jest.mock('./IssuersMachine', () => ({}));
jest.mock('@noble/secp256k1', () => ({
  sign: jest.fn(),
}));

import {IssuersService} from './IssuersService';

describe('IssuersService', () => {
  let service: ReturnType<typeof IssuersService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = IssuersService();
  });

  describe('downloadIssuersList', () => {
    it('should fetch issuers list', async () => {
      const result = await service.downloadIssuersList();
      expect(result).toEqual([{issuer_id: 'issuer1'}]);
    });
  });

  describe('checkInternet', () => {
    it('should return network status', async () => {
      const result = await service.checkInternet();
      expect(result).toEqual({isConnected: true});
    });
  });

  describe('downloadIssuerWellknown', () => {
    it('should download and cache wellknown config', async () => {
      const context = {
        selectedIssuer: {credential_issuer_host: 'https://issuer.example.com'},
      };
      const result = await service.downloadIssuerWellknown(context);
      expect(result).toBeDefined();
    });
  });

  describe('getCredentialTypes', () => {
    it('should return credential types from issuer', async () => {
      const context = {
        selectedIssuer: {
          issuer_id: 'issuer1',
          credential_configurations_supported: {
            config1: {format: 'ldp_vc'},
            config2: {format: 'jwt_vc'},
          },
        },
      };
      const result = await service.getCredentialTypes(context);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('config1');
    });

    it('should throw when no credential types found', async () => {
      const context = {
        selectedIssuer: {
          issuer_id: 'issuer1',
          credential_configurations_supported: {},
        },
      };
      await expect(service.getCredentialTypes(context)).rejects.toThrow(
        'No credential type found',
      );
    });
  });

  describe('sendTxCode', () => {
    it('should send tx code', async () => {
      await service.sendTxCode({txCode: '123456'});
      // Verify via mock
    });
  });

  describe('sendConsentGiven', () => {
    it('should send consent as true', async () => {
      await service.sendConsentGiven();
    });
  });

  describe('sendConsentNotGiven', () => {
    it('should send consent as false', async () => {
      await service.sendConsentNotGiven();
    });
  });

  describe('checkIssuerIdInStoredTrustedIssuers', () => {
    it('should check if issuer is trusted', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.RNSecureKeystoreModule.hasAlias = jest.fn(() =>
        Promise.resolve(true),
      );
      const result = await service.checkIssuerIdInStoredTrustedIssuers({
        credentialOfferCredentialIssuer: 'https://issuer.example.com',
      });
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.RNSecureKeystoreModule.hasAlias = jest.fn(() =>
        Promise.reject(new Error('Error')),
      );
      const result = await service.checkIssuerIdInStoredTrustedIssuers({
        credentialOfferCredentialIssuer: 'https://issuer.example.com',
      });
      expect(result).toBe(false);
    });
  });

  describe('addIssuerToTrustedIssuers', () => {
    it('should store issuer as trusted', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.RNSecureKeystoreModule.storeData = jest.fn(() =>
        Promise.resolve(),
      );
      await service.addIssuerToTrustedIssuers({
        credentialOfferCredentialIssuer: 'https://issuer.example.com',
      });
      expect(NativeModules.RNSecureKeystoreModule.storeData).toHaveBeenCalled();
    });
  });

  describe('constructProof', () => {
    it('should construct and send proof JWT', async () => {
      const context = {
        publicKey: 'pub',
        privateKey: 'priv',
        credentialOfferCredentialIssuer: 'https://issuer.example.com',
        keyType: 'RS256',
        wellknownKeyTypes: ['RS256'],
        cNonce: 'test-nonce',
      };
      const result = await service.constructProof(context);
      expect(result).toBe('proof-jwt');
    });
  });

  describe('generateKeyPair', () => {
    it('should generate key pair', async () => {
      const result = await service.generateKeyPair({keyType: 'RS256'});
      expect(result).toEqual({publicKey: 'pub', privateKey: 'priv'});
    });
  });

  describe('getKeyPair', () => {
    it('should throw when keyType is empty', async () => {
      await expect(service.getKeyPair({keyType: ''})).rejects.toThrow(
        'key type not found',
      );
    });

    it('should fetch key pair when exists', async () => {
      const result = await service.getKeyPair({keyType: 'RS256'});
      expect(result).toEqual({publicKey: 'pub', privateKey: 'priv'});
    });
  });

  describe('getSelectedKey', () => {
    it('should return context keyType', async () => {
      const result = await service.getSelectedKey({keyType: 'ES256'});
      expect(result).toBe('ES256');
    });
  });

  describe('verifyCredential', () => {
    it('should verify credential', async () => {
      const context = {
        isCredentialOfferFlow: false,
        verifiableCredential: {credential: 'cred'},
        selectedCredentialType: {format: 'ldp_vc'},
      };
      const result = await service.verifyCredential(context);
      expect(result.isVerified).toBe(true);
    });
  });

  describe('sendTokenResponse', () => {
    it('should send token response', async () => {
      await service.sendTokenResponse({tokenResponse: {access_token: 'token'}});
    });

    it('should throw when tokenResponse is undefined', async () => {
      await expect(
        service.sendTokenResponse({tokenResponse: undefined}),
      ).rejects.toThrow('Could not send token response');
    });
  });

  describe('updateCredential', () => {
    it('should update credential info', async () => {
      const context = {credential: {credential: 'cred'}};
      const result = await service.updateCredential(context);
      expect(result.updated).toBe(true);
    });
  });
});
