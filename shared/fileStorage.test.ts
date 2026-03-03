import {
  DocumentDirectoryPath,
  exists,
  mkdir,
  readDir,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'react-native-fs';
import * as RNZipArchive from 'react-native-zip-archive';

jest.mock('./commonUtil', () => ({
  getBackupFileName: jest.fn(() => 'backup_1234567890'),
}));

import FileStorage, {
  vcDirectoryPath,
  backupDirectoryPath,
  zipFilePath,
  getFilePath,
  getBackupFilePath,
  compressAndRemoveFile,
  cleanupLocalBackups,
  unZipAndRemoveFile,
  getDirectorySize,
  writeToBackupFile,
  isVCStorageInitialised,
} from './fileStorage';

describe('fileStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Path constants and helpers', () => {
    it('should define vcDirectoryPath', () => {
      expect(vcDirectoryPath).toContain('inji/VC');
    });

    it('should define backupDirectoryPath', () => {
      expect(backupDirectoryPath).toContain('inji/backup');
    });

    it('should generate zip file path', () => {
      const path = zipFilePath('testFile');
      expect(path).toContain('inji/backup/testFile.zip');
    });

    it('should generate file path from key', () => {
      const path = getFilePath('my-vc-key');
      expect(path).toContain('inji/VC/my-vc-key.txt');
    });

    it('should generate backup file path with default extension', () => {
      const path = getBackupFilePath('backup_001');
      expect(path).toContain('inji/backup/backup_001.injibackup');
    });

    it('should generate backup file path with custom extension', () => {
      const path = getBackupFilePath('backup_001', '.zip');
      expect(path).toContain('inji/backup/backup_001.zip');
    });
  });

  describe('FileStorage class', () => {
    it('should read a file', async () => {
      (readFile as jest.Mock).mockResolvedValue('file-content');
      const result = await FileStorage.readFile('/test/path');
      expect(result).toBe('file-content');
      expect(readFile).toHaveBeenCalledWith('/test/path', 'utf8');
    });

    it('should get all files in directory', async () => {
      const mockFiles = [{name: 'file1.txt'}, {name: 'file2.txt'}];
      (readDir as jest.Mock).mockResolvedValue(mockFiles);
      const result = await FileStorage.getAllFilesInDirectory('/test/dir');
      expect(result).toEqual(mockFiles);
    });

    it('should write a file', async () => {
      (writeFile as jest.Mock).mockResolvedValue(undefined);
      await FileStorage.writeFile('/test/path', 'data');
      expect(writeFile).toHaveBeenCalledWith('/test/path', 'data', 'utf8');
    });

    it('should create a directory', async () => {
      (mkdir as jest.Mock).mockResolvedValue(undefined);
      await FileStorage.createDirectory('/test/dir');
      expect(mkdir).toHaveBeenCalledWith('/test/dir');
    });

    it('should check if path exists', async () => {
      (exists as jest.Mock).mockResolvedValue(true);
      const result = await FileStorage.exists('/test/path');
      expect(result).toBe(true);
    });

    it('should remove item', async () => {
      (unlink as jest.Mock).mockResolvedValue(undefined);
      await FileStorage.removeItem('/test/path');
      expect(unlink).toHaveBeenCalledWith('/test/path');
    });

    it('should remove item if it exists', async () => {
      (exists as jest.Mock).mockResolvedValue(true);
      (unlink as jest.Mock).mockResolvedValue(undefined);
      await FileStorage.removeItemIfExist('/test/path');
      expect(exists).toHaveBeenCalledWith('/test/path');
      expect(unlink).toHaveBeenCalledWith('/test/path');
    });

    it('should not remove item if does not exist', async () => {
      (exists as jest.Mock).mockResolvedValue(false);
      await FileStorage.removeItemIfExist('/test/path');
      expect(unlink).not.toHaveBeenCalled();
    });

    it('should get info', async () => {
      const mockStat = {size: 1024, isDirectory: () => true};
      (stat as jest.Mock).mockResolvedValue(mockStat);
      const result = await FileStorage.getInfo('/test/path');
      expect(result.size).toBe(1024);
    });
  });

  describe('compressAndRemoveFile', () => {
    it('should compress and remove file', async () => {
      (RNZipArchive.zip as jest.Mock).mockResolvedValue('/compressed.zip');
      (unlink as jest.Mock).mockResolvedValue(undefined);
      (stat as jest.Mock).mockResolvedValue({size: 500});

      const result = await compressAndRemoveFile('testFile');
      expect(result.size).toBe(500);
      expect(RNZipArchive.zip).toHaveBeenCalled();
    });
  });

  describe('cleanupLocalBackups', () => {
    it('should remove all backup files if directory exists', async () => {
      (exists as jest.Mock).mockResolvedValue(true);
      (readDir as jest.Mock).mockResolvedValue([{name: 'backup_1.zip'}]);
      (unlink as jest.Mock).mockResolvedValue(undefined);

      await cleanupLocalBackups();
      expect(unlink).toHaveBeenCalled();
    });

    it('should do nothing if backup directory does not exist', async () => {
      (exists as jest.Mock).mockResolvedValue(false);
      await cleanupLocalBackups();
      expect(readDir).not.toHaveBeenCalled();
    });
  });

  describe('unZipAndRemoveFile', () => {
    it('should unzip and remove the zip file', async () => {
      (RNZipArchive.unzip as jest.Mock).mockResolvedValue('/extracted');
      (unlink as jest.Mock).mockResolvedValue(undefined);

      const result = await unZipAndRemoveFile('testBackup');
      expect(result).toBe('/extracted');
      expect(RNZipArchive.unzip).toHaveBeenCalled();
    });
  });

  describe('getDirectorySize', () => {
    it('should calculate total directory size', async () => {
      (readDir as jest.Mock).mockResolvedValue([
        {size: 100},
        {size: 200},
        {size: 300},
      ]);

      const result = await getDirectorySize('/test/dir');
      expect(result).toBe(600);
    });

    it('should return 0 for empty directory', async () => {
      (readDir as jest.Mock).mockResolvedValue([]);
      const result = await getDirectorySize('/test/dir');
      expect(result).toBe(0);
    });
  });

  describe('writeToBackupFile', () => {
    it('should create directory and write file', async () => {
      (exists as jest.Mock).mockResolvedValue(false);
      (mkdir as jest.Mock).mockResolvedValue(undefined);
      (writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await writeToBackupFile({key: 'value'});
      expect(typeof result).toBe('string');
      expect(result).toContain('backup_');
      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });

    it('should remove old backup files before writing', async () => {
      (exists as jest.Mock).mockResolvedValue(true);
      (readDir as jest.Mock).mockResolvedValue([
        {name: 'old_backup.injibackup'},
      ]);
      (unlink as jest.Mock).mockResolvedValue(undefined);
      (mkdir as jest.Mock).mockResolvedValue(undefined);
      (writeFile as jest.Mock).mockResolvedValue(undefined);

      await writeToBackupFile({key: 'value'});
      expect(unlink).toHaveBeenCalled();
    });
  });

  describe('isVCStorageInitialised', () => {
    it('should return true if VC directory exists and is directory', async () => {
      (stat as jest.Mock).mockResolvedValue({isDirectory: () => true});
      const result = await isVCStorageInitialised();
      expect(result).toBe(true);
    });

    it('should return false if stat throws an error', async () => {
      (stat as jest.Mock).mockRejectedValue(new Error('not found'));
      const result = await isVCStorageInitialised();
      expect(result).toBe(false);
    });

    it('should return false if path is not a directory', async () => {
      (stat as jest.Mock).mockResolvedValue({isDirectory: () => false});
      const result = await isVCStorageInitialised();
      expect(result).toBe(false);
    });
  });
});
