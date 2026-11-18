// English store listing (App Store en-US, Play en-US). The primary listing:
// Korean, Hindi, and Russian store visitors see this one too.
// Feature names follow apps/web/messages/en.json. Spec 0057.
import type { StoreListing } from "./types";

const AGE_LINE = "For adults of legal drinking age. Please drink responsibly.";

const DESCRIPTION = `Cocktailist helps you make drinks from what you already have.

Tell it what is in your bar, and it shows the cocktails you can make right now, plus the ones you are only an ingredient or two away from. When nothing fits, ask for AI drink ideas from your pantry: a new recipe built around the bottles you own.

WHAT YOU CAN DO
• Pantry: add your spirits, mixers, and garnishes once, and every recipe shows what you have and what you are missing.
• Drink ideas: see what you can make tonight, and get AI drink ideas for the rest.
• Search: find classic and modern cocktails and mocktails by name or ingredient, with clear measures and steps.
• Favorites and shopping list: save the drinks you love and keep a list of what to buy next.
• Popular drinks by region: see what people order around the world.
• Learn and quizzes: short guides to spirits, wine, beer, and bar tools, with quizzes to test what you know.

FOR HOSTS AND BARTENDERS
• Batch calculator: scale a recipe for a party or a pitcher, with dilution worked out for you.
• Bartender Mode: fast search and pinned cocktails for a busy shift, plus a shared menu for your bar team.

NO ACCOUNT NEEDED TO START
Open the app and start mixing. Sign in when you want your pantry and favorites to follow you, or to share a bar menu with your team.

Cocktailist is free, with no in app purchases and no ads.

${AGE_LINE}`;

export const en: StoreListing = {
  locale: "en",
  ageLine: AGE_LINE,
  releaseNotes:
    "Welcome to Cocktailist. Tell it what is in your bar, see what you can make, and get AI drink ideas for the rest. Thanks for being here from the start.",
  appStore: {
    locale: "en-US",
    name: "Cocktailist: Cocktail Recipes",
    subtitle: "Make drinks with what you have",
    keywords: [
      "mixology",
      "bartender",
      "pantry",
      "ingredient",
      "margarita",
      "mojito",
      "martini",
      "gin",
      "vodka",
      "rum",
      "whiskey",
      "tequila",
      "bar",
    ],
    promotionalText:
      "Tell Cocktailist what is in your bar and see the drinks you can make tonight. Nothing fits? Get AI drink ideas from your pantry.",
    description: DESCRIPTION,
  },
  play: {
    locale: "en-US",
    title: "Cocktailist: Cocktail Recipes",
    shortDescription: "Make drinks with what you have, and get AI drink ideas from your pantry.",
    fullDescription: DESCRIPTION,
  },
  screenshots: {
    captions: [
      "See what you can make tonight",
      "Get AI drink ideas from your pantry",
      "Classic recipes with clear steps",
      "Search by name or ingredient",
      "Scale a recipe for a party",
      "Learn spirits, wine, and bar tools",
    ],
    featureGraphicLine: "Make drinks with what you have",
  },
};
