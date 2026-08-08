import { describe, expect, it } from "vitest";
import { assertIntegerAmount, DisabledRedemptionProvider, FEATURE_REAL_MONEY_REDEMPTION, integerAmount } from "./index.js";

describe("economy boundary", () => {
  it("keeps redemption disabled and rejects floating point amounts", () => {
    expect(FEATURE_REAL_MONEY_REDEMPTION).toBe(false);
    expect(() => assertIntegerAmount(12.5)).toThrow();
    expect(() => assertIntegerAmount(10)).not.toThrow();
  });
  it("rejects redemption through the disabled adapter", async () => {
    const provider = new DisabledRedemptionProvider();
    await expect(provider.redeem({ userId: "test", amount: integerAmount(1), currency: "BONUS_POINT" })).resolves.toEqual({ status: "REJECTED_FEATURE_DISABLED" });
  });
});
