import process from 'node:process';
import preact from '@preact/preset-vite';
import Unocss from 'unocss/vite';
import { defineConfig } from 'vite';
import packageJson from './package.json' with { type: 'json' };

for (const key of ['name', 'author', 'version'] as const) {
  process.env[`VITE_${key.toUpperCase()}`] = packageJson[key];
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [Unocss(), preact()]
});
