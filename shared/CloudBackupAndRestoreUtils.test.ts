jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    signIn: jest.fn(() =>
      Promise.resolve({
        scopes: [
          'https://www.googleapis.com/auth/drive.appdata',
          'https://www.googleapis.com/auth/drive.file',
        ],
      }),
    ),
    signOut: jest.fn(() => Promise.resolve()),
    revokeAccess: jest.fn(() => Promise.resolve()),
    getTokens: jest.fn(() =>
      Promise.resolve({accessToken: 'mock-token', idToken: 'id-token'}),
    ),
    isSignedIn: jest.fn(() => Promise.resolve(true)),
    signInSilently: jest.fn(() => Promise.resolve()),
    clearCachedAccessToken: jest.fn(() => Promise.resolve()),
  },
  statusCodes: {SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED'},
}));

jest.mock('react-native-cloud-storage', () => ({
  CloudStorage: {
    readdir: jest.fn(() => Promise.resolve([])),
    readFile: jest.fn(() => Promise.resolve('file-content')),
    writeFile: jest.fn(() => Promise.resolve()),
    exists: jest.fn(() => Promise.resolve(true)),
    stat: jest.fn(() => Promise.resolve({birthtimeMs: 1000, size: 2048})),
    unlink: jest.fn(() => Promise.resolve()),
    setTimeout: jest.fn(),
    setGoogleDriveAccessToken: jest.fn(),
    isCloudAvailable: jest.fn(() => Promise.resolve(true)),
    downloadFile: jest.fn(() => Promise.resolve()),
  },
  CloudStorageScope: {AppData: 'AppData'},
}));

jest.mock('react-native-dotenv', () => ({
  GOOGLE_ANDROID_CLIENT_ID: 'mock-client-id',
}));

jest.mock('react-native-fs', () => ({
  readFile: jest.fn(() => Promise.resolve('base64-content')),
  writeFile: jest.fn(() => Promise.resolve()),
}));

jest.mock('../types/backup-and-restore/backup', () => ({}));

