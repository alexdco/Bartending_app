// Reason specific copy for an AI drink idea 429 (spec 0034 AC-6, Client messages).
// Pure: both apps render the parts, linking `signInText` to the account screen.
import type { DrinkIdeaLimitDetails, DrinkIdeaLimitReason } from "./generateDrinkIdea";
import type { Locale } from "./locale";

/** A message split around its optional "Sign in" link. */
export interface DrinkIdeaLimitMessage {
  readonly before: string;
  readonly signInText?: string;
  readonly after: string;
}

type CopyCase = "signInLimit" | "limit" | "busySignIn" | "busy";

type Copy = Record<CopyCase, { readonly before: string; readonly after?: string }> & {
  readonly signIn: string;
};

// `{time}` is replaced with the formatted reset time.
const COPY: Record<Locale, Copy> = {
  en: {
    signIn: "Sign in",
    signInLimit: {
      before: "You've used today's free drink ideas. ",
      after: " to get more today, or try again after {time}.",
    },
    limit: { before: "You've reached today's drink idea limit. Try again after {time}." },
    busySignIn: {
      before: "Drink ideas are very busy today. ",
      after: " to keep going, or try again after {time}.",
    },
    busy: { before: "Drink ideas are very busy today. Try again after {time}." },
  },
  es: {
    signIn: "Inicia sesión",
    signInLimit: {
      before: "Ya usaste las ideas gratis de hoy. ",
      after: " para obtener más hoy, o vuelve a intentarlo después de {time}.",
    },
    limit: { before: "Llegaste al límite de ideas de hoy. Vuelve a intentarlo después de {time}." },
    busySignIn: {
      before: "Las ideas de tragos están muy solicitadas hoy. ",
      after: " para seguir, o vuelve a intentarlo después de {time}.",
    },
    busy: {
      before:
        "Las ideas de tragos están muy solicitadas hoy. Vuelve a intentarlo después de {time}.",
    },
  },
  // Hand written Brazilian Portuguese (spec 0045 AC-13), pending native review.
  pt: {
    signIn: "Entre",
    signInLimit: {
      before: "Você já usou as ideias de drinks grátis de hoje. ",
      after: " para ganhar mais hoje, ou tente de novo depois de {time}.",
    },
    limit: {
      before: "Você chegou ao limite de ideias de drinks de hoje. Tente de novo depois de {time}.",
    },
    busySignIn: {
      before: "As ideias de drinks estão muito procuradas hoje. ",
      after: " para continuar, ou tente de novo depois de {time}.",
    },
    busy: {
      before: "As ideias de drinks estão muito procuradas hoje. Tente de novo depois de {time}.",
    },
  },
  // Hand written French as in France (spec 0046 AC-13), pending native review.
  fr: {
    signIn: "Connectez-vous",
    signInLimit: {
      before: "Vous avez utilisé les idées de cocktails gratuites du jour. ",
      after: " pour en obtenir d’autres aujourd’hui, ou réessayez après {time}.",
    },
    limit: {
      before: "Vous avez atteint la limite d’idées de cocktails du jour. Réessayez après {time}.",
    },
    busySignIn: {
      before: "Les idées de cocktails sont très demandées aujourd’hui. ",
      after: " pour continuer, ou réessayez après {time}.",
    },
    busy: {
      before: "Les idées de cocktails sont très demandées aujourd’hui. Réessayez après {time}.",
    },
  },
  // Hand written Russian with lowercase «вы» (spec 0047 AC-13), pending native review.
  // The time stands alone after a colon, so it needs no case ending (AC-12).
  ru: {
    signIn: "Войдите",
    signInLimit: {
      before: "Вы использовали все бесплатные идеи коктейлей на сегодня. ",
      after: ", чтобы получить ещё, или попробуйте снова. Обновление: {time}.",
    },
    limit: {
      before: "Вы достигли дневного лимита идей коктейлей. Попробуйте снова. Обновление: {time}.",
    },
    busySignIn: {
      before: "Сегодня идеи коктейлей очень востребованы. ",
      after: ", чтобы продолжить, или попробуйте снова. Обновление: {time}.",
    },
    busy: {
      before: "Сегодня идеи коктейлей очень востребованы. Попробуйте снова. Обновление: {time}.",
    },
  },
  // Hand written everyday Hindi with आप (spec 0048 AC-13), pending native review.
  // The time stands alone after a colon as a label, so it needs no postposition (AC-12).
  hi: {
    signIn: "साइन इन करें",
    signInLimit: {
      before: "आपने आज के मुफ़्त ड्रिंक आइडिया इस्तेमाल कर लिए हैं। ",
      after: " और आज ज़्यादा पाएँ, या बाद में फिर कोशिश करें। फिर से उपलब्ध: {time}",
    },
    limit: {
      before: "आप आज की ड्रिंक आइडिया सीमा तक पहुँच गए हैं। फिर से उपलब्ध: {time}",
    },
    busySignIn: {
      before: "आज ड्रिंक आइडिया की बहुत माँग है। ",
      after: " और जारी रखें, या बाद में फिर कोशिश करें। फिर से उपलब्ध: {time}",
    },
    busy: {
      before: "आज ड्रिंक आइडिया की बहुत माँग है। बाद में फिर कोशिश करें। फिर से उपलब्ध: {time}",
    },
  },
  // Hand written polite Japanese (spec 0050 AC-14), pending native review.
  // Japanese nouns don't change form, so {time}以降 reads naturally (AC-13).
  ja: {
    signIn: "ログイン",
    signInLimit: {
      before: "今日の無料ドリンクアイデアを使い切りました。",
      after: "すると今日さらに使えます。または{time}以降にもう一度お試しください。",
    },
    limit: {
      before: "今日のドリンクアイデアの上限に達しました。{time}以降にもう一度お試しください。",
    },
    busySignIn: {
      before: "今日はドリンクアイデアが大変混み合っています。",
      after: "すると続けられます。または{time}以降にもう一度お試しください。",
    },
    busy: {
      before: "今日はドリンクアイデアが大変混み合っています。{time}以降にもう一度お試しください。",
    },
  },
  // Hand written 해요체 Korean (spec 0051 AC-13), checked by the AI second
  // pass (AC-20). {time} 이후에 needs no particle that changes with the time.
  ko: {
    signIn: "로그인",
    signInLimit: {
      before: "오늘 무료 드링크 아이디어를 모두 사용했어요. ",
      after: "하면 오늘 더 사용할 수 있어요. 또는 {time} 이후에 다시 시도해 보세요.",
    },
    limit: {
      before: "오늘 드링크 아이디어 한도에 도달했어요. {time} 이후에 다시 시도해 보세요.",
    },
    busySignIn: {
      before: "오늘은 드링크 아이디어 요청이 너무 많아요. ",
      after: "하면 계속 사용할 수 있어요. 또는 {time} 이후에 다시 시도해 보세요.",
    },
    busy: {
      before: "오늘은 드링크 아이디어 요청이 너무 많아요. {time} 이후에 다시 시도해 보세요.",
    },
  },
  // Hand written Simplified Chinese with 你 (spec 0052 AC-13), checked by the
  // AI second pass (AC-20). The formatted time starts and ends with a digit,
  // so {time} has a space on each side (AC-1).
  zh: {
    signIn: "登录",
    signInLimit: {
      before: "你今天的免费饮品灵感已用完。",
      after: "后今天可以获得更多，或在 {time} 之后再试。",
    },
    limit: {
      before: "你已达到今天的饮品灵感上限。请在 {time} 之后再试。",
    },
    busySignIn: {
      before: "今天饮品灵感的请求太多了。",
      after: "后可以继续使用，或在 {time} 之后再试。",
    },
    busy: {
      before: "今天饮品灵感的请求太多了。请在 {time} 之后再试。",
    },
  },
};

