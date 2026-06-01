/** Mock data for the Shots reels-style feed. */

export type Shot = {
  id: string;
  username: string;
  handle: string;
  hue: number;
  verified: boolean;
  caption: string;
  hypes: number;
  comments: number;
  from: number;
  to: number;
};

export const shotsFeed: Shot[] = [
  {
    id: "sh1",
    username: "AMAN",
    handle: "@aman",
    hue: 280,
    verified: true,
    caption: "POV: it's 2am and the city is yours 🌃",
    hypes: 4200,
    comments: 188,
    from: 265,
    to: 320,
  },
  {
    id: "sh2",
    username: "zoya",
    handle: "@zoya",
    hue: 95,
    verified: false,
    caption: "green screen tutorial pt.3 🎬",
    hypes: 980,
    comments: 64,
    from: 95,
    to: 150,
  },
  {
    id: "sh3",
    username: "dev",
    handle: "@devbuilds",
    hue: 150,
    verified: true,
    caption: "shipped a feature in 60 seconds, watch 🚀",
    hypes: 7600,
    comments: 322,
    from: 150,
    to: 195,
  },
  {
    id: "sh4",
    username: "kabir",
    handle: "@kabir",
    hue: 330,
    verified: false,
    caption: "sunset run, no thoughts 🏃‍♂️",
    hypes: 2300,
    comments: 91,
    from: 330,
    to: 25,
  },
];
