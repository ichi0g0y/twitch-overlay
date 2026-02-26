import type React from 'react';
import { toast } from 'sonner';
import type { TwitchUserInfo } from '../../types';
import { buildApiUrl } from '../../utils/api';
import { readErrorMessage } from './http';

type CoreUiActionDeps = {
  setRefreshingStreamStatus: React.Dispatch<React.SetStateAction<boolean>>;
  setVerifyingTwitch: React.Dispatch<React.SetStateAction<boolean>>;
  setTwitchUserInfo: React.Dispatch<React.SetStateAction<TwitchUserInfo | null>>;
  setReconnectingPrinter: React.Dispatch<React.SetStateAction<boolean>>;
  setTestingPrinter: React.Dispatch<React.SetStateAction<boolean>>;
  setTestingNotification: React.Dispatch<React.SetStateAction<boolean>>;
  setUploadingFont: React.Dispatch<React.SetStateAction<boolean>>;
  setPreviewImage: React.Dispatch<React.SetStateAction<string>>;
  previewText: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  fetchAuthStatus: () => Promise<void>;
  fetchStreamStatus: (showToast?: boolean) => Promise<void>;
  fetchPrinterStatus: () => Promise<void>;
  fetchAllSettings: () => Promise<void>;
  handleSettingChange: (key: string, value: string | boolean | number) => void;
};

export const createCoreUiActions = ({
  setRefreshingStreamStatus,
  setVerifyingTwitch,
  setTwitchUserInfo,
  setReconnectingPrinter,
  setTestingPrinter,
  setTestingNotification,
  setUploadingFont,
  setPreviewImage,
  previewText,
  fileInputRef,
  fetchAuthStatus,
  fetchStreamStatus,
  fetchPrinterStatus,
  fetchAllSettings,
  handleSettingChange,
}: CoreUiActionDeps) => {
  const handleTwitchAuth = async () => {
    try {
      window.open('/auth', '_blank', 'noopener,noreferrer');
      toast.info('ブラウザでTwitchにログインしてください');
      setTimeout(async () => {
        await fetchAuthStatus();
      }, 5000);
    } catch {
      toast.error('認証URLの取得に失敗しました');
    }
  };

  const handleRefreshStreamStatus = async () => {
    setRefreshingStreamStatus(true);
    await fetchStreamStatus(true);
    setRefreshingStreamStatus(false);
  };

  const verifyTwitchConfig = async (options?: { suppressSuccessToast?: boolean }) => {
    const suppressSuccessToast = options?.suppressSuccessToast ?? false;
    setVerifyingTwitch(true);
    try {
      const response = await fetch(buildApiUrl('/api/twitch/verify'));
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const data: TwitchUserInfo = await response.json();
      setTwitchUserInfo(data);
      if (data.verified && !suppressSuccessToast) {
        toast.success(`Twitch連携確認: ${data.display_name}`);
      } else if (data.error) {
        toast.error(`Twitch連携エラー: ${data.error}`);
      }
    } catch (err: any) {
      setTwitchUserInfo({
        id: '',
        login: '',
        display_name: '',
        verified: false,
        error: err?.message || 'Twitch連携の検証に失敗しました',
      });
      toast.error('Twitch連携の検証に失敗しました');
    } finally {
      setVerifyingTwitch(false);
    }
  };

  const handlePrinterReconnect = async () => {
    setReconnectingPrinter(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/reconnect'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success('プリンターに再接続しました');
      await fetchPrinterStatus();
    } catch (err: any) {
      toast.error(`再接続エラー: ${err.message}`);
    } finally {
      setReconnectingPrinter(false);
    }
  };

  const handleTestPrint = async () => {
    setTestingPrinter(true);
    try {
      const response = await fetch(buildApiUrl('/api/printer/test-print'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success('テストプリントを送信しました');
    } catch (err: any) {
      toast.error(`テストプリントエラー: ${err.message}`);
    } finally {
      setTestingPrinter(false);
    }
  };

  const handleTestNotification = async () => {
    setTestingNotification(true);
    try {
      const response = await fetch(buildApiUrl('/api/chat/post'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'WebUI',
          user_id: 'webui-local',
          message: 'テスト通知',
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      toast.success('通知ウィンドウのテスト通知を送信しました');
    } catch (err: any) {
      toast.error(`テスト通知エラー: ${err.message}`);
    } finally {
      setTestingNotification(false);
    }
  };

  const handleFontUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.ttf') && !file.name.endsWith('.otf')) {
      toast.error('フォントファイルは.ttfまたは.otf形式である必要があります');
      return;
    }
    setUploadingFont(true);
    try {
      const form = new FormData();
      form.append('font', file);
      const response = await fetch(buildApiUrl('/api/settings/font'), {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success(`フォント「${file.name}」をアップロードしました`);
      await fetchAllSettings();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      toast.error('フォントのアップロードに失敗しました: ' + err.message);
    } finally {
      setUploadingFont(false);
    }
  };

  const handleDeleteFont = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/font'), { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      toast.success('フォントを削除しました');
      handleSettingChange('FONT_FILENAME', '');
      await fetchAllSettings();
    } catch (err: any) {
      toast.error('フォントの削除に失敗しました: ' + err.message);
    }
  };

  const handleFontPreview = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/settings/font/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: previewText }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = await response.json();
      if (payload?.image) {
        setPreviewImage(payload.image);
        toast.success('プレビューを生成しました');
      }
    } catch (err: any) {
      toast.error('プレビューの生成に失敗しました: ' + err.message);
    }
  };

  return {
    handleTwitchAuth,
    handleRefreshStreamStatus,
    verifyTwitchConfig,
    handlePrinterReconnect,
    handleTestPrint,
    handleTestNotification,
    handleFontUpload,
    handleDeleteFont,
    handleFontPreview,
  };
};
