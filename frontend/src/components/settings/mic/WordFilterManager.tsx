import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
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
  const [newBadWord, setNewBadWord] = useState('');
  const [newGoodWord, setNewGoodWord] = useState('');
  const [addingBad, setAddingBad] = useState(false);
  const [addingGood, setAddingGood] = useState(false);

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

  const handleAdd = useCallback(async (wordType: 'bad' | 'good', word: string) => {
    const trimmed = word.trim();
    if (!trimmed) return;

    const setAdding = wordType === 'bad' ? setAddingBad : setAddingGood;
    const setNewWord = wordType === 'bad' ? setNewBadWord : setNewGoodWord;
    setAdding(true);

    try {
      const res = await fetch(buildApiUrl('/api/word-filter'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: selectedLang, word: trimmed, type: wordType }),
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
  }, [selectedLang, fetchWords, invalidateCache, fetchLanguages]);

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
      <div className="space-y-2">
        <Label>言語</Label>
        <Select value={selectedLang} onValueChange={setSelectedLang}>
          <SelectTrigger className="w-32">
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
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中...
        </div>
      ) : (
        <>
          <WordSection
            title="Bad Words"
            subtitle="フィルタ対象のワード"
            words={badWords}
            newWord={newBadWord}
            setNewWord={setNewBadWord}
            adding={addingBad}
            onAdd={() => handleAdd('bad', newBadWord)}
            onDelete={handleDelete}
          />

          <WordSection
            title="Good Words"
            subtitle="BadWordを含むが許可するワード"
            words={goodWords}
            newWord={newGoodWord}
            setNewWord={setNewGoodWord}
            adding={addingGood}
            onAdd={() => handleAdd('good', newGoodWord)}
            onDelete={handleDelete}
          />
        </>
      )}
    </div>
  );
};

type WordSectionProps = {
  title: string;
  subtitle: string;
  words: WordItem[];
  newWord: string;
  setNewWord: (v: string) => void;
  adding: boolean;
  onAdd: () => void;
  onDelete: (id: number) => void;
};

const WordSection: React.FC<WordSectionProps> = ({
  title, subtitle, words, newWord, setNewWord, adding, onAdd, onDelete,
}) => (
  <div className="space-y-2">
    <div>
      <Label className="text-xs font-semibold">{title}</Label>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>

    {words.length > 0 && (
      <div className="max-h-40 overflow-y-auto border border-gray-800/60 rounded-md p-2 space-y-1">
        {words.map((w) => (
          <div key={w.id} className="flex items-center justify-between group text-sm py-0.5 px-1 rounded hover:bg-gray-800/40">
            <span className="text-gray-300 truncate">{w.word}</span>
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 cursor-pointer"
              onClick={() => onDelete(w.id)}
              title="削除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    )}

    <div className="flex gap-2">
      <Input
        className="flex-1 h-8 text-sm"
        placeholder="ワードを入力..."
        value={newWord}
        onChange={(e) => setNewWord(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        disabled={adding || !newWord.trim()}
        onClick={onAdd}
      >
        {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </Button>
    </div>
  </div>
);
