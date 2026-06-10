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
