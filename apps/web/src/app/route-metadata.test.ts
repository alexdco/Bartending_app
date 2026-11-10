import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { LEARN_CATEGORIES } from "@bartendingapp/shared";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import pt from "../../messages/pt.json";

// Spec 0037, AC-2 and AC-3: every route has its own translated title, and
// every indexable route its own description. This mirrors the spec's Route
// titles table; a new route fails here until it is added to the table.

type Messages = Record<string, Record<string, string>>;

type RouteMeta = {
  // Message namespace and key of the title, or "data" for a title read from
  // the route's own data (recipe name, article title, quiz title).
  readonly title: readonly [string, string] | "data";
  // Message key of the description, "data" when built from the route's data,
  // or null for private routes that fall back to the site description.
  readonly description: readonly [string, string] | "data" | null;
};

const ROUTES: Record<string, RouteMeta> = {
  "page.tsx": { title: ["home", "siteTitle"], description: ["home", "metaDescription"] },
  "search/page.tsx": {
    title: ["search", "metaTitle"],
    description: ["search", "metaDescription"],
  },
  "recipes/[slug]/page.tsx": { title: "data", description: ["recipe", "metaDescription"] },
  "recipes/[slug]/more-like-this/page.tsx": {
    title: ["moreLikeThis", "metaTitle"],
    description: ["moreLikeThis", "metaDescription"],
  },
  "popular/page.tsx": {
    title: ["popular", "title"],
    description: ["popular", "indexMetaDescription"],
  },
  "popular/[region]/page.tsx": {
    title: ["popular", "metaTitle"],
    description: ["popular", "metaDescription"],
  },
  "learn/page.tsx": {
    title: ["learn", "landingTitle"],
    description: ["learn", "landingDescription"],
  },
  // One title and description per category (spec 0033 AC-8), checked below.
  "learn/[category]/page.tsx": { title: "data", description: "data" },
  // Its description is the article's summary column (spec 0033 AC-6).
  "learn/[category]/[slug]/page.tsx": { title: "data", description: "data" },
  "quizzes/page.tsx": { title: ["quizzes", "title"], description: ["quizzes", "metaDescription"] },
  "quizzes/[slug]/page.tsx": {
    title: "data",
    description: ["quizzes", "detailMetaDescription"],
  },
  "drink-ideas/page.tsx": {
    title: ["drinkIdeas", "title"],
    description: ["drinkIdeas", "metaDescription"],
  },
  "privacy/page.tsx": {
    title: ["privacy", "metaTitle"],
    description: ["privacy", "metaDescription"],
  },
  "pantry/page.tsx": { title: ["pantry", "title"], description: null },
  "favorites/page.tsx": { title: ["favorites", "title"], description: null },
  "shopping-list/page.tsx": { title: ["shoppingList", "title"], description: null },
  "account/page.tsx": { title: ["account", "metaTitle"], description: null },
  "account/reset-password/page.tsx": {
    title: ["account", "resetPasswordMetaTitle"],
    description: null,
  },
  "auth/callback/page.tsx": { title: ["account", "callbackMetaTitle"], description: null },
  "admin/ingredients/page.tsx": { title: ["admin", "ingredientsMetaTitle"], description: null },
  "admin/comments/page.tsx": { title: ["admin", "commentsMetaTitle"], description: null },
  "admin/recipes/page.tsx": { title: ["admin", "recipesMetaTitle"], description: null },
  "admin/recipes/new/page.tsx": { title: ["admin", "newRecipeMetaTitle"], description: null },
  "admin/recipes/[id]/edit/page.tsx": {
    title: ["admin", "editRecipeMetaTitle"],
    description: null,
  },
  "service/page.tsx": { title: ["service", "metaTitle"], description: null },
  "service/search/page.tsx": { title: ["service", "searchMetaTitle"], description: null },
  "service/build/[kind]/[id]/page.tsx": {
    title: ["service", "buildMetaTitle"],
    description: null,
  },
  "service/recipes/new/page.tsx": {
    title: ["service", "newRecipeMetaTitle"],
    description: null,
  },
  "service/invite/page.tsx": { title: ["service", "inviteMetaTitle"], description: null },
  "service/invites/page.tsx": { title: ["service", "invitesMetaTitle"], description: null },
};

