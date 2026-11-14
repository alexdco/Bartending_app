// Single source of truth for supported locales, read by both apps, the
// import job, and the sitemap. The database's own list is the
// supported_locales table; the locale parity test keeps the two in sync.
// Adding a language is a supported_locales row, entries here, message files,
// and a translation backfill, with no SQL function edits.
// Specs: docs/specs/0020-multi-language-support/index.md,
// docs/specs/0045-language-agnostic-locales-portuguese/index.md,
// docs/specs/0046-french-locale.md, docs/specs/0047-russian-locale.md,
// docs/specs/0048-hindi-locale/index.md, docs/specs/0050-japanese-locale/index.md,
// docs/specs/0051-korean-locale/index.md,
// docs/specs/0052-simplified-chinese-locale/index.md

export const SUPPORTED_LOCALES = ["en", "es", "pt", "fr", "ru", "hi", "ja", "ko", "zh"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** A translation locale: English lives on the base rows, never as a translation. */
export type NonDefaultLocale = Exclude<Locale, "en">;

export const DEFAULT_LOCALE: Locale = "en";

export const NON_DEFAULT_LOCALES: readonly NonDefaultLocale[] = SUPPORTED_LOCALES.filter(
  (locale): locale is NonDefaultLocale => locale !== DEFAULT_LOCALE,
);

/**
 * The locales users can discover (switcher, detection, sitemap, hreflang).
 * Every supported locale still routes; only discovery is gated. A new locale
 * joins at launch, in the same commit as CATALOG_TRANSLATION_LOCALES.
 */
export const LAUNCHED_LOCALES: readonly Locale[] = [
  "en",
  "es",
  "pt",
  "fr",
  "ru",
  "hi",
  "ja",
  "ko",
  "zh",
];

/**
 * The locales the import job translates new catalog rows into, and the
 * blocks the default recipe notes run writes. Holds only launched locales
 * outside a backfill run.
 */
export const CATALOG_TRANSLATION_LOCALES = [
  "es",
  "pt",
  "fr",
  "ru",
  "hi",
  "ja",
  "ko",
  "zh",
] as const satisfies readonly NonDefaultLocale[];

export type CatalogTranslationLocale = (typeof CATALOG_TRANSLATION_LOCALES)[number];

export const LOCALE_TEXT_SEARCH_CONFIG: Record<Locale, string> = {
  en: "english",
  es: "spanish",
  pt: "portuguese",
  // Strips accents before stemming, so "creme" finds "crème" (spec 0046 AC-3).
  fr: "public.french_unaccent",
  // Built in; it already stems "ликер" and "ликёр" alike (spec 0047 AC-3).
  ru: "russian",
  // Built in; it stems "संतरा" and "संतरे" alike (spec 0048 AC-3).
  hi: "hindi",
  // No Japanese stemmer; `simple` splits names at ・, and the locale agnostic
  // CJK contains tier in the search functions finds the rest (spec 0050 AC-3).
  ja: "simple",
  // No Korean stemmer; `simple` splits names at the spaces between words, and
  // the CJK contains tier covers Hangul too (spec 0051 AC-3).
  ko: "simple",
  // No Chinese stemmer; names have no spaces, so the CJK contains tier does
  // the matching (spec 0052 AC-3).
  zh: "simple",
};

/** BCP 47 codes for hreflang, the sitemap, and <html lang>. URLs keep the bare code. */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en",
  es: "es",
  pt: "pt-BR",
  fr: "fr",
  ru: "ru",
  hi: "hi",
  ja: "ja",
  ko: "ko",
  // Simplified Chinese announces its script, so a later Traditional locale
  // can sit beside it (spec 0052 AC-8).
  zh: "zh-Hans",
};

/** The language named in AI translation and recipe notes prompts. */
export const LOCALE_AI_LANGUAGE: Record<Locale, string> = {
  en: "English",
  es: "Latin American Spanish",
  pt: "Brazilian Portuguese",
  fr: "French as written in France",
  ru: "Russian",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  zh: "Simplified Chinese as written in mainland China",
};

