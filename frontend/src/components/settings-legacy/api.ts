import { buildApiUrl } from '../../utils/api';
import type {
  ScanResponse,
  SettingsResponse,
  TestResponse,
  UpdateSettingsRequest,
  UpdateSettingsResponse,
} from '../../types';
import type { AuthInfo, FontInfo } from './types';

export const fetchAllSettingsApi = async (): Promise<SettingsResponse> => {
  const response = await fetch(buildApiUrl('/api/settings/v2'));
  if (!response.ok) throw new Error('Failed to fetch settings');
  return response.json();
};

export const fetchAuthStatusApi = async (): Promise<AuthInfo> => {
  const response = await fetch(buildApiUrl('/api/settings/auth/status'));
  if (!response.ok) throw new Error('Failed to fetch auth status');
  return response.json();
};

export const generatePreviewApi = async (text: string): Promise<string> => {
  const response = await fetch(buildApiUrl('/api/settings/font/preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate preview: ${errorText}`);
  }
  const data = await response.json();
  return data.image;
};

export const uploadFontApi = async (file: File): Promise<FontInfo> => {
  const formData = new FormData();
  formData.append('font', file);

  const response = await fetch(buildApiUrl('/api/settings/font'), {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Upload failed');
  }

  const data = await response.json();
  return data.font;
};

export const deleteFontApi = async (): Promise<void> => {
  const response = await fetch(buildApiUrl('/api/settings/font'), {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Delete failed');
};

export const scanDevicesApi = async (): Promise<ScanResponse> => {
  const response = await fetch(buildApiUrl('/api/printer/scan'), {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Scan request failed');
  return response.json();
};

export const testPrinterApi = async (macAddress: string): Promise<TestResponse> => {
  const response = await fetch(buildApiUrl('/api/printer/test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mac_address: macAddress }),
  });
  return response.json();
};

export const saveSettingsApi = async (
  payload: UpdateSettingsRequest,
): Promise<UpdateSettingsResponse> => {
  const response = await fetch(buildApiUrl('/api/settings/v2'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  return response.json();
};
