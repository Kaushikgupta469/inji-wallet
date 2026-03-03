jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/Documents',
}));
jest.mock('../constants', () => ({
  MY_VCS_STORE_KEY: 'myVCs',
  EXPIRED_VC_ERROR_CODE: 'EXPIRED',
}));
jest.mock('../cryptoutil/cryptoUtil', () => ({
  decryptJson: jest.fn((_k, d) => Promise.resolve(d)),
  encryptJson: jest.fn((_k, d) => Promise.resolve(d)),
}));
jest.mock('../fileStorage', () => ({
  __esModule: true,
  default: {
    exists: jest.fn(() => Promise.resolve(false)),
    readFile: jest.fn(() => Promise.resolve('123456')),
    writeFile: jest.fn(() => Promise.resolve()),
    removeItemIfExist: jest.fn(() => Promise.resolve()),
    getAllFilesInDirectory: jest.fn(() => Promise.resolve([])),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
  },
  MMKV: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../telemetry/TelemetryConstants', () => ({
  TelemetryConstants: {
    FlowType: {dataRestore: 'dataRestore', dataBackup: 'dataBackup'},
    ErrorId: {failure: 'failure'},
  },
}));
jest.mock('../telemetry/TelemetryUtils', () => ({
  getErrorEventData: jest.fn(),
  sendErrorEvent: jest.fn(),
}));
jest.mock('../VCMetadata', () => ({
  VCMetadata: jest.fn().mockImplementation(meta => ({
    getVcKey: () => `VC_${meta.timestamp}_${meta.requestId}`,
    ...meta,
  })),
}));
jest.mock('../openId4VCI/Utils', () => ({
  verifyCredentialData: jest.fn(() =>
    Promise.resolve({
      isVerified: true,
      isRevoked: 'false',
      verificationErrorCode: '',
    }),
  ),
}));
jest.mock('../vcVerifier/VcVerifier', () => ({
  RevocationStatus: {FALSE: 'false', TRUE: 'true'},
}));

import {loadBackupData} from './restoreData';
import fileStorage from '../fileStorage';
import Storage, {MMKV} from '../storage';
import {encryptJson} from '../cryptoutil/cryptoUtil';

describe('restoreData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadBackupData', () => {
    const backupData = JSON.stringify({
      VC_Records: {},
      dataFromDB: {myVCs: []},
    });

    it('should load backup data with no VCs', async () => {
      (fileStorage.exists as jest.Mock).mockResolvedValue(false);
      await loadBackupData(backupData, 'enc-key');
      expect(fileStorage.removeItemIfExist).toHaveBeenCalled();
    });

    it('should load backup data with VCs', async () => {
      const dataWithVCs = JSON.stringify({
        VC_Records: {
          VC_123: {
            vcMetadata: {requestId: 'r1', timestamp: '100', format: 'ldp_vc'},
            verifiableCredential: {credential: 'cred-data'},
          },
        },
        dataFromDB: {
          myVCs: [{requestId: 'r1', timestamp: '100'}],
        },
      });
      (fileStorage.exists as jest.Mock).mockResolvedValue(false);

      await loadBackupData(dataWithVCs, 'enc-key');
      expect(Storage.setItem).toHaveBeenCalled();
    });

    it('should handle previous backup state', async () => {
      (fileStorage.exists as jest.Mock).mockResolvedValueOnce(true);
      (fileStorage.readFile as jest.Mock).mockResolvedValue('100000');
      (fileStorage.getAllFilesInDirectory as jest.Mock).mockResolvedValue([]);

      await loadBackupData(backupData, 'enc-key');
      expect(fileStorage.readFile).toHaveBeenCalled();
    });

    it('should update wellknown configs', async () => {
      const dataWithConfig = JSON.stringify({
        VC_Records: {},
        dataFromDB: {
          myVCs: [],
          CACHE_FETCH_ISSUER_WELLKNOWN_CONFIG_issuer1: {config: 'data'},
        },
      });
      (fileStorage.exists as jest.Mock).mockResolvedValue(false);

      await loadBackupData(dataWithConfig, 'enc-key');
      expect(encryptJson).toHaveBeenCalled();
    });

    it('should merge with existing VCs in MMKV', async () => {
      (fileStorage.exists as jest.Mock).mockResolvedValue(false);
      (MMKV.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([{requestId: 'existing'}]),
      );

      const data = JSON.stringify({
        VC_Records: {},
        dataFromDB: {myVCs: [{requestId: 'new'}]},
      });

      await loadBackupData(data, 'enc-key');
      expect(MMKV.getItem).toHaveBeenCalled();
    });

    it('should throw on invalid JSON data', async () => {
      (fileStorage.exists as jest.Mock).mockResolvedValue(false);
      await expect(loadBackupData('invalid-json', 'enc-key')).rejects.toThrow();
    });
  });
});
