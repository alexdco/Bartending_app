// Parses a dotenv style file (KEY=value per line, # comments, optional
// quotes) into a plain record. Used by the store capture script to read the
// gitignored demo credentials (spec 0060).
export const parseEnvFile = (text: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        const raw = line.slice(index + 1).trim();
        const quoted = /^(["'])(.*)\1$/.exec(raw);
        return [key, quoted ? (quoted[2] ?? "") : raw] as const;
      }),
  );
