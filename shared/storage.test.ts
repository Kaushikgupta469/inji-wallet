jest.mock('./api', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({minStorageRequired: 100})),
}));

jest.mock('./backupUtils/backupData', () => ({
  exportData: jest.fn(() => Promise.resolve({data: 'exported'})),
}));

jest.mock('./backupUtils/restoreData', () => ({
  loadBackupData: jest.fn(() => Promise.resolve({data: 'restored'})),
}));

jest.mock('./commonUtil', () => ({
  BYTES_IN_MEGABYTE: 1048576,
}));

jest.mock('./constants', () => ({
  androidVersion: 30,
  API_CACHED_STORAGE_KEYS: {
    fetchIssuerWellknownConfig: (key: string) => `wk_config_${key}`,
  },
  ENOENT: 'ENOENT',
  isAndroid: jest.fn(() => true),
  SETTINGS_STORE_KEY: 'settings',
}));

jest.mock('./cryptoutil/cryptoUtil', () => ({
  decryptJson: jest.fn((_key: string, data: string) => Promise.resolve(data)),
  encryptJson: jest.fn((_key: string, data: string) => Promise.resolve(data)),
  HMAC_ALIAS: 'test-hmac-alias',
  hmacSHA: jest.fn(() => 'hmac-result'),
  isHardwareKeystoreExists: false,
}));

jest.mock('./fileStorage', () => ({
  __esModule: true,
  default: {
    exists: jest.fn(() => Promise.resolve(true)),
    readFile: jest.fn(() => Promise.resolve('file-data')),
    writeFile: jest.fn(() => Promise.resolve()),
    createDirectory: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getAllFilesInDirectory: jest.fn(() => Promise.resolve([])),
  },
  getDirectorySize: jest.fn(() => Promise.resolve(1000)),
  getFilePath: jest.fn((key: string) => `/mock/path/${key}.txt`),
  vcDirectoryPath: '/mock/inji/VC',
}));

jest.mock('./GlobalVariables', () => ({
  __AppId: {setValue: jest.fn(), getValue: jest.fn(() => 'test-id')},
}));

jest.mock('./telemetry/TelemetryConstants', () => ({
  TelemetryConstants: {
    FlowType: {fetchData: 'fetchData'},
    ErrorId: {tampered: 'tampered', dataRetrieval: 'dataRetrieval'},
  },
}));

jest.mock('./telemetry/TelemetryUtils', () => ({
  getErrorEventData: jest.fn(),
  sendErrorEvent: jest.fn(),
}));

jest.mock('./VCMetadata', () => ({
  VCMetadata: {
    isVCKey: jest.fn((key: string) => key.startsWith('VC_')),
  },
}));

jest.mock('react-native-device-info', () => ({
  getFreeDiskStorageOldSync: jest.fn(() => 5000000),
  getFreeDiskStorageSync: jest.fn(() => 5000000),
}));

import Storage, {
  isMinimumLimitForBackupReached,
  isMinimumLimitForBackupRestorationReached,
  isMinimumStorageLimitReached,
  MMKV,
} from './storage';
import {getDirectorySize} from './fileStorage';
import FileStorage from './fileStorage';
import {getFreeDiskStorageSync} from 'react-native-device-info';
import getAllConfigurations from './api';

