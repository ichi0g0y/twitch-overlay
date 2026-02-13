import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { buildApiUrl } from '../../../utils/api';
import { clearWordListCache, preloadWordLists } from '../../../utils/contentFilter';

type WordItem = {
  id: number;
  language: string;
  word: string;
  type: 'bad' | 'good';
};

export const WordFilterManager: React.FC = () => {
  const [languages, setLanguages] = useState<string[]>([]);
  const [selectedLang, setSelectedLang] = useState('ja');
  const [words, setWords] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'bad' | 'good'>('bad');

  const fetchLanguages = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl('/api/word-filter/languages'));
      const json = await res.json();
      setLanguages(json.data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchWords = useCallback(async (lang: string) => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`/api/word-filter?lang=${encodeURIComponent(lang)}`));
      const json = await res.json();
      setWords(json.data || []);
    } catch {
      setWords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLanguages(); }, [fetchLanguages]);
  useEffect(() => { fetchWords(selectedLang); }, [selectedLang, fetchWords]);

  const invalidateCache = useCallback((lang: string) => {
    clearWordListCache(lang);
    preloadWordLists([lang]);
  }, []);

  const handleAdd = useCallback(async () => {
    const trimmed = newWord.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const res = await fetch(buildApiUrl('/api/word-filter'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: selectedLang, word: trimmed, type: activeTab }),
      });
      if (res.ok) {
        setNewWord('');
        await fetchWords(selectedLang);
        invalidateCache(selectedLang);
        fetchLanguages();
      }
    } finally {
      setAdding(false);
    }
  }, [newWord, selectedLang, activeTab, fetchWords, invalidateCache, fetchLanguages]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      const res = await fetch(buildApiUrl(`/api/word-filter/${id}`), { method: 'DELETE' });
      if (res.ok) {
        await fetchWords(selectedLang);
        invalidateCache(selectedLang);
      }
    } catch { /* ignore */ }
  }, [selectedLang, fetchWords, invalidateCache]);

  const badWords = words.filter((w) => w.type === 'bad');
  const goodWords = words.filter((w) => w.type === 'good');

  return (
    <div className="space-y-3 pt-2">
      <div className="flex items-center gap-3">
        <Select value={selectedLang} onValueChange={setSelectedLang}>
          <SelectTrigger className="w-24 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang} value={lang}>{lang}</SelectItem>
            ))}
            {!languages.includes(selectedLang) && (
              <SelectItem value={selectedLang}>{selectedLang}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-500">
          {words.length} 件登録済み
        </span>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'bad' | 'good')}>
        <TabsList className="w-full">
          <TabsTrigger value="bad" className="flex-1 text-xs">
            Bad Words
            {badWords.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] leading-none">
                {badWords.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="good" className="flex-1 text-xs">
            Good Words
            {goodWords.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] leading-none">
                {goodWords.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <>
            <TabsContent value="bad">
              <WordChips words={badWords} onDelete={handleDelete} variant="bad" />
            </TabsContent>
            <TabsContent value="good">
              <WordChips words={goodWords} onDelete={handleDelete} variant="good" />
            </TabsContent>
          </>
        )}
      </Tabs>

      <div className="flex gap-2">
        <Input
          className="flex-1 h-8 text-sm"
          placeholder={activeTab === 'bad' ? 'フィルタするワード...' : '許可するワード...'}
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-3"
          disabled={adding || !newWord.trim()}
          onClick={handleAdd}
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
};

type WordChipsProps = {
  words: WordItem[];
  onDelete: (id: number) => void;
  variant: 'bad' | 'good';
};

const WordChips: React.FC<WordChipsProps> = ({ words, onDelete, variant }) => {
  if (words.length === 0) {
    return (
      <p className="text-xs text-gray-500 py-4 text-center">
        {variant === 'bad' ? 'フィルタ対象のワードがありません' : '許可ワードがありません'}
      </p>
    );
  }

  const chipColor = variant === 'bad'
    ? 'bg-red-500/10 border-red-500/20 text-red-300 hover:bg-red-500/20'
    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20';

  const btnColor = variant === 'bad'
    ? 'hover:bg-red-500/30 hover:text-red-200'
    : 'hover:bg-emerald-500/30 hover:text-emerald-200';

  return (
    <div className="max-h-48 overflow-y-auto rounded-md p-2">
      <div className="flex flex-wrap gap-1.5">
        {words.map((w) => (
          <span
            key={w.id}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-colors ${chipColor}`}
          >
            {w.word}
            <button
              type="button"
              className={`rounded-full p-0.5 transition-colors cursor-pointer ${btnColor}`}
              onClick={() => onDelete(w.id)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};
