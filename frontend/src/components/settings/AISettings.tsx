import { Eye, EyeOff } from 'lucide-react';
import React from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';

interface AISettingsProps {
  getSettingValue: (key: string) => string;
  handleSettingChange: (key: string, value: string | boolean) => void;
  showSecrets: Record<string, boolean>;
  setShowSecrets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  resettingOpenAIUsage: boolean;
  handleResetOpenAIUsageDaily: () => void;
  ollamaModels: { id: string; size_bytes?: number | null; modified_at?: string }[];
  ollamaModelsLoading: boolean;
  ollamaModelsError: string | null;
  ollamaModelsFetchedAt: number | null;
  pullingOllamaModel: boolean;
  creatingOllamaModelfile: boolean;
  ollamaModelfilePreview: string;
  ollamaModelfileError: string | null;
  handleCreateOllamaModelfile: (apply: boolean) => void;
  fetchOllamaModels: (options?: { silent?: boolean }) => void;
  pullOllamaModel: (modelId: string) => void;
  ollamaStatus: { running: boolean; healthy: boolean; version?: string; model?: string; error?: string } | null;
  translationTestText: string;
  setTranslationTestText: (text: string) => void;
  translationTestSourceLang: string;
  setTranslationTestSourceLang: (lang: string) => void;
  translationTestTargetLang: string;
  setTranslationTestTargetLang: (lang: string) => void;
  translationTestBackend: 'openai' | 'ollama';
  setTranslationTestBackend: (backend: 'openai' | 'ollama') => void;
  translationTestResult: string;
  translationTestTookMs: number | null;
  translationTesting: boolean;
  handleTestTranslation: () => void;
}

