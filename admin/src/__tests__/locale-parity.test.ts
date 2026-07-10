import en from "../../messages/en.json";
import de from "../../messages/de.json";
import fr from "../../messages/fr.json";
import nl from "../../messages/nl.json";

type Messages = Record<string, unknown>;

function flatten(obj: Messages, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const k of flatten(value as Messages, path)) keys.add(k);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

const LOCALES: Record<string, Messages> = { de, fr, nl };

describe("locale key parity", () => {
  const enKeys = flatten(en as Messages);

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale}.json has exactly the same keys as en.json`, () => {
      const localeKeys = flatten(messages as Messages);
      const missing = [...enKeys].filter((k) => !localeKeys.has(k));
      const extra = [...localeKeys].filter((k) => !enKeys.has(k));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  }
});
