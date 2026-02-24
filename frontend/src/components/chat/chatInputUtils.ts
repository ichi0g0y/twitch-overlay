export type InputFragment = {
  type: 'text' | 'emote';
  text: string;
  emoteUrl?: string;
};

const isSelectionInside = (container: HTMLElement, selection: Selection | null) => {
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return container.contains(range.commonAncestorContainer);
};

const selectRange = (range: Range) => {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
};

const collectFragmentsFromNode = (node: Node, fragments: InputFragment[]) => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').replace(/\u00a0/g, ' ');
    if (text !== '') {
      fragments.push({ type: 'text', text });
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  if (element.tagName === 'IMG') {
    const name = element.dataset.emoteName?.trim() || '';
    if (name !== '') {
      fragments.push({
        type: 'emote',
        text: name,
        emoteUrl: element.dataset.emoteUrl || element.getAttribute('src') || undefined,
      });
    }
    return;
  }

  if (element.tagName === 'BR') {
    fragments.push({ type: 'text', text: '\n' });
    return;
  }

  for (const child of Array.from(node.childNodes)) {
    collectFragmentsFromNode(child, fragments);
  }
};

export const extractFragments = (container: HTMLElement): InputFragment[] => {
  const fragments: InputFragment[] = [];
  for (const node of Array.from(container.childNodes)) {
    collectFragmentsFromNode(node, fragments);
  }
  return fragments;
};

export const fragmentsToIrcText = (fragments: InputFragment[]): string => {
  let text = '';
  for (const fragment of fragments) {
    if (fragment.type === 'text') {
      text += fragment.text;
      continue;
    }

    const emoteName = fragment.text.trim();
    if (emoteName === '') continue;
    if (text !== '' && !/\s$/.test(text)) {
      text += ' ';
    }
    text += emoteName;
    text += ' ';
  }
  return text.replace(/\u00a0/g, ' ');
};

export const createEmoteElement = (name: string, url: string) => {
  const img = document.createElement('img');
  img.src = url;
  img.alt = name;
  img.title = name;
  img.draggable = false;
  img.dataset.emoteName = name;
  img.dataset.emoteUrl = url;
  img.className = 'mx-0.5 inline-block h-5 w-5 select-none align-text-bottom rounded-sm';
  img.contentEditable = 'false';
  return img;
};

export const moveCursorToEnd = (container: HTMLElement) => {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(container);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

const getSafeRange = (container: HTMLElement): Range => {
  const selection = window.getSelection();
  if (selection && isSelectionInside(container, selection)) {
    return selection.getRangeAt(0);
  }

  moveCursorToEnd(container);
  const nextSelection = window.getSelection();
  if (nextSelection && nextSelection.rangeCount > 0) {
    return nextSelection.getRangeAt(0);
  }

  const fallback = document.createRange();
  fallback.selectNodeContents(container);
  fallback.collapse(false);
  return fallback;
};

export const insertTextAtCursor = (container: HTMLElement, rawText: string) => {
  if (rawText === '') return;
  const range = getSafeRange(container);
  range.deleteContents();

  const textNode = document.createTextNode(rawText);
  range.insertNode(textNode);

  const nextRange = document.createRange();
  nextRange.setStartAfter(textNode);
  nextRange.collapse(true);
  selectRange(nextRange);
};

export const insertEmoteAtCursor = (container: HTMLElement, name: string, url: string) => {
  const range = getSafeRange(container);
  range.deleteContents();

  const fragment = document.createDocumentFragment();
  const emoteNode = createEmoteElement(name, url);
  const trailingSpace = document.createTextNode(' ');

  fragment.appendChild(emoteNode);
  fragment.appendChild(trailingSpace);
  range.insertNode(fragment);

  const nextRange = document.createRange();
  nextRange.setStartAfter(trailingSpace);
  nextRange.collapse(true);
  selectRange(nextRange);
};

export const isContentEmpty = (container: HTMLElement) => {
  const fragments = extractFragments(container);
  if (fragments.length === 0) return true;
  for (const fragment of fragments) {
    if (fragment.type === 'emote') return false;
    if (fragment.text.trim() !== '') return false;
  }
  return true;
};
