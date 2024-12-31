import type { Account, Report as ReportType } from './pdftools';
import { useEffect, useRef, useState } from 'preact/compat';
import Animate from './components/Animate';
import Parser from './view/Parser.js';
import Report from './view/Report.js';
import '@unocss/reset/tailwind.css';
import 'uno.css';
import 'virtual:unocss-devtools';
import './style.css';

export function App() {
  const [accounts, setAccounts] = useState<Record<string, Account>>(),
    main = useRef<HTMLDivElement>(null),
    [scroll, setScroll] = useState<'down' | 'up' | undefined>(undefined);

  useEffect(() => {
    if (accounts) {
      queueMicrotask(() =>
        main.current?.children[1].scrollIntoView({ behavior: 'smooth' })
      );
    }
  }, [accounts]);

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

  function onReports(reports: ReportType[]) {
    const accounts: Record<string, Account> = {};
    reports.sort((a, b) => a.summary.date > b.summary.date ? 1 : (a.summary.date < b.summary.date ? -1 : 0));
    for (const report of reports) {
      for (const account in report.accounts) {
        if (accounts[account] == null) {
          accounts[account] ??= {
            end: report.accounts[account].end,
            iban: report.accounts[account].iban,
            start: report.accounts[account].start,
            transactions: []
          };
        } else {
          accounts[account].end = report.accounts[account].end;
        }
        accounts[account].transactions.push(...report.accounts[account].transactions);
      }
    }
    setAccounts(accounts);
  }

  return (
    <div ref={main} class="snap h-screen snap-y snap-mandatory overflow-y-auto children:snap-start" onScroll={onScroll}>
      <Parser onReports={onReports} />
      { accounts != null && (
        <Report accounts={accounts} />
      )}
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
    </div>
  );
}
