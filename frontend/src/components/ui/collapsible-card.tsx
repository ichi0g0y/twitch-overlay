import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

type WorkspaceCardUi = {
  onClose?: () => void;
  nodeMode?: boolean;
};

export const WorkspaceCardUiContext = React.createContext<WorkspaceCardUi | null>(null);

type CollapsibleCardProps = {
  panelId: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
};

export function CollapsibleCard({
  panelId: _panelId,
  title,
  description,
  actions,
  defaultOpen: _defaultOpen = true,
  className,
  headerClassName,
  contentClassName,
  children,
}: CollapsibleCardProps) {
  const workspaceUi = React.useContext(WorkspaceCardUiContext);
  const mergedActions = actions ?? (workspaceUi?.onClose
    ? (
      <button
        type="button"
        onClick={workspaceUi.onClose}
        aria-label="カードを削除"
        className="nodrag inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700/80 bg-gray-900/70 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )
    : null);

  return (
    <Card
      className={cn(
        workspaceUi?.nodeMode ? 'flex h-full min-h-0 flex-col overflow-hidden' : '',
        className,
      )}
    >
      <CardHeader
        data-workspace-node-drag-handle={workspaceUi?.nodeMode ? 'true' : undefined}
        className={cn(
          'p-4 pb-3',
          workspaceUi?.nodeMode ? 'workspace-node-drag-handle cursor-grab active:cursor-grabbing' : '',
          headerClassName,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          </div>
          {mergedActions ? <div className="shrink-0">{mergedActions}</div> : null}
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          'p-4 pt-0',
          workspaceUi?.nodeMode ? 'min-h-0 flex-1 overflow-auto' : '',
          contentClassName,
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}
