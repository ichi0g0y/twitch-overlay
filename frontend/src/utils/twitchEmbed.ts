const TWITCH_EMBED_SCRIPT_URL = 'https://embed.twitch.tv/embed/v1.js';

let loadPromise: Promise<void> | null = null;

export function loadTwitchEmbedScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Twitch?.Player) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TWITCH_EMBED_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Twitch?.Player) {
        resolve();
        return;
      }
      loadPromise = null;
      reject(new Error('Failed to initialize Twitch Embed SDK'));
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Twitch Embed SDK'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
