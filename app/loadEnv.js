import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let loaded = false;

export function loadAppEnv() {
  if (loaded) return;
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
  loaded = true;
}
