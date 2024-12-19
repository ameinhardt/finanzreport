import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker?worker&url';
import { type TargetedEvent, useState } from 'preact/compat';
import { useIntl } from 'react-intl';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import 'virtual:unocss-devtools';
import './style.css';

interface TextXItem {
  s: number
  str: string
  x: number
  y: number
}

interface Account {
  amount: number
  iban?: string
}

const EUROS = /^[+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/;

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

function assert(expression: boolean): asserts expression is true {
  if (expression !== true) {
    throw new Error('unexpected assertion');
  }
}

const idx = 0;
async function readFile(file: File): Promise<TextXItem[]> {
  const data = await file.arrayBuffer(),
    pdf = await pdfjs.getDocument(data).promise;
  try {
    const textItems: TextXItem[] = [];
    for (let numPage = 2; numPage <= pdf.numPages; numPage++) { // skip first greetings page
      const page = await pdf.getPage(numPage),
        { items } = await page.getTextContent();
      textItems.push(
        ...(items.filter((s) => ((s as TextItem).str?.trim() ?? '').length > 0) as TextItem[])
          .map((textItem) => ({
            s: textItem.transform[0] as number,
            str: textItem.str,
            x: textItem.transform[4] as number,
            y: textItem.transform[5] as number
          }))
          .filter((item) => item.y > 43 && item.y < 715) // crop header and footer
      );
    }
    return textItems;
  } finally {
    await pdf.destroy();
  }
}

function textToCents(str: string) {
  assert(EUROS.test(str));
  return Number.parseInt(str.replace(/[.,]/g, ''));
}

function popNextSection(textItems: TextXItem[]) {
  assert(textItems[0].s > 9); // start with a caption
  const caption = textItems.shift()!,
    endIdx = textItems.findIndex(({ s }) => s > 9);
  return [caption, ...textItems.splice(0, !~endIdx ? textItems.length : endIdx)]; // return until or empty all
}

function extractOverview(textItems: TextXItem[]) {
  assert(['Kontoübersicht', 'Ihre aktuellen Salden', 'IBAN', 'Saldo in', 'EUR'].every((str, i) => textItems[i].str === str));
  const overviewItems = textItems.slice(5),
    rows = Object.groupBy(overviewItems, ({ y }) => y) as Record<number, TextXItem[]>,
    summaryRow = rows[Math.min(...Object.keys(rows).map(Number.parseFloat))],
    summary = {
      date: new Date(summaryRow[1].str),
      sum: textToCents(summaryRow[2].str)
    },
    accounts: Record<string, Account> = Object.fromEntries(Object.values(rows)
      .filter((row) => row !== summaryRow)
      .map((row) => [row[0].str, row.length > 2
        ? {
            amount: textToCents(row[2].str),
            iban: row[1].str
          }
        : { amount: textToCents(row[1].str) }]));

  assert(Object.values(accounts).reduce((partialSum, { amount }) => partialSum + amount, 0) === summary.sum);
  return {
    accounts,
    summary
  };
}

export function App() {
  const i18n = useIntl(),
    [progressBar, setProgressBar] = useState<number | undefined>(),
    // eslint-disable-next-line perfectionist/sort-union-types
    [state, setState] = useState<'start' | 'readFile' | 'overview' | `details_${number}` | 'done'>('start');

  async function processFiles(event: TargetedEvent<HTMLInputElement, Event>) {
    const fileList = (event.target as HTMLInputElement).files;
    if (fileList == null || fileList.length === 0) {
      return;
    }
    let progress = 0;
    setProgressBar(progress);
    // await new Promise((resolve) => queueMicrotask(() => resolve(true)));
    for (const file of Array.from(fileList)) {
      setState('readFile');
      const fileText = await readFile(file);
      setState('overview');
      const overview = extractOverview(popNextSection(fileText));
      while (fileText.length > 0) {
        const section = popNextSection(fileText);
        if (section[0].str === 'Steuerübersicht') {
          break;
        }
        assert(overview.accounts[section[0].str] != null);
      }

      progress += 100 / fileList.length;
      setProgressBar(progress);
    }
    setProgressBar(undefined);
    // details.push(...textItems.filter((i) => i.transform[4] === 59.556));
  }

  return (
    <div class="bg-base-200">
      <div class="mx-auto min-h-screen hero container">
        <div class="w-full flex-col hero-content lg:flex-row-reverse">
          <div class="text-center lg:text-left">
            <h1 class="text-5xl font-bold">{ i18n.$t({ id: 'pages.about.title' }) }</h1>
            <p class="py-6">
              Upload the Finanzreport_*.pdf files you want to extract here
            </p>
          </div>
          <div class="max-w-sm w-full shrink-0 bg-base-100 shadow-2xl card">
            <div class="card-body">
              { progressBar == null
                ? (
                    <input
                      type="file"
                      multiple
                      class="file-input file-input-bordered file-input-primary"
                      onChange={(event) => void processFiles(event)}
                    />
                  )
                : (
                    <progress class="h-12 max-w-xs w-full progress progress-primary" value={progressBar} max="100"></progress>
                  ) }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
