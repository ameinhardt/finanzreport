import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker?worker&url';
import { type TargetedEvent, useRef, useState } from 'preact/compat';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import 'virtual:unocss-devtools';
import './style.css';

interface TextXItem {
  bold: boolean
  s: number
  str: string
  x: number
  y: number
}

interface Transaction {
  amount: number
  dateOfEntry: Date
  issuer: string
  process: string
  reference: string
  text: string
  valuta: Date
}

interface Account {
  amount: number
  iban?: string
  transactions: Transaction[]
}

interface Report {
  accounts: Record<string, Account>
  summary: {
    date: Date
    sum: number
  }
}

const EURORE = /^[+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/,
  DATERE = /^(?<day>\d\d)\.(?<month>\d\d)\.(?<year>\d{4})$/,
  // PROCESSREFERENCERE = /^(.*)([\dA-Z]{3}\d{5}[0-9A-O]\d{7}\/\d+|\d{15})$/; // https://community.comdirect.de/t5/wertpapiere-anlage/was-bedeuten-die-nummern-auf-wertpapierabrechnungen/m-p/12936#messageview_0
  PROCESSREFERENCERE = /^(.*)([\dA-Z]{16}\/\d+|\d{15})$/;

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

function assert(expression: boolean): asserts expression is true {
  if (expression !== true) {
    throw new Error('unexpected assertion');
  }
}

const saldos: Record<string, Map<Date, number>> = {},
  assertSaldo = (name: string, dateStr: string, saldoStr: string) => {
    saldos[name] ??= new Map<Date, number>();
    const date = textToDate(dateStr),
      saldo = textToCents(saldoStr),
      previous = saldos[name].get(date);
    if (previous != null) {
      assert(previous === saldo);
    } else {
      saldos[name].set(date, saldo);
    }
  };

async function readFile(file: File): Promise<TextXItem[]> {
  const data = await file.arrayBuffer(),
    pdf = await pdfjs.getDocument(data).promise;
  try {
    const textItems: TextXItem[] = [];
    for (let numPage = 2; numPage <= pdf.numPages; numPage++) { // skip first greetings page
      const page = await pdf.getPage(numPage),
        { items } = await page.getTextContent();

      await page.getOperatorList();

      const boldFonts = new Map<string, boolean>();
      function isBold(fontName: string) {
        let isBold = boldFonts.get(fontName);
        if (isBold == null) {
          isBold = ['AAAAAB+Dax-Medium', 'AAAAAB+MarkOffcPro-Bold'].includes((page.commonObjs.get(fontName) as { name: string }).name);
          boldFonts.set(fontName, isBold);
        }
        return isBold;
      }

      textItems.push(
        ...(items.filter((s) => ((s as TextItem).str?.trim() ?? '').length > 0) as TextItem[])
          .map((textItem) => ({
            bold: isBold(textItem.fontName),
            // font: page.commonObjs.get(textItem.fontName),
            // item: textItem,
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
  assert(EURORE.test(str));
  return Number.parseInt(str.replace(/[.,]/g, ''));
}

function textToDate(str: string) {
  const match = str.match(DATERE);
  assert(match != null);
  const { day, month, year } = match?.groups as { day: '\d\d', month: '\d\d', year: '\d\d\d\d' };
  return new Date(`${year}-${month}-${day}`);
}

function popNextSection(textItems: TextXItem[]) {
  assert(textItems[0].s > 9); // start with a caption
  const caption = textItems.shift()!,
    endIdx = textItems.findIndex(({ s }) => s > 9);
  return [caption, ...textItems.splice(0, !~endIdx ? textItems.length : endIdx)]; // return until or empty all
}

function getOverview(textItems: TextXItem[]): Report {
  assert(['Kontoübersicht', 'Ihre aktuellen Salden', 'IBAN', 'Saldo in', 'EUR'].every((str, i) => textItems[i].str === str));
  const overviewItems = textItems.slice(5),
    rows = Object.groupBy(overviewItems, ({ y }) => y) as Record<number, TextXItem[]>,
    summaryRow = rows[Math.min(...Object.keys(rows).map(Number.parseFloat))],
    summary = {
      date: textToDate(summaryRow[1].str),
      sum: textToCents(summaryRow[2].str)
    },
    accounts: Record<string, Account> = Object.fromEntries(Object.values(rows)
      .filter((row) => row !== summaryRow)
      .map((row) => [row[0].str, row.length > 2
        ? {
            amount: textToCents(row[2].str),
            iban: row[1].str,
            transactions: []
          }
        : {
            amount: textToCents(row[1].str),
            transactions: []
          }]));

  assert(Object.values(accounts).reduce((partialSum, { amount }) => partialSum + amount, 0) === summary.sum);
  return {
    accounts,
    summary
  };
}

function *getTransactions(section: TextXItem[], name: string): Generator<Transaction> {
  const startsAt = section.findIndex(({ bold, str }) => bold && str === 'Alter Saldo'),
    hasIssuer = section[9].str === 'Auftraggeber/Empfänger',
    endsAt = section.findIndex(({ bold, str }) => bold && str === 'Neuer Saldo'),
    items = section.slice(startsAt + 3, endsAt).filter(({ bold }) => !bold);
  assertSaldo(name, section[startsAt + 1].str, section[startsAt + 2].str);
  assertSaldo(name, section[endsAt + 1].str, section[endsAt + 2].str);
  let iter = 0;
  while (iter < items.length) {
    if (items[iter].str.startsWith('A') && items[iter + 1].str === 'A') { // fix 10-11/2019 issues
      items[iter].str = items[iter].str.substring(1);
      items.splice(iter + 1, 1);
    // endsAt--;
    }
    const transaction: Partial<Transaction> = {
        dateOfEntry: textToDate(items[iter++].str),
        valuta: textToDate(items[iter++].str)
      },
      text: string[] = [];
    let processReference = '';
    while (iter < items.length && items[iter].x >= 115 && items[iter].x < 188) {
      processReference += items[iter++].str;
    }
    const match = processReference.match(PROCESSREFERENCERE);
    assert(match != null);
    transaction.process = match![1];
    transaction.reference = match![2];
    if (hasIssuer) {
      const issuer: string[] = [];
      while (iter < items.length && items[iter].x >= 188 && items[iter].x < 300) { // 308
        issuer.push(items[iter++].str);
      }
      transaction.issuer = issuer.join(' ');
    }
    while (iter < items.length && items[iter].x >= (hasIssuer ? 300 : 188) && items[iter].x < 500) {
      text.push(items[iter++].str);
    }
    transaction.text = text.join(' ');
    transaction.amount = textToCents(items[iter++].str);
    yield transaction as Transaction;
  }
}

async function *getReports(fileList: FileList): AsyncGenerator<Report> {
  for (const file of Array.from(fileList)) {
    const fileText = await readFile(file),
      report = getOverview(popNextSection(fileText));
    while (fileText.length > 0) {
      const section = popNextSection(fileText),
        name = section[0].str;
      if (name === 'Depot') {
        // Todo: not yet implemented
        break;
      }
      if (name === 'Steuerübersicht') {
        break;
      }
      assert(report.accounts[name] != null);

      for (const transaction of getTransactions(section, name)) {
        report.accounts[name].transactions.push(transaction);
      }
    }
    yield report;
  }
}

export function App() {
  const [progressBar, setProgressBar] = useState<number | undefined>(),

    [csvContent, setCsvContent] = useState<[string, string][]>([]),
    dialog = useRef<HTMLDialogElement>(null);

  async function processFiles(event: TargetedEvent<HTMLInputElement, Event>) {
    const fileList = (event.target as HTMLInputElement).files;
    if (fileList == null || fileList.length === 0) {
      return;
    }
    let progress = 0;
    setProgressBar(progress);
    try {
      const allTransactions: Record<string, string[][]> = {};

      for await (const report of getReports(fileList)) {
        progress += 100 / fileList.length;
        setProgressBar(progress);

        for (const account in report.accounts) {
          allTransactions[account] ??= [];
          allTransactions[account].push(...report.accounts[account].transactions.map(({ amount, dateOfEntry, issuer, process, reference, text, valuta }) => [
            dateOfEntry.toISOString().substring(0, 10),
            valuta.toISOString().substring(0, 10),
            amount.toString().replace(/(\d+)(\d\d)/, '$1.$2'),
            issuer,
            process,
            reference,
            text
          ]));
        }
      }
      setCsvContent(
        Object.entries(allTransactions)
          .map(([name, transactions]) => [name, `data:text/csv;charset=utf-8,${transactions.map((column) => column.join(';')).join('\n')}`])
      );
      dialog.current?.showModal();
    } finally {
      setProgressBar(undefined);
    }
    // details.push(...textItems.filter((i) => i.transform[4] === 59.556));
  }

  return (
    <div class="bg-base-200">
      <div class="mx-auto min-h-screen hero container">
        <div class="grid w-full justify-items-center gap-4 hero-content lg:grid-cols-2">
          <div class="text-center lg:order-2 lg:text-left">
            <h1 class="text-5xl font-bold">Finanzreport</h1>
            <p class="py-6">
              Comdirect Finanzreport_*.pdf files are (batch) downloadable from your online postbox. Select the ones here that you want to convert. Data is processed only locally.
            </p>
          </div>
          <div role="alert" class="order-3 alert alert-success">
            <div class="anim-pulse i-mdi-lightbulb-variant-outline animate-pulse animate-duration-5000 text-2xl text-orange"></div>
            All data is processed locally
          </div>
          <div class="align-center row-span-2 w-full bg-base-100 shadow-2xl card lg:max-w-sm">
            <div class="justify-center card-body">
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
      <dialog ref={dialog} class="modal modal-bottom sm:modal-middle">
        <div class="modal-box">
          <h3 class="text-lg font-bold">Download CSV</h3>
          <p class="py-4">Press ESC key or click the button below to close</p>
          <ul>
            {
              csvContent.map(([name, file]) => (
                <li key={name}>
                  <a href={file} target="_blank">{ name }</a>
                </li>
              ))
            }
          </ul>
          <div class="modal-action">
            <form method="dialog">
              <button class="btn" type="button" onClick={() => dialog.current?.close()}>Close</button>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  );
}
