import { render } from 'preact';
import { IntlProvider } from 'react-intl';
import { App } from './App.js';
import messages from './locales/en.json';

const locale = 'en';

interface NestedObject {
  [key: string]: NestedObject | string
}

function flatten(nestedObject: NestedObject, path: Array<string> = []): Record<string, string> {
  return Object.assign({}, ...Object.entries(nestedObject)
    .map(([key, value]) => typeof value === 'object'
      ? flatten(value, [...path, key])
      : ({ [[...path, key].join('.')]: value }))) as Record<string, string>;
}

render(
  <IntlProvider locale={locale} messages={flatten(messages)}>
    <App />
  </IntlProvider>,
  document.getElementById('app')
);
