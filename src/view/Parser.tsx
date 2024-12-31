import type { TargetedEvent } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import pkgJson from '../../package.json';
import { getReports, ParsingError, type Report } from '../pdftools';

const REPOSITORY = (pkgJson.repository as Record<string, string>).url;

export default function Parser({ onReports }: { onReports: (reports: Report[]) => void }) {
  const [progressBar, setProgressBar] = useState<number | undefined>(),
    [error, setError] = useState<string | undefined>(undefined),
    dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (error == null) {
      dialog.current?.close();
    } else {
      dialog.current?.showModal();
    }
  }, [error]);

  async function processFiles(event: TargetedEvent<HTMLInputElement, Event>) {
    const fileList = (event.target as HTMLInputElement).files;
    if (fileList == null || fileList.length === 0) {
      return;
    }
    let progress = 0;
    setProgressBar(progress);
    try {
      const reports: Report[] = [];
      for await (const report of getReports(fileList)) {
        progress += 100 / fileList.length;
        setProgressBar(progress);
        reports.push(report);
      }
      onReports(reports);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      if (err instanceof ParsingError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(`Unexpected error: ${err.message}`);
      } else {
        setError('unknown error');
      }
    } finally {
      setProgressBar(undefined);
    }
  }

  return (
    <div class="bg-base-200">
      <div class="mx-auto h-screen hero container">
        <div class="grid w-full justify-items-center gap-4 hero-content lg:grid-cols-2">
          <div class="text-center lg:order-2 lg:text-left">
            <h1 class="text-5xl font-bold">
              Finanzreport
              <span class="align-top font-size-sm">
                v
                {import.meta.env.VITE_VERSION}
              </span>
            </h1>
            <p class="py-6">
              Comdirect Finanzreport_*.pdf files are (batch) downloadable from your
              {' '}
              <a target="_blank" href="https://kunde.comdirect.de/itx/posteingangsuche" rel="noreferrer noopener" class="underline underline-offset-4">Comdirect&nbsp;PostBox</a>
              . Choose the ones that you want to convert.
            </p>
            <p>
              See
              {' '}
              <a href={REPOSITORY} target="_blank" rel="noreferrer noopener" class="underline underline-offset-4">
                <span class="i-mdi-github mx-1 inline-block align-middle"> </span>
                github
              </a>
              {' '}
              for source code.
            </p>
          </div>
          <div role="alert" class="order-3 flex alert alert-success">
            <div class="anim-pulse i-mdi-lightbulb-variant-outline animate-pulse animate-duration-5000 text-2xl text-orange"></div>
            All data is processed locally. You can download this standalone HTML and run offline.
          </div>
          <div class="align-center row-span-2 w-full bg-base-100 shadow-2xl card lg:max-w-sm">
            <div class="justify-center p-4 card-body lg:p-8">
              { progressBar == null
                ? (
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      class="w-full file-input file-input-bordered file-input-primary"
                      onChange={(event) => void processFiles(event)}
                    />
                  )
                : (
                    <progress class="h-12 w-full progress progress-primary" value={progressBar} max="100"></progress>
                  ) }
            </div>
          </div>
        </div>
      </div>
      <dialog ref={dialog} class="modal" onClose={() => setError(undefined)}>
        <div class="relative modal-box">
          <button type="button" class="absolute right-2 top-2 btn btn-circle btn-ghost btn-sm" onClick={() => dialog.current?.close()}>✕</button>
          <h3 class="text-lg font-bold">Error</h3>
          <p class="py-4">{ error }</p>
          <div class="modal-action">
            <button type="button" class="btn" onClick={() => dialog.current?.close()}>Close</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
