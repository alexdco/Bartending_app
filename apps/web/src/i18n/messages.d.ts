// Types every message key against the English catalog, so a missing or
// misspelled key fails typecheck instead of rendering the raw key.
import type messages from "../../messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
  }
}
