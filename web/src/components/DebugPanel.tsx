import { useState, type FormEvent, type ReactNode } from 'react';
import type { FaxData } from '../types';
import { useDebugPanelRequests } from './debug-panel/useDebugPanelRequests';
interface DebugPanelProps {
  onSendFax?: (faxData: FaxData) => void;
}
interface SectionProps {
  title: string;
  children: ReactNode;
}
interface ActionButtonProps {
  onClick?: () => void;
  disabled: boolean;
  activeClass: string;
  label: string;
  pendingLabel?: string;
  type?: 'button' | 'submit';
}
const PANEL_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';
const SMALL_TEXT = { fontSize: '13px' };
function Section({ title, children }: SectionProps) {
  return (
    <div className="mb-4 pb-4 border-b border-gray-700">
      <h4 className="text-gray-300 text-sm font-semibold mb-3">{title}</h4>
      {children}
    </div>
  );
}
function ActionButton({
  onClick,
  disabled,
  activeClass,
  label,
  pendingLabel,
  type = 'button',
}: ActionButtonProps) {
  const disabledClass = 'bg-gray-600 text-gray-400 cursor-not-allowed';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-1.5 rounded transition-colors font-medium ${disabled ? disabledClass : activeClass}`}
      style={SMALL_TEXT}
    >
      {disabled && pendingLabel ? pendingLabel : label}
    </button>
  );
}
const DebugPanel = ({}: DebugPanelProps) => {
  const [username, setUsername] = useState('DebugUser');
  const [userInput, setUserInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [bits, setBits] = useState(100);
  const [viewers, setViewers] = useState(10);
  const [months, setMonths] = useState(3);
  const [resubMessage, setResubMessage] = useState('デバッグ再サブスクメッセージ');
  const [fromBroadcaster, setFromBroadcaster] = useState('DebugRaider');
  const { isSubmitting, sendChannelPoints, triggerClock, triggerTwitchEvent } = useDebugPanelRequests();
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await sendChannelPoints(username, userInput);
    if (ok) {
      setUserInput('');
    }
  };
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-700 transition-colors"
          style={{ fontSize: '14px', fontFamily: PANEL_FONT_FAMILY }}
        >
          Debug Panel
        </button>
      ) : (
        <div
          className="bg-gray-800 rounded-lg shadow-xl p-4"
          style={{
            width: '350px',
            maxHeight: '80vh',
            overflowY: 'auto',
            fontFamily: PANEL_FONT_FAMILY,
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold" style={{ fontSize: '16px' }}>
              Debug Panel
            </h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white"
              style={{ fontSize: '20px' }}
            >
              ×
            </button>
          </div>
          <Section title="📝 チャンネルポイント">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-gray-300 text-xs mb-1">ユーザー名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  style={SMALL_TEXT}
                  required
                />
              </div>
              <div>
                <label className="block text-gray-300 text-xs mb-1">メッセージ</label>
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                  style={SMALL_TEXT}
                  rows={2}
                  placeholder="FAXに送信するメッセージ..."
                  required
                />
              </div>
              <ActionButton
                type="submit"
                disabled={isSubmitting}
                activeClass="bg-blue-600 text-white hover:bg-blue-700"
                label="チャンネルポイントを使用"
                pendingLabel="送信中..."
              />
            </form>
          </Section>
          <Section title="🕐 時計印刷">
            <div className="space-y-2">
              <ActionButton
                onClick={() => { void triggerClock(); }}
                disabled={isSubmitting}
                activeClass="bg-purple-600 text-white hover:bg-purple-700"
                label="リーダーボード付き"
                pendingLabel="実行中..."
              />
              <ActionButton
                onClick={() => { void triggerClock({ emptyLeaderboard: true }); }}
                disabled={isSubmitting}
                activeClass="bg-orange-600 text-white hover:bg-orange-700"
                label="空のリーダーボード"
                pendingLabel="実行中..."
              />
            </div>
          </Section>
          <Section title="⭐ サブスク関連">
            <div className="space-y-2">
              <ActionButton
                onClick={() => { void triggerTwitchEvent('subscribe', { username }); }}
                disabled={isSubmitting}
                activeClass="bg-pink-600 text-white hover:bg-pink-700"
                label="サブスクライブ"
              />
              <ActionButton
                onClick={() => { void triggerTwitchEvent('gift-sub', { username, isAnonymous: false }); }}
                disabled={isSubmitting}
                activeClass="bg-pink-600 text-white hover:bg-pink-700"
                label="サブギフト（通常）"
              />
              <ActionButton
                onClick={() => { void triggerTwitchEvent('gift-sub', { username: '匿名さん', isAnonymous: true }); }}
                disabled={isSubmitting}
                activeClass="bg-pink-600 text-white hover:bg-pink-700"
                label="サブギフト（匿名）"
              />
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={months}
                    onChange={(e) => setMonths(parseInt(e.target.value, 10) || 1)}
                    className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    style={{ fontSize: '12px' }}
                    placeholder="月数"
                    min="1"
                  />
                  <input
                    type="text"
                    value={resubMessage}
                    onChange={(e) => setResubMessage(e.target.value)}
                    className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    style={{ fontSize: '12px' }}
                    placeholder="メッセージ"
                  />
                </div>
                <ActionButton
                  onClick={() => {
                    void triggerTwitchEvent('resub', {
                      username,
                      cumulativeMonths: months,
                      message: resubMessage,
                    });
                  }}
                  disabled={isSubmitting}
                  activeClass="bg-pink-600 text-white hover:bg-pink-700"
                  label={`再サブスク（${months}ヶ月）`}
                />
              </div>
            </div>
          </Section>
          <Section title="🎉 その他のイベント">
            <div className="space-y-2">
              <ActionButton
                onClick={() => { void triggerTwitchEvent('follow', { username }); }}
                disabled={isSubmitting}
                activeClass="bg-green-600 text-white hover:bg-green-700"
                label="フォロー"
              />
              <div className="space-y-1">
                <input
                  type="number"
                  value={bits}
                  onChange={(e) => setBits(parseInt(e.target.value, 10) || 100)}
                  className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  style={{ fontSize: '12px' }}
                  placeholder="ビッツ数"
                  min="1"
                />
                <ActionButton
                  onClick={() => { void triggerTwitchEvent('cheer', { username, bits }); }}
                  disabled={isSubmitting}
                  activeClass="bg-yellow-600 text-white hover:bg-yellow-700"
                  label={`チアー（${bits}ビッツ）`}
                />
              </div>
              <div className="space-y-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fromBroadcaster}
                    onChange={(e) => setFromBroadcaster(e.target.value)}
                    className="flex-1 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    style={{ fontSize: '12px' }}
                    placeholder="配信者名"
                  />
                  <input
                    type="number"
                    value={viewers}
                    onChange={(e) => setViewers(parseInt(e.target.value, 10) || 10)}
                    className="w-20 px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    style={{ fontSize: '12px' }}
                    placeholder="人数"
                    min="1"
                  />
                </div>
                <ActionButton
                  onClick={() => { void triggerTwitchEvent('raid', { fromBroadcaster, viewers }); }}
                  disabled={isSubmitting}
                  activeClass="bg-red-600 text-white hover:bg-red-700"
                  label={`レイド（${viewers}人）`}
                />
              </div>
              <ActionButton
                onClick={() => { void triggerTwitchEvent('shoutout', { fromBroadcaster }); }}
                disabled={isSubmitting}
                activeClass="bg-indigo-600 text-white hover:bg-indigo-700"
                label="シャウトアウト"
              />
            </div>
          </Section>
          <Section title="📡 配信状態">
            <div className="space-y-2">
              <ActionButton
                onClick={() => { void triggerTwitchEvent('stream-online'); }}
                disabled={isSubmitting}
                activeClass="bg-teal-600 text-white hover:bg-teal-700"
                label="配信開始"
              />
              <ActionButton
                onClick={() => { void triggerTwitchEvent('stream-offline'); }}
                disabled={isSubmitting}
                activeClass="bg-gray-500 text-white hover:bg-gray-600"
                label="配信終了"
              />
            </div>
          </Section>
          <p className="text-gray-400 text-xs">※バックエンドでoutput.PrintOutが実行されます</p>
        </div>
      )}
    </div>
  );
};
export default DebugPanel;
