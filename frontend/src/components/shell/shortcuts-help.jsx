"use client";
import React, { useEffect } from 'react';
import { X, Command, Keyboard, Send, Archive, Trash2, PenLine, Search, CornerDownLeft, Reply } from 'lucide-react';

export default function ShortcutsHelp({ onClose }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const shortcuts = [
        { icon: <Command size={15} />, label: "Global Search", keys: ["⌘", "K"] },
        { icon: <PenLine size={15} />, label: "Compose", keys: ["C"] },
        { icon: <Send size={15} />, label: "Send Email", keys: ["⌘", "Ent"] },
        { icon: <Archive size={15} />, label: "Archive/Unarchive", keys: ["E"] },
        { icon: <Trash2 size={15} />, label: "Delete", keys: ["#"] },
        { icon: <Reply size={15} />, label: "Reply", keys: ["R"] },
        { icon: <Keyboard size={15} />, label: "Next Email", keys: ["J"] },
        { icon: <Keyboard size={15} />, label: "Prev Email", keys: ["K"] },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop with Blur */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-2xl bg-[#09090b] rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden animate-in zoom-in-95 fade-in duration-300 group">

                {/* Subtle Ambient Background Gradient */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-indigo-500/10 blur-[80px] pointer-events-none" />

                {/* Header */}
                <div className="relative flex items-center justify-between px-6 py-5 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white/5 ring-1 ring-white/10">
                            <Keyboard className="text-indigo-400" size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">Command Center</h2>
                            <p className="text-xs text-zinc-500">Keyboard shortcuts & hotkeys</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg transition-all active:scale-95"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Shortcuts Grid */}
                <div className="relative p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {shortcuts.map((item, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between p-3 rounded-xl border border-transparent hover:border-white/5 hover:bg-white/[0.03] transition-all duration-200 group/item"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="text-zinc-500 group-hover/item:text-indigo-400 transition-colors">
                                        {item.icon}
                                    </div>
                                    <span className="text-sm font-medium text-zinc-400 group-hover/item:text-zinc-200 transition-colors">
                                        {item.label}
                                    </span>
                                </div>

                                <div className="flex gap-1.5">
                                    {item.keys.map((k, idx) => (
                                        <KeyCap key={idx}>{k}</KeyCap>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="relative px-6 py-4 bg-zinc-900/30 border-t border-white/5 flex items-center justify-center">
                    <p className="text-[10px] font-medium text-zinc-500 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                        Pro Tip: Press <KeyCap small>Esc</KeyCap> to close this window
                    </p>
                </div>
            </div>
        </div>
    );
}

// Reusable Aesthetic Key Component
function KeyCap({ children, small }) {
    return (
        <kbd className={`
            hidden sm:inline-flex items-center justify-center 
            bg-gradient-to-b from-zinc-800 to-zinc-900 
            border-t border-l border-r border-white/10 border-b-2 border-b-black/50
            rounded-[6px] 
            text-zinc-300 font-sans font-medium 
            shadow-[0_2px_0_0_rgba(0,0,0,0.5)]
            ${small ? 'text-[10px] px-1.5 py-0.5 min-w-[20px]' : 'text-xs px-2.5 py-1.5 min-w-[28px]'}
        `}>
            {children}
        </kbd>
    );
}