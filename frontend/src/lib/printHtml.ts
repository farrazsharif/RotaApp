// Showing and printing a generated HTML document.
//
// Everything used to do this:
//
//   const w = window.open('', '_blank');
//   if (!w) { alert('Please allow pop-ups to print.'); return; }
//   w.document.write(html); w.document.close(); w.focus();
//
// which is fine on a desktop browser and reliably broken on a phone. Mobile
// Safari and Chrome treat that popup as one to block, so the office staff who
// work from a phone got the "please allow pop-ups" alert and nothing else —
// and when the popup did open, writing into about:blank often left a blank
// page with no way back. `w.focus()` does nothing on mobile either.
//
// A same-page iframe needs no popup permission and behaves the same on every
// platform. Printing goes to an offscreen one; viewing goes to a full-screen
// overlay with its own Print and Close, so a phone has a way out that is not
// the browser's back button.

const PRINT_FRAME_ID = 'caremid-print-frame';

// Offscreen, but a real size: Safari will not print a zero-sized or
// display:none iframe.
const OFFSCREEN = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';


// Print a generated document. Nothing is shown on screen beyond the browser's
// own print dialog, which is what a Print button should do.
export function printHtml(html: string): void {
  // An iframe print is just as dead as a page print on a home-screen iOS
  // app, so say so rather than appearing to do nothing.
  if (isIosStandalone()) { explainNoPrint(); return; }
  document.getElementById(PRINT_FRAME_ID)?.remove();
  const frame = document.createElement('iframe');
  frame.id = PRINT_FRAME_ID;
  frame.setAttribute('style', OFFSCREEN);
  frame.setAttribute('aria-hidden', 'true');

  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    // Give webfonts and images a moment; printing a half-laid-out document
    // loses the branding header.
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* a browser that refuses to print an iframe — nothing useful to do */
      }
    }, 250);

    // Tidy up once the dialog closes. onafterprint does not fire everywhere
    // (notably iOS), so there is a long stop as well. Removing the frame too
    // early cancels the print on some browsers, hence the delays.
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    win.addEventListener?.('afterprint', cleanup);
    setTimeout(() => frame.remove(), 60000);
  };

  frame.srcdoc = html;
  document.body.appendChild(frame);
}

// Show a generated document full-screen, with its own Print and Close. Used
// where the point is to read the document — a care plan, a report — and
// printing is one of the things you might then do.
export function viewHtml(html: string, title = 'Document'): void {
  const overlay = document.createElement('div');
  overlay.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:9999;background:#fff;display:flex;flex-direction:column;',
  );

  const bar = document.createElement('div');
  bar.setAttribute(
    'style',
    'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #e5e7eb;background:#f9fafb;flex:0 0 auto;',
  );

  const name = document.createElement('span');
  name.textContent = title;
  name.setAttribute('style', 'font:600 14px system-ui,sans-serif;color:#374151;flex:1;');

  const printBtn = document.createElement('button');
  printBtn.textContent = '🖨 Print';
  printBtn.setAttribute(
    'style',
    'font:600 14px system-ui,sans-serif;padding:8px 16px;border-radius:8px;border:1px solid #2563eb;background:#2563eb;color:#fff;cursor:pointer;',
  );

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.setAttribute(
    'style',
    'font:600 14px system-ui,sans-serif;padding:8px 16px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;cursor:pointer;',
  );

  const frame = document.createElement('iframe');
  frame.setAttribute('style', 'flex:1 1 auto;width:100%;border:0;');
  frame.srcdoc = html;

  printBtn.onclick = () => {
    if (isIosStandalone()) { explainNoPrint(); return; }
    const win = frame.contentWindow;
    if (!win) return;
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
  };

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  closeBtn.onclick = close;
  document.addEventListener('keydown', onKey);

  bar.append(name, printBtn, closeBtn);
  overlay.append(bar, frame);
  document.body.appendChild(overlay);
}

