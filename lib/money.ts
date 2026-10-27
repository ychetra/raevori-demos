/** Riel per US dollar used for the small KHR line under prices. */
export const KHR_RATE = 4100;

export const usd = (n: number) => `$${n.toFixed(2)}`;
export const khr = (n: number) => Math.round(n * KHR_RATE).toLocaleString("en-US");
