import type React from 'react';
import { toast } from 'sonner';
import type { BluetoothDevice } from '../../types';
import { buildApiUrl } from '../../utils/api';
import { readErrorMessage } from './http';

type AuxActionDeps = {
  webServerPort: number;
  getSettingValue: (key: string) => string;
  setScanning: React.Dispatch<React.SetStateAction<boolean>>;
  setBluetoothDevices: React.Dispatch<React.SetStateAction<BluetoothDevice[]>>;
  fetchPrinterStatus: () => Promise<void>;
  setTesting: React.Dispatch<React.SetStateAction<boolean>>;
  setLoadingSystemPrinters: React.Dispatch<React.SetStateAction<boolean>>;
  setSystemPrinters: React.Dispatch<React.SetStateAction<any[]>>;
  fetchAuthStatus: () => Promise<void>;
  setIsControlDisabled: React.Dispatch<React.SetStateAction<boolean>>;
};

const sortBluetoothDevices = (devices: BluetoothDevice[]): BluetoothDevice[] => {
  return devices.sort((a, b) => {
    if (a.name && !b.name) return -1;
    if (!a.name && b.name) return 1;
    if (a.name && b.name) return a.name.localeCompare(b.name);
    return 0;
  });
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const createAuxActions = (deps: AuxActionDeps) => {
  const {
    webServerPort,
    getSettingValue,
    setScanning,
    setBluetoothDevices,
    fetchPrinterStatus,
    setTesting,
    setLoadingSystemPrinters,
    setSystemPrinters,
    fetchAuthStatus,
    setIsControlDisabled,
  } = deps;

  const resolveExternalBaseUrl = (): string => {
    if (typeof window === 'undefined') {
      return `http://localhost:${webServerPort}`;
    }
    const proto = window.location.protocol;
    if (proto === 'http:' || proto === 'https:') {
      return window.location.origin;
    }
    return `http://localhost:${webServerPort}`;
  };

  const openExternal = (path: string) => {
    try {
      let base = resolveExternalBaseUrl();
      let targetPath = path;
      if (import.meta.env.DEV && path.startsWith('/overlay')) {
        base = import.meta.env.VITE_OVERLAY_DEV_ORIGIN || 'http://localhost:5174';
        targetPath = path.replace(/^\/overlay(?=\/|$)/, '') || '/';
      }
      const url = new URL(targetPath, base).toString();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('[openExternal] Failed:', error);
    }
  };

  const handleOpenPresent = async () => {
    openExternal('/overlay/present');
  };

  const handleOpenPresentDebug = async () => {
    openExternal('/overlay/present?debug=true');
  };

  const handleOpenOverlay = async () => {
    openExternal('/overlay/');
  };

  const handleOpenOverlayDebug = async () => {
    openExternal('/overlay/?debug=true');
  };

  const handleScanDevices = async () => {
    setScanning(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/scan'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      const rawDevices = Array.isArray(payload?.Devices) ? payload.Devices : payload?.devices;
      const bluetoothDevices: BluetoothDevice[] = Array.isArray(rawDevices) ? rawDevices.map((d: any) => ({
        mac_address: d.mac_address || d.MACAddress,
        name: d.name || d.Name,
        last_seen: d.last_seen || d.LastSeen,
      })) : [];

      const currentAddress = getSettingValue('PRINTER_ADDRESS');
      let updatedDevices = [...bluetoothDevices];
      if (currentAddress && !bluetoothDevices.find((d) => d.mac_address === currentAddress)) {
        updatedDevices.unshift({
          mac_address: currentAddress,
          name: '(現在の設定)',
          last_seen: new Date().toISOString(),
        });
      }

      const sortedDevices = sortBluetoothDevices(updatedDevices);
      setBluetoothDevices(sortedDevices);
      toast.success(`${bluetoothDevices.length}台のデバイスが見つかりました`);
      await fetchPrinterStatus();
    } catch (err: any) {
      toast.error('デバイススキャンに失敗しました: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleTestConnection = async () => {
    const printerType = getSettingValue('PRINTER_TYPE') || 'bluetooth';
    if (printerType === 'bluetooth') {
      const printerAddress = getSettingValue('PRINTER_ADDRESS');
      if (!printerAddress) {
        toast.error('プリンターアドレスが選択されていません');
        return;
      }
    } else if (printerType === 'usb') {
      const usbPrinterName = getSettingValue('USB_PRINTER_NAME');
      if (!usbPrinterName) {
        toast.error('USBプリンター名が選択されていません');
        return;
      }
    }

    setTesting(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/test-print'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success('プリンターとの接続に成功しました');
    } catch (err: any) {
      toast.error('接続テスト失敗: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleRefreshSystemPrinters = async () => {
    setLoadingSystemPrinters(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/system-printers'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      const printers = Array.isArray(payload?.printers) ? payload.printers : [];
      setSystemPrinters(printers);
      if (printers.length > 0) {
        toast.success(`${printers.length}台のプリンターが見つかりました`);
      } else {
        toast.info('システムプリンターが見つかりませんでした');
      }
    } catch (err: any) {
      console.error('Failed to get system printers:', err);
      toast.error('システムプリンターの取得に失敗しました: ' + err.message);
      setSystemPrinters([]);
    } finally {
      setLoadingSystemPrinters(false);
    }
  };

  const handleTokenRefresh = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/twitch/refresh-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Token refresh failed');
      }

      if (result.success) {
        toast.success('トークンを更新しました');
        await fetchAuthStatus();
      } else {
        throw new Error(result.error || 'トークンの更新に失敗しました');
      }
    } catch (err: any) {
      toast.error(`トークンの更新に失敗しました: ${err.message}`);
    }
  };

  const sendMusicControlCommand = async (command: string, data?: any) => {
    try {
      setIsControlDisabled(true);
      const url = buildApiUrl(`/api/music/control/${command}`);
      const payload = data ?? {};
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(
          detail
            ? `Control command failed: ${response.status} (${detail})`
            : `Control command failed: ${response.status}`,
        );
      }
    } catch (error) {
      console.error('Music control error:', error);
      toast.error(`コマンドエラー: ${error}`);
    } finally {
      setTimeout(() => setIsControlDisabled(false), 300);
    }
  };

  const handleSeek = async (position: number) => {
    await sendMusicControlCommand('seek', { position });
  };

  return {
    formatTime,
    handleOpenPresent,
    handleOpenPresentDebug,
    handleOpenOverlay,
    handleOpenOverlayDebug,
    handleScanDevices,
    handleTestConnection,
    handleRefreshSystemPrinters,
    handleTokenRefresh,
    sendMusicControlCommand,
    handleSeek,
  };
};
