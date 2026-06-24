import { describe, expect, it } from "vitest";
import {
  MAX_BULK_LAUNCH_ACCOUNTS,
  pruneBulkSelection,
  selectBulkAccountRange,
  selectFirstBulkAccounts,
  toggleBulkAccountSelection
} from "../src/renderer/bulk-selection";

describe("bulk account selection", () => {
  it("adds and removes selected accounts", () => {
    expect(toggleBulkAccountSelection([], "account-1")).toEqual(["account-1"]);
    expect(toggleBulkAccountSelection(["account-1"], "account-1")).toEqual([]);
  });

  it("limits bulk launch selection to ten accounts", () => {
    const selected = Array.from({ length: MAX_BULK_LAUNCH_ACCOUNTS }, (_, index) => `account-${index + 1}`);

    expect(toggleBulkAccountSelection(selected, "account-11")).toEqual(selected);
  });

  it("selects only the first ten visible accounts", () => {
    const accounts = Array.from({ length: 12 }, (_, index) => ({ id: `account-${index + 1}` }));

    expect(selectFirstBulkAccounts(accounts)).toEqual([
      "account-1",
      "account-2",
      "account-3",
      "account-4",
      "account-5",
      "account-6",
      "account-7",
      "account-8",
      "account-9",
      "account-10"
    ]);
  });

  it("selects a bulk account range by visible row number", () => {
    const accounts = Array.from({ length: 12 }, (_, index) => ({ id: `account-${index + 1}` }));

    expect(selectBulkAccountRange(accounts, 6, 5)).toEqual([
      "account-6",
      "account-7",
      "account-8",
      "account-9",
      "account-10"
    ]);
  });

  it("caps range selection to ten accounts", () => {
    const accounts = Array.from({ length: 20 }, (_, index) => ({ id: `account-${index + 1}` }));

    expect(selectBulkAccountRange(accounts, 1, 12)).toHaveLength(MAX_BULK_LAUNCH_ACCOUNTS);
  });

  it("drops selections that are no longer visible", () => {
    expect(
      pruneBulkSelection(["account-1", "account-2", "account-3"], [{ id: "account-2" }, { id: "account-4" }])
    ).toEqual(["account-2"]);
  });
});
