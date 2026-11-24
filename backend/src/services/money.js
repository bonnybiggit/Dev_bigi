export const MAX_MINOR = 1000000000000n;
export function parseMoney(value) {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const result =
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
    (negative ? -1n : 1n);
  return result;
}
export const moneySum = (values) =>
  values.reduce((sum, value) => sum + BigInt(value), 0n);
export function allocateMinor(total, weights) {
  total = BigInt(total);
  const sum = moneySum(weights);
  if (!sum) return weights.map(() => 0n);
  const rows = weights.map((weight, index) => ({
    index,
    value: (total * BigInt(weight)) / sum,
    remainder: (total * BigInt(weight)) % sum,
  }));
  let remaining = total - moneySum(rows.map((row) => row.value));
  const order = [...rows].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const row of order)
    if (remaining > 0n) {
      row.value += 1n;
      remaining -= 1n;
    }
  return rows.map((row) => row.value);
}
export function invoiceCategories(invoice) {
  const weights = invoice.lines.map((line) => BigInt(line.amountMinor));
  const discounts = allocateMinor(invoice.discountMinor, weights);
  const afterDiscount = weights.map((value, index) => value - discounts[index]);
  const adjustment = BigInt(invoice.adjustmentMinor);
  const adjustments = allocateMinor(
    adjustment < 0n ? -adjustment : adjustment,
    adjustment < 0n ? afterDiscount : weights,
  ).map((value) => (adjustment < 0n ? -value : value));
  const net = afterDiscount.map((value, index) => value + adjustments[index]);
  const paid = allocateMinor(invoice.paidMinor, net);
  return invoice.lines.map((line, index) => ({
    categoryId: String(line.categoryId),
    categoryName: line.categoryName,
    billedMinor: weights[index],
    discountMinor: discounts[index],
    adjustmentMinor: adjustments[index],
    paidMinor: paid[index],
    balanceMinor: net[index] - paid[index],
  }));
}
