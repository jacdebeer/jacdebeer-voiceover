import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Volume2, Loader, CheckCircle2 } from 'lucide-react';
import { VoiceOption } from '../types';

interface VoicePickerProps {
  isOpen: boolean;
  onClose: () => void;
  voices: VoiceOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onPreview: (voice: VoiceOption) => void;
  previewingId: string | null;
  language: 'en' | 'af';
  localize?: (voice: VoiceOption) => { label: string; desc: string };
}

type LangFilter = 'all' | 'afr' | 'eng';
type GenderFilter = 'all' | 'Female' | 'Male';
type EngineFilter = 'all' | 'gemini' | 'elevenlabs';

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
    active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
  }`;

export const VoicePicker: React.FC<VoicePickerProps> = ({
  isOpen,
  onClose,
  voices,
  selectedId,
  onSelect,
  onPreview,
  previewingId,
  language,
  localize,
}) => {
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<LangFilter>('all');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [engine, setEngine] = useState<EngineFilter>('all');
  const af = language === 'af';

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const hasEleven = useMemo(() => voices.some((v) => v.provider === 'elevenlabs'), [voices]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter((v) => {
      if (lang === 'afr' && !v.isAfrVariant) return false;
      if (lang === 'eng' && v.isAfrVariant) return false;
      if (gender !== 'all' && v.gender !== gender) return false;
      const isEleven = v.provider === 'elevenlabs';
      if (engine === 'elevenlabs' && !isEleven) return false;
      if (engine === 'gemini' && isEleven) return false;
      if (!q) return true;
      const meta = localize ? localize(v) : { label: v.label, desc: v.description };
      return `${meta.label} ${meta.desc} ${v.conversationalBio}`.toLowerCase().includes(q);
    });
  }, [voices, query, lang, gender, engine, localize]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-none flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-extrabold text-slate-800">{af ? 'Kies \'n stem' : 'Choose a voice'}</h2>
            <p className="text-[11px] text-slate-500 font-medium">
              {af ? 'Luister na \'n stem en kies dit' : 'Preview a voice, then select it'} · {visible.length} / {voices.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            title={af ? 'Sluit' : 'Close'}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-none px-5 py-3 border-b border-slate-100 space-y-2.5">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={af ? 'Soek stem op naam of beskrywing...' : 'Search voices by name or description...'}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex gap-1.5">
              <button className={chip(lang === 'all')} onClick={() => setLang('all')}>{af ? 'Alle tale' : 'All languages'}</button>
              <button className={chip(lang === 'afr')} onClick={() => setLang('afr')}>Afrikaans</button>
              <button className={chip(lang === 'eng')} onClick={() => setLang('eng')}>English</button>
            </div>
            <div className="flex gap-1.5">
              <button className={chip(gender === 'all')} onClick={() => setGender('all')}>{af ? 'Almal' : 'Any'}</button>
              <button className={chip(gender === 'Female')} onClick={() => setGender('Female')}>{af ? 'Vroulik' : 'Female'}</button>
              <button className={chip(gender === 'Male')} onClick={() => setGender('Male')}>{af ? 'Manlik' : 'Male'}</button>
            </div>
            {hasEleven && (
              <div className="flex gap-1.5">
                <button className={chip(engine === 'all')} onClick={() => setEngine('all')}>{af ? 'Alle enjins' : 'All engines'}</button>
                <button className={chip(engine === 'gemini')} onClick={() => setEngine('gemini')}>Gemini</button>
                <button className={chip(engine === 'elevenlabs')} onClick={() => setEngine('elevenlabs')}>ElevenLabs</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 custom-scrollbar">
          {visible.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium text-center py-12">
              {af ? 'Geen stemme pas by hierdie filters nie.' : 'No voices match these filters.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visible.map((voice) => {
                const meta = localize ? localize(voice) : { label: voice.label, desc: voice.description };
                const isSel = selectedId === voice.id;
                return (
                  <div
                    key={voice.id}
                    onClick={() => {
                      onSelect(voice.id);
                      onClose();
                    }}
                    className={`group p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      isSel
                        ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
                        : 'border-slate-100 hover:border-indigo-200 hover:shadow-sm bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 flex-none rounded-full flex items-center justify-center text-sm font-black ${
                            isSel ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                          }`}
                        >
                          {meta.label[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-800">
                            <span className="truncate">{meta.label}</span>
                            {isSel && <CheckCircle2 size={13} className="text-indigo-600 flex-none" />}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold truncate">{meta.desc}</div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreview(voice);
                        }}
                        className="flex-none p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors"
                        title={af ? 'Luister voorbeeld' : 'Play sample'}
                      >
                        {previewingId === voice.id ? <Loader className="animate-spin" size={15} /> : <Volume2 size={16} />}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`text-[8px] px-1.5 py-0.5 rounded-full font-black tracking-widest ${
                          voice.gender === 'Female' ? 'bg-pink-50 text-pink-600' : 'bg-blue-50 text-blue-600'
                        }`}
                      >
                        {voice.gender.toUpperCase()}
                      </span>
                      {voice.isAfrVariant && (
                        <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-black uppercase">AFR</span>
                      )}
                      {voice.provider === 'elevenlabs' && (
                        <span className="text-[8px] bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded-full font-black uppercase">ElevenLabs</span>
                      )}
                    </div>
                    {voice.conversationalBio && (
                      <p className="text-[11px] text-slate-500 leading-snug line-clamp-3">{voice.conversationalBio}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
