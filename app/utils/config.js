// Refuse to boot a production process on the well-known 'password' default —
// dev/test keep the fallback for ergonomics (docker-compose.local.yml sets
// its own throwaway default; CI sets NEO4J_PASSWORD explicitly).
if (!process.env.NEO4J_PASSWORD && process.env.NODE_ENV === 'production') {
  throw new Error(
    'NEO4J_PASSWORD must be set in production — refusing to start with an insecure default credential.'
  );
}

const config = {
  path: process.env.PATH || './',
  port: process.env.PORT || 3000,
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://neo4j:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  },
  translateApi: {
    host: process.env.TRANSLATE_HOST || 'localhost',
    port: process.env.TRANSLATE_PORT || '5000',
    path: process.env.TRANSLATE_PATH || '/translate',
    protocol: process.env.TRANSLATE_PROTOCOL || 'http',
  },
  getTranslateApiEndpoint: function () {
    return `${this.translateApi.protocol}://${this.translateApi.host}:${this.translateApi.port}${this.translateApi.path}`;
  },
};

export { config };
