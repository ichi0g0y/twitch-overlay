import type { OverlaySettings as OverlaySettingsState } from '../../../contexts/SettingsContext';
import type {
  AuthStatus,
  FeatureStatus,
  PrinterStatusInfo,
  StreamStatus,
  TwitchUserInfo,
} from '../../../types';
import type { TopBarMenuItem } from './menu';

export type StatusTopBarProps = {
  leftOffset: number;
  rightOffset: number;
  featureStatus: FeatureStatus | null;
  authStatus: AuthStatus | null;
  streamStatus: StreamStatus | null;
  twitchUserInfo: TwitchUserInfo | null;
  printerStatusInfo: PrinterStatusInfo | null;
  webServerPort?: number;
  refreshingStreamStatus: boolean;
  reconnectingPrinter: boolean;
  testingPrinter: boolean;
  verifyingTwitch: boolean;
  onTwitchAuth: () => void;
  onRefreshStreamStatus: () => void;
  onVerifyTwitchConfig: () => void;
  onPrinterReconnect: () => void;
  onTestPrint: () => void;
  overlaySettings: OverlaySettingsState | null;
  updateOverlaySettings: (
    updates: Partial<OverlaySettingsState>,
  ) => Promise<void>;
  cardMenuItems: TopBarMenuItem[];
  onAddCard: (kind: any) => void;
  onAddIrcPreview: (channelLogin: string) => void;
  canAddCard: (kind: any) => boolean;
  ircChannelDisplayNames: Record<string, string>;
};
