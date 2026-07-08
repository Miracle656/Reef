export type MockAuthor = {
  handle: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  followingCount: number;
  followersCount: number;
  suinsName: string | null;
};

export type MockPost = {
  id: string;
  author: MockAuthor;
  text: string;
  media: string[];
  likes: number;
  createdAt: number;
  replyTo?: string;
};

export type MockLevel = { price: number; size: number };
export type MockBook = { asks: MockLevel[]; bids: MockLevel[]; mid: number };

export const MOCK_AUTHORS: Record<string, MockAuthor> = {
  lagosbuild: {
    handle: 'lagosbuild',
    displayName: 'Lagos Build',
    avatar: null,
    bio: 'Shipping on Sui from Lagos. DeFi × Social.',
    followingCount: 84,
    followersCount: 312,
    suinsName: 'lagosbuild.umbra.sui',
  },
  web3ng: {
    handle: 'web3ng',
    displayName: 'Web3 NG',
    avatar: null,
    bio: 'Web3 for Africa. zkLogin believer.',
    followingCount: 210,
    followersCount: 1400,
    suinsName: 'web3ng.umbra.sui',
  },
  suibuilder: {
    handle: 'suibuilder',
    displayName: 'Sui Builder',
    avatar: null,
    bio: 'Move dev. Testnet grinder.',
    followingCount: 56,
    followersCount: 780,
    suinsName: 'suibuilder.umbra.sui',
  },
  amakacodes: {
    handle: 'amakacodes',
    displayName: 'Amaka Codes',
    avatar: null,
    bio: 'Frontend + smart contracts. She/Her.',
    followingCount: 100,
    followersCount: 540,
    suinsName: 'amakacodes.umbra.sui',
  },
};

export const MOCK_POSTS: MockPost[] = [
  {
    id: '1',
    author: MOCK_AUTHORS['lagosbuild']!,
    text: 'Just deployed my first dapp on Sui testnet 🚀 The zkLogin flow is buttery smooth — no seed phrases, no gas for users. This is the future of onboarding.',
    media: [],
    likes: 42,
    createdAt: Date.now() - 3_600_000,
  },
  {
    id: '2',
    author: MOCK_AUTHORS['web3ng']!,
    text: 'Umbra is what crypto social should have been from day 1. Lagos-first. Mobile-first. Chain-first. Building here.',
    media: [],
    likes: 87,
    createdAt: Date.now() - 7_200_000,
  },
  {
    id: '3',
    author: MOCK_AUTHORS['suibuilder']!,
    text: 'Owned objects + no consensus on hot paths = Sui posts literally never contend with each other. Every post is parallel. The architecture is 🔥',
    media: [],
    likes: 134,
    createdAt: Date.now() - 14_400_000,
  },
  {
    id: '4',
    author: MOCK_AUTHORS['amakacodes']!,
    text: 'WAGMI but actually — Walrus for media, zkLogin for auth, Enoki for gas sponsorship. No middlemen. Built for everyone.',
    media: [],
    likes: 61,
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: '5',
    author: MOCK_AUTHORS['lagosbuild']!,
    text: 'Phase 1 ships: identity → on-chain graph → storage → indexer → feed. All with zero gas for the user. Testnet live. 🌊',
    media: [],
    likes: 29,
    createdAt: Date.now() - 172_800_000,
  },
  // replies (threaded under posts via replyTo)
  {
    id: 'r1',
    author: MOCK_AUTHORS['amakacodes']!,
    text: 'This is huge 🙌 zkLogin really is the onboarding unlock we needed.',
    media: [],
    likes: 8,
    createdAt: Date.now() - 3_300_000,
    replyTo: '1',
  },
  {
    id: 'r2',
    author: MOCK_AUTHORS['web3ng']!,
    text: 'Tried it on mobile — felt like a web2 app. No wallet popups at all.',
    media: [],
    likes: 5,
    createdAt: Date.now() - 3_000_000,
    replyTo: '1',
  },
  {
    id: 'r3',
    author: MOCK_AUTHORS['lagosbuild']!,
    text: 'Exactly. Parallel posts = no global bottleneck. Sui was built for this.',
    media: [],
    likes: 12,
    createdAt: Date.now() - 14_000_000,
    replyTo: '3',
  },
];

