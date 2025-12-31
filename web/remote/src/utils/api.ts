// API URL構築（相対パスを使用）
export function buildApiUrl(path: string): string {
  // ブラウザから同じオリジンにアクセスしているので、相対パスを使用
  return path;
}

// 設定更新（Wails非依存）
export async function updateSettings(settings: Record<string, any>): Promise<void> {
  const response = await fetch(buildApiUrl('/api/settings/overlay'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });

  if (!response.ok) {
    throw new Error(`Failed to update settings: ${response.statusText}`);
  }
}
