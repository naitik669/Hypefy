/** Mock data for Messages inbox + threads. */

export type Thread = {
  id: string;
  name: string;
  handle: string;
  hue: number;
  verified: boolean;
  online: boolean;
  preview: string;
  time: string;
  unread: number;
  isRoom: boolean;
};

export type ChatMessage =
  | { id: string; kind: "text"; mine: boolean; text: string; time: string }
  | { id: string; kind: "voice"; mine: boolean; seconds: number; time: string }
  | { id: string; kind: "hype"; mine: boolean; time: string }
  | {
      id: string;
      kind: "post";
      mine: boolean;
      time: string;
      post: { username: string; caption: string; hypes: number; from: number; to: number };
    };

export const threads: Thread[] = [
  {
    id: "aman",
    name: "AMAN",
    handle: "@aman",
    hue: 280,
    verified: true,
    online: true,
    preview: "sent 3 messages",
    time: "2m",
    unread: 3,
    isRoom: false,
  },
  {
    id: "riya",
    name: "riya",
    handle: "@riya.k",
    hue: 200,
    verified: false,
    online: true,
    preview: "this post looks clean 🔥",
    time: "18m",
    unread: 0,
    isRoom: false,
  },
  {
    id: "dev",
    name: "dev",
    handle: "@devbuilds",
    hue: 150,
    verified: true,
    online: false,
    preview: "ship it tonight?",
    time: "1h",
    unread: 1,
    isRoom: false,
  },
  {
    id: "crazie",
    name: "Crazie Room",
    handle: "12 members",
    hue: 330,
    verified: false,
    online: true,
    preview: "12 new hypes on your post",
    time: "3h",
    unread: 5,
    isRoom: true,
  },
  {
    id: "noc",
    name: "noc",
    handle: "@noc",
    hue: 30,
    verified: false,
    online: false,
    preview: "check the room",
    time: "1d",
    unread: 0,
    isRoom: false,
  },
];

const defaultThread: ChatMessage[] = [
  { id: "m1", kind: "text", mine: false, text: "yo 👋", time: "2:01" },
  { id: "m2", kind: "text", mine: true, text: "hey! what's up", time: "2:02" },
];

export const messagesByThread: Record<string, ChatMessage[]> = {
  aman: [
    { id: "a1", kind: "text", mine: false, text: "yo did you see my new post", time: "2:01" },
    {
      id: "a2",
      kind: "post",
      mine: false,
      time: "2:01",
      post: {
        username: "@aman",
        caption: "late night drives hit different 🌌",
        hypes: 1284,
        from: 265,
        to: 320,
      },
    },
    { id: "a3", kind: "text", mine: true, text: "that's clean 🔥 hyping it rn", time: "2:03" },
    { id: "a4", kind: "hype", mine: true, time: "2:03" },
    { id: "a5", kind: "voice", mine: false, seconds: 14, time: "2:05" },
    { id: "a6", kind: "text", mine: false, text: "lmk when you drop yours", time: "2:06" },
  ],
  riya: [
    { id: "r1", kind: "text", mine: false, text: "this post looks clean 🔥", time: "1:40" },
    { id: "r2", kind: "text", mine: true, text: "thank uu 🙏", time: "1:41" },
  ],
  dev: [
    { id: "d1", kind: "text", mine: false, text: "ship it tonight?", time: "12:10" },
    { id: "d2", kind: "text", mine: true, text: "yeah merging now", time: "12:12" },
  ],
};

export function getThreadMessages(id: string): ChatMessage[] {
  return messagesByThread[id] ?? defaultThread;
}

export function getThread(id: string): Thread | undefined {
  return threads.find((t) => t.id === id);
}