// The common case for the document builders: print it, or show it to read.
export function openPrintable(html: string, autoPrint: boolean, title?: string): void {
  if (autoPrint) printHtml(html);
  else viewHtml(html, title);
}

// ---------------------------------------------------------------------------
// iOS, installed to the home screen
//
// A site launched from the iOS home screen runs "standalone", and WebKit
// exposes no printing there at all: window.print() returns without doing
// anything, with no error and no dialog. That is why Export worked and Print
// appeared dead — the button was firing, iOS was ignoring it.
//
// Nothing in the page can work around that. What a page CAN do is stop failing
// silently and offer the one route that does work: the same page opened in
// Safari proper, where printing behaves normally. From a standalone web app a
// target="_blank" link to an https URL opens in Safari, so the way out is one
// tap.

export function isIosStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // `standalone` is iOS-only; the display-mode query covers an iPad reporting
  // itself as a Mac, which recent iPadOS does.
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  if (!standalone) return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
}

// Shown instead of a print dialog that would never appear.
function explainNoPrint(): void {
  const overlay = document.createElement('div');
  overlay.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:20px;',
  );

  const card = document.createElement('div');
  card.setAttribute(
    'style',
    'background:#fff;border-radius:16px;padding:20px;max-width:380px;width:100%;font:400 15px/1.5 system-ui,sans-serif;color:#374151;',
  );
  card.innerHTML =
    '<p style="font:700 17px system-ui,sans-serif;color:#111827;margin:0 0 8px">Printing needs Safari</p>' +
    '<p style="margin:0 0 14px">iPhones and iPads cannot print from an app added to the home screen. Send this page to Safari and print it there.</p>';

  const note = document.createElement('p');
  note.setAttribute('style', 'margin:12px 0 0;font-size:13px;color:#6b7280;');

  const btnStyle = (primary: boolean) =>
    `display:block;width:100%;text-align:center;font:600 15px system-ui,sans-serif;padding:12px;border-radius:10px;margin-bottom:8px;cursor:pointer;${
      primary ? 'background:#2563eb;color:#fff;border:1px solid #2563eb;' : 'background:#fff;color:#374151;border:1px solid #d1d5db;'
    }`;

  // The share sheet is the only reliable way out of a standalone web app:
  // a target="_blank" link to the same origin is kept INSIDE the app by iOS,
  // which is why an "Open in Safari" link did nothing. Sharing the URL puts
  // Safari in the sheet as somewhere to send it.
  const url = window.location.href;
  const nav = navigator as Navigator & { share?: (d: { url?: string; title?: string }) => Promise<void> };

  if (typeof nav.share === 'function') {
    const share = document.createElement('button');
    share.textContent = 'Send to Safari…';
    share.setAttribute('style', btnStyle(true));
    share.onclick = async () => {
      try {
        await nav.share!({ url, title: document.title });
        note.textContent = 'Choose Safari in the share sheet, then print from there.';
      } catch {
        /* the sheet was dismissed — nothing to report */
      }
    };
    card.append(share);
  }

  // Always offered: if the sheet is unavailable or confusing, the address
  // pasted into Safari gets to the same place.
  const copy = document.createElement('button');
  copy.textContent = 'Copy page link';
  copy.setAttribute('style', btnStyle(false));
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'Link copied ✓';
      note.textContent = 'Open Safari and paste it into the address bar.';
    } catch {
      note.textContent = url;
    }
  };

  const close = document.createElement('button');
  close.textContent = 'Not now';
  close.setAttribute('style', btnStyle(false));
  close.onclick = () => overlay.remove();

  card.append(copy, close, note);
  overlay.append(card);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// Print the live page. Use this rather than window.print() directly, so the
// home-screen case says something instead of appearing broken.
export function printPage(): void {
  if (isIosStandalone()) { explainNoPrint(); return; }
  window.print();
}
