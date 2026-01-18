import type { BackupFile } from './types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const BACKUP_FILENAME = 'feels-backup.json';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export async function listAppDataFiles(
  accessToken: string
): Promise<DriveFile[]> {
  const response = await fetch(
    `${DRIVE_API_BASE}/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.status}`);
  }

  const data = await response.json();
  return data.files || [];
}

export async function findBackupFile(
  accessToken: string
): Promise<{ id: string; modifiedTime: string } | null> {
  const files = await listAppDataFiles(accessToken);
  const backup = files.find((f) => f.name === BACKUP_FILENAME);
  return backup ? { id: backup.id, modifiedTime: backup.modifiedTime } : null;
}

export async function uploadBackup(
  accessToken: string,
  backupData: BackupFile,
  existingFileId?: string
): Promise<string> {
  const metadata = {
    name: BACKUP_FILENAME,
    mimeType: 'application/json',
    ...(existingFileId ? {} : { parents: ['appDataFolder'] }),
  };

  const body = JSON.stringify(backupData, null, 2);

  const boundary = '-------feels_backup_boundary';
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;

  const url = existingFileId
    ? `${DRIVE_UPLOAD_BASE}/files/${existingFileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`;

  const response = await fetch(url, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload backup: ${response.status}`);
  }

  const data = await response.json();
  return data.id;
}

export async function downloadBackup(
  accessToken: string,
  fileId: string
): Promise<BackupFile> {
  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download backup: ${response.status}`);
  }

  return response.json();
}