const LOCALE_DIR = join(__dirname, "[locale]");

const pageFiles = readdirSync(LOCALE_DIR, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name === "page.tsx")
  .map((entry) => relative(LOCALE_DIR, join(entry.parentPath, entry.name)).split(sep).join("/"))
  // The catch all only routes unknown paths to not-found.tsx.
  .filter((file) => file !== "[...rest]/page.tsx")
  .sort();

const source = (file: string) => readFileSync(join(LOCALE_DIR, file), "utf8");

const LOCALES: Record<string, Messages> = { en, es, pt } as unknown as Record<string, Messages>;

const keyed = (meta: RouteMeta["title"] | RouteMeta["description"]) =>
  Array.isArray(meta) ? (meta as readonly [string, string]) : null;

describe("route metadata coverage", () => {
  it("lists every route under [locale] in the table", () => {
    expect(pageFiles).toEqual(Object.keys(ROUTES).sort());
  });

  it.each(Object.keys(ROUTES))("%s defines generateMetadata", (file) => {
    expect(source(file)).toMatch(/export async function generateMetadata/);
  });

  it.each(Object.entries(ROUTES))("%s reads its title and description keys", (file, meta) => {
    const text = source(file);
    [keyed(meta.title), keyed(meta.description)]
      .filter((pair): pair is readonly [string, string] => pair !== null)
      .forEach(([namespace, key]) => {
        expect(text).toContain(`"${namespace}"`);
        expect(text).toContain(`t("${key}"`);
      });
  });

  it.each(Object.keys(LOCALES))("has every title and description in %s", (locale) => {
    const messages = LOCALES[locale];
    const missing = Object.values(ROUTES)
      .flatMap((meta) => [keyed(meta.title), keyed(meta.description)])
      .filter((pair): pair is readonly [string, string] => pair !== null)
      .filter(([namespace, key]) => !messages[namespace]?.[key]?.trim());
    expect(missing).toEqual([]);
  });

  it.each(Object.keys(LOCALES))("gives each route type its own title in %s", (locale) => {
    const messages = LOCALES[locale];
    const titles = Object.values(ROUTES)
      .map((meta) => keyed(meta.title))
      .filter((pair): pair is readonly [string, string] => pair !== null)
      .map(([namespace, key]) => messages[namespace][key]);
    const notFound = messages.common.notFoundTitle;
    expect(new Set([...titles, notFound]).size).toBe(titles.length + 1);
  });

  it("reads each Learn category's own title and description", () => {
    const text = source("learn/[category]/page.tsx");
    expect(text).toContain("t(`categoryTitles.${category}`)");
    expect(text).toContain("t(`categoryDescriptions.${category}`)");
  });

  it("reads each Learn article's description from its summary", () => {
    const text = source("learn/[category]/[slug]/page.tsx");
    expect(text).toContain("description: article.summary");
  });

  it.each(Object.keys(LOCALES))(
    "has a hand written title and description for every Learn category in %s",
    (locale) => {
      const learn = LOCALES[locale].learn as unknown as Record<string, Record<string, string>>;
      LEARN_CATEGORIES.forEach((category) => {
        expect(learn.categoryTitles?.[category]?.trim()).toBeTruthy();
        expect(learn.categoryDescriptions?.[category]?.trim()).toBeTruthy();
      });
      const titles = LEARN_CATEGORIES.map((category) => learn.categoryTitles[category]);
      expect(new Set(titles).size).toBe(titles.length);
      expect(Object.values(learn.categoryDescriptions).join(" ")).not.toMatch(/Learn about/);
    },
  );

  it("titles the locale not found page", () => {
    const text = readFileSync(join(LOCALE_DIR, "not-found.tsx"), "utf8");
    expect(text).toMatch(/export async function generateMetadata/);
    expect(text).toContain('t("notFoundTitle")');
  });
});