/**
 * Regional wording the AI prompts must follow, appended to them as is. Empty
 * when a language needs none, or starting with a space.
 */
export const LOCALE_AI_TERMS: Record<Locale, string> = {
  en: "",
  es: "",
  pt:
    ' Use Brazilian citrus terms: lime is "limão", lemon is "limão-siciliano", limeade is ' +
    '"limonada", and lemonade is "limonada siciliana". Never write "lima" for lime, and keep ' +
    "lemon and lime distinct.",
  // Approved in the native review (spec 0046). generate-drink-idea carries a
  // hand copy of the citrus and typography sentences: change both together.
  fr:
    ' Lime is "citron vert" and lemon is "citron jaune"; never write "citron" alone for lime, ' +
    'and keep lemon and lime distinct. Bar tools: shaker is "shaker", jigger is "doseur", ' +
    'muddler is "pilon", strainer is "passoire", and bar spoon is "cuillère à mélange". Use ' +
    "French typography: a narrow no break space before ; ! ? and a no break space before :, " +
    "and « » quotes.",
  // Approved in the native review (spec 0047). generate-drink-idea
  // carries a hand copy of the address, citrus, and typography sentences:
  // change both together.
  ru:
    " Address the reader with lowercase «вы». Lime is «лайм» and lemon is «лимон»; keep lemon " +
    "and lime distinct. Lime juice is «сок лайма» and a lime wedge or wheel is «долька лайма» " +
    "or «кружок лайма»; never use «лимонный» for lime. Bar tools: shaker is «шейкер», jigger " +
    "is «джиггер», muddler is " +
    "«мадлер», strainer is «стрейнер», and bar spoon is «барная ложка». Simple syrup is " +
    "«сахарный сироп» and bitters is «биттер». Write ё where standard Russian spelling uses " +
    "it (ликёр, лёд). Use « » quotes and a spaced em dash ( — ).",
  // Drafted for the native review (spec 0048), which approves it before the
  // backfill. generate-drink-idea carries a hand copy of the register,
  // citrus, tool, and punctuation sentences: change both together.
  hi:
    " Write everyday Hindi in Devanagari, not formal Sanskrit based Hindi and not Hinglish, and " +
    "address the reader as «आप». Never mix Latin letters into a Hindi word. Lime is «हरा नींबू» " +
    "and lemon is «पीला नींबू», inflecting «हरा» and «पीला» as grammar needs (हरे, हरी, पीले, " +
    "पीली, as in «हरे नींबू का रस»); keep lemon and lime distinct, never write «नींबू» alone, " +
    "and never use the loanwords «लाइम» or «लेमन». Lemonade is «पीले नींबू का शरबत» and " +
    "lemon-lime soda is «पीले और हरे नींबू वाला सोडा», never «नींबू पानी». " +
    "Grapefruit is «चकोतरा» (चकोतरे as grammar needs, as in «चकोतरे का रस»), never " +
    "«अंगूर», which means grape, and never the loanword «ग्रेपफ्रूट». Cranberry is " +
    "«क्रैनबेरी», never «करंट». " +
    "Bar tools: shaker is «शेकर», jigger is «जिगर», muddler is «मडलर», strainer is " +
    "«स्ट्रेनर», and bar spoon is «बार स्पून». Simple syrup is «शुगर सिरप», bitters is " +
    "«बिटर्स», and ice is «बर्फ़». Write glass names as Devanagari loanwords, for example " +
    "highball glass is «हाईबॉल गिलास», cocktail glass is «कॉकटेल गिलास», and old fashioned " +
    "glass is «ओल्ड फ़ैशन्ड गिलास». Use Western " +
    "digits (0 to 9), write units without dots (मिली, सेली, ली, औंस), end sentences with " +
    "«।», and use “ ” quotes.",
  // Drafted for the native review (spec 0050), which approves it before the
  // backfill. generate-drink-idea carries a hand copy of the register,
  // citrus, name, and punctuation sentences: change both together.
  ja:
    " Write natural Japanese in the です・ます polite form. Lime is «ライム» and lemon is " +
    "«レモン»; keep lemon and lime distinct. Write cocktail names in katakana with «・» between " +
    "words (ジン・トニック), using the established Japanese name where one exists. Bar tools: " +
    "shaker is «シェーカー», jigger is «メジャーカップ», muddler is «ペストル», strainer is " +
    "«ストレーナー», and bar spoon is «バースプーン». Simple syrup is «シンプルシロップ», " +
    "bitters is «ビターズ», and ice is «氷». Write glass names in katakana, for example old " +
    "fashioned glass is «ロックグラス», cocktail glass is «カクテルグラス», collins glass is " +
    "«コリンズグラス», and highball glass is «ハイボールグラス». Use half width digits, write " +
    "units as ml, cl, L, and «オンス», punctuate with «。» and «、», use «「」» for quotes, and " +
    "put no spaces between Japanese words.",
  // Checked by the AI terms pass (spec 0051 AC-20) on 2026-11-13, before the
  // backfill; the -요 ending and lemon-lime soda sentences were added after
  // the backfill (69 of 475 recipes came back in 합니다체, and the soda as
  // 레모네이드), and the 붓다, 글라스, 셰이크, and 온스 sentence after the
  // step 4 drink ideas (붓어요, 글래스, 셔이크, and oz in 8 live ideas), and
  // the spelling sentence after the step 4 catalog sample (베르무스 next to
  // 베르무트, 데킬라 next to 테킬라, and Half-and-Half as 헤비 크림). generate-drink-idea carries a hand copy of the register,
  // citrus, name, tool, and punctuation sentences: change both together.
  ko:
    " Write natural Korean in the 해요체 polite form, ending every sentence in -요 (넣어요, " +
    "부어요) and never in 합니다체 (넣습니다, 붓습니다), with short nouns for labels, and never " +
    "use Hanja. Lime is «라임» and lemon is «레몬»; keep lemon and lime distinct. " +
    "Lemon-lime soda is «레몬 라임 소다», never «레모네이드». Write " +
    "cocktail names in Hangul as Korean bars and menus write them (마가리타, 모히토, 진토닉, " +
    "올드 패션드), using the established name where one exists and the standard loanword " +
    "spelling otherwise, and never put a middle dot between words; use a space or nothing. " +
    "Bar tools: shaker is «셰이커», jigger is «지거», muddler is «머들러», strainer is " +
    "«스트레이너», and bar spoon is «바 스푼». Simple syrup is «심플 시럽», bitters is " +
    "«비터스», and ice is «얼음». A shot is «샷», a dash is «대시», a teaspoon is «티스푼», and " +
    "a tablespoon is «테이블스푼»; use the same word in the measures and the steps. " +
    "Write glass names in Hangul, for example old fashioned glass " +
    "is «록 글라스», cocktail glass is «칵테일 글라스», collins glass is «콜린스 글라스», and " +
    "highball glass is «하이볼 글라스». Conjugate 붓다 as «부어요», never «붓어요» or «붓아요». " +
    "Spell vermouth «베르무트», tequila «테킬라», amaretto «아마레토», Southern Comfort " +
    "«서던 컴포트», champagne «샴페인», half-and-half «하프 앤 하프» (not heavy cream), and " +
    "mason jar «메이슨 자». Write glass as «글라스», never «글래스», shake as «셰이크», and ounces as «온스», never oz. " +
    "Use half width digits, write units as ml, cl, L, and «온스», use Western punctuation (. , ? !) with no space before it, and use «“ ”» for quotes.",
  // Reviewed by Claude Opus 5 on 2026-11-13 (spec 0052 AC-20), before
  // the backfill. The shot measure is 小杯; 抖 remains the pinned dash label. generate-drink-idea carries a hand copy of the register,
  // citrus, name, and punctuation sentences: change both together. The words
  // it names on purpose as wrong (莱姆, 琴酒, 兰姆酒, 您, 青柠檬) are the
  // CHINESE_BANNED_TERMS in chineseScript.ts.
  zh:
    " Write natural Simplified Chinese as used in mainland China; never use Traditional " +
    "characters or Taiwan and Hong Kong wording (never «莱姆» for lime, «琴酒» for gin, or " +
    "«兰姆酒» for rum). Address the reader as «你», never «您»; write recipe steps as short " +
    "commands with no pronoun (加入冰块，摇匀). Lime is «青柠» and lemon is «柠檬»; keep them " +
    "distinct. Lime juice is «青柠汁». Lemon lime soda is «柠檬青柠汽水», never «柠檬水». " +
    "Spirits and staples: gin is «金酒», vodka is «伏特加», rum is «朗姆酒», tequila is " +
    "«龙舌兰», whiskey is «威士忌», brandy is «白兰地», vermouth is «味美思», liqueur is " +
    "«利口酒», bitters is «苦精», simple syrup is «糖浆», club soda is «苏打水», and ice is " +
    "«冰块». Bar tools: shaker is «摇酒壶», jigger is «量酒器», muddler is «捣棒», strainer is " +
    "«滤冰器», and bar spoon is «吧勺». Glasses: old fashioned glass is «古典杯», cocktail " +
    "glass is «鸡尾酒杯», collins glass is «柯林斯杯», and highball glass is «高球杯». " +
    "Measures: a dash is «抖», a drop is «滴», a shot is «小杯», a part is «份», a teaspoon " +
    "is «茶匙», and a tablespoon is «汤匙»; use the same word in the measures and the steps. " +
    "Brand and proprietary names (Galliano, Angostura, 7-Up, Southern Comfort) stay in " +
    "English exactly as given. These term and name rules apply to ingredient and tag names " +
    "too, not only to full sentences. Cocktail names: use the established mainland Chinese " +
    "name where one exists: Margarita is «玛格丽特», Mojito is «莫吉托», Gin Tonic or Gin " +
    "and Tonic is «金汤力», Manhattan is «曼哈顿», Negroni is «尼格罗尼», Cosmopolitan is " +
    "«大都会», and Martini is «马天尼». Never reuse Margarita's name for Martini or " +
    "Cosmopolitan, and do not leave those established names in English. When no " +
    "established Chinese name exists, keep the English name exactly as given, and never " +
    "invent a translation or a sound based spelling. Never put a middle dot in a name " +
    "(汤姆柯林斯, not 汤姆·柯林斯). Lime is never «青柠檬». Typography: use half width " +
    "digits; write units as ml, cl, L, and «盎司», with a space between the number and the " +
    "unit (30 ml); use full width punctuation («，» «。» «？» «！» «：» «；») with no space " +
    "around it; use «“ ”» for quotes; and put one space between a Chinese character and a " +
    "Latin letter or digit. Tag and glass labels must always contain Chinese characters: " +
    "translate ordinary labels fully, and for a brand label keep the exact English brand " +
    "name and append only a category stated by the source label or existing data (Galliano " +
    "Liqueur becomes Galliano 利口酒); never invent a category. If no category is stated, " +
    "append «品牌» instead (Southern Comfort 品牌). The rule about keeping an English " +
    "cocktail name applies to recipe names, never to tag or glass labels; brand only " +
    "ingredient and recipe names may stay exactly English. Peach Schnapps is «桃味利口酒» " +
    "and Strawberry Schnapps is «草莓味利口酒»; other flavoured schnapps use the flavour " +
    "plus «味利口酒». Never use Japanese kana (katakana or hiragana) anywhere in any " +
    "ingredient, tag, glass, recipe name, or step." +
    " For ingredient and tag labels only, never as permission to rename cocktail recipes, use this reviewed name glossary. Keep the source English brand tokens exactly; translate the generic descriptor or preparation, and never confuse a herb with a spirit, a juice with a soft drink, or US proof with ABV degrees. Peach Schnapps => «桃味利口酒»; Triple Sec => «橙皮利口酒»; Wormwood => «苦艾»; Rosso Vermouth => «红味美思»; Lemonade => «柠檬水»; Pink lemonade => «粉红柠檬水»; Prepared Horseradish => «辣根酱»; Skim Milk => «脱脂牛奶»; Ginger Beer => «姜汁啤酒»; Orange Spiral => «橙皮卷»; Orange Whee => «橙轮片»; Vodk => «伏特加»; Root Beer Vodka => «根汁汽水伏特加»; Root Beer => «根汁汽水»; Root Beer Float => «根汁汽水冰淇淋»; Pitcher Cocktail => «壶装鸡尾酒»; Nostalgic => «怀旧»; Comfort Drink => «舒心饮品»; Mixed Drink => «混合饮品»; Three-Ingredient Cocktail => «三种材料鸡尾酒»; Poison Apple => «毒苹果»; Apple Pie => «苹果派»; Mother's Day => «母亲节»; Jolly Rancher => «Jolly Rancher 品牌»; Creamsicle => «Creamsicle 品牌»; Orange Creamsicle => «Orange Creamsicle 品牌»; IBA => «IBA 国际调酒师协会»; Dragon Bleu => «Dragon Bleu 品牌»; Luxardo => «Luxardo 品牌»; Tuaca => «Tuaca 品牌»; Jungle Punch => «丛林潘趣»; White Balsamic Reduction => «白香醋浓缩液»; Diet Cranberry => «低热量蔓越莓»; Orange Twist => «橙皮卷»; Whipped Cream => «打发奶油»; Brown Sugar => «红糖»; Celery Salt => «芹菜盐»; Peach Nectar => «桃汁饮料»; Yellow Chartreuse => «黄色 Chartreuse»; Advocaat => «蛋黄利口酒»; Falernum => «法勒南姆»; Angostura Bitters => «Angostura 苦精»; The Bitter End Memphis BBQ Bitters => «The Bitter End Memphis BBQ 苦精»; Midori Melon Liqueur => «Midori 蜜瓜利口酒»; Chambord Raspberry Liqueur => «Chambord 树莓利口酒»; Peter Heering Cherry Liqueur => «Peter Heering 樱桃利口酒»; Domaine De Canton Ginger Liqueur => «Domaine De Canton 生姜利口酒»; Godiva Liqueur => «Godiva 利口酒»; Skinnygirl White Cherry Vodka => «Skinnygirl 白樱桃伏特加»; Skinnygirl Coconut Vodka => «Skinnygirl 椰子伏特加»; Tabasco Sauce => «Tabasco 辣酱»; Tabasco Chipotle Sauce => «Tabasco Chipotle 辣酱»; Diet 7UP, Chilled => «Diet 7UP（冰镇）»; Cointreau (a Splash) => «Cointreau（少许）»; Giffard Crème De Pamplemousse Rose (pink Grapefruit Liqueur) => «Giffard Crème De Pamplemousse Rose（粉红葡萄柚利口酒）»; Dragon Bleu Rose Vodka (or Preferred Rose-Flavored Vodka) => «Dragon Bleu Rose Vodka（或任选玫瑰味伏特加）»; 151 Proof Rum => «151 proof 朗姆酒»; Crystal Light Lemonade => «Crystal Light 柠檬水»; Maraschino Cherry => «马拉斯基诺樱桃»; Pepper => «胡椒»; Sarsaparilla => «沙示»; Demerara Sugar => «德梅拉拉糖»; Absolut Vodka => «Absolut 伏特加»; Old Bay Seasoning => «Old Bay 调味料»; Clear => «清澈»; Hangover => «宿醉»; Cocktail Part => «鸡尾酒会»; Punch Bowl => «潘趣酒钵»." +
    // Reviewed by Claude Opus 5 on 2026-11-13 (spec 0052 AC-20), after the
    // recipe name and 30 recipe sample review: method words and recipe names.
    " Method words: strain is «滤入», never «倒入», which means pour; serve is «享用» or «奉上», never «上菜» or «上桌»; chilled is «冰镇», never «冷冻», which means frozen; blend in a blender is «用搅拌机打», distinct from stir «搅拌» and shake «摇匀»; served up means without ice («不加冰»); a citrus twist is «皮卷»; US proof stays «proof» and is never «度»." +
    " Recipe name glossary, reviewed: a shot in a recipe name is «小杯», Fizz is «菲兹», Sling is «司令», Punch is «潘趣». Gin Sling => «金酒司令»; Screwdriver => «螺丝起子»; Pina Colada => «椰林飘香»; Cuba Libre => «自由古巴»; Long Island Iced Tea => «长岛冰茶»; Sangria => «桑格利亚»; Oreo Mudslide => «奥利奥泥石流»; Lemon Elderflower Spritzer => «柠檬接骨木花气泡饮»; Frosé => «冰冻桃红»; Death in the Afternoon => «午后之死»; House Margarita => «招牌玛格丽特»; Chicago Fizz => «芝加哥菲兹»; Japanese Fizz => «日本菲兹»; Tequila Fizz => «龙舌兰菲兹»; Poison Apple Shot => «毒苹果小杯»; Pink Petals Shot => «粉红花瓣小杯»; Grape Sourball Shot => «葡萄酸糖小杯»; Elderflower Caipirinha => «接骨木花凯皮林哈»; Horse's Neck => «马颈»; Mai Tai => «迈泰»; Sidecar => «边车»; Masala Chai => «马萨拉茶»; Dry Rob Roy => «干式罗布罗伊»; Wine Punch => «葡萄酒潘趣»; Early Riser => «早起者»; Herbal flame => «草本火焰»; Jewel Of The Nile => «尼罗河宝石»; Gingerbread Shot => «姜饼小杯»; Grape Chill Shot => «葡萄冰爽小杯»; Gin Fizz => «金酒菲兹»; Gin Sour => «金酒酸酒»; Greyhound => «灵缇»; White Lady => «白佳人»; Dirty Martini => «脏马天尼»; Queen Elizabeth => «伊丽莎白女王»; Beet Bloody Mary => «甜菜血腥玛丽»; Empellón Cocina's Fat-Washed Mezcal => «Empellón Cocina 的油脂浸泡梅斯卡尔»; Homemade Kahlua => «自制 Kahlua»; Dubonnet Cocktail => «Dubonnet 鸡尾酒»; Campari Beer => «Campari 啤酒»; Orangeade => «橙子水»; Mimosa => «含羞草»; Thai Iced Tea => «泰式冰茶»; Rum Punch => «朗姆潘趣酒»; Cranberry Punch => «蔓越莓潘趣»." +
    " Most recipe names in this catalog have no established Chinese name and keep the English name exactly; never translate a recipe name word by word. These keep the English name exactly: Lemon Drop, Egg Cream, Port And Starboard, Rum Runner, Gin Daisy, Funk and Soul, Royal Flush, The Slammer, Tuxedo Cocktail, Affinity, Victor, Penicillin, Aviation, Hot Creamy Bush, Flander's Flake-Out, French Connection, Cherry Swizzle, Gin Swizzle, Melya, Pink Penocha, Rose De Varsovie, Pear Pressure, Orange Push-up, Highland Fling Cocktail, Sol Y Sombra, Tomato Tang." +
    " Swizzle is not Sling: never write «司令» for a Swizzle, and Gin Swizzle and Cherry Swizzle stay in English. Measure units: ml, cl, L, and «盎司» for oz; translate other units: cup «杯», quart or qt «夸脱», gallon or gal «加仑», a fifth «瓶（五分之一加仑）».",
};