// Fake order-book levels keyed by pair
export const MOCK_BOOKS: Record<string, MockBook> = {
  SUI_DBUSDC: {
    mid: 3.4812,
    asks: [
      { price: 3.4900, size: 1200 },
      { price: 3.5050, size: 800 },
      { price: 3.5200, size: 2400 },
      { price: 3.5410, size: 600 },
      { price: 3.5600, size: 3100 },
    ],
    bids: [
      { price: 3.4724, size: 1500 },
      { price: 3.4600, size: 950 },
      { price: 3.4440, size: 1800 },
      { price: 3.4200, size: 700 },
      { price: 3.4000, size: 2200 },
    ],
  },
  DEEP_DBUSDC: {
    mid: 0.0841,
    asks: [
      { price: 0.0845, size: 18000 },
      { price: 0.0850, size: 9000 },
      { price: 0.0860, size: 24000 },
      { price: 0.0872, size: 7000 },
      { price: 0.0880, size: 31000 },
    ],
    bids: [
      { price: 0.0837, size: 21000 },
      { price: 0.0830, size: 14000 },
      { price: 0.0820, size: 18000 },
      { price: 0.0810, size: 9000 },
      { price: 0.0800, size: 25000 },
    ],
  },
  USDT_DBUSDC: {
    mid: 0.9998,
    asks: [
      { price: 1.0001, size: 45000 },
      { price: 1.0005, size: 22000 },
      { price: 1.0010, size: 18000 },
      { price: 1.0020, size: 9000 },
      { price: 1.0030, size: 5000 },
    ],
    bids: [
      { price: 0.9995, size: 38000 },
      { price: 0.9990, size: 17000 },
      { price: 0.9980, size: 12000 },
      { price: 0.9970, size: 7000 },
      { price: 0.9960, size: 4000 },
    ],
  },
};

export type MockPrediction = {
  id: string;
  question: string;
  category: string;
  yesProb: number;
  volume: number;
  endsAt: number;
};

export const MOCK_PREDICTIONS: MockPrediction[] = [
  {
    id: 'p1',
    question: 'Will SUI price exceed $5 before end of Q3 2026?',
    category: 'Crypto Price',
    yesProb: 0.61,
    volume: 48200,
    endsAt: Date.now() + 45 * 24 * 3600 * 1000,
  },
  {
    id: 'p2',
    question: 'Will Sui TVL surpass $2B in 2026?',
    category: 'DeFi',
    yesProb: 0.44,
    volume: 31500,
    endsAt: Date.now() + 120 * 24 * 3600 * 1000,
  },
  {
    id: 'p3',
    question: 'Will Umbra reach 10k users on testnet by August 2026?',
    category: 'Social',
    yesProb: 0.78,
    volume: 12800,
    endsAt: Date.now() + 60 * 24 * 3600 * 1000,
  },
  {
    id: 'p4',
    question: 'Will DEEP list on a top-5 CEX in 2026?',
    category: 'Listings',
    yesProb: 0.35,
    volume: 19700,
    endsAt: Date.now() + 180 * 24 * 3600 * 1000,
  },
];

export const PAIRS = [
  { key: 'SUI_DBUSDC', base: 'SUI', quote: 'USDC' },
  { key: 'DEEP_DBUSDC', base: 'DEEP', quote: 'USDC' },
  { key: 'USDT_DBUSDC', base: 'USDT', quote: 'USDC' },
] as const;

export type MockNotifType = 'follow' | 'like' | 'repost' | 'reply' | 'mention';

export type MockNotification = {
  id: string;
  type: MockNotifType;
  actor: MockAuthor;
  postId?: string;
  targetIsReply?: boolean;
  createdAtMs: number;
};

export const MOCK_NOTIFICATIONS: MockNotification[] = [
  { id: 'n1', type: 'follow', actor: MOCK_AUTHORS['web3ng']!, createdAtMs: Date.now() - 1_800_000 },
  { id: 'n2', type: 'like', actor: MOCK_AUTHORS['suibuilder']!, postId: '1', createdAtMs: Date.now() - 3_600_000 },
  { id: 'n3', type: 'reply', actor: MOCK_AUTHORS['amakacodes']!, postId: '1', targetIsReply: false, createdAtMs: Date.now() - 7_200_000 },
  { id: 'n4', type: 'mention', actor: MOCK_AUTHORS['lagosbuild']!, postId: '3', createdAtMs: Date.now() - 86_400_000 },
  { id: 'n5', type: 'repost', actor: MOCK_AUTHORS['web3ng']!, postId: '5', createdAtMs: Date.now() - 172_800_000 },
];
