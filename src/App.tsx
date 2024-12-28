import type { Account, Report } from './pdftools';
import classNames from 'classnames';
import { useEffect, useRef, useState } from 'preact/compat';
import Animate from './components/Animate';
import Parser from './view/Parser';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import 'virtual:unocss-devtools';
import './style.css';

const CurrencyFormatter = Intl.NumberFormat(navigator.language, {
    currency: 'EUR',
    maximumFractionDigits: 2,
    style: 'currency'
  }),
  DateFormatter = Intl.DateTimeFormat(navigator.language, {
    dateStyle: 'short'
  });

function formatEuro(amount: number) {
  return CurrencyFormatter.format(amount / 100);
}

export function App() {
  const [csvContent, setCsvContent] = useState<[string, string][]>([]),
    [accounts, setAccounts] = useState<Record<string, Account>>(),
    [tab, setTab] = useState<string>(),
    [tabHighlight, setTabHighlight] = useState<[number, number]>(),
    main = useRef<HTMLDivElement>(null),
    tabs = useRef<Record<string, HTMLDivElement | null>>({}),
    [scroll, setScroll] = useState<'down' | 'up' | undefined>('down');

  useEffect(() => {
    if (accounts) {
      setTab(Object.keys(accounts)[0]);
      main.current?.children[1].scrollIntoView({ behavior: 'smooth' });
    }
  }, [accounts]);

  useEffect(() => {
    if (tab == null) {
      return;
    }
    const activeTab = tabs.current[tab];
    if (activeTab != null) {
      setTabHighlight([activeTab.offsetLeft, activeTab.clientWidth - 1]);
    } else {
      setTabHighlight([0, 0]);
    }
  }, [tab]);

  function onScroll(ev: Event) {
    const el = ev.target as HTMLDivElement;
    if (el.scrollTop < 10) {
      setScroll('down');
    } else if (el.scrollTop > el.clientHeight - 10) {
      setScroll('up');
    } else {
      setScroll(undefined);
    }
  }

  function onReports(reports: Report[]) {
    const accounts: Record<string, Account> = {};
    reports.sort((a, b) => a.summary.date > b.summary.date ? 1 : (a.summary.date < b.summary.date ? -1 : 0));
    for (const report of reports) {
      for (const account in report.accounts) {
        accounts[account] ??= {
          amount: report.accounts[account].amount - report.accounts[account].transactions.reduce((l, { amount }) => l + amount, 0),
          iban: report.accounts[account].iban,
          transactions: []
        };
        accounts[account].transactions.push(...report.accounts[account].transactions);
      }
    }
    setAccounts(accounts);
    /*
    transactions.map(({ amount, dateOfEntry, issuer, process, reference, text, valuta }) => [
      dateOfEntry.toISOString().substring(0, 10),
      valuta.toISOString().substring(0, 10),
      amount.toString().replace(/(\d+)(\d\d)/, '$1.$2'),
      issuer,
      process,
      reference,
      text
    ])
    setCsvContent(
      Object.entries(allTransactions)
        .map(([name, transactions]) => [name, window.URL.createObjectURL(new Blob([transactions.map((column) => column.join(';')).join('\n')], { type: 'text/csv' }))])
    );
    */
  }

  return (
    <div ref={main} class="snap h-screen snap-y snap-mandatory overflow-y-auto children:snap-start" onScroll={onScroll}>
      <Parser onReports={onReports} />
      { accounts != null && (
        <>
          <div class="mx-auto h-screen flex flex-col items-center items-stretch justify-start pb-4 pt-16 container">
            <div role="tablist" class="relative flex-shrink-0 overflow-y-auto tabs tabs-bordered">
              {
                Object.entries(accounts).map(([name, _account]) => (
                  <div
                    ref={(el) => (tabs.current[name] = el)}
                    key={name}
                    role="tab"
                    class={classNames('tab whitespace-nowrap', { 'tab-active': false })}
                    aria-label={name}
                    onClick={() => setTab(name)}
                  >
                    { name }
                  </div>
                ))
              }
              <div class="absolute bottom-0 border-b-2 bg-[oklch(var(--bc))] transition-all duration-300" style={{ left: tabHighlight?.[0], width: tabHighlight?.[1] }} />
            </div>
            <div role="tabpanel" class="h-full flex flex-col p-4">
              { tab != null && (
                <>
                  <table class="w-fit table">
                    <tbody>
                      <tr>
                        <th class="pr-8 text-left">Start amount:</th>
                        <td>{ formatEuro(accounts[tab].amount) }</td>
                      </tr>
                      { accounts[tab].iban != null && (
                        <tr>
                          <th class="pr-8 text-left">IBAN:</th>
                          <td>{ accounts[tab].iban }</td>
                        </tr>
                      )}
                      { accounts[tab].transactions.length > 0 && (
                        <tr>
                          <th class="pr-8 text-left">Transactions:</th>
                          <td>
                            <div class="btn btn-primary btn-sm">csv</div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  { accounts[tab].transactions.length > 0 && (
                    <>
                      <hr class="my-4" />
                      <table class="full-w block overflow-auto pr-2 table-zebra table-xs">
                        <thead>
                          <tr class="sticky top-0 bg-[oklch(var(--b1))] text-xs text-[oklch(var(--bc)/.6)]">
                            <th class="whitespace-nowrap">
                              Date of entry /
                              <br />
                              Valuta
                            </th>
                            <th>Reference</th>
                            <th>Issuer</th>
                            <th>Process</th>
                            <th class="w-full">Text</th>
                            <th class="text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          { accounts[tab].transactions.map((trx) => (
                            <tr key={trx.reference}>
                              <td>
                                { DateFormatter.format(trx.dateOfEntry) }
                                <br />
                                { DateFormatter.format(trx.valuta) }
                              </td>
                              <td>{ trx.reference }</td>
                              <td>{ trx.issuer }</td>
                              <td>{ trx.process }</td>
                              <td>{ trx.text }</td>
                              <td class="text-right">{ formatEuro(trx.amount) }</td>
                            </tr>
                          )) }
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          <Animate
            active={scroll === 'down'}
            type="transition"
            class="absolute bottom-0 w-full pb-4 transition-opacity transition-duration-300"
            afterEnterClass="flex opacity-100"
            afterLeaveClass="hidden"
            beforeEnterClass="flex opacity-0"
            beforeLeaveClass="flex opacity-0"
            enterAnimationClass="flex opacity-100"
            leaveAnimationClass="flex opacity-0"
          >
            <div class="mx-auto h-4 text-4xl btn btn-ghost btn-sm" onClick={() => main.current?.children[1].scrollIntoView({ behavior: 'smooth' })}>
              <div class="i-mdi-chevron-down"></div>
            </div>
          </Animate>
          <Animate
            active={scroll === 'up'}
            type="transition"
            class="absolute top-0 w-full pt-4 transition-opacity transition-duration-300"
            afterEnterClass="flex opacity-100"
            afterLeaveClass="hidden"
            beforeEnterClass="flex opacity-0"
            beforeLeaveClass="flex opacity-0"
            enterAnimationClass="flex opacity-100"
            leaveAnimationClass="flex opacity-0"
          >
            <div class="mx-auto text-4xl btn btn-ghost btn-sm" onClick={() => main.current?.children[0].scrollIntoView({ behavior: 'smooth' })}>
              <div class="i-mdi-chevron-up"></div>
            </div>
          </Animate>
        </>
      )}
    </div>
  );
}
