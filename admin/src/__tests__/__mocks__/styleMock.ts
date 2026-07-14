// Stub for CSS module imports in Jest
const styleMock: Record<string, string> = new Proxy(
  {},
  {
    get(_target, prop) {
      return String(prop);
    },
  }
);

module.exports = styleMock;