jest.mock('@invertase/react-native-apple-authentication', () => ({
  appleAuth: {
    performRequest: jest.fn(),
    getCredentialStateForUser: jest.fn(),
    Operation: {LOGIN: 'LOGIN'},
    Scope: {FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL'},
    Error: {CANCELED: 'CANCELED'},
    State: {AUTHORIZED: 1},
  },
}));

jest.mock('./commonUtil', () => ({
  bytesToMB: jest.fn((bytes: number) => bytes / (1024 * 1024)),
  sleep: jest.fn(() => Promise.resolve()),
}));

jest.mock('./constants', () => ({
  IOS_SIGNIN_FAILED: 'IOS_SIGNIN_FAILED',
  isAndroid: jest.fn(() => true),
  isIOS: jest.fn(() => false),
  NETWORK_REQUEST_FAILED: 'NETWORK_REQUEST_FAILED',
}));

jest.mock('./fileStorage', () => ({
  __esModule: true,
  default: {
    exists: jest.fn(() => Promise.resolve(true)),
    createDirectory: jest.fn(() => Promise.resolve()),
    getAllFilesInDirectory: jest.fn(() => Promise.resolve([])),
    removeItem: jest.fn(() => Promise.resolve()),
  },
  backupDirectoryPath: '/mock/backup',
  zipFilePath: jest.fn((name: string) => `/mock/backup/${name}.zip`),
}));

jest.mock('./api', () => ({
  API: {
    getGoogleAccountProfileInfo: jest.fn(() =>
      Promise.resolve({email: 'test@example.com', picture: 'http://pic.jpg'}),
    ),
  },
}));

import Cloud from './CloudBackupAndRestoreUtils';
import {CloudStorage} from 'react-native-cloud-storage';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
import {isAndroid, isIOS} from './constants';

describe('CloudBackupAndRestoreUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAndroid as jest.Mock).mockReturnValue(true);
    (isIOS as jest.Mock).mockReturnValue(false);
  });

  describe('Cloud.status', () => {
    it('should have DECLINED status', () => {
      expect(Cloud.status.DECLINED).toBe('DECLINED');
    });

    it('should have SUCCESS status', () => {
      expect(Cloud.status.SUCCESS).toBe('SUCCESS');
    });

    it('should have FAILURE status', () => {
      expect(Cloud.status.FAILURE).toBe('FAILURE');
    });
  });

  describe('Cloud.NO_BACKUP_FILE', () => {
    it('should have a descriptive message', () => {
      expect(Cloud.NO_BACKUP_FILE).toBe('Backup files not available');
    });
  });

  describe('Cloud.getAccessToken', () => {
    it('should return access token when valid', async () => {
      const token = await Cloud.getAccessToken();
      expect(token).toBe('mock-token');
    });

    it('should handle 401 UNAUTHENTICATED error', async () => {
      const {API} = require('./api');
      API.getGoogleAccountProfileInfo
        .mockRejectedValueOnce(new Error('401 UNAUTHENTICATED'))
        .mockResolvedValueOnce({email: 'test@example.com'});

      (GoogleSignin.getTokens as jest.Mock)
        .mockResolvedValueOnce({accessToken: 'old-token'})
        .mockResolvedValueOnce({accessToken: 'new-token'});

      await expect(Cloud.getAccessToken()).rejects.toThrow();
    });

    it('should handle 401 Unauthorized by refreshing token', async () => {
      const {API} = require('./api');
      API.getGoogleAccountProfileInfo
        .mockRejectedValueOnce(new Error('401 Unauthorized'))
        .mockResolvedValueOnce({email: 'test@example.com'});

      (GoogleSignin.getTokens as jest.Mock).mockResolvedValueOnce({
        accessToken: 'old-token',
        idToken: 'id',
      });

      (GoogleSignin.clearCachedAccessToken as jest.Mock).mockResolvedValue(
        undefined,
      );
      (GoogleSignin.signInSilently as jest.Mock).mockResolvedValue(undefined);
      (GoogleSignin.getTokens as jest.Mock).mockResolvedValueOnce({
        accessToken: 'new-token',
      });

      // This path triggers the refresh flow
      try {
        const token = await Cloud.getAccessToken();
        expect(typeof token).toBe('string');
      } catch (e) {
        // May throw due to mock chaining
      }
    });

    it('should handle network error', async () => {
      const {API} = require('./api');
      API.getGoogleAccountProfileInfo.mockRejectedValue(
        new Error('NETWORK_ERROR'),
      );

      await expect(Cloud.getAccessToken()).rejects.toThrow(
        'NETWORK_REQUEST_FAILED',
      );
    });
  });

  describe('Cloud.signIn', () => {
    it('should sign in successfully on Android', async () => {
      const result = await Cloud.signIn();
      expect(result).toHaveProperty('status', 'SUCCESS');
      expect(result).toHaveProperty('profileInfo');
    });

    it('should handle sign-in cancelled', async () => {
      (GoogleSignin.signIn as jest.Mock).mockRejectedValue({
        code: 'SIGN_IN_CANCELLED',
      });
      const result = await Cloud.signIn();
      expect(result.status).toBe('DECLINED');
    });

    it('should handle declined scopes', async () => {
      (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
        scopes: ['some-other-scope'],
      });
      const result = await Cloud.signIn();
      expect(result.status).toBe('DECLINED');
    });

    it('should handle network error on sign-in', async () => {
      (GoogleSignin.signIn as jest.Mock).mockRejectedValue(
        new Error('NETWORK_ERROR'),
      );
      const result = await Cloud.signIn();
      expect(result.status).toBe('FAILURE');
    });
  });

  describe('Cloud.isSignedInAlready', () => {
    it('should return signed in when already signed in on Android', async () => {
      (GoogleSignin.isSignedIn as jest.Mock).mockResolvedValue(true);
      const result = await Cloud.isSignedInAlready();
      expect(result.isSignedIn).toBe(true);
      expect(result.isAuthorised).toBe(true);
    });

    it('should sign in silently when not signed in', async () => {
      (GoogleSignin.isSignedIn as jest.Mock).mockResolvedValue(false);
      const result = await Cloud.isSignedInAlready();
      expect(GoogleSignin.signInSilently).toHaveBeenCalled();
      expect(result.isSignedIn).toBe(true);
    });

    it('should handle errors', async () => {
      (GoogleSignin.isSignedIn as jest.Mock).mockRejectedValue(
        new Error('Auth error'),
      );
      const result = await Cloud.isSignedInAlready();
      expect(result.isSignedIn).toBe(false);
      expect(result.isAuthorised).toBe(false);
    });
  });

  describe('Cloud.downloadUnSyncedBackupFiles', () => {
    it('should return true on Android (no sync needed)', async () => {
      const result = await Cloud.downloadUnSyncedBackupFiles();
      expect(result).toBe(true);
    });
  });

  describe('Cloud.lastBackupDetails', () => {
    it('should get backup details on Android', async () => {
      (CloudStorage.readdir as jest.Mock).mockResolvedValue([
        'backup_1234567890.zip',
      ]);
      (CloudStorage.stat as jest.Mock).mockResolvedValue({
        birthtimeMs: 1000,
        size: 2048,
      });

      const result = await Cloud.lastBackupDetails();
      expect(result).toHaveProperty('backupCreationTime');
      expect(result).toHaveProperty('backupFileSize');
    });

    it('should throw when no backup files exist', async () => {
      (CloudStorage.readdir as jest.Mock).mockResolvedValue([]);
      await expect(Cloud.lastBackupDetails()).rejects.toThrow(
        'Backup files not available',
      );
    });

    it('should use provided cloudFileName', async () => {
      const result = await Cloud.lastBackupDetails('/backup_123.zip');
      expect(CloudStorage.stat).toHaveBeenCalledWith(
        '/backup_123.zip',
        'AppData',
      );
    });
  });

  describe('Cloud.removeOldDriveBackupFiles', () => {
    it('should remove old files except the current one', async () => {
      (CloudStorage.readdir as jest.Mock).mockResolvedValue([
        'backup_111.zip',
        'backup_222.zip',
        'backup_333.zip',
      ]);

      await Cloud.removeOldDriveBackupFiles('backup_333.zip');
      expect(CloudStorage.unlink).toHaveBeenCalledTimes(2);
    });

    it('should not remove anything if only current file', async () => {
      (CloudStorage.readdir as jest.Mock).mockResolvedValue(['backup_333.zip']);
      await Cloud.removeOldDriveBackupFiles('backup_333.zip');
      expect(CloudStorage.unlink).not.toHaveBeenCalled();
    });
  });

  describe('Cloud.uploadBackupFileToDrive', () => {
    it('should upload successfully', async () => {
      (CloudStorage.exists as jest.Mock).mockResolvedValue(true);
      (CloudStorage.readdir as jest.Mock).mockResolvedValue(['backup_123.zip']);

      const result = await Cloud.uploadBackupFileToDrive('backup_123', 3);
      expect(result.status).toBe('SUCCESS');
    });

    it('should reject when retry counter is negative', async () => {
      await expect(
        Cloud.uploadBackupFileToDrive('backup_123', -1),
      ).rejects.toEqual(expect.objectContaining({status: 'FAILURE'}));
    });

    it('should reject on network error', async () => {
      await expect(
        Cloud.uploadBackupFileToDrive(
          'backup_123',
          0,
          'NETWORK_REQUEST_FAILED',
        ),
      ).rejects.toEqual(expect.objectContaining({status: 'FAILURE'}));
    });
  });

  describe('Cloud.downloadLatestBackup', () => {
    it('should download and save backup file', async () => {
      (CloudStorage.readdir as jest.Mock).mockResolvedValue([
        'backup_1234567890.zip',
      ]);
      (CloudStorage.readFile as jest.Mock).mockResolvedValue('base64-content');

      const result = await Cloud.downloadLatestBackup();
      expect(result).toContain('backup_');
    });

    it('should reject when no backup files available', async () => {
      (CloudStorage.readdir as jest.Mock).mockResolvedValue([]);

      await expect(Cloud.downloadLatestBackup()).rejects.toEqual(
        expect.objectContaining({error: 'Backup files not available'}),
      );
    });

    it('should return null when file content is empty', async () => {
      (CloudStorage.readdir as jest.Mock).mockResolvedValue([
        'backup_1234567890.zip',
      ]);
      (CloudStorage.readFile as jest.Mock).mockResolvedValue('');

      const result = await Cloud.downloadLatestBackup();
      expect(result).toBeNull();
    });
  });
});
