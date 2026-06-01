/** Mock data for Discover + Search. */

export type TrendingPost = {
  id: string;
  username: string;
  hypes: number;
  from: number;
  to: number;
};

export type Room = {
  id: string;
  name: string;
  members: number;
  hype: number; // Hype Meter 0–100
  from: number;
  to: number;
};

export type SuggestedUser = {
  id: string;
  name: string;
  handle: string;
  hue: number;
  verified: boolean;
};

export const trending: TrendingPost[] = [
  { id: "t1", username: "@aman", hypes: 1284, from: 265, to: 320 },
  { id: "t2", username: "@dev", hypes: 7600, from: 140, to: 175 },
  { id: "t3", username: "@zoya", hypes: 980, from: 95, to: 140 },
  { id: "t4", username: "@kabir", hypes: 2300, from: 330, to: 20 },
];

export const rooms: Room[] = [
  { id: "meme-lab", name: "Meme Lab", members: 1820, hype: 92, from: 280, to: 330 },
  { id: "creator-circle", name: "Creator Circle", members: 940, hype: 74, from: 200, to: 250 },
  { id: "late-night", name: "Late Night Talks", members: 2310, hype: 88, from: 250, to: 300 },
  { id: "ai-builders", name: "AI Builders", members: 1560, hype: 81, from: 150, to: 190 },
  { id: "design-room", name: "Design Room", members: 670, hype: 66, from: 30, to: 70 },
];

export const people: SuggestedUser[] = [
  { id: "u1", name: "AMAN", handle: "@aman", hue: 280, verified: true },
  { id: "u2", name: "riya", handle: "@riya.k", hue: 200, verified: false },
  { id: "u3", name: "dev", handle: "@devbuilds", hue: 150, verified: true },
  { id: "u4", name: "zoya", handle: "@zoya", hue: 95, verified: false },
  { id: "u5", name: "kabir", handle: "@kabir", hue: 330, verified: false },
];
