import { Trash2 } from 'lucide-react';
import React from 'react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import type { LotteryHistoryItem } from './types';

type Props = {
  history: LotteryHistoryItem[];
  onDelete: (id: number) => void | Promise<void>;
};

const formatParticipantsDetail = (rawJSON: string): string => {
  try {
    const parsed = JSON.parse(rawJSON || '[]');
    return JSON.stringify(parsed, null, 2);
  } catch {
    return rawJSON || '[]';
  }
};

export const LotteryHistory: React.FC<Props> = ({ history, onDelete }) => {
  return (
    <div className="space-y-3 pt-4 border-t">
      <h4 className="text-sm font-medium">抽選履歴</h4>
      {history.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">履歴はまだありません</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {history.map((item) => (
            <Card key={item.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{item.winner_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      参加者 {item.total_participants}人 / 総口数 {item.total_tickets}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(item.drawn_at).toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-600 dark:text-gray-300">参加者詳細</summary>
                  <pre className="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800 overflow-x-auto">
                    {formatParticipantsDetail(item.participants_json)}
                  </pre>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
