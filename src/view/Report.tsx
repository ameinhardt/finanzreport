import type { Account } from '../pdftools.js';
import classNames from 'classnames';
import { useEffect, useRef, useState } from 'preact/compat';

const CurrencyFormatter = Intl.NumberFormat(navigator.language, {
    currency: 'EUR',
    maximumFractionDigits: 2,
    style: 'currency'
  }),
  DateFormatter = Intl.DateTimeFormat(navigator.language, {
    dateStyle: 'short'
  });

function formatEuro(amount: number) {
  if (Number.isNaN(amount)) {
    return 'unknown';
  }
  return CurrencyFormatter.format(amount / 100);
}

export default function Report({ accounts }: { accounts: Record<string, Account> }) {
  const [tab, setTab] = useState<string>(),
    [tabHighlight, setTabHighlight] = useState<[number, number]>(),
    tabs = useRef<Record<string, HTMLDivElement | null>>({}),
    observer = new ResizeObserver(() => fixTabHighlightMaybe());

  function fixTabHighlightMaybe() {
    if (tab == null) {
      return;
    }
    const activeTab = tabs.current[tab];
    if (activeTab != null) {
      setTabHighlight([activeTab.offsetLeft, activeTab.clientWidth - 1]);
      return activeTab;
    } else {
      setTabHighlight([0, 0]);
    }
  }

  useEffect(() => {
    observer.disconnect();
    const activeTab = fixTabHighlightMaybe();
    if (activeTab) {
      observer.observe(activeTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    const primary = Object.keys(accounts)[0];
    if (primary) {
      setTab(primary);
    }
  }, [accounts]);

  return (
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
              <div class="grid grid-cols-[max-content_1fr] lg:grid-cols-[max-content_1fr_max-content_1fr]">
                <div class="pr-8 text-left">Start amount:</div>
                <div>{ accounts[tab].start == null ? 'unknown' : formatEuro(accounts[tab].start) }</div>
                <div class="pr-8 text-left">End amount:</div>
                <div>{ formatEuro(accounts[tab].end) }</div>
                { accounts[tab].iban != null && (
                  <>
                    <div class="pr-8 text-left">IBAN:</div>
                    <div>{ accounts[tab].iban }</div>
                  </>
                )}
                { accounts[tab].transactions.length > 0 && (
                  <>
                    <div class="pr-8 text-left lg:col-start-3">Transactions:</div>
                    <div>
                      <div class="btn btn-primary btn-sm">csv</div>
                    </div>
                  </>
                )}
              </div>
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
    </>
  );
}
