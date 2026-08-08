export const FEATURE_REAL_MONEY_REDEMPTION = false as const;
declare const integerAmountBrand: unique symbol;
export type IntegerAmount = number & { readonly [integerAmountBrand]: "IntegerAmount" };
export type CurrencyType = "PLAY_BALL" | "FREE_CREDIT" | "BONUS_POINT";
export type TransactionType = "CREDIT" | "DEBIT" | "REWARD" | "ADJUSTMENT";
export interface Currency { readonly type: CurrencyType; readonly displayName: string; readonly fractionalDigits: 0 }

export interface Transaction {
  readonly transactionId: string;
  readonly userId: string;
  readonly type: TransactionType;
  readonly amount: IntegerAmount;
  readonly currency: CurrencyType;
  readonly timestamp: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}
export interface Ledger { append(transaction: Transaction): Promise<void>; entries(userId: string): Promise<readonly Transaction[]> }
export interface Wallet { balance(userId: string, currency: CurrencyType): Promise<IntegerAmount> }
export interface Reward { readonly id: string; readonly amount: IntegerAmount; readonly currency: CurrencyType }
export interface RedemptionRequest { readonly userId: string; readonly amount: IntegerAmount; readonly currency: CurrencyType }
export interface RedemptionResult { readonly status: "REJECTED_FEATURE_DISABLED" }
export interface RedemptionProvider { readonly enabled: boolean; redeem(request: RedemptionRequest): Promise<RedemptionResult> }

export class DisabledRedemptionProvider implements RedemptionProvider {
  readonly enabled = FEATURE_REAL_MONEY_REDEMPTION;
  async redeem(request: RedemptionRequest): Promise<RedemptionResult> {
    void request;
    return { status: "REJECTED_FEATURE_DISABLED" };
  }
}

export function assertIntegerAmount(amount: number): asserts amount is IntegerAmount {
  if (!Number.isSafeInteger(amount)) throw new Error("Economy amounts must be safe integers");
}

export function integerAmount(amount: number): IntegerAmount {
  assertIntegerAmount(amount);
  return amount;
}
