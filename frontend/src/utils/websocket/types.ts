export type MessageHandler = (data: any) => void;
export type ConnectionHandler = () => void;

export interface WSMessage {
  type: string;
  data: any;
}
