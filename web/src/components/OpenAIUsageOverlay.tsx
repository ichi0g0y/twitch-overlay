import { useEffect, useState } from 'react';
import { buildApiUrl } from '../utils/api';

type UsageAggregate = {
  date: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
};

type UsageResponse = {
  timezone: string;
  daily: UsageAggregate;
  total: UsageAggregate;
};

const formatNumber = (value: number) => value.toLocaleString('ja-JP');
const formatUsd = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

const OpenAIUsageOverlay = () => {
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchUsage = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/openai/usage'));
        if (!response.ok) return;
        const data = (await response.json()) as UsageResponse;
        if (!mounted) return;
        setUsage(data);
      } catch (error) {
        console.error('Failed to fetch OpenAI usage:', error);
      }
    };

    fetchUsage();
    const interval = setInterval(fetchUsage, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!usage) {
    return null;
  }

  const daily = usage.daily;

  return (
    <div className="openai-usage text-outline font-readable text-white">
      <div className="openai-usage-label">OpenAI 今日</div>
      <div className="openai-usage-main">
        <span className="openai-usage-value">{formatNumber(daily.total_tokens)} tok</span>
        <span className="openai-usage-value">{formatUsd(daily.cost_usd)}</span>
      </div>
    </div>
  );
};

export default OpenAIUsageOverlay;
