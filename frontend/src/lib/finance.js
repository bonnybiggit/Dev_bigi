export function money(value = 0) {
  const amount = BigInt(value),
    absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}₦${(absolute / 100n).toLocaleString("en-NG")}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function amountText(value = 0) {
  const amount = BigInt(value),
    absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export const financeLabels = {
  billedMinor: "Total fees billed",
  paidMinor: "Net payments received",
  balanceMinor: "Outstanding balance",
  discountMinor: "Discounts & scholarships",
  adjustmentMinor: "Net adjustments",
};
