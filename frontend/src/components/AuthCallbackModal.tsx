import React from 'react';
import { X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface AuthCallbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
  authCode: string;
  setAuthCode: (code: string) => void;
}

export const AuthCallbackModal: React.FC<AuthCallbackModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  authCode,
  setAuthCode,
}) => {
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authCode.trim()) {
      onSubmit(authCode.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
          <CardTitle>Twitch認証コードを入力</CardTitle>
          <CardDescription>
            ブラウザでTwitchにログインして認証を完了してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                認証後、URLに含まれる認証コードをコピーして以下に貼り付けてください。
              </p>
              <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded">
                URLの例: http://localhost/?code=<strong className="text-blue-600 dark:text-blue-400">ここの部分をコピー</strong>&scope=...
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="auth-code">認証コード</Label>
              <Input
                id="auth-code"
                type="text"
                placeholder="認証コードを貼り付け"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={onClose}>
                キャンセル
              </Button>
              <Button type="submit" disabled={!authCode.trim()}>
                認証を完了
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};