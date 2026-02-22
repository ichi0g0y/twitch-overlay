import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

const STORAGE_PREFIX = 'settings.panel.';

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
  panelId,
  title,
  description,
  actions,
  defaultOpen = true,
  className,
  headerClassName,
  contentClassName,
  children,
}: CollapsibleCardProps) {
  const storageKey = `${STORAGE_PREFIX}${panelId}`;
  const [isOpen, setIsOpen] = React.useState(() => {
    if (typeof window === 'undefined') return defaultOpen;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return defaultOpen;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, String(isOpen));
  }, [isOpen, storageKey]);

  return (
    <Card className={className}>
      <CardHeader className={cn('pb-4', headerClassName)}>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
          >
            <ChevronDown
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform',
                isOpen ? 'rotate-0' : '-rotate-90',
              )}
            />
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
            </div>
          </button>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      </CardHeader>
      {isOpen ? <CardContent className={contentClassName}>{children}</CardContent> : null}
    </Card>
  );
}
