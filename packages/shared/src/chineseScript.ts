// Script and wording checks for Simplified Chinese (spec 0052 AC-14, AC-22).
// The Chinese normalizers fix punctuation and spacing but never convert a
// Traditional character, so these lists back the checks that find one: the
// vitest scans over both zh.json files, and the catalog SQL checks pasted into
// the spec's verify.md. Pure, with no dependency, so tests and scripts share
// one source. generate-drink-idea carries no copy of these lists.
// Spec: docs/specs/0052-simplified-chinese-locale/index.md

/**
 * High frequency Traditional characters whose Simplified form is a different
 * character and which standard Simplified Chinese does not use itself.
 * Curated, not complete: characters valid in both scripts (著, 乾, 藉, 瞭, 麽,
 * 於, 徵, 鍾, 夥) are left out on purpose. The first group is the bar and app
 * set the spec requires; the rest follow in radical order.
 */
export const TRADITIONAL_ONLY_CHARACTERS: string =
  // The bar and app set (spec 0052, must include).
  "麗瑪龍蘭檸萊薑鹽醬蘋櫻藍綠紅黃熱涼凍搖攪濾壓擠滿飲雞調類級蘇釀葉塊顆個們這為與來時會後裡麼" +
  "開關譜單選儲櫃購買賣評論語設錄帳戶驗證隱載歡應無鐘點頁請讓說給過還進適" +
  // General high frequency characters.
  "並兒內兩冊別劃勝動務勞勢區協卻參員問嗎嚴團圖國圍圓園場壞報墊夠夢奪奮婦媽學孫" +
  "寧實寫寬寶審對導將專尋層屬島嶺幣師帶幫庫廣廠廳廚張強彈彎徑從復複幾幹" +
  "愛態慣慶憶懷戀戰戲擁據擇擔擊掃掛採換揮損搶撥擴攝擺數斷晝暫曉書條東極樂業構槍樣標樓樹橋機檢權歐歲歷曆歸殘殺殼毀" +
  "氣決沒況洩淚淨淺測湯溝溫準滅漢漲漸潔濃濕濟濱灣瀏灑災煙燈燒營爐爛爭爺爾牆狀獎獨獲獻獸" +
  "現環產畫異當畢療瘋癢發盜監盤盡眾礙確碼礦禮禍種稱積穩窩窮競竄筆節範築簡簽籃籤糧糾" +
  "紀約紙納純細終組結絕絲統經維網緊線練編緣縣縮總績織繼續纖罰羅習聖聞聯聰聲職聽腦臉腳膽臟舉舊興艱" +
  "藝藥處號虧蟲術衛裝補製裏見規視親覺覽觀觸計訂討訓記許訴訪詞試詩話該詳認誌誤誰課談諸謝講謂識議護譯讀變" +
  "貝負貨責貴貿賀資賓賞賠賴賺賽贈贏贊趕跡踐躍車軍軟較輕輛輝輪輸轉輯轟辦辭農" +
  "連週遊運達違遠遞遲遷遺邊郵鄉鄰醫釋醜釣針鈴銀銅銷鋼錯錶鍋鍵鎖鎮鏡鐵鑰長門閉間閃閒閱闆闊闖" +
  "隊階際陣陳陸陰陽險隨隻雖雙雜離難電雲霧靈靜韓響頂項順須預頑頓領頭頻題額顏願顧顯" +
  "風飛飯飽飾養餅餓餘館馬駐駕騎驚驟體髮髒鬆鬧鬥鬱魚鮮鯊鳥鳴鴨鵝鷹鹹麥麵黨齊齒齡龜臺檯颱傑";

/** The same characters as a Postgres bracket class, for the catalog checks in verify.md. */
export const TRADITIONAL_ONLY_SQL_CLASS: string = `[${TRADITIONAL_ONLY_CHARACTERS}]`;

const TRADITIONAL_ONLY = new Set<string>(TRADITIONAL_ONLY_CHARACTERS);

/** The distinct Traditional only characters in `text`, in first seen order. */
export function findTraditionalCharacters(text: string): readonly string[] {
  return [...new Set([...text].filter((char) => TRADITIONAL_ONLY.has(char)))];
}

export function hasTraditionalCharacter(text: string): boolean {
  return [...text].some((char) => TRADITIONAL_ONLY.has(char));
}

/**
 * Wording that is wrong for this app but written in Simplified characters, so
 * the character list cannot see it: the formal 您, the Taiwan and Hong Kong
 * words for lime, gin, and rum, and 青柠檬 for lime (spec 0052 AC-14). The
 * pinned sentences in LOCALE_AI_TERMS.zh and the edge function's
 * CHINESE_INSTRUCTION name these words on purpose and are never scanned.
 */
export const CHINESE_BANNED_TERMS: readonly string[] = ["您", "莱姆", "琴酒", "兰姆酒", "青柠檬"];

/** The banned terms `text` contains, in list order. */
export function findBannedChineseTerms(text: string): readonly string[] {
  return CHINESE_BANNED_TERMS.filter((term) => text.includes(term));
}

const HAS_HAN = /[㐀-䶿一-鿿豈-﫿]/;

/**
 * A translated recipe or ingredient name when it holds a Han character, else
 * the English source name unchanged, so a kept English name never drifts in
 * case, apostrophes, or `&` (spec 0052 AC-14).
 */
export function keepSourceNameUnlessChinese(translated: string, source: string): string {
  return HAS_HAN.test(translated) ? translated : source;
}
