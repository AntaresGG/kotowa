import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './util.ts';

// English messages are the keys; keep UI translations separate from learning data.
export const messages: Record<string, string> = JSON.parse(
  readFileSync(join(ROOT, 'site/locales/zh-CN.json'), 'utf8'),
);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
type Params = Record<string, string | number>;

function check(message: string): void {
  if (!Object.hasOwn(messages, message)) throw new Error(`Missing Chinese UI translation: ${message}`);
}

export function ui(message: string, params: Params = {}): string {
  check(message);
  const text = message.replace(/\{(\w+)\}/g, (token, key: string) => String(params[key] ?? token));
  return `<span data-i18n="${escapeHtml(message)}"${Object.keys(params).length
    ? ` data-i18n-params="${escapeHtml(JSON.stringify(params))}"` : ''}>${escapeHtml(text)}</span>`;
}

export function uiAttr(name: string, message: string): string {
  check(message);
  return `${name}="${escapeHtml(message)}" data-i18n-${name}="${escapeHtml(message)}"`;
}