function copyCase(limitReason: DrinkIdeaLimitReason, signInHelps: boolean): CopyCase {
  if (limitReason === "global_limit") return signInHelps ? "busySignIn" : "busy";
  // An ip_limit is always a guest's, so signInHelps is false only once the full
  // cap is reached; it then reads like a plain limit.
  return signInHelps ? "signInLimit" : "limit";
}

export interface DrinkIdeaLimitMessageOptions {
  /** Language of the sentence. */
  readonly copyLocale: Locale;
  /** Locale used to format the reset time (the app's current locale). */
  readonly formatLocale: Locale;
  /** Defaults to the device's time zone; set in tests. */
  readonly timeZone?: string;
}

/**
 * The message for a 429, or null when the response carried no reason or reset
 * time (an older function deploy), so the caller keeps its existing message.
 */
export function drinkIdeaLimitMessage(
  details: DrinkIdeaLimitDetails,
  { copyLocale, formatLocale, timeZone }: DrinkIdeaLimitMessageOptions,
): DrinkIdeaLimitMessage | null {
  const { limitReason, resetsAt } = details;
  const resetDate = resetsAt === undefined ? null : new Date(resetsAt);
  if (limitReason === undefined || resetDate === null || Number.isNaN(resetDate.getTime())) {
    return null;
  }

  const time = new Intl.DateTimeFormat(formatLocale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(resetDate);
  const fill = (text: string) => text.replace("{time}", time);

  const copy = COPY[copyLocale];
  const chosen = copy[copyCase(limitReason, details.signInHelps === true)];

  return chosen.after === undefined
    ? { before: fill(chosen.before), after: "" }
    : { before: fill(chosen.before), signInText: copy.signIn, after: fill(chosen.after) };
}