export const AISettings: React.FC<AISettingsProps> = ({
  getSettingValue,
  handleSettingChange,
  showSecrets,
  setShowSecrets,
  resettingOpenAIUsage,
  handleResetOpenAIUsageDaily,
  ollamaModels,
  ollamaModelsLoading,
  ollamaModelsError,
  ollamaModelsFetchedAt,
  pullingOllamaModel,
  creatingOllamaModelfile,
  ollamaModelfilePreview,
  ollamaModelfileError,
  handleCreateOllamaModelfile,
  fetchOllamaModels,
  pullOllamaModel,
  ollamaStatus,
  translationTestText,
  setTranslationTestText,
  translationTestSourceLang,
  setTranslationTestSourceLang,
  translationTestTargetLang,
  setTranslationTestTargetLang,
  translationTestBackend,
  setTranslationTestBackend,
  translationTestResult,
  translationTestTookMs,
  translationTesting,
  handleTestTranslation,
}) => {
  const autoFetchRequestedRef = React.useRef(false);
  const gbToBytes = (gb: number) => Math.round(gb * 1024 * 1024 * 1024);
  const isHfModelId = (modelId: string) =>
    /^(hf\.co\/|https?:\/\/huggingface\.co\/|huggingface\.co\/)/i.test(modelId);
  const parseHfModelId = (modelId: string) => {
    const trimmed = modelId.trim();
    if (!trimmed) return null;
    let withoutPrefix = trimmed;
    if (withoutPrefix.startsWith('https://huggingface.co/')) {
      withoutPrefix = withoutPrefix.replace('https://huggingface.co/', '');
    } else if (withoutPrefix.startsWith('http://huggingface.co/')) {
      withoutPrefix = withoutPrefix.replace('http://huggingface.co/', '');
    } else if (withoutPrefix.startsWith('huggingface.co/')) {
      withoutPrefix = withoutPrefix.replace('huggingface.co/', '');
    } else if (withoutPrefix.startsWith('hf.co/')) {
      withoutPrefix = withoutPrefix.replace('hf.co/', '');
    } else {
      return null;
    }
    const [repo, quantRaw] = withoutPrefix.split(':', 2);
    const quant = (quantRaw || '').trim();
    return { repo: repo.trim(), quant };
  };
  const normalizeHfQuant = (quant: string) => {
    const trimmed = quant.trim();
    if (!trimmed) return '';
    if (trimmed.toLowerCase().endsWith('.gguf')) {
      const base = trimmed.replace(/\.gguf$/i, '');
      const match = base.match(/(iq\d+_[a-z0-9_]+|q\d+_[a-z0-9_]+)/i);
      if (match) return match[1].toUpperCase();
      return base;
    }
    return trimmed.toUpperCase();
  };
  const buildHfModelId = (repo: string, quant: string) => {
    const normalizedRepo = repo.trim();
    if (!normalizedRepo) return '';
    const normalizedQuant = quant.trim();
    return normalizedQuant ? `hf.co/${normalizedRepo}:${normalizedQuant}` : `hf.co/${normalizedRepo}`;
  };
  const openAiModels = [
    {
      id: 'gpt-5',
      name: 'GPT-5',
      price: '入力 $1.25 / 出力 $10.00',
    },
    {
      id: 'gpt-5-mini',
      name: 'GPT-5 mini',
      price: '入力 $0.25 / 出力 $2.00',
    },
    {
      id: 'gpt-5-nano',
      name: 'GPT-5 nano',
      price: '入力 $0.05 / 出力 $0.40',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o mini',
      price: '入力 $0.15 / 出力 $0.60',
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      price: '入力 $2.50 / 出力 $10.00',
    },
    {
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 mini',
      price: '入力 $0.40 / 出力 $1.60',
    },
  ];

  const selectedOpenAiModel = getSettingValue('OPENAI_MODEL') || 'gpt-4o-mini';
  const inputTokens = parseInt(getSettingValue('OPENAI_USAGE_INPUT_TOKENS') || '0', 10) || 0;
  const outputTokens = parseInt(getSettingValue('OPENAI_USAGE_OUTPUT_TOKENS') || '0', 10) || 0;
  const totalTokens = inputTokens + outputTokens;
  const costUsd = parseFloat(getSettingValue('OPENAI_USAGE_COST_USD') || '0') || 0;
  const dailyInputTokens = parseInt(getSettingValue('OPENAI_USAGE_DAILY_INPUT_TOKENS') || '0', 10) || 0;
  const dailyOutputTokens = parseInt(getSettingValue('OPENAI_USAGE_DAILY_OUTPUT_TOKENS') || '0', 10) || 0;
  const dailyTotalTokens = dailyInputTokens + dailyOutputTokens;
  const dailyCostUsd = parseFloat(getSettingValue('OPENAI_USAGE_DAILY_COST_USD') || '0') || 0;
  const dailyDate = getSettingValue('OPENAI_USAGE_DAILY_DATE') || '未集計';
  const timeZone = getSettingValue('TIMEZONE') || 'UTC';
  const formatNumber = (value: number) => value.toLocaleString('ja-JP');
  const formatUsd = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

  const translationBackend = getSettingValue('TRANSLATION_BACKEND') || 'openai';
  const activeOllamaModel = getSettingValue('OLLAMA_MODEL') || 'translategemma:12b';
  const baseOllamaModel = getSettingValue('OLLAMA_BASE_MODEL') || activeOllamaModel;
  const isOllamaModelInstalled = ollamaModels.some(
    (model) => model.id.toLowerCase() === activeOllamaModel.toLowerCase(),
  );

  const autoLangValue = 'auto';
  const languageOptions = [
    { value: 'jpn', label: '日本語' },
    { value: 'eng', label: '英語' },
    { value: 'kor', label: '韓国語' },
    { value: 'zho', label: '中国語' },
    { value: 'spa', label: 'スペイン語' },
    { value: 'fra', label: 'フランス語' },
    { value: 'deu', label: 'ドイツ語' },
    { value: 'ita', label: 'イタリア語' },
    { value: 'por', label: 'ポルトガル語' },
    { value: 'rus', label: 'ロシア語' },
    { value: 'ara', label: 'アラビア語' },
    { value: 'hin', label: 'ヒンディー語' },
    { value: 'tha', label: 'タイ語' },
    { value: 'vie', label: 'ベトナム語' },
    { value: 'ind', label: 'インドネシア語' },
  ];

  const libraryModelPresets = [
    { id: 'translategemma:12b' },
    { id: 'translategemma:4b' },
    { id: 'gemma2:9b' },
    { id: 'llama3.1:8b' },
  ];

  const hfModelPresets = [
    {
      repo: 'XpressAI/shisa-v2.1-qwen3-8b-GGUF',
      label: 'Shisa v2.1 Qwen3 8B',
      quants: [
        { id: 'Q4_K_M', size_bytes: gbToBytes(5.03) },
        { id: 'Q5_K_M', size_bytes: gbToBytes(5.85) },
        { id: 'Q6_K', size_bytes: gbToBytes(6.73) },
        { id: 'Q8_0', size_bytes: gbToBytes(8.71) },
        { id: 'Q4_0', size_bytes: gbToBytes(4.77) },
        { id: 'Q2_K', size_bytes: gbToBytes(3.28) },
      ],
    },
    {
      repo: 'XpressAI/shisa-v2.1-llama3.2-3b-GGUF',
      label: 'Shisa v2.1 Llama 3.2 3B',
      quants: [
        { id: 'Q4_K_M', size_bytes: gbToBytes(2.02) },
        { id: 'Q5_K_M', size_bytes: gbToBytes(2.32) },
        { id: 'Q6_K', size_bytes: gbToBytes(2.64) },
        { id: 'Q8_0', size_bytes: gbToBytes(3.42) },
        { id: 'Q4_0', size_bytes: gbToBytes(1.92) },
        { id: 'Q2_K', size_bytes: gbToBytes(1.36) },
      ],
    },
    {
      repo: 'mradermacher/shisa-v2.1-unphi4-14b-GGUF',
      label: 'Shisa v2.1 Unphi4 14B',
      quants: [
        { id: 'Q4_K_M', size_bytes: gbToBytes(8.89) },
        { id: 'Q5_K_M', size_bytes: gbToBytes(10.4) },
        { id: 'Q6_K', size_bytes: gbToBytes(12.0) },
        { id: 'Q8_0', size_bytes: gbToBytes(15.6) },
        { id: 'Q4_K_S', size_bytes: gbToBytes(8.44) },
        { id: 'Q2_K', size_bytes: gbToBytes(5.61) },
      ],
    },
  ];

  const parsedHfModel = parseHfModelId(baseOllamaModel);
  const normalizedHfQuant = parsedHfModel?.quant ? normalizeHfQuant(parsedHfModel.quant) : '';
  const fallbackHfPreset = hfModelPresets[0];
  const selectedHfRepo = hfModelPresets.some((preset) => preset.repo === parsedHfModel?.repo)
    ? (parsedHfModel?.repo || fallbackHfPreset.repo)
    : fallbackHfPreset.repo;
  const selectedHfPreset = hfModelPresets.find((preset) => preset.repo === selectedHfRepo) || fallbackHfPreset;
  const selectedHfQuant = selectedHfPreset.quants.some((quant) => quant.id === normalizedHfQuant)
    ? normalizedHfQuant
    : selectedHfPreset.quants[0]?.id || '';
  const isHfSelected = isHfModelId(baseOllamaModel);
  const modelSource = isHfSelected ? 'hf' : 'ollama';
  const lastLibraryModelRef = React.useRef(baseOllamaModel || 'translategemma:12b');

  React.useEffect(() => {
    if (!isHfSelected && baseOllamaModel) {
      lastLibraryModelRef.current = baseOllamaModel;
    }
  }, [isHfSelected, baseOllamaModel]);

  const mergedOllamaModels = (() => {
    const currentModel = baseOllamaModel;
    const map = new Map<string, { id: string; size_bytes?: number | null }>();
    const push = (item?: { id: string; size_bytes?: number | null } | null) => {
      if (!item?.id) return;
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
        return;
      }
      const incomingHasSize = typeof item.size_bytes === 'number' && item.size_bytes > 0;
      const existingHasSize = typeof existing.size_bytes === 'number' && existing.size_bytes > 0;
      const size_bytes = existingHasSize ? existing.size_bytes : incomingHasSize ? item.size_bytes : existing.size_bytes;
      map.set(item.id, { id: item.id, size_bytes });
    };
    if (currentModel && !isHfModelId(currentModel)) {
      push({ id: currentModel });
    }
    libraryModelPresets.forEach(push);
    ollamaModels.filter((model) => !isHfModelId(model.id)).forEach(push);
    return Array.from(map.values());
  })();

  const ollamaReady = ollamaStatus?.healthy ?? false;
  const ollamaStarting = ollamaStatus?.running && !ollamaStatus?.healthy;

  React.useEffect(() => {
    if (translationBackend !== 'ollama') return;
    if (ollamaModelsLoading) return;
    if (ollamaModels.length > 0) return;
    if (autoFetchRequestedRef.current) return;
    if (!ollamaReady) return;
    autoFetchRequestedRef.current = true;
    fetchOllamaModels({ silent: true });
  }, [translationBackend, ollamaModelsLoading, ollamaModels.length, ollamaReady, fetchOllamaModels]);

  const formatModelSize = (sizeBytes?: number | null) => {
    if (!sizeBytes || sizeBytes <= 0) return '未取得';
    const gb = sizeBytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(2)}GB` : `${(sizeBytes / (1024 * 1024)).toFixed(0)}MB`;
  };
  const hfModelIdPreview = buildHfModelId(selectedHfRepo, selectedHfQuant);
  const handleModelSourceChange = (value: 'ollama' | 'hf') => {
    if (value === 'hf') {
      const defaultRepo = hfModelPresets[0]?.repo || '';
      const defaultQuant = hfModelPresets[0]?.quants[0]?.id || '';
      const nextModel = buildHfModelId(defaultRepo, defaultQuant);
      if (nextModel) {
        handleSettingChange('OLLAMA_BASE_MODEL', nextModel);
        handleSettingChange('OLLAMA_MODEL', nextModel);
      }
      return;
    }
    const fallback = lastLibraryModelRef.current || libraryModelPresets[0]?.id || 'translategemma:12b';
    handleSettingChange('OLLAMA_BASE_MODEL', fallback);
    handleSettingChange('OLLAMA_MODEL', fallback);
  };
  const handleHfRepoChange = (repo: string) => {
    const preset = hfModelPresets.find((item) => item.repo === repo) || hfModelPresets[0];
    const nextQuant = preset?.quants[0]?.id || '';
    const nextModel = buildHfModelId(repo, nextQuant);
    if (nextModel) {
      handleSettingChange('OLLAMA_BASE_MODEL', nextModel);
      handleSettingChange('OLLAMA_MODEL', nextModel);
    }
  };
  const handleHfQuantChange = (quant: string) => {
    const nextModel = buildHfModelId(selectedHfRepo, quant);
    if (nextModel) {
      handleSettingChange('OLLAMA_BASE_MODEL', nextModel);
      handleSettingChange('OLLAMA_MODEL', nextModel);
    }
  };

  return (
    <div className="space-y-6 focus:outline-none">
      <Card>
        <CardHeader>
          <CardTitle>OpenAI 設定</CardTitle>
          <CardDescription>
            OpenAI APIキーと翻訳モデル、使用量を管理します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="openai_api_key">OpenAI APIキー</Label>
            <div className="flex items-center gap-2">
              <Input
                id="openai_api_key"
                type={showSecrets['OPENAI_API_KEY'] ? 'text' : 'password'}
                placeholder={getSettingValue('OPENAI_API_KEY') ? '（設定済み）' : 'OpenAI API Key'}
                value={getSettingValue('OPENAI_API_KEY')}
                onChange={(e) => handleSettingChange('OPENAI_API_KEY', e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowSecrets(prev => ({ ...prev, OPENAI_API_KEY: !prev.OPENAI_API_KEY }))}
                aria-label="OpenAI APIキーの表示切り替え"
              >
                {showSecrets['OPENAI_API_KEY'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              {openAiModels.map((model) => {
                const isActive = selectedOpenAiModel === model.id;
                return (
                  <Button
                    key={model.id}
                    type="button"
                    variant={isActive ? 'default' : 'outline'}
                    onClick={() => handleSettingChange('OPENAI_MODEL', model.id)}
                    className="h-auto px-3 py-2"
                  >
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold">{model.name}</span>
                      <span className={`text-sm ${isActive ? 'opacity-80' : 'text-gray-500 dark:text-gray-400'}`}>
                        {model.price}
                      </span>
                    </div>
                  </Button>
                );
              })}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              価格はStandardの1Mトークンあたり（入力 / 出力）
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
            <div className="text-base font-semibold text-gray-700 dark:text-gray-200">OpenAI 使用量（概算）</div>
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              今日: {dailyDate}（{timeZone}）
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-base">
              <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">入力トークン</div>
                <div className="mt-1 font-semibold">{formatNumber(dailyInputTokens)}</div>
              </div>
              <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">出力トークン</div>
                <div className="mt-1 font-semibold">{formatNumber(dailyOutputTokens)}</div>
              </div>
              <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">合計トークン</div>
                <div className="mt-1 font-semibold">{formatNumber(dailyTotalTokens)}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-base text-gray-600 dark:text-gray-300">
              <span>推定料金: <span className="font-semibold">{formatUsd(dailyCostUsd)}</span></span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetOpenAIUsageDaily}
                disabled={resettingOpenAIUsage}
              >
                {resettingOpenAIUsage ? 'リセット中…' : '今日の使用量をリセット'}
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-base">
              <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">累計入力トークン</div>
                <div className="mt-1 font-semibold">{formatNumber(inputTokens)}</div>
              </div>
              <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">累計出力トークン</div>
                <div className="mt-1 font-semibold">{formatNumber(outputTokens)}</div>
              </div>
              <div className="rounded-md bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">累計合計トークン</div>
                <div className="mt-1 font-semibold">{formatNumber(totalTokens)}</div>
              </div>
            </div>
            <div className="mt-3 text-base text-gray-600 dark:text-gray-300">
              累計推定料金: <span className="font-semibold">{formatUsd(costUsd)}</span>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              OpenAIの公式価格に基づく概算（未対応モデルは除外・モデル変更時は誤差が出る可能性あり）
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>翻訳設定</CardTitle>
          <CardDescription>
            チャット翻訳とマイク文字起こし翻訳のバックエンドを切り替えます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>翻訳バックエンド</Label>
            <Select
              value={translationBackend}
              onValueChange={(value) => handleSettingChange('TRANSLATION_BACKEND', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="バックエンドを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI（クラウド）</SelectItem>
                <SelectItem value="ollama">Ollama（ローカル）</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ollamaを使用する場合はローカルサーバの起動を確認してください（localhostは自動起動）
            </p>
          </div>

          {translationBackend === 'openai' && (
            <Alert className="dark:bg-blue-900/20 dark:border-blue-700">
              <AlertDescription className="text-blue-700 dark:text-blue-200">
                OpenAIバックエンドではAPIキーが必要です
              </AlertDescription>
            </Alert>
          )}

          {translationBackend === 'ollama' && (
            <div className="space-y-4">
              {!ollamaReady && (
                <Alert className="dark:bg-yellow-900/20 dark:border-yellow-700">
                  <AlertDescription className="text-yellow-700 dark:text-yellow-200">
                    {ollamaStarting ? 'Ollamaを起動中です。接続後に操作できます。' : 'Ollama未接続です。起動を確認してください。'}
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="ollama_base_url">OllamaサーバURL</Label>
                <Input
                  id="ollama_base_url"
                  placeholder="http://127.0.0.1:11434"
                  value={getSettingValue('OLLAMA_BASE_URL')}
                  onChange={(e) => handleSettingChange('OLLAMA_BASE_URL', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ollama_system_prompt">Ollama System Prompt</Label>
                <Textarea
                  id="ollama_system_prompt"
                  value={getSettingValue('OLLAMA_SYSTEM_PROMPT')}
                  onChange={(e) => handleSettingChange('OLLAMA_SYSTEM_PROMPT', e.target.value)}
                  rows={3}
                  placeholder="翻訳エンジン向けのsystem指示（空ならデフォルト）"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  入力するとOllama翻訳の全リクエストに適用されます
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>モデルソース</Label>
                <Select
                  value={modelSource}
                  onValueChange={(value) => handleModelSourceChange(value as 'ollama' | 'hf')}
                >
                    <SelectTrigger>
                      <SelectValue placeholder="モデルソースを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ollama">Ollamaライブラリ</SelectItem>
                      <SelectItem value="hf">Hugging Face（GGUF）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {modelSource === 'ollama' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="ollama_model">モデル</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fetchOllamaModels()}
                          disabled={ollamaModelsLoading || !ollamaReady}
                        >
                          更新
                        </Button>
                      </div>
                    </div>
                    <Select
                  value={baseOllamaModel}
                  onValueChange={(value) => {
                    handleSettingChange('OLLAMA_BASE_MODEL', value);
                    handleSettingChange('OLLAMA_MODEL', value);
                  }}
                  disabled={mergedOllamaModels.length === 0}
                >
                      <SelectTrigger>
                        <SelectValue placeholder="モデルを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {mergedOllamaModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.id} ({formatModelSize(model.size_bytes)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mergedOllamaModels.length === 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        モデル一覧を取得してください
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>HF GGUF リポジトリ</Label>
                    <Select value={selectedHfRepo} onValueChange={handleHfRepoChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="モデルを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {hfModelPresets.map((preset) => (
                          <SelectItem key={preset.repo} value={preset.repo}>
                            {preset.label}（{preset.repo}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Label>量子化</Label>
                    <Select value={selectedHfQuant} onValueChange={handleHfQuantChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="量子化を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedHfPreset.quants.map((quant) => (
                          <SelectItem key={quant.id} value={quant.id}>
                            {quant.id} ({formatModelSize(quant.size_bytes)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      使用モデルID: {hfModelIdPreview}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      HF GGUFは初回ダウンロードが大きいので時間がかかる場合があります
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                  onClick={() => pullOllamaModel(activeOllamaModel)}
                  disabled={
                    pullingOllamaModel ||
                      !activeOllamaModel ||
                      !ollamaReady ||
                      isOllamaModelInstalled
                    }
                >
                    {pullingOllamaModel
                      ? '取得中...'
                      : isOllamaModelInstalled
                        ? '取得済み'
                        : 'モデルを取得'}
                  </Button>
                  <span>未取得の場合はここでダウンロード</span>
                  {ollamaModelsFetchedAt && (
                    <span>更新: {new Date(ollamaModelsFetchedAt * 1000).toLocaleString('ja-JP')}</span>
                  )}
                </div>
                {ollamaModelsError && (
                  <p className="text-xs text-red-500">{ollamaModelsError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="ollama_num_predict">num_predict</Label>
                  <Input
                    id="ollama_num_predict"
                    type="number"
                    min="1"
                    max="4096"
                    value={getSettingValue('OLLAMA_NUM_PREDICT')}
                    onChange={(e) => handleSettingChange('OLLAMA_NUM_PREDICT', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ollama_temperature">temperature</Label>
                  <Input
                    id="ollama_temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.05"
                    value={getSettingValue('OLLAMA_TEMPERATURE')}
                    onChange={(e) => handleSettingChange('OLLAMA_TEMPERATURE', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ollama_top_p">top_p</Label>
                  <Input
                    id="ollama_top_p"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={getSettingValue('OLLAMA_TOP_P')}
                    onChange={(e) => handleSettingChange('OLLAMA_TOP_P', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ollama_num_ctx">num_ctx</Label>
                  <Input
                    id="ollama_num_ctx"
                    type="number"
                    min="128"
                    max="131072"
                    value={getSettingValue('OLLAMA_NUM_CTX')}
                    onChange={(e) => handleSettingChange('OLLAMA_NUM_CTX', e.target.value)}
                    placeholder="空欄でモデル既定"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ollama_stop">stop（カンマ/改行区切り）</Label>
                <Textarea
                  id="ollama_stop"
                  value={getSettingValue('OLLAMA_STOP')}
                  onChange={(e) => handleSettingChange('OLLAMA_STOP', e.target.value)}
                  rows={2}
                  placeholder="例: \\n*( \\n###"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ollama_custom_model_name">Modelfile 出力モデル名</Label>
                <Input
                  id="ollama_custom_model_name"
                  value={getSettingValue('OLLAMA_CUSTOM_MODEL_NAME')}
                  onChange={(e) => handleSettingChange('OLLAMA_CUSTOM_MODEL_NAME', e.target.value)}
                  placeholder="例: shisa-translator"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ここで指定した名前で `ollama create` を実行します
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleCreateOllamaModelfile(true)}
                  disabled={creatingOllamaModelfile || !ollamaReady}
                >
                  {creatingOllamaModelfile ? '生成中...' : 'Modelfile生成＆適用'}
                </Button>
                <span>現在の設定からModelfileを作り、Ollamaモデルとして登録します</span>
              </div>
              {ollamaModelfileError && (
                <p className="text-xs text-red-500">{ollamaModelfileError}</p>
              )}
              {ollamaModelfilePreview && (
                <div className="space-y-2">
                  <Label>生成されたModelfile</Label>
                  <Textarea readOnly rows={6} value={ollamaModelfilePreview} />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>ステータス</Label>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    {ollamaStatus?.healthy
                      ? `接続中${ollamaStatus.version ? ` (v${ollamaStatus.version})` : ''}`
                      : ollamaStatus?.running
                        ? '起動中'
                        : '停止中'}
                  </div>
                  {ollamaStatus?.error && !ollamaStatus.healthy && (
                    <p className="text-xs text-red-500">{ollamaStatus.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 space-y-3">
            <div className="text-base font-semibold text-gray-700 dark:text-gray-200">翻訳テスト</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>バックエンド</Label>
                <Select
                  value={translationTestBackend}
                  onValueChange={(value) => setTranslationTestBackend(value as 'openai' | 'ollama')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="ollama">Ollama</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Select
                  value={translationTestSourceLang || autoLangValue}
                  onValueChange={(value) =>
                    setTranslationTestSourceLang(value === autoLangValue ? '' : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="自動判定" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={autoLangValue}>自動判定</SelectItem>
                    {languageOptions.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}（{lang.value}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target</Label>
                <Select
                  value={translationTestTargetLang || 'eng'}
                  onValueChange={(value) => setTranslationTestTargetLang(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="言語を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}（{lang.value}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="translation-test-text">テスト文</Label>
              <Textarea
                id="translation-test-text"
                value={translationTestText}
                onChange={(e) => setTranslationTestText(e.target.value)}
                rows={3}
                placeholder="翻訳したい文章を入力"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleTestTranslation}
                disabled={translationTesting || (translationTestBackend === 'ollama' && !ollamaReady)}
                variant="outline"
              >
                {translationTesting ? '翻訳中...' : '翻訳テスト'}
              </Button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                OpenAI/OllamaどちらもISO 639-3（例: jpn/eng）を推奨
              </span>
            </div>
            <div className="space-y-2">
              <Label>結果</Label>
              <Textarea
                value={translationTestResult}
                readOnly
                rows={3}
                placeholder="翻訳結果がここに表示されます"
              />
              {translationTestTookMs !== null && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  処理時間: {translationTestTookMs}ms
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