/** Each language's own name, shown in the switcher whatever the active language. */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  fr: "Français",
  ru: "Русский",
  hi: "हिन्दी",
  ja: "日本語",
  ko: "한국어",
  zh: "简体中文",
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function isNonDefaultLocale(value: string | null | undefined): value is NonDefaultLocale {
  return isSupportedLocale(value) && value !== DEFAULT_LOCALE;
}

export function isLaunchedLocale(value: string | null | undefined): value is Locale {
  return LAUNCHED_LOCALES.includes(value as Locale);
}

/**
 * The one filter for a stored preference (web cookie, mobile AsyncStorage,
 * user_preferences.locale). An unlaunched value counts as absent but is left
 * in place, so it applies again at launch (spec 0045 AC-7).
 */
export function resolveStoredLocale(
  value: string | null | undefined,
  { allowUnlaunched = false }: { allowUnlaunched?: boolean } = {},
): Locale | null {
  if (!isSupportedLocale(value)) {
    return null;
  }
  return allowUnlaunched || isLaunchedLocale(value) ? value : null;
}

/**
 * Whether a language tag asks for Traditional Chinese (spec 0052 AC-8): the
 * primary subtag is `zh` and either the script is `Hant`, or there is no
 * `Hans` and the region is Taiwan, Hong Kong, or Macau. Ignores case and
 * accepts `_` between subtags (`zh_TW`). This is the one place detection
 * names a language; keep the Chinese rule here only.
 */