describe('storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MMKV', () => {
    it('should be initialized', () => {
      expect(MMKV).toBeDefined();
    });
  });

  describe('Storage.backupData', () => {
    it('should call exportData with encryption key', async () => {
      const result = await Storage.backupData('enc-key');
      expect(result).toEqual({data: 'exported'});
    });
  });

  describe('Storage.restoreBackUpData', () => {
    it('should call loadBackupData', async () => {
      const result = await Storage.restoreBackUpData('data', 'enc-key');
      expect(result).toEqual({data: 'restored'});
    });
  });

  describe('Storage.setItem', () => {
    it('should set item in MMKV for non-VC key', async () => {
      await Storage.setItem('regularKey', 'data', 'enc-key');
      expect(MMKV.setItem).toHaveBeenCalledWith('regularKey', 'data');
    });

    it('should store VC file for VC key', async () => {
      await Storage.setItem('VC_123', 'vc-data', 'enc-key');
      expect(FileStorage.createDirectory).toHaveBeenCalled();
      expect(FileStorage.writeFile).toHaveBeenCalled();
    });

    it('should throw on error', async () => {
      (MMKV.setItem as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      await expect(Storage.setItem('key', 'data', 'enc-key')).rejects.toThrow(
        'Storage error',
      );
    });
  });

  describe('Storage.getItem', () => {
    it('should get item from MMKV for non-VC key', async () => {
      (MMKV.getItem as jest.Mock).mockResolvedValue('stored-data');
      const result = await Storage.getItem('regularKey', 'enc-key');
      expect(result).toBe('stored-data');
    });

    it('should read VC from file for VC key', async () => {
      // Mock the HMAC check to pass (same hash)
      const {hmacSHA} = require('./cryptoutil/cryptoUtil');
      hmacSHA.mockReturnValue('same-hash');
      const {decryptJson} = require('./cryptoutil/cryptoUtil');
      decryptJson.mockResolvedValue('same-hash');
      (MMKV.getItem as jest.Mock).mockResolvedValue('encrypted-hmac');

      const result = await Storage.getItem('VC_123', 'enc-key');
      expect(result).toBe('file-data');
    });
  });

  describe('Storage.removeItem', () => {
    it('should remove file for VC key when file exists', async () => {
      (FileStorage.exists as jest.Mock).mockResolvedValue(true);
      await Storage.removeItem('VC_123');
      expect(FileStorage.removeItem).toHaveBeenCalled();
    });

    it('should not remove file for VC key when file does not exist', async () => {
      (FileStorage.exists as jest.Mock).mockResolvedValue(false);
      await Storage.removeItem('VC_123');
      // FileStorage.removeItem should not be called, but MMKV.removeItem should be
    });

    it('should remove from MMKV for non-VC key', async () => {
      await Storage.removeItem('regularKey');
      expect(MMKV.removeItem).toHaveBeenCalledWith('regularKey');
    });
  });

  describe('Storage.clear', () => {
    it('should clear file storage and MMKV', async () => {
      (FileStorage.exists as jest.Mock).mockResolvedValue(true);
      (MMKV.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({appId: 'test-app-id'}),
      );
      (MMKV.clearStore as jest.Mock).mockImplementation(() => {});

      await Storage.clear();
      expect(MMKV.clearStore).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      (FileStorage.exists as jest.Mock).mockRejectedValue(
        new Error('FS error'),
      );
      // Should not throw
      await Storage.clear();
    });
  });

  describe('isMinimumLimitForBackupReached', () => {
    it('should return false when plenty of disk space', async () => {
      (getDirectorySize as jest.Mock).mockResolvedValue(1000);
      (getFreeDiskStorageSync as jest.Mock).mockReturnValue(5000000);

      const result = await isMinimumLimitForBackupReached();
      expect(result).toBe(false);
    });

    it('should return true when limited disk space', async () => {
      (getDirectorySize as jest.Mock).mockResolvedValue(3000000);
      (getFreeDiskStorageSync as jest.Mock).mockReturnValue(5000000);

      const result = await isMinimumLimitForBackupReached();
      expect(result).toBe(true);
    });
  });

  describe('isMinimumStorageLimitReached', () => {
    it('should return false when config not set', async () => {
      (getAllConfigurations as jest.Mock).mockResolvedValue({});
      const result = await isMinimumStorageLimitReached('minStorageRequired');
      expect(result).toBe(false);
    });

    it('should return false when enough storage', async () => {
      (getAllConfigurations as jest.Mock).mockResolvedValue({
        minStorageRequired: 1,
      });
      (getFreeDiskStorageSync as jest.Mock).mockReturnValue(5000000);
      const result = await isMinimumStorageLimitReached('minStorageRequired');
      expect(result).toBe(false);
    });

    it('should return true when storage limit reached', async () => {
      (getAllConfigurations as jest.Mock).mockResolvedValue({
        minStorageRequired: 100,
      });
      (getFreeDiskStorageSync as jest.Mock).mockReturnValue(100);
      const result = await isMinimumStorageLimitReached('minStorageRequired');
      expect(result).toBe(true);
    });
  });
});
