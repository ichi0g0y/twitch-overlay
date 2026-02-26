import { Bluetooth, Printer } from 'lucide-react';
import React from 'react';

import { CollapsibleCard } from '../../ui/collapsible-card';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { PrinterTypeCardProps } from './types';

export const PrinterTypeCard: React.FC<PrinterTypeCardProps> = ({
  printerType,
  onPrinterTypeChange,
}) => {
  return (
    <CollapsibleCard
      panelId="settings.printer.type"
      title="プリンター種類"
      description="使用するプリンターの種類を選択してください"
    >
      <div className="space-y-4">
        <Label>プリンター種類</Label>
        <Select
          value={printerType}
          onValueChange={onPrinterTypeChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="プリンター種類を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bluetooth">
              <div className="flex items-center space-x-2">
                <Bluetooth className="w-4 h-4" />
                <span>Bluetooth Cat プリンター</span>
              </div>
            </SelectItem>
            <SelectItem value="usb">
              <div className="flex items-center space-x-2">
                <Printer className="w-4 h-4" />
                <span>USB プリンター (Phomemo M04S)</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CollapsibleCard>
  );
};
