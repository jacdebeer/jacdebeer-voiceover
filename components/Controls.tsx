import React from 'react';
import { Play, Pause, RotateCcw, Download } from 'lucide-react';

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  onDownload: () => void;
  disabled: boolean;
}

export const Controls: React.FC<ControlsProps> = ({ 
  isPlaying, 
  onPlayPause, 
  onReset,
  onDownload,
  disabled 
}) => {
  return (
    <div className="flex items-center justify-center space-x-6 mt-4">
      <button
        onClick={onReset}
        disabled={disabled}
        className="p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
        title="Reset"
      >
        <RotateCcw size={20} />
      </button>

      <button
        onClick={onPlayPause}
        disabled={disabled}
        className={`
          flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95
          ${disabled 
            ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}
        `}
      >
        {isPlaying ? (
          <Pause size={28} fill="currentColor" />
        ) : (
          <Play size={28} fill="currentColor" className="ml-1" />
        )}
      </button>

      <button
        onClick={onDownload}
        disabled={disabled}
        className="p-2 text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-50"
        title="Download audio (WAV)"
      >
        <Download size={20} />
      </button>
    </div>
  );
};