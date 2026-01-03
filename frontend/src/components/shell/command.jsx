"use client";
import React, { useState, useEffect } from 'react';
import { Search, Loader2, Calendar, AlertCircle, Sparkles, CornerDownLeft, Command } from 'lucide-react';
import { EmailService } from '@/lib/endpoints';

export default function SearchModal({ onClose, onSelect }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!query.trim()) {
                setResults([]);
                return;
            }

            setLoading(true);
            try {
                const data = await EmailService.search(query);
                setResults(data);
            } catch (error) {
                console.error("Search failed:", error);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-2xl bg-[#09090b]/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[75vh] animate-in slide-in-from-top-4 duration-300 ring-1 ring-white/5">

                {/* Ambient Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-indigo-500/5 blur-[80px] pointer-events-none" />

                {/* Input Area */}
                <div className="relative flex items-center gap-4 px-6 py-5 border-b border-white/5 bg-white/[0.02]">
                    <div className={`transition-colors duration-300 ${loading ? 'text-indigo-400' : 'text-zinc-500'}`}>
                        {loading ? <Loader2 className="animate-spin" size={24} /> : <Search size={24} />}
                    </div>

                    <input
                        type="text"
                        className="flex-1 bg-transparent outline-none text-xl text-zinc-100 placeholder:text-zinc-600 font-medium tracking-tight"
                        placeholder="Search emails..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />

                    <KeyCap>Esc</KeyCap>
                </div>

                {/* Results Area */}
                <div className="flex-1 overflow-y-auto p-2 scroll-smooth">
                    <style jsx>{`
                        ::-webkit-scrollbar { width: 6px; }
                        ::-webkit-scrollbar-track { background: transparent; }
                        ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
                        ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
                    `}</style>

                    {/* Empty State */}
                    {!query && (
                        <div className="h-64 flex flex-col items-center justify-center text-zinc-600 gap-3">
                            <div className="p-4 rounded-full bg-zinc-900/50 border border-zinc-800/50">
                                <Command size={32} className="opacity-40" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium text-zinc-400">Search your inbox</p>
                                <p className="text-xs text-zinc-600 mt-1">Find emails by keywords, sender, or meaning</p>
                            </div>
                        </div>
                    )}

                    {/* No Results State */}
                    {query && !loading && results.length === 0 && (
                        <div className="h-64 flex flex-col items-center justify-center text-zinc-600 gap-3">
                            <div className="p-4 rounded-full bg-zinc-900/50 border border-zinc-800/50">
                                <AlertCircle size={32} className="opacity-40" />
                            </div>
                            <p className="text-sm">No relevant emails found.</p>
                        </div>
                    )}

                    {/* Result List */}
                    <div className="space-y-1">
                        {results.map((email) => (
                            <button
                                key={email.id}
                                onClick={() => {
                                    onSelect(email);
                                    onClose();
                                }}
                                className="w-full text-left p-3.5 rounded-xl hover:bg-white/[0.04] border border-transparent hover:border-white/5 transition-all group relative overflow-hidden"
                            >
                                {/* Hover Gradient */}
                                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                                {email.sender[0]}
                                            </div>
                                            <span className="font-semibold text-zinc-200 text-sm group-hover:text-white transition-colors">
                                                {email.sender}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 bg-zinc-900/50 px-2 py-0.5 rounded-full border border-zinc-800/50">
                                            <Calendar size={10} />
                                            {new Date(email.sent_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                    </div>

                                    <div className="font-medium text-indigo-300 text-sm mb-1 truncate pl-8">
                                        {email.subject}
                                    </div>

                                    {/* Semantic Match Highlight */}
                                    {email.matching_chunk ? (
                                        <div className="ml-8 mt-2.5 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10 group-hover:border-indigo-500/20 transition-colors">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <Sparkles size={12} className="text-indigo-400" />
                                                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Semantic Match</span>
                                            </div>
                                            <p className="text-xs text-zinc-400 italic leading-relaxed line-clamp-2">
                                                &quot;{email.matching_chunk.substring(0, 150)}...&quot;
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="ml-8 text-xs text-zinc-500 line-clamp-1 group-hover:text-zinc-400 transition-colors">
                                            {email.body_text?.substring(0, 100)}
                                        </p>
                                    )}
                                </div>

                                {/* Enter Key Hint on Hover */}
                                <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                                    <CornerDownLeft size={16} className="text-zinc-500" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer Status Bar */}
                {results.length > 0 && (
                    <div className="px-6 py-3 border-t border-white/5 bg-zinc-900/50 text-[10px] text-zinc-500 flex justify-between items-center backdrop-blur-sm">
                        <span>{results.length} result{results.length !== 1 && 's'} found</span>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                            <span className="text-indigo-400 font-medium">Hybrid Vector Search</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Aesthetic Keycap Component
function KeyCap({ children }) {
    return (
        <div className="hidden sm:flex items-center justify-center 
            bg-gradient-to-b from-zinc-800 to-zinc-900 
            border-t border-l border-r border-white/10 border-b-2 border-b-black/50
            rounded-[6px] 
            text-[10px] text-zinc-400 font-sans font-bold uppercase tracking-wider
            shadow-[0_2px_0_0_rgba(0,0,0,0.5)]
            px-2 py-1 min-w-[24px]">
            {children}
        </div>
    );
}