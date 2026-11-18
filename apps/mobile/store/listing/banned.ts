// Ranking words neither store allows in listing copy (spec 0057, AC-4).
// Latin script entries are matched as whole normalized words or word runs;
// `ja` and `zh` entries are matched as substrings.
import type { ListingLocale } from "./types";

export const BANNED_WORDS: Readonly<Record<ListingLocale, readonly string[]>> = {
  en: ["best", "#1", "top", "number one", "No. 1", "leading", "greatest"],
  es: ["mejor", "mejores", "#1", "top", "número uno", "líder"],
  pt: ["melhor", "melhores", "#1", "top", "número um", "líder"],
  fr: ["meilleur", "meilleure", "meilleurs", "meilleures", "#1", "top", "numéro un", "leader"],
  ja: ["最高", "一番", "ナンバーワン", "No.1", "№1", "トップ", "第一位", "人気No"],
  zh: ["最好", "最佳", "第一", "排名第一", "顶级", "头号", "No.1"],
};
