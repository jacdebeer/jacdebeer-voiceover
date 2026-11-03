import { LessonData } from './lessonPlayer';

interface Entry { details: string; amount: number }
interface Acc { name: string; debit: Entry[]; credit: Entry[] }

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' ? parseFloat(v.replace(/[^\d.\-]/g, '')) || 0 : 0);
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * The example figures the earlier slides of a course already used: its T-accounts (the latest state of each, with the net balance),
 * journal rows, accounting-equation rows, source documents and calculations. The next slide is told to continue from them,
 * so one example runs through the whole course instead of every slide inventing its own numbers.
 */
export function exampleContext(lessons: LessonData[], maxChars = 2800): string {
  const accounts = new Map<string, Acc>();
  const other: string[] = [];
  for (const l of lessons) {
    for (const b of l.beats ?? []) {
      for (const blk of (b.blocks as any[]) ?? []) {
        if (blk?.type === 't_accounts') {
          for (const a of blk.accounts ?? []) {
            const name = String(a?.name ?? '').trim();
            if (!name) continue;
            // a later T-account of the same account carries the earlier balance forward (Saldo b/o), so the latest one is the state
            const acc: Acc = { name, debit: [], credit: [] };
            const add = (side: Entry[], list: any[]) => {
              for (const e of list ?? []) {
                const entry = { details: String(e?.details ?? '').trim(), amount: num(e?.amount) };
                if (!entry.amount) continue;
                side.push(entry);
              }
            };
            add(acc.debit, a.debit);
            add(acc.credit, a.credit);
            accounts.set(name, acc);
          }
        } else if (blk?.type === 'journal' && blk.journal) {
          const cols: any[] = blk.journal.columns ?? [];
          for (const r of blk.journal.rows ?? []) {
            const parts = cols.map((c) => (r.values?.[c.key] ? `${c.label} ${r.values[c.key]}` : '')).filter(Boolean);
            other.push(`journal: ${r.details ?? ''}${r.docNo ? ` (${r.docNo})` : ''} ${parts.join(', ')}`.trim());
          }
        } else if (blk?.type === 'equation') {
          for (const r of blk.rows ?? []) other.push(`equation: ${r.debit ?? ''} / ${r.credit ?? ''}: A ${r.a ?? 0}, OE ${r.oe ?? 0}, L ${r.l ?? 0}`);
        } else if (blk?.type === 'source_document' && blk.doc) {
          other.push(`source document: ${blk.doc.docType ?? ''} ${blk.doc.docNo ?? ''} ${blk.doc.date ?? ''}, total ${blk.doc.total ?? ''}`.trim());
        } else if (blk?.type === 'calculation') {
          other.push(`calculation: ${(blk.lines ?? []).map((x: any) => `${x.label} ${x.value}`).join('; ')}`);
        }
      }
    }
  }
  const lines: string[] = [];
  for (const a of accounts.values()) {
    const d = a.debit.reduce((n, e) => n + e.amount, 0);
    const c = a.credit.reduce((n, e) => n + e.amount, 0);
    const side = (list: Entry[]) => list.map((e) => `${e.details || '?'} ${fmt(e.amount)}`).join('; ') || '-';
    const net = c - d;
    lines.push(`${a.name}: debit [${side(a.debit)}], credit [${side(a.credit)}], ${net >= 0 ? 'credit' : 'debit'} balance ${fmt(Math.abs(net))}`);
  }
  const text = [...lines, ...other.slice(0, 12)].join('\n');
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
