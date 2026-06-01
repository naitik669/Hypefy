/** Mock data for the Notifications page. */

export type NotifType =
  | "hype"
  | "comment"
  | "follow"
  | "room_invite"
  | "room_join"
  | "shot_hype"
  | "room_active";

export type NotifGroup = "Now" | "Earlier" | "This week";

export type Notif = {
  id: string;
  type: NotifType;
  actor: { name: string; hue: number; verified: boolean };
  text: string;
  time: string;
  group: NotifGroup;
  unread: boolean;
  preview?: { from: number; to: number };
  action?: "follow" | "join";
};

export const notifications: Notif[] = [
  {
    id: "n1",
    type: "hype",
    actor: { name: "AMAN", hue: 280, verified: true },
    text: "hyped your post",
    time: "2m",
    group: "Now",
    unread: true,
    preview: { from: 265, to: 320 },
  },
  {
    id: "n2",
    type: "comment",
    actor: { name: "riya", hue: 200, verified: false },
    text: "replied to your Shot",
    time: "14m",
    group: "Now",
    unread: true,
    preview: { from: 200, to: 240 },
  },
  {
    id: "n3",
    type: "follow",
    actor: { name: "zoya", hue: 95, verified: false },
    text: "started following you",
    time: "1h",
    group: "Earlier",
    unread: false,
    action: "follow",
  },
  {
    id: "n4",
    type: "room_invite",
    actor: { name: "dev", hue: 150, verified: true },
    text: "invited you to AI Builders",
    time: "3h",
    group: "Earlier",
    unread: false,
    action: "join",
  },
  {
    id: "n5",
    type: "room_active",
    actor: { name: "Meme Lab", hue: 330, verified: false },
    text: "is blowing up right now 🔥",
    time: "5h",
    group: "Earlier",
    unread: false,
  },
  {
    id: "n6",
    type: "shot_hype",
    actor: { name: "kabir", hue: 30, verified: false },
    text: "and 24 others hyped your Shot",
    time: "2d",
    group: "This week",
    unread: false,
    preview: { from: 30, to: 60 },
  },
  {
    id: "n7",
    type: "room_join",
    actor: { name: "noc", hue: 30, verified: false },
    text: "joined your Room",
    time: "4d",
    group: "This week",
    unread: false,
  },
];
