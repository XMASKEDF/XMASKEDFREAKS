export type CustomerOrder = {
  id: string;
  orderNumber: string;
  productName: string;
  productType: string;
  imageUrl: string;
  createdAt: string;
  coinsPaid: number;
  status: string;
  digital: boolean;
  downloadUrl: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  merchandiseCoins: number | null;
  shippingCoins: number | null;
  taxCoins: number | null;
};

export type CustomerWalletEntry = {
  id: string;
  createdAt: string;
  amount: number;
  reason: string;
  runningBalance: number;
  status: string;
};

export type CustomerProductReference = {
  id: string;
  productType: string;
  title: string;
  imageUrl: string;
  href: string;
  createdAt: string;
  badge?: string;
};

export type CustomerActivity = {
  id: string;
  activityType: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type CustomerHighScore = {
  gameId: string;
  gameTitle: string;
  score: number;
  difficulty: string;
  roundLevel: number | null;
  achievedAt: string;
  globalRank: number | null;
};

export type CustomerNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  destinationUrl: string | null;
  priority: string;
  readAt: string | null;
  createdAt: string;
};

export type CustomerAccountState = {
  authenticated: boolean;
  userId: string | null;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  preferredLanguage: string;
  liveAlertsEnabled: boolean;
  productUpdatesEnabled: boolean;
  balance: number | null;
  lastDeposit: CustomerWalletEntry | null;
  lastPurchase: CustomerWalletEntry | null;
  walletHistory: CustomerWalletEntry[];
  orders: CustomerOrder[];
  favorites: CustomerProductReference[];
  recentlyViewed: CustomerProductReference[];
  whatsNew: CustomerProductReference[];
  activity: CustomerActivity[];
  highScores: CustomerHighScore[];
  notifications: CustomerNotification[];
};

export const EMPTY_CUSTOMER_ACCOUNT: CustomerAccountState = {
  authenticated: false,
  userId: null,
  email: "",
  nickname: "",
  avatarUrl: null,
  preferredLanguage: "en",
  liveAlertsEnabled: true,
  productUpdatesEnabled: true,
  balance: null,
  lastDeposit: null,
  lastPurchase: null,
  walletHistory: [],
  orders: [],
  favorites: [],
  recentlyViewed: [],
  whatsNew: [],
  activity: [],
  highScores: [],
  notifications: []
};
