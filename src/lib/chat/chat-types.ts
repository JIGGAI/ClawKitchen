export type ChatAuthor = {
  kind: "human" | "agent";
  id: string;
  label?: string;
};

export type ChatMessage = {
  id: string;
  ts: string; // ISO
  roomId: string; // e.g. "team" | "role:dev"
  author: ChatAuthor;
  text: string;
  meta?: {
    ticketId?: string;
    replyTo?: string;
    mentions?: string[];
  };
};

export type ChatRoom = {
  roomId: string;
  label: string;
  file: string;
};
