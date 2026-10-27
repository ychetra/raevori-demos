export type Lang = "en" | "km";
export type Text = { en: string; km: string };

export const pick = (t: Text, lang: Lang): string => t[lang];
