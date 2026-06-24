export const MAX_BULK_LAUNCH_ACCOUNTS = 10;

export interface SelectableAccount {
  id: string;
}

export function toggleBulkAccountSelection(
  selectedIds: string[],
  accountId: string,
  maxSelected = MAX_BULK_LAUNCH_ACCOUNTS
): string[] {
  if (selectedIds.includes(accountId)) {
    return selectedIds.filter((id) => id !== accountId);
  }

  if (selectedIds.length >= maxSelected) {
    return selectedIds;
  }

  return [...selectedIds, accountId];
}

export function selectFirstBulkAccounts(
  accounts: SelectableAccount[],
  maxSelected = MAX_BULK_LAUNCH_ACCOUNTS
): string[] {
  return accounts.slice(0, maxSelected).map((account) => account.id);
}

export function selectBulkAccountRange(
  accounts: SelectableAccount[],
  startIndex: number,
  count: number,
  maxSelected = MAX_BULK_LAUNCH_ACCOUNTS
): string[] {
  const normalizedStart = Math.max(1, Math.floor(startIndex));
  const normalizedCount = Math.min(maxSelected, Math.max(1, Math.floor(count)));
  return accounts.slice(normalizedStart - 1, normalizedStart - 1 + normalizedCount).map((account) => account.id);
}

export function pruneBulkSelection(selectedIds: string[], visibleAccounts: SelectableAccount[]): string[] {
  const visibleIds = new Set(visibleAccounts.map((account) => account.id));
  return selectedIds.filter((id) => visibleIds.has(id));
}
