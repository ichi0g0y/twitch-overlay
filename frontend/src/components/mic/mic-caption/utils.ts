export const nowID = (prefix: string): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const speechRecognitionErrorToMessage = (code: string): string => {
  switch ((code || '').trim()) {
    case 'aborted':
      return '音声認識が中断されました（再起動中）';
    case 'no-speech':
      return '音声が検出されませんでした';
    case 'audio-capture':
      return 'マイク入力を取得できませんでした（デバイス/権限を確認してください）';
    case 'network':
      return '音声認識のネットワークエラーが発生しました';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'マイク権限が拒否されています。ブラウザ/OSの権限設定を確認してください';
    case 'language-not-supported':
      return '指定した言語が音声認識でサポートされていません';
    case 'bad-grammar':
      return '音声認識の文法設定が不正です';
    default:
      return code || '音声認識エラー';
  }
};

export const resolveMicPermissionErrorMessage = (err: any): string => {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'マイク権限が拒否されています。Chromeのサイト設定/ macOSのマイク権限を確認してください';
  }
  if (name === 'NotFoundError') {
    return 'マイクデバイスが見つかりません。接続/入力デバイス設定を確認してください';
  }
  if (name === 'NotReadableError') {
    return 'マイクが他のアプリで使用中の可能性があります。使用中アプリを閉じて再試行してください';
  }
  return err?.message || 'マイク権限の取得に失敗しました';
};
