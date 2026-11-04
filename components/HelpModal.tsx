import React from 'react';
import { X, HelpCircle } from 'lucide-react';
import manual from '../docs/HOW-TO-USE.md?raw';

interface Props { af: boolean; onClose: () => void }

// Inline: **bold**, *italic*, `code`. Built as React elements (no HTML injection).
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={i++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={i++} className="px-1 rounded bg-slate-100 text-[11px]">{t.slice(1, -1)}</code>);
    else out.push(<i key={i++}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function render(md: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  md.split('\n').forEach((raw, k) => {
    if (!raw.trim()) return;
    if (/^---+$/.test(raw.trim())) { nodes.push(<hr key={k} className="my-5 border-slate-200" />); return; }
    const h = /^(#{1,3})\s+(.*)$/.exec(raw);
    if (h) {
      const cls = h[1].length === 1 ? 'text-lg font-bold text-indigo-600 mt-4' : 'text-sm font-bold text-slate-800 mt-4';
      nodes.push(<div key={k} className={cls}>{inline(h[2])}</div>);
      return;
    }
    const ol = /^(\s*)(\d+)\.\s+(.*)$/.exec(raw);
    if (ol) {
      nodes.push(<div key={k} className="flex gap-2 mt-1.5 text-xs text-slate-700 leading-relaxed" style={{ paddingLeft: ol[1].length * 6 }}><span className="font-bold text-indigo-500 shrink-0">{ol[2]}.</span><span>{inline(ol[3])}</span></div>);
      return;
    }
    const ul = /^(\s*)-\s+(.*)$/.exec(raw);
    if (ul) {
      nodes.push(<div key={k} className="flex gap-2 mt-1 text-xs text-slate-700 leading-relaxed" style={{ paddingLeft: 14 + ul[1].length * 6 }}><span className="text-slate-400 shrink-0">•</span><span>{inline(ul[2])}</span></div>);
      return;
    }
    nodes.push(<p key={k} className="mt-2 text-xs text-slate-700 leading-relaxed">{inline(raw.trim())}</p>);
  });
  return nodes;
}

export const HelpModal: React.FC<Props> = ({ af, onClose }) => (
  <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4 anim-backdrop" role="dialog" aria-label={af ? 'Hulp' : 'Help'}>
    <div className="anim-pop bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h2 className="text-lg text-indigo-600 flex items-center gap-2"><HelpCircle size={16} /> {af ? 'Hulp (handleiding in Engels)' : 'Help'}</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close" data-testid="help-close"><X size={16} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6" data-testid="help-body">{render(manual)}</div>
    </div>
  </div>
);
