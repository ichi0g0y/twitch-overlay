import React, { useContext } from 'react';

import { SettingsPageContext } from '../../hooks/useSettingsPage';
import { BluetoothSettingsCard } from './printer/BluetoothSettingsCard';
import { ClockPrintSettingsCard } from './printer/ClockPrintSettingsCard';
import { PrintSettingsCard } from './printer/PrintSettingsCard';
import { PrinterTypeCard } from './printer/PrinterTypeCard';
import { UsbSettingsCard } from './printer/UsbSettingsCard';

interface PrinterSettingsProps {
  sections?: Array<'type' | 'bluetooth' | 'usb' | 'print' | 'clock'>;
}

export const PrinterSettings: React.FC<PrinterSettingsProps> = ({ sections }) => {
  const context = useContext(SettingsPageContext);
  if (!context) {
    throw new Error('PrinterSettings must be used within SettingsPageProvider');
  }

  const {
    getSettingValue,
    handleSettingChange,
    getBooleanValue,
    bluetoothDevices,
    scanning,
    testing,
    handleScanDevices,
    handleTestConnection,
    systemPrinters,
    loadingSystemPrinters,
    handleRefreshSystemPrinters,
  } = context;

  const printerType = getSettingValue('PRINTER_TYPE') || 'bluetooth';
  const visibleSections = new Set(sections ?? ['type', 'bluetooth', 'usb', 'print', 'clock']);
  const isSingleSectionMode = Array.isArray(sections) && sections.length === 1;

  return (
    <div className="space-y-6">
      {visibleSections.has('type') && (
        <PrinterTypeCard
          printerType={printerType}
          onPrinterTypeChange={(value) => handleSettingChange('PRINTER_TYPE', value)}
        />
      )}

      {visibleSections.has('bluetooth') && (
        <BluetoothSettingsCard
          printerType={printerType}
          isSingleSectionMode={isSingleSectionMode}
          getSettingValue={getSettingValue}
          handleSettingChange={handleSettingChange}
          getBooleanValue={getBooleanValue}
          handleTestConnection={handleTestConnection}
          testing={testing}
          bluetoothDevices={bluetoothDevices}
          scanning={scanning}
          handleScanDevices={handleScanDevices}
        />
      )}

      {visibleSections.has('usb') && (
        <UsbSettingsCard
          printerType={printerType}
          isSingleSectionMode={isSingleSectionMode}
          getSettingValue={getSettingValue}
          handleSettingChange={handleSettingChange}
          getBooleanValue={getBooleanValue}
          handleTestConnection={handleTestConnection}
          testing={testing}
          systemPrinters={systemPrinters}
          loadingSystemPrinters={loadingSystemPrinters}
          handleRefreshSystemPrinters={handleRefreshSystemPrinters}
        />
      )}

      {visibleSections.has('print') && (
        <PrintSettingsCard
          printerType={printerType}
          getSettingValue={getSettingValue}
          handleSettingChange={handleSettingChange}
          getBooleanValue={getBooleanValue}
        />
      )}

      {visibleSections.has('clock') && (
        <ClockPrintSettingsCard
          getBooleanValue={getBooleanValue}
          handleSettingChange={handleSettingChange}
        />
      )}
    </div>
  );
};
