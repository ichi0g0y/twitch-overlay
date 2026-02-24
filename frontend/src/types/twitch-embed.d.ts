type TwitchPlayerOptions = {
  channel: string;
  parent: string[];
  width?: number | string;
  height?: number | string;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
};

type TwitchPlayerListener = (...args: unknown[]) => void;

type TwitchPlayerInstance = {
  addEventListener(eventName: string, listener: TwitchPlayerListener): void;
  removeEventListener(eventName: string, listener: TwitchPlayerListener): void;
  setMuted(muted: boolean): void;
  play(): void | Promise<void>;
};

type TwitchPlayerConstructor = {
  new (target: HTMLElement | string, options: TwitchPlayerOptions): TwitchPlayerInstance;
  READY: string;
};

type TwitchNamespace = {
  Player: TwitchPlayerConstructor;
};

declare global {
  interface Window {
    Twitch?: TwitchNamespace;
  }
}

export {};
