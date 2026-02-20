import React from 'react';

const tierMultipliers = [
  { tier: 'Tier1', value: '1.0' },
  { tier: 'Tier2', value: '1.1' },
  { tier: 'Tier3', value: '1.2' },
];

const examples = [
  'サブスク未登録 + 3回使用: 3 + 0 = 3口',
  'Tier1 / 1ヶ月 + 3回使用: 3 + ceil(1×1.0×1.1÷3) = 4口',
  'Tier1 / 6ヶ月 + 3回使用: 3 + ceil(6×1.0×1.1÷3) = 6口',
  'Tier3 / 12ヶ月 + 3回使用: 3 + ceil(12×1.2×1.1÷3) = 9口',
];

export const LotteryRuleDisplay: React.FC = () => {
  return (
    <div className="space-y-3 pt-4 border-t">
      <h4 className="text-sm font-medium">抽選ルール</h4>

      <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
        <p>基本口数: 1口リワード使用回数（同一ユーザー合算）</p>
        <p>ボーナス口数: ceil(累計月数 × Tier係数 × 1.1 ÷ 3)</p>
        <p>最終口数: 基本口数 + ボーナス口数</p>
        <p>前回当選者は次回抽選から自動除外されます</p>
      </div>

      <div className="rounded border bg-gray-50 dark:bg-gray-900/20 p-3">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Tier係数</p>
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-300">
          {tierMultipliers.map((item) => (
            <div key={item.tier} className="rounded bg-white dark:bg-gray-800 px-2 py-1 text-center">
              {item.tier}: {item.value}
            </div>
          ))}
        </div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-gray-600 dark:text-gray-300">計算例</summary>
        <ul className="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
          {examples.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
      </details>
    </div>
  );
};
