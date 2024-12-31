import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import * as pdfjs from 'pdfjs-dist';
import WorkerSrc from 'pdfjs-dist/build/pdf.worker?worker&inline';

interface Text {
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

export interface Account {
  end: number
  iban?: string
  start?: number
  transactions: Transaction[]
}

export interface Report {
  accounts: Record<string, Account>
  summary: {
    date: Date
    sum: number
  }
}

export class ParsingError extends Error {};

const EURORE = /^[+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/,
  DATERE = /^(?<day>\d\d)\.(?<month>\d\d)\.(?<year>\d{4})$/,
  // PROCESSREFERENCERE = /^(.*)([\dA-Z]{3}\d{5}[0-9A-O]\d{7}\/\d+|\d{15})$/; // https://community.comdirect.de/t5/wertpapiere-anlage/was-bedeuten-die-nummern-auf-wertpapierabrechnungen/m-p/12936#messageview_0
  PROCESSREFERENCERE = /^(.*)([\dA-Z]{16}\/\d+|\d{15})$/;

// pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.js';
pdfjs.GlobalWorkerOptions.workerPort = new WorkerSrc();

function assert(expression: boolean, error = 'unexpected assertion'): asserts expression is true {
  if (expression !== true) {
    throw new ParsingError(error);
  }
}

const saldos: Record<string, Map<Date, number>> = {},
  assertSaldo = (name: string, dateStr: string, saldoStr: string) => {
    saldos[name] ??= new Map<Date, number>();
    const date = textToDate(dateStr),
      saldo = textToCents(saldoStr),
      previous = saldos[name].get(date);
    if (previous != null) {
      assert(previous === saldo, 'saldo doesn\'t match existing record');
    } else {
      saldos[name].set(date, saldo);
    }
  };

async function readFile(file: File): Promise<Text[]> {
  const data = await file.arrayBuffer(),
    pdf = await pdfjs.getDocument(data).promise;
  try {
    const textItems: Text[] = [];
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
  assert(EURORE.test(str), 'Unexpected currency value');
  return Number.parseInt(str.replace(/[.,]/g, ''));
}

function textToDate(str: string) {
  const match = str.match(DATERE);
  assert(match != null, 'not a date string');
  const { day, month, year } = match?.groups as { day: '\d\d', month: '\d\d', year: '\d\d\d\d' };
  return new Date(`${year}-${month}-${day}`);
}

function popNextSection(textItems: Text[]) {
  assert(textItems.length > 0 && textItems[0].s > 9, 'no account section found'); // start with a caption
  const caption = textItems.shift()!,
    endIdx = textItems.findIndex(({ s }) => s > 9);
  return [caption, ...textItems.splice(0, !~endIdx ? textItems.length : endIdx)]; // return until or empty all
}

function getOverview(textItems: Text[]): Report {
  assert(['Kontoübersicht', 'Ihre aktuellen Salden', 'IBAN', 'Saldo in', 'EUR'].every((str, i) => textItems[i].str === str), 'unexpected overview structure');
  const overviewItems = textItems.slice(5),
    rows = Object.groupBy(overviewItems, ({ y }) => y) as Record<number, Text[]>,
    summaryRow = rows[Math.min(...Object.keys(rows).map(Number.parseFloat))], // the lowest y row
    summary = {
      date: textToDate(summaryRow[1].str),
      sum: textToCents(summaryRow[2].str)
    },
    accounts: Record<string, Omit<Account, 'start'>> = Object.fromEntries(Object.values(rows)
      .filter((row) => row !== summaryRow)
      .map((row) => [row[0].str, row.length > 2
        ? {
            end: textToCents(row[2].str),
            iban: row[1].str,
            transactions: []
          }
        : {
            end: textToCents(row[1].str),
            transactions: []
          }]));

  assert(Object.values(accounts).reduce((partialSum, { end }) => partialSum + end, 0) === summary.sum, 'sum of accounts does\'t match total');
  return {
    accounts,
    summary
  };
}

function *getTransactions(section: Text[], name: string): Generator<Transaction> {
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
    assert(match != null, 'unexpected process reference string');
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

export async function *getReports(fileList: FileList): AsyncGenerator<Report> {
  for (const file of Array.from(fileList)) {
    try {
      const fileText = await readFile(file).catch((err) => {
          throw new ParsingError((err as Error).message);
        }),
        report = getOverview(popNextSection(fileText));
      while (fileText.length > 0) {
        const section = popNextSection(fileText),
          name = section[0].str;
        if (name === 'Steuerübersicht') {
          break;
        }
        // section must have been mentioned in overview
        assert(report.accounts[name] != null, 'unknown account section');
        if (name === 'Depot') {
          // Todo: not yet implemented
          break;
        }

        for (const transaction of getTransactions(section, name)) {
          report.accounts[name].transactions.push(transaction);
        }
        report.accounts[name].start = report.accounts[name].transactions.reduce((l, { amount }) => l + amount, report.accounts[name].end);
      }
      yield report;
    } catch (err) {
      throw new ParsingError(`${file.name}: ${(err as Error).message}`);
    }
  }
}
