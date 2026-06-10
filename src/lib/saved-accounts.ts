const KEY = "hypefy_accounts";

export type SavedAccount = {
  userId: string;
  email: string;
  displayName: string | null;
  username: string | null;
  avatarHue: number | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
};

export function getSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedAccount[];
  } catch { return []; }
}

export function upsertSavedAccount(account: SavedAccount) {
  const list = getSavedAccounts();
  const idx = list.findIndex((a) => a.userId === account.userId);
  if (idx >= 0) list[idx] = account;
  else list.push(account);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function removeSavedAccount(userId: string) {
  const list = getSavedAccounts().filter((a) => a.userId !== userId);
  localStorage.setItem(KEY, JSON.stringify(list));
}
