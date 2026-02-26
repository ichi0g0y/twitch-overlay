export interface PrinterSettingsSharedProps {
  printerType: string;
  isSingleSectionMode: boolean;
  getSettingValue: (key: string) => string;
  handleSettingChange: (key: string, value: string | boolean | number) => void;
  getBooleanValue: (key: string) => boolean;
  handleTestConnection: () => void;
  testing: boolean;
}

export interface PrinterTypeCardProps {
  printerType: string;
  onPrinterTypeChange: (value: string) => void;
}

export interface BluetoothSettingsCardProps extends PrinterSettingsSharedProps {
  bluetoothDevices: Array<{ mac_address: string; name?: string }>;
  scanning: boolean;
  handleScanDevices: () => void;
}

export interface UsbSettingsCardProps extends PrinterSettingsSharedProps {
  systemPrinters: Array<{ name: string; status: string }>;
  loadingSystemPrinters: boolean;
  handleRefreshSystemPrinters: () => void;
}

export interface PrintSettingsCardProps {
  printerType: string;
  getSettingValue: (key: string) => string;
  handleSettingChange: (key: string, value: string | boolean | number) => void;
  getBooleanValue: (key: string) => boolean;
}

export interface ClockPrintSettingsCardProps {
  getBooleanValue: (key: string) => boolean;
  handleSettingChange: (key: string, value: string | boolean | number) => void;
}
