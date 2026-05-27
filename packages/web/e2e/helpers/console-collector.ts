import type { Page, ConsoleMessage, Response } from '@playwright/test';

export type CapturedError = {
  kind: 'console.error' | 'console.warn' | 'pageerror' | 'response';
  text: string;
  location?: string;
};

export function attachConsoleCollector(page: Page): CapturedError[] {
  const errors: CapturedError[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const location = formatLocation(msg.location());
      errors.push({
        kind: 'console.error',
        text: msg.text(),
        ...(location && { location }),
      });
    } else if (msg.type() === 'warning') {
      const location = formatLocation(msg.location());
      errors.push({
        kind: 'console.warn',
        text: msg.text(),
        ...(location && { location }),
      });
    }
  });

  page.on('pageerror', (err: Error) => {
    const location = err.stack?.split('\n')[1]?.trim();
    errors.push({
      kind: 'pageerror',
      text: `${err.name}: ${err.message}`,
      ...(location && { location }),
    });
  });

  page.on('response', (res: Response) => {
    const status = res.status();
    if (status >= 400 && status < 600) {
      errors.push({
        kind: 'response',
        text: `HTTP ${status}`,
        location: res.url(),
      });
    }
  });

  return errors;
}

function formatLocation(loc: {
  url: string;
  lineNumber: number;
  columnNumber: number;
}): string | undefined {
  return loc.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined;
}
