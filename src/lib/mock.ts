/** Temporary mock data for the Home feed until the posts backend exists. */

export type Show = {
  id: string;
  name: string;
  hue: number;
  seen: boolean;
  avatar_url?: string | null;
};

export type Post = {
  id: string;
  username: string;
  handle: string;
  verified: boolean;
  hue: number; // avatar hue
  timeAgo: string;
  following: boolean;
  mediaFrom: number; // media gradient hue
  mediaTo: number;
  mediaCount: number;
  hypes: number;
  comments: number;
  hyped: boolean;
  caption: string;
};

export const shows: Show[] = [
  { id: "s1", name: "aman", hue: 280, seen: false },
  { id: "s2", name: "riya", hue: 200, seen: false },
  { id: "s3", name: "dev", hue: 150, seen: false },
  { id: "s4", name: "noor", hue: 30, seen: true },
  { id: "s5", name: "kabir", hue: 330, seen: true },
  { id: "s6", name: "zoya", hue: 95, seen: true },
];

export const posts: Post[] = [
  {
    id: "p1",
    username: "AMAN",
    handle: "@aman",
    verified: true,
    hue: 280,
    timeAgo: "2h",
    following: false,
    mediaFrom: 265,
    mediaTo: 320,
    mediaCount: 3,
    hypes: 1284,
    comments: 42,
    hyped: false,
    caption: "late night drives hit different 🌌",
  },
  {
    id: "p2",
    username: "riya",
    handle: "@riya.k",
    verified: false,
    hue: 200,
    timeAgo: "5h",
    following: true,
    mediaFrom: 190,
    mediaTo: 230,
    mediaCount: 1,
    hypes: 318,
    comments: 12,
    hyped: true,
    caption: "studio day ✨ new drop soon",
  },
  {
    id: "p3",
    username: "dev",
    handle: "@devbuilds",
    verified: true,
    hue: 150,
    timeAgo: "8h",
    following: false,
    mediaFrom: 140,
    mediaTo: 175,
    mediaCount: 2,
    hypes: 7600,
    comments: 210,
    hyped: false,
    caption: "shipped it. building in public is the way 🚀",
  },
  {
    id: "p4",
    username: "noor",
    handle: "@noor",
    verified: false,
    hue: 30,
    timeAgo: "1d",
    following: true,
    mediaFrom: 20,
    mediaTo: 50,
    mediaCount: 1,
    hypes: 91,
    comments: 5,
    hyped: false,
    caption: "golden hour never misses",
  },
];

export type CurrentUser = {
  name: string;
  handle: string;
  hue: number;
  verified: boolean;
  bio: string;
  link: string;
  vibe: string;
  stats: { posts: number; hypes: number; rooms: number };
};

export const currentUser: CurrentUser = {
  name: "AMAN",
  handle: "@aman",
  hue: 280,
  verified: true,
  bio: "building hypefy in public · chronically online",
  link: "hypefy.chat/aman",
  vibe: "building quietly",
  stats: { posts: 48, hypes: 8900, rooms: 6 },
};

export type Comment = {
  id: string;
  name: string;
  handle: string;
  hue: number;
  verified: boolean;
  text: string;
  hypes: number;
  time: string;
};

export const comments: Comment[] = [
  {
    id: "c1",
    name: "riya",
    handle: "@riya.k",
    hue: 200,
    verified: false,
    text: "this is so clean 🔥🔥",
    hypes: 24,
    time: "1h",
  },
  {
    id: "c2",
    name: "dev",
    handle: "@devbuilds",
    hue: 150,
    verified: true,
    text: "the vibe is immaculate",
    hypes: 12,
    time: "1h",
  },
  {
    id: "c3",
    name: "zoya",
    handle: "@zoya",
    hue: 95,
    verified: false,
    text: "okay where is this 👀",
    hypes: 5,
    time: "45m",
  },
  {
    id: "c4",
    name: "kabir",
    handle: "@kabir",
    hue: 330,
    verified: false,
    text: "hyped ⭐",
    hypes: 2,
    time: "20m",
  },
];

export function formatCount(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${n}`;
}
