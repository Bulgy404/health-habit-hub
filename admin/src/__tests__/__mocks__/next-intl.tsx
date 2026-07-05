// Test-only stand-in for next-intl. Real next-intl ships ESM-only builds that
// Jest's default transform can't parse; since tests only ever need the English
// strings (to assert on rendered text), this mock does real key lookup against
// messages/en.json instead of returning raw keys, so existing text-based
// assertions keep working unchanged.
import React from "react";
import messages from "../../../messages/en.json";

type Messages = { [key: string]: string | Messages };

function resolve(namespace: string, key: string): string {
  const parts = [...namespace.split("."), ...key.split(".")].filter(Boolean);
  let node: string | Messages = messages as Messages;
  for (const part of parts) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return `${namespace}.${key}`;
    }
    node = node[part];
  }
  return typeof node === "string" ? node : `${namespace}.${key}`;
}

function interpolate(template: string, values?: Record<string, unknown>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in values ? String(values[name]) : match
  );
}

function makeT(namespace: string) {
  const t = (key: string, values?: Record<string, unknown>) =>
    interpolate(resolve(namespace, key), values);
  t.rich = (
    key: string,
    values?: Record<string, unknown | ((chunks: React.ReactNode) => React.ReactNode)>
  ) => {
    const raw = resolve(namespace, key);
    // Minimal <tag>content</tag> handling for rich text mocks used in tests.
    const tagMatch = raw.match(/^([\s\S]*)<(\w+)>([\s\S]*)<\/\2>([\s\S]*)$/);
    if (tagMatch && values && typeof values[tagMatch[2]] === "function") {
      const [, before, , inner, after] = tagMatch;
      const renderTag = values[tagMatch[2]] as (chunks: React.ReactNode) => React.ReactNode;
      return (
        <>
          {interpolate(before, values as Record<string, unknown>)}
          {renderTag(interpolate(inner, values as Record<string, unknown>))}
          {interpolate(after, values as Record<string, unknown>)}
        </>
      );
    }
    return interpolate(raw, values as Record<string, unknown>);
  };
  return t;
}

// Real next-intl memoizes the returned t function, so components that put it
// in a useCallback/useEffect dependency array only re-run when it actually
// changes. Cache per namespace here too, or such effects would re-fire (and
// in some cases never settle) on every render.
const cache = new Map<string, ReturnType<typeof makeT>>();
function cachedT(namespace: string) {
  let t = cache.get(namespace);
  if (!t) {
    t = makeT(namespace);
    cache.set(namespace, t);
  }
  return t;
}

export function useTranslations(namespace: string) {
  return cachedT(namespace);
}

export async function getTranslations(namespace: string) {
  return cachedT(namespace);
}

export function useLocale() {
  return "en";
}

export function useMessages() {
  return messages;
}

export function NextIntlClientProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
