import { presetDaisy } from '@ameinhardt/unocss-preset-daisy';
import colors from 'daisyui/src/theming/index.js';
import { defineConfig, presetAttributify, presetTypography, presetWind, transformerDirectives, transformerVariantGroup } from 'unocss';

export default defineConfig({
  presets: [presetAttributify(), presetTypography(), presetWind(), presetDaisy({
    themes: ['light', 'dark']
  })],
  rules: [
    ['p-safe', { padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }],
    ['pt-safe', { 'padding-top': 'env(safe-area-inset-top)' }],
    ['pr-safe', { 'padding-right': 'env(safe-area-inset-right)' }],
    ['pb-safe', { 'padding-bottom': 'env(safe-area-inset-bottom)' }],
    ['pl-safe', { 'padding-left': 'env(safe-area-inset-left)' }]
  ],
  safelist: ['lg:hidden', 'text-lg'], // appease devtools ordering
  separators: [':'],
  theme: {
    colors: colors as Record<string, string>
  },
  transformers: [transformerDirectives(), transformerVariantGroup()]
});
