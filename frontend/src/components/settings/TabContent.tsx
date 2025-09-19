// 各タブコンテンツコンポーネントの簡略版
// 必要に応じて個別ファイルに分割可能

import React from 'react';
import { TabsContent } from '../ui/tabs';

// 残りのタブコンテンツは後で実装
export const TwitchSettings: React.FC<any> = (props) => {
  return <TabsContent value="twitch">Twitch設定（実装中）</TabsContent>;
};

export const PrinterSettings: React.FC<any> = (props) => {
  return <TabsContent value="printer">プリンター設定（実装中）</TabsContent>;
};

export const OverlaySettings: React.FC<any> = (props) => {
  return <TabsContent value="overlay">オーバーレイ設定（実装中）</TabsContent>;
};

export const ApiTab: React.FC<any> = (props) => {
  return <TabsContent value="api">API設定（実装中）</TabsContent>;
};