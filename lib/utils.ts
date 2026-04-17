export function formatCurrency(amount: number | null | undefined, currency = "EUR") {
  if (amount == null || Number.isNaN(amount)) {
    return "Unknown";
  }

  return new Intl.NumberFormat("de-DE", {
    currency,
    style: "currency"
  }).format(amount);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function compactNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "0";
  }

  return new Intl.NumberFormat("de-DE", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function ensureErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export function average(numbers: number[]) {
  if (numbers.length === 0) {
    return 0;
  }

  return numbers.reduce((total, value) => total + value, 0) / numbers.length;
}
