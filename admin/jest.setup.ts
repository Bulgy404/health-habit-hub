import "@testing-library/jest-dom";

// jsdom doesn't implement matchMedia — Sidebar (mobile-breakpoint detection)
// and any other component reading it need at least a no-op stub, or mounting
// throws "window.matchMedia is not a function".
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
