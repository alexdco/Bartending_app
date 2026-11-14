import { describe, expect, it } from "vitest";
import {
  CHINESE_BANNED_TERMS,
  TRADITIONAL_ONLY_CHARACTERS,
  TRADITIONAL_ONLY_SQL_CLASS,
  findBannedChineseTerms,
  findTraditionalCharacters,
  hasTraditionalCharacter,
  keepSourceNameUnlessChinese,
} from "./chineseScript";
import { LOCALE_AI_TERMS } from "./locale";

/** The bar and app characters the spec says the list must hold. */
const MUST_INCLUDE =
  "麗瑪龍蘭檸萊薑鹽醬蘋櫻藍綠紅黃熱涼凍搖攪濾壓擠滿飲雞調類級蘇釀葉塊顆個們這為與來時會後裡麼" +
  "開關譜單選儲櫃購買賣評論語設錄帳戶驗證隱載歡應無鐘點頁請讓說給過還進適";

/** Ordinary Simplified text: app copy, recipe steps, and a privacy style paragraph. */
const SIMPLIFIED_FIXTURE =
  "欢迎使用调酒应用。你可以在这里浏览、搜索和收藏鸡尾酒配方，也可以把家里的酒和材料加入酒柜，看看现在能调出哪些饮品。" +
  "在摇酒壶中加入冰块，倒入金酒、青柠汁和糖浆，用力摇匀，然后用滤冰器滤入冰镇过的鸡尾酒杯，饰以一片青柠。" +
  "将薄荷叶和糖放入高球杯，用捣棒轻轻挤压，加满碎冰，倒入朗姆酒和苏打水，用吧勺搅拌，最后点缀一枝薄荷。" +
  "古典杯里放一块大冰，加入威士忌、两抖苦精和一茶匙糖浆，搅拌三十秒，挤一片橙皮并放入杯中。" +
  "龙舌兰、伏特加、白兰地、味美思、利口酒、姜汁啤酒、柠檬、樱桃、苹果、蓝莓、盐、酱、红石榴糖浆、绿薄荷、黄柠檬、热水、凉茶、冷冻草莓。" +
  "请先登录你的账户，验证邮箱后即可保存评分和评论。我们只收集提供服务所需的信息，不会出售你的个人数据；" +
  "你可以随时在设置中删除账户、更改语言或关闭通知。如果你有任何问题或建议，请通过电子邮件与我们联系。" +
  "本应用仅面向已达到法定饮酒年龄的用户，请理性饮酒，切勿酒后驾车。继续使用即表示你确认已满足当地的年龄要求。" +
  "这个页面还没有内容，稍后再来看看吧。正在加载，请稍候。出了点问题，请重试。没有找到结果，换个关键词试试。" +
  "购物清单、单位、选择、储存、买卖、设置、记录、隐私、下载、无、钟、点、页、让、说、给、过、还、进、适合、开关、谱、类、级、个、们、为、与、来、时、会、后、里、么。" +
  LOCALE_AI_TERMS.zh;

// covers: spec 0052 AC-14, AC-22
describe("TRADITIONAL_ONLY_CHARACTERS", () => {
  const characters = [...TRADITIONAL_ONLY_CHARACTERS];

  it("holds at least 300 distinct characters", () => {
    expect(new Set(characters).size).toBe(characters.length);
    expect(characters.length).toBeGreaterThanOrEqual(300);
  });

  it("holds only Han characters", () => {
    expect(characters.filter((char) => !/[一-鿿]/.test(char))).toEqual([]);
  });

  it("holds the bar and app set the spec requires", () => {
    expect([...MUST_INCLUDE].filter((char) => !characters.includes(char))).toEqual([]);
  });

  it("finds none of its characters in ordinary Simplified text", () => {
    expect(findTraditionalCharacters(SIMPLIFIED_FIXTURE)).toEqual([]);
    expect(hasTraditionalCharacter(SIMPLIFIED_FIXTURE)).toBe(false);
  });

  it("leaves out characters that are valid in both scripts", () => {
    expect(findTraditionalCharacters("著乾藉瞭麽於徵")).toEqual([]);
  });

  it("the SQL class holds exactly the constant's characters", () => {
    expect(TRADITIONAL_ONLY_SQL_CLASS).toBe(`[${TRADITIONAL_ONLY_CHARACTERS}]`);
    expect([...TRADITIONAL_ONLY_SQL_CLASS.slice(1, -1)]).toEqual(characters);
    // No character that would change the meaning of a bracket class.
    expect(TRADITIONAL_ONLY_CHARACTERS).not.toMatch(/[\]\\^\-\s']/);
  });
});

describe("findTraditionalCharacters", () => {
  it("returns the distinct hits in first seen order", () => {
    expect(findTraditionalCharacters("瑪格麗特和瑪麗")).toEqual(["瑪", "麗"]);
    expect(hasTraditionalCharacter("瑪格麗特")).toBe(true);
  });

  it("passes Simplified, Latin, and empty text", () => {
    expect(findTraditionalCharacters("玛格丽特 Margarita 30 ml")).toEqual([]);
    expect(hasTraditionalCharacter("")).toBe(false);
  });
});

describe("findBannedChineseTerms", () => {
  it("lists the five banned terms", () => {
    expect(CHINESE_BANNED_TERMS).toEqual(["您", "莱姆", "琴酒", "兰姆酒", "青柠檬"]);
  });

  it("finds 青柠檬 and passes 青柠 and 柠檬", () => {
    expect(findBannedChineseTerms("挤入青柠檬汁")).toEqual(["青柠檬"]);
    expect(findBannedChineseTerms("青柠")).toEqual([]);
    expect(findBannedChineseTerms("柠檬")).toEqual([]);
    expect(findBannedChineseTerms("青柠和柠檬")).toEqual([]);
  });

  it("finds the formal 您 and the regional spirit words", () => {
    expect(findBannedChineseTerms("您可以加入琴酒或兰姆酒，再挤一点莱姆")).toEqual([
      "您",
      "莱姆",
      "琴酒",
      "兰姆酒",
    ]);
    expect(findBannedChineseTerms("你可以加入金酒或朗姆酒")).toEqual([]);
  });
});

describe("keepSourceNameUnlessChinese", () => {
  it("keeps the English source name when the translation has no Han", () => {
    expect(keepSourceNameUnlessChinese("jamaica kiss", "Jamaica Kiss")).toBe("Jamaica Kiss");
    expect(keepSourceNameUnlessChinese("Planters Punch", "Planter's Punch")).toBe(
      "Planter's Punch",
    );
  });

  it("keeps a translation that holds a Han character", () => {
    expect(keepSourceNameUnlessChinese("玛格丽特", "Margarita")).toBe("玛格丽特");
    expect(keepSourceNameUnlessChinese("金 Tonic", "Gin Tonic")).toBe("金 Tonic");
  });
});
