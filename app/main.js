import { loadAppEnv } from './loadEnv.js';

loadAppEnv();

await import('./app.js');