export function isTraditionalChineseTag(tag: string): boolean {
  const [primary, ...rest] = tag.toLowerCase().split(/[-_]/);
  if (primary !== "zh") {
    return false;
  }
  return (
    rest.includes("hant") ||
    (!rest.includes("hans") && rest.some((part) => part === "tw" || part === "hk" || part === "mo"))
  );
}

/**
 * The locale one BCP 47 language tag picks, or null: the tag's primary subtag
 * (hyphen separated only, so `es_ES` picks nothing) when it is a supported
 * locale in `allowed`. A Traditional Chinese tag never picks Simplified
 * (spec 0052 AC-8). Shared by web and mobile detection.
 */
export function localeForLanguageTag(
  tag: string | null | undefined,
  allowed: readonly Locale[] = LAUNCHED_LOCALES,
): Locale | null {
  if (!tag || isTraditionalChineseTag(tag)) {
    return null;
  }
  const primary = tag.toLowerCase().split("-")[0];
  return isSupportedLocale(primary) && allowed.includes(primary) ? primary : null;
}

export function parseAcceptLanguage(
  header: string | null | undefined,
  allowed: readonly Locale[] = LAUNCHED_LOCALES,
): Locale | null {
  if (!header) {
    return null;
  }

  const candidates = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter((tag): tag is string => Boolean(tag));

  // Once a Traditional Chinese tag has been seen, a later bare `zh` belongs to
  // it (Taiwan Chrome sends `zh-TW,zh;q=0.9`), so it is skipped too; a later
  // explicit Simplified tag still picks `zh` (spec 0052 AC-8).
  const firstTraditional = candidates.findIndex(isTraditionalChineseTag);
  const picked = candidates
    .filter((tag, index) => !(tag === "zh" && firstTraditional !== -1 && index > firstTraditional))
    .map((tag) => localeForLanguageTag(tag, allowed))
    .find((locale) => locale !== null);

  return picked ?? null;
}

/** The locale a path with no locale prefix redirects to (spec 0045 AC-7). */
export function resolveRedirectLocale(
  storedLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return resolveStoredLocale(storedLocale) ?? parseAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/**
 * A page's hreflang alternates, keyed by hreflang code, launched locales only.
 * An unlaunched page gets none (spec 0045 AC-7).
 */
export function hreflangAlternates(
  locale: Locale,
  pathFor: (candidate: Locale) => string,
): Record<string, string> {
  return isLaunchedLocale(locale)
    ? Object.fromEntries(
        LAUNCHED_LOCALES.map((candidate) => [LOCALE_HREFLANG[candidate], pathFor(candidate)]),
      )
    : {};
}
