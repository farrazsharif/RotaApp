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
