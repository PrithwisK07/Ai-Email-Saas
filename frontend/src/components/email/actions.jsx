import React from 'react';

export const KeyboardShortcut = ({ keys }) => (
    <div className="flex items-center gap-1">
        {keys.map((k, i) => (
            <span key={i} className="min-w-[20px] h-5 px-1 flex items-center justify-center bg-zinc-800 border-b-2 border-zinc-700 rounded text-[10px] font-bold text-zinc-400 uppercase shadow-sm">
                {k}
            </span>
        ))}
    </div>
);

export const IconButton = ({ icon: Icon, onClick, active, shortcut, label }) => (
    <button
        onClick={onClick}
        className={`group relative p-2 rounded-lg transition-all duration-200 active:scale-95 ${active ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
        title={label}
    >
        <Icon size={20} strokeWidth={1.5} />
        {shortcut && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                <KeyboardShortcut keys={[shortcut]} />
            </div>
        )}
    </button>
);