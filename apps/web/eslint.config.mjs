import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Every page renders under a [locale] segment; the plain Next.js helpers
  // drop the prefix and send /es visitors to English. Use @/i18n/navigation.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: 'Use `Link` from "@/i18n/navigation" so links keep the current locale.',
            },
            {
              name: "next/navigation",
              importNames: ["redirect", "permanentRedirect", "useRouter", "usePathname"],
              message:
                'Import this from "@/i18n/navigation" so navigation keeps the current locale.',
            },
          ],
        },
      ],
    },
  },
  // Spec 0038 AC-14: jsx-a11y's recommended rules across apps/web/src.
  // eslint-config-next already registers the jsx-a11y plugin, so only the
  // rule set is added here. No rule is turned off globally; any
  // eslint-disable for one of these rules needs an inline reason.
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
