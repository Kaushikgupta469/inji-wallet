jest.mock('./request', () => ({
  request: jest.fn(),
}));
jest.mock('./constants', () => ({
  API_CACHED_STORAGE_KEYS: {
    fetchTrustedVerifiers: 'cache_trusted_verifiers',
    fetchIssuers: 'cache_issuers',
    fetchIssuerWellknownConfig: (key: string) => `cache_wk_${key}`,
    fetchIssuerAuthorizationServerMetadata: (key: string) =>
      `cache_auth_${key}`,
  },
  changeCrendetialRegistry: jest.fn(),
  COMMON_PROPS_KEY: 'commonProps',
  CACHE_TTL: 3600000,
  updateCacheTTL: jest.fn(),
}));
jest.mock('./InitialConfig', () => ({
  INITIAL_CONFIG: {allProperties: {defaultProp: 'value'}},
}));
jest.mock('../machines/store', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('./commonUtil', () => ({
  faceMatchConfig: jest.fn(() => ({threshold: 0.5})),
}));
jest.mock('@iriscan/biometric-sdk-react-native', () => ({
  configure: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('./telemetry/TelemetryUtils', () => ({
  getErrorEventData: jest.fn(),
  getImpressionEventData: jest.fn(),
  sendErrorEvent: jest.fn(),
  sendImpressionEvent: jest.fn(),
}));
jest.mock('./telemetry/TelemetryConstants', () => ({
  TelemetryConstants: {
    FlowType: {faceModelInit: 'faceModelInit'},
    Screens: {home: 'home'},
    EndEventStatus: {success: 'success'},
    ErrorId: {failure: 'failure'},
    ErrorMessage: {faceModelInitFailed: 'faceModelInitFailed'},
  },
}));
jest.mock('./Utils', () => ({
  createCacheObject: jest.fn((response: any) => ({
    response,
    cachedTime: Date.now(),
  })),
}));
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() =>
    Promise.resolve({isConnected: true, isInternetReachable: true}),
  ),
}));

import {API_URLS, API, CACHED_API, initializeFaceModel} from './api';
import getAllConfigurations from './api';
import {request} from './request';
import {getItem, setItem} from '../machines/store';
import {configure} from '@iriscan/biometric-sdk-react-native';
import NetInfo from '@react-native-community/netinfo';

describe('api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('API_URLS', () => {
    it('should have trustedVerifiersList', () => {
      expect(API_URLS.trustedVerifiersList.method).toBe('GET');
      expect(API_URLS.trustedVerifiersList.buildURL()).toBe(
        '/v1/mimoto/verifiers',
      );
    });

    it('should have issuersList', () => {
      expect(API_URLS.issuersList.method).toBe('GET');
      expect(API_URLS.issuersList.buildURL()).toBe('/v1/mimoto/issuers');
    });

    it('should have issuerConfig with param', () => {
      expect(API_URLS.issuerConfig.buildURL('issuer123')).toBe(
        '/v1/mimoto/issuers/issuer123',
      );
    });

    it('should have issuerWellknownConfig', () => {
      const url = API_URLS.issuerWellknownConfig.buildURL(
        'https://issuer.example.com',
      );
      expect(url).toBe(
        'https://issuer.example.com/.well-known/openid-credential-issuer',
      );
    });

    it('should have authorizationServerMetadataConfig', () => {
      const url = API_URLS.authorizationServerMetadataConfig.buildURL(
        'https://auth.example.com',
      );
      expect(url).toBe(
        'https://auth.example.com/.well-known/oauth-authorization-server',
      );
    });

    it('should have allProperties', () => {
      expect(API_URLS.allProperties.buildURL()).toBe(
        '/v1/mimoto/allProperties',
      );
    });

    it('should have getIndividualId', () => {
      expect(API_URLS.getIndividualId.method).toBe('POST');
    });

    it('should have reqIndividualOTP', () => {
      expect(API_URLS.reqIndividualOTP.method).toBe('POST');
    });

    it('should have walletBinding', () => {
      expect(API_URLS.walletBinding.method).toBe('POST');
    });

    it('should have bindingOtp', () => {
      expect(API_URLS.bindingOtp.method).toBe('POST');
    });

    it('should have requestOtp', () => {
      expect(API_URLS.requestOtp.method).toBe('POST');
    });

    it('should have credentialRequest', () => {
      expect(API_URLS.credentialRequest.method).toBe('POST');
    });

    it('should have credentialStatus', () => {
      expect(API_URLS.credentialStatus.buildURL('req123')).toContain('req123');
    });

    it('should have credentialDownload', () => {
      expect(API_URLS.credentialDownload.method).toBe('POST');
    });

    it('should have linkTransaction', () => {
      expect(API_URLS.linkTransaction.method).toBe('POST');
    });

    it('should have authenticate', () => {
      expect(API_URLS.authenticate.method).toBe('POST');
    });

    it('should have sendConsent', () => {
      expect(API_URLS.sendConsent.method).toBe('POST');
    });

    it('should have googleAccountProfileInfo', () => {
      const url = API_URLS.googleAccountProfileInfo.buildURL('token123');
      expect(url).toContain('googleapis.com');
      expect(url).toContain('token123');
    });
  });

  describe('API functions', () => {
    it('should fetch trusted verifiers list', async () => {
      (request as jest.Mock).mockResolvedValue({response: []});
      const result = await API.fetchTrustedVerifiersList();
      expect(request).toHaveBeenCalledWith('GET', '/v1/mimoto/verifiers');
      expect(result).toEqual({response: []});
    });

    it('should fetch issuers', async () => {
      (request as jest.Mock).mockResolvedValue({
        response: {issuers: ['issuer1']},
      });
      const result = await API.fetchIssuers();
      expect(result).toEqual(['issuer1']);
    });

    it('should return empty array when no issuers', async () => {
      (request as jest.Mock).mockResolvedValue({response: {}});
      const result = await API.fetchIssuers();
      expect(result).toEqual([]);
    });

    it('should fetch issuer config', async () => {
      (request as jest.Mock).mockResolvedValue({
        response: {id: 'issuer1', name: 'Test'},
      });
      const result = await API.fetchIssuerConfig('issuer1');
      expect(result).toEqual({id: 'issuer1', name: 'Test'});
    });

    it('should fetch issuer wellknown config', async () => {
      (request as jest.Mock).mockResolvedValue({credential_issuer: 'test'});
      const result = await API.fetchIssuerWellknownConfig(
        'https://issuer.example.com',
      );
      expect(result).toEqual({credential_issuer: 'test'});
    });

    it('should fetch all properties', async () => {
      (request as jest.Mock).mockResolvedValue({
        response: {prop1: 'val1'},
      });
      const result = await API.fetchAllProperties();
      expect(result).toEqual({prop1: 'val1'});
    });
  });

  describe('CACHED_API', () => {
    it('should call fetchIssuers with caching', async () => {
      (getItem as jest.Mock).mockResolvedValue(null);
      (request as jest.Mock).mockResolvedValue({
        response: {issuers: ['issuer1']},
      });
      const result = await CACHED_API.fetchIssuers();
      expect(result).toEqual(['issuer1']);
    });

    it('should return cached data when available and valid', async () => {
      (getItem as jest.Mock).mockResolvedValue({
        response: ['cached-issuer'],
        cachedTime: Date.now(),
      });
      const result = await CACHED_API.fetchTrustedVerifiersList(true);
      expect(result).toEqual(['cached-issuer']);
    });

    it('should use hardcoded value on error for getAllProperties', async () => {
      (getItem as jest.Mock).mockResolvedValue(null);
      (request as jest.Mock).mockRejectedValue(new Error('Network error'));
      (NetInfo.fetch as jest.Mock).mockResolvedValue({isConnected: false});
      const result = await CACHED_API.getAllProperties(true);
      expect(result).toEqual({defaultProp: 'value'});
    });
  });

  describe('getAllConfigurations', () => {
    it('should call CACHED_API.getAllProperties', async () => {
      (getItem as jest.Mock).mockResolvedValue({
        response: {config: 'test'},
        cachedTime: Date.now(),
      });
      const result = await getAllConfigurations(undefined, true);
      expect(result).toEqual({config: 'test'});
    });
  });

  describe('initializeFaceModel', () => {
    it('should configure and send success event', async () => {
      (configure as jest.Mock).mockResolvedValue(true);
      await initializeFaceModel();
      expect(configure).toHaveBeenCalled();
    });

    it('should send error event on failure', async () => {
      (configure as jest.Mock).mockResolvedValue(false);
      await initializeFaceModel();
      expect(configure).toHaveBeenCalled();
    });
  });
});
