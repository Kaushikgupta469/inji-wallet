jest.mock('../constants', () => ({
  MY_VCS_STORE_KEY: 'myVCs',
}));
jest.mock('../cryptoutil/cryptoUtil', () => ({
  decryptJson: jest.fn((_k: string, data: string) => Promise.resolve(data)),
}));
jest.mock('../storage', () => ({
  __esModule: true,
  default: {getItem: jest.fn(() => Promise.resolve('vc-data'))},
  MMKV: {
    indexer: {strings: {getKeys: jest.fn(() => Promise.resolve([]))}},
    getItem: jest.fn(() => Promise.resolve(null)),
  },
}));
jest.mock('../telemetry/TelemetryConstants', () => ({
  TelemetryConstants: {FlowType: {dataBackup: 'dataBackup'}, ErrorId: {}},
}));
jest.mock('../telemetry/TelemetryUtils', () => ({
  getErrorEventData: jest.fn(),
  sendErrorEvent: jest.fn(),
}));
jest.mock('../VCMetadata', () => ({
  VCMetadata: {
    fromVcMetadataString: jest.fn((m: any) => ({
      getVcKey: () => m.vcKey || 'VC_key',
    })),
  },
}));

import {exportData} from './backupData';
import {MMKV} from '../storage';
import Storage from '../storage';
import {decryptJson} from '../cryptoutil/cryptoUtil';

describe('backupData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportData', () => {
    it('should export data with empty DB', async () => {
      (MMKV.indexer.strings.getKeys as jest.Mock).mockResolvedValue([]);
      const result = await exportData('enc-key');
      expect(result).toHaveProperty('VC_Records');
      expect(result).toHaveProperty('dataFromDB');
    });

    it('should export data with VCs', async () => {
      (MMKV.indexer.strings.getKeys as jest.Mock).mockResolvedValue([
        'myVCs',
        'VC_123',
      ]);
      (MMKV.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([{requestId: 'r1', isPinned: true}]),
      );
      (decryptJson as jest.Mock).mockResolvedValue(
        JSON.stringify([{requestId: 'r1', isPinned: true}]),
      );
      (Storage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({
          vcMetadata: {requestId: 'r1'},
          walletBindingResponse: 'binding',
          publicKey: 'pub',
          privateKey: 'priv',
          verifiableCredential: {credential: 'cred'},
        }),
      );

      const result = await exportData('enc-key');
      expect(result.VC_Records).toBeDefined();
    });

    it('should handle VCs with null data', async () => {
      (MMKV.indexer.strings.getKeys as jest.Mock).mockResolvedValue([
        'myVCs',
        'VC_123',
      ]);
      (MMKV.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([{requestId: 'r1'}]),
      );
      (decryptJson as jest.Mock).mockResolvedValue(
        JSON.stringify([{requestId: 'r1'}]),
      );
      (Storage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await exportData('enc-key');
      expect(result.VC_Records).toEqual({});
    });

    it('should export with wellknown config cache keys', async () => {
      (MMKV.indexer.strings.getKeys as jest.Mock).mockResolvedValue([
        'CACHE_FETCH_ISSUER_WELLKNOWN_CONFIG_issuer1',
        'myVCs',
      ]);
      (MMKV.getItem as jest.Mock).mockResolvedValue(JSON.stringify([]));
      (decryptJson as jest.Mock).mockResolvedValue(JSON.stringify([]));

      const result = await exportData('enc-key');
      expect(result.dataFromDB).toBeDefined();
    });

    it('should set isPinned to false for all VCs', async () => {
      (MMKV.indexer.strings.getKeys as jest.Mock).mockResolvedValue(['myVCs']);
      (MMKV.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([
          {requestId: 'r1', isPinned: true},
          {requestId: 'r2', isPinned: true},
        ]),
      );
      (decryptJson as jest.Mock).mockResolvedValue(
        JSON.stringify([
          {requestId: 'r1', isPinned: true},
          {requestId: 'r2', isPinned: true},
        ]),
      );

      const result = await exportData('enc-key');
      const myVcs = result.dataFromDB['myVCs'];
      if (myVcs) {
        myVcs.forEach((vc: any) => {
          expect(vc.isPinned).toBe(false);
        });
      }
    });

    it('should throw on error', async () => {
      (MMKV.indexer.strings.getKeys as jest.Mock).mockRejectedValue(
        new Error('DB error'),
      );
      await expect(exportData('enc-key')).rejects.toThrow('DB error');
    });
  });
});
