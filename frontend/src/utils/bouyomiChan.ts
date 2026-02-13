export type BouyomiChanTalkOptions = {
  url?: string;
  host?: string;
  port?: number;
  path?: string;
};

const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 50002; // BouyomiChan WebSocket
const DEFAULT_PATH = '/ws/';

function makeBouyomiPacketUtf8(text: string): Uint8Array {
  // Protocol: { message: string }
  const command = 0x0001; // talk
  const speed = -1;
  const tone = -1;
  const volume = -1;
  const voice = 0;
  const code = 0; // UTF-8

  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;

  const total = 2 + 2 + 2 + 2 + 2 + 1 + 4 + len;
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  let offset = 0;

  view.setUint16(offset, command, true); offset += 2;
  view.setInt16(offset, speed, true); offset += 2;
  view.setInt16(offset, tone, true); offset += 2;
  view.setInt16(offset, volume, true); offset += 2;
  view.setUint16(offset, voice, true); offset += 2;
  view.setUint8(offset, code); offset += 1;
  view.setUint32(offset, len, true); offset += 4;

  new Uint8Array(buf, offset).set(bytes);
  return new Uint8Array(buf);
}

export async function talkBouyomiChan(text: string, opts: BouyomiChanTalkOptions = {}): Promise<void> {
  const trimmed = (text || '').trim();
  if (!trimmed) return;

  const url = opts.url
    || `ws://${opts.host || DEFAULT_HOST}:${opts.port ?? DEFAULT_PORT}${opts.path || DEFAULT_PATH}`;
  const payload = makeBouyomiPacketUtf8(trimmed);

  await new Promise<void>((resolve, reject) => {
    let sent = false;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    const safeClose = () => {
      try { ws.close(); } catch { /* ignore */ }
    };

    ws.onopen = () => {
      try {
        ws.send(payload);
        sent = true;
        // Some servers don't respond; close after a short delay.
        setTimeout(() => safeClose(), 200);
      } catch (e: any) {
        safeClose();
        reject(e);
      }
    };
    ws.onerror = () => {
      safeClose();
      reject(new Error('BouyomiChan WebSocket connection failed'));
    };
    ws.onmessage = () => {
      // Received any response; close and resolve.
      safeClose();
    };
    ws.onclose = () => {
      // If we at least sent data, treat as success.
      if (sent) resolve();
      else reject(new Error('BouyomiChan WebSocket closed before send'));
    };
  });
}
