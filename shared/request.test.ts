import NetInfo from '@react-native-community/netinfo';

// Mock constants
jest.mock('./constants', () => ({
  MIMOTO_BASE_URL: 'https://mock-mimoto.example.com',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
}));

jest.mock('./GlobalVariables', () => ({
  __AppId: {getValue: jest.fn(() => 'test-app-id')},
}));

jest.mock('./openId4VCI/Utils', () => ({
  ErrorMessage: {NETWORK_REQUEST_FAILED: 'Network request failed'},
}));

import {request, BackendResponseError} from './request';

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  describe('BackendResponseError', () => {
    it('should create error with name and message', () => {
      const err = new BackendResponseError('ERR_001', 'Something failed');
      expect(err.name).toBe('ERR_001');
      expect(err.message).toBe('Something failed');
      expect(err instanceof Error).toBe(true);
    });
  });

  describe('successful requests', () => {
    it('should make a GET request and return JSON', async () => {
      const mockResponse = {response: {data: 'test'}};
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await request('GET', '/v1/test');
      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://mock-mimoto.example.com/v1/test',
        expect.objectContaining({method: 'GET'}),
      );
    });

    it('should make a POST request with body', async () => {
      const body = {key: 'value'};
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({response: 'ok'}),
      });

      await request('POST', '/v1/test', body);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    });

    it('should add X-AppId header for mimoto paths', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({response: 'ok'}),
      });

      await request('GET', '/v1/mimoto/test');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-AppId': 'test-app-id',
          }),
        }),
      );
    });

    it('should not add X-AppId for non-mimoto paths', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({response: 'ok'}),
      });

      await request('GET', '/v1/test');
      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['X-AppId']).toBeUndefined();
    });

    it('should use full URL if path starts with https://', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({response: 'ok'}),
      });

      await request('GET', 'https://external.api.com/data');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://external.api.com/data',
        expect.any(Object),
      );
    });

    it('should use custom headers when provided', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({response: 'ok'}),
      });

      await request('GET', '/test', undefined, undefined, {
        Authorization: 'Bearer token',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {Authorization: 'Bearer token'},
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP error status >= 400', async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        json: () => Promise.resolve({message: 'Not Found'}),
      });

      await expect(request('GET', '/v1/test')).rejects.toThrow('Not Found');
    });

    it('should handle object error in response', async () => {
      mockFetch.mockResolvedValue({
        status: 500,
        json: () =>
          Promise.resolve({error: {code: 'ERR', detail: 'Server error'}}),
      });

      await expect(request('GET', '/v1/test')).rejects.toThrow();
    });

    it('should throw BackendResponseError for structured errors', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () =>
          Promise.resolve({
            errors: [{errorCode: 'ERR_001', errorMessage: 'Structured error'}],
          }),
      });

      await expect(request('GET', '/v1/test')).rejects.toThrow(
        'Structured error',
      );
    });

    it('should throw on invalid JSON response', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(request('GET', '/v1/test')).rejects.toThrow();
    });

    it('should check internet connection on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(request('GET', '/v1/test')).rejects.toThrow();
      expect(NetInfo.fetch).toHaveBeenCalled();
    });

    it('should throw no internet error when disconnected', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: false,
        isInternetReachable: false,
      });

      await expect(request('GET', '/v1/test')).rejects.toThrow(
        'No internet connection',
      );
    });
  });

  describe('timeout handling', () => {
    it('should use abort controller with timeout', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        json: () => Promise.resolve({response: 'ok'}),
      });

      await request('GET', '/v1/test', undefined, undefined, undefined, 5000);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({signal: expect.any(Object)}),
      );
    });

    it('should throw REQUEST_TIMEOUT on abort error', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      await expect(
        request('GET', '/v1/test', undefined, undefined, undefined, 100),
      ).rejects.toThrow('REQUEST_TIMEOUT');
    });
  });
});
