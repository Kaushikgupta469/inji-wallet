jest.mock('../GlobalVariables', () => ({
  __AppId: {getValue: jest.fn(() => 'test-app-id')},
}));
jest.mock('../../machines/openID4VP/openID4VPServices', () => ({
  signatureSuite: 'Ed25519Signature2018',
}));

import {NativeModules, NativeEventEmitter} from 'react-native';
import VciClient from './VciClient';

// Setup mock InjiVciClient on NativeModules
NativeModules.InjiVciClient = {
  init: jest.fn(),
  sendProofFromJS: jest.fn(),
  sendSelectedCredentialsForVPSharingFromJS: jest.fn(),
  sendVPTokenSigningResultFromJS: jest.fn(),
  sendAuthCodeFromJS: jest.fn(),
  sendTxCodeFromJS: jest.fn(),
  sendIssuerTrustResponseFromJS: jest.fn(),
  sendTokenResponseFromJS: jest.fn(),
  getIssuerMetadata: jest.fn(() =>
    Promise.resolve(JSON.stringify({name: 'Test Issuer'})),
  ),
  requestCredentialByOffer: jest.fn(() =>
    Promise.resolve(
      JSON.stringify({
        credential: 'cred-data',
        credentialConfigurationId: 'config-id',
        credentialIssuer: 'https://issuer.example.com',
      }),
    ),
  ),
  requestCredentialFromTrustedIssuer: jest.fn(() =>
    Promise.resolve(
      JSON.stringify({
        credential: 'cred-data',
        credentialConfigurationId: 'config-id',
        credentialIssuer: 'https://issuer.example.com',
      }),
    ),
  ),
  abortPresentationFlowFromJS: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

describe('VciClient', () => {
  let client: VciClient;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton
    (VciClient as any).instance = undefined;
    client = VciClient.getInstance();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = VciClient.getInstance();
      const instance2 = VciClient.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should call init on creation', () => {
      expect(NativeModules.InjiVciClient.init).toHaveBeenCalledWith(
        'test-app-id',
      );
    });
  });

  describe('sendProof', () => {
    it('should call sendProofFromJS', async () => {
      await client.sendProof('jwt-token');
      expect(NativeModules.InjiVciClient.sendProofFromJS).toHaveBeenCalledWith(
        'jwt-token',
      );
    });
  });

  describe('sendSelectedCredentialsForVPSharing', () => {
    it('should call sendSelectedCredentialsForVPSharingFromJS', async () => {
      const creds = {desc1: {ldp_vc: ['cred1']}};
      await client.sendSelectedCredentialsForVPSharing(creds as any);
      expect(
        NativeModules.InjiVciClient.sendSelectedCredentialsForVPSharingFromJS,
      ).toHaveBeenCalledWith(creds);
    });
  });

  describe('sendSignedVP', () => {
    it('should call sendVPTokenSigningResultFromJS', () => {
      const result = {signed: 'data'};
      client.sendSignedVP(result);
      expect(
        NativeModules.InjiVciClient.sendVPTokenSigningResultFromJS,
      ).toHaveBeenCalledWith(result);
    });
  });

  describe('sendAuthCode', () => {
    it('should call sendAuthCodeFromJS', async () => {
      await client.sendAuthCode('auth-code-123');
      expect(
        NativeModules.InjiVciClient.sendAuthCodeFromJS,
      ).toHaveBeenCalledWith('auth-code-123');
    });
  });

  describe('sendTxCode', () => {
    it('should call sendTxCodeFromJS', async () => {
      await client.sendTxCode('tx-code-456');
      expect(NativeModules.InjiVciClient.sendTxCodeFromJS).toHaveBeenCalledWith(
        'tx-code-456',
      );
    });
  });

  describe('sendIssuerConsent', () => {
    it('should call sendIssuerTrustResponseFromJS with true', async () => {
      await client.sendIssuerConsent(true);
      expect(
        NativeModules.InjiVciClient.sendIssuerTrustResponseFromJS,
      ).toHaveBeenCalledWith(true);
    });

    it('should call sendIssuerTrustResponseFromJS with false', async () => {
      await client.sendIssuerConsent(false);
      expect(
        NativeModules.InjiVciClient.sendIssuerTrustResponseFromJS,
      ).toHaveBeenCalledWith(false);
    });
  });

  describe('sendTokenResponse', () => {
    it('should call sendTokenResponseFromJS', async () => {
      await client.sendTokenResponse('{"token":"value"}');
      expect(
        NativeModules.InjiVciClient.sendTokenResponseFromJS,
      ).toHaveBeenCalledWith('{"token":"value"}');
    });
  });

  describe('getIssuerMetadata', () => {
    it('should return parsed metadata', async () => {
      const result = await client.getIssuerMetadata(
        'https://issuer.example.com',
      );
      expect(result).toEqual({name: 'Test Issuer'});
    });
  });

  describe('requestCredentialByOffer', () => {
    it('should request credential and return parsed result', async () => {
      const result = await client.requestCredentialByOffer(
        'offer-uri',
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );
      expect(result.credential).toBeDefined();
      expect(result.credentialConfigurationId).toBe('config-id');
      expect(result.credentialIssuer).toBe('https://issuer.example.com');
    });

    it('should throw on native error', async () => {
      NativeModules.InjiVciClient.requestCredentialByOffer.mockRejectedValueOnce(
        new Error('Native error'),
      );
      await expect(
        client.requestCredentialByOffer(
          'offer',
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
        ),
      ).rejects.toThrow('Native error');
    });
  });

  describe('requestCredentialFromTrustedIssuer', () => {
    it('should request credential and return parsed result', async () => {
      const result = await client.requestCredentialFromTrustedIssuer(
        'https://issuer.example.com',
        'config-id',
        {clientId: 'wallet'},
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
        jest.fn(),
      );
      expect(result.credential).toBeDefined();
      expect(result.credentialIssuer).toBe('https://issuer.example.com');
    });

    it('should throw on native error', async () => {
      NativeModules.InjiVciClient.requestCredentialFromTrustedIssuer.mockRejectedValueOnce(
        new Error('Native error'),
      );
      await expect(
        client.requestCredentialFromTrustedIssuer(
          'https://issuer.example.com',
          'config',
          {},
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
          jest.fn(),
        ),
      ).rejects.toThrow('Native error');
    });
  });

  describe('abortPresentationFlow', () => {
    it('should call abortPresentationFlowFromJS', () => {
      client.abortPresentationFlow({code: 'ERR_001', message: 'Test error'});
      expect(
        NativeModules.InjiVciClient.abortPresentationFlowFromJS,
      ).toHaveBeenCalledWith('ERR_001', 'Test error');
    });
  });
});
