"use client";
import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Send, Loader2, Bot, HelpCircle, Copy, Check } from 'lucide-react';
import { ActionService } from '@/lib/endpoints';

// --- HELPER: Simple Markdown Parser ---
// --- HELPER: Enhanced Markdown Parser ---
const MarkdownRenderer = ({ content }) => {
    if (!content) return null;

    const lines = content.split('\n');

    return (
        <div className="space-y-2 text-zinc-300 text-sm leading-relaxed">
            {lines.map((line, i) => {
                // 1. Handle Bullet Points
                if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
                    const text = line.trim().substring(2);
                    return (
                        <div key={i} className="flex gap-2 pl-1">
                            <span className="text-indigo-400 mt-1.5">•</span>
                            {/* Use the new parseContent function */}
                            <span dangerouslySetInnerHTML={{ __html: parseContent(text) }} />
                        </div>
                    );
                }

                // 2. Handle Empty Lines
                if (!line.trim()) {
                    return <div key={i} className="h-2" />;
                }

                // 3. Standard Paragraphs
                return (
                    <p key={i} dangerouslySetInnerHTML={{ __html: parseContent(line) }} />
                );
            })}
        </div>
    );
};

// --- UPDATED PARSER: Handles Bold AND Links ---
const parseContent = (text) => {
    // 1. Parse Links (http/https)
    // FIX: The regex now looks for urls, but we clean the result in the replacer function
    let parsed = text.replace(
        /(`?)(https?:\/\/[^\s`)]+)(`?)/g,
        (match, prefix, url, suffix) => {
            // If the AI wrapped it in backticks (`https://...`), we discard them
            // and just render the clean clickable link.
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">${url}</a>`;
        }
    );

    // 2. Parse Bold (**text**)
    parsed = parsed.replace(
        /\*\*(.*?)\*\*/g,
        '<strong class="text-indigo-200 font-semibold">$1</strong>'
    );

    return parsed;
};

export default function AskAIModal({ onClose }) {
    const [query, setQuery] = useState("");
    const [answer, setAnswer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const inputRef = useRef(null);
    const contentRef = useRef(null);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [answer, loading]);

    const handleAsk = async () => {
        if (!query.trim() || loading) return;

        setLoading(true);
        setAnswer(null);
        setCopied(false);

        try {
            const responseData = await ActionService.ask(query);
            const answerText = typeof responseData === 'string'
                ? responseData
                : responseData.answer || responseData.message;

            setAnswer(answerText);
        } catch (error) {
            console.error("Ask AI Failed:", error);
            setAnswer("I'm sorry, I encountered an error while analyzing your emails. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!answer) return;
        // Strip HTML/Markdown markers if you want clean text, or copy raw answer
        // Here we copy the raw answer text so specific formatting characters are preserved
        navigator.clipboard.writeText(answer);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const suggestions = [
        "What are the deadlines for the Q3 project?",
        "Did John confirm the meeting time?",
        "Summarize the feedback from Client X",
        "List all action items from yesterday"
    ];

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-2xl bg-[#09090b]/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden flex flex-col h-[75vh] animate-in slide-in-from-bottom-4 duration-300">

                {/* Ambient Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20 shadow-[0_0_15px_-3px_rgba(99,102,241,0.3)]">
                            <Sparkles size={18} className="text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-zinc-100 text-sm tracking-wide">Ask your Inbox</h2>
                            <p className="text-[10px] text-indigo-400/80 font-medium uppercase tracking-wider">RAG Powered</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-all active:scale-95"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content Area */}
                <div ref={contentRef} className="flex-1 overflow-y-auto p-6 scroll-smooth">
                    <style jsx>{`
                        ::-webkit-scrollbar { width: 6px; }
                        ::-webkit-scrollbar-track { background: transparent; }
                        ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
                        ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
                    `}</style>

                    {/* 1. Empty State (Suggestions) */}
                    {!answer && !loading && (
                        <div className="h-full flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-2">
                            <div className="w-16 h-16 rounded-2xl bg-zinc-900/50 flex items-center justify-center mb-6 border border-zinc-800 shadow-inner">
                                <Bot size={32} className="text-zinc-600" />
                            </div>
                            <h3 className="text-zinc-200 font-medium mb-2">How can I help you today?</h3>
                            <p className="text-zinc-500 text-sm mb-8 text-center max-w-sm">
                                I can analyze your emails to find deadlines, summarize threads, or extract specific details.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                                {suggestions.map((q, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setQuery(q)}
                                        className="text-left text-xs p-3 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-800/80 hover:border-zinc-700 hover:text-indigo-300 text-zinc-400 transition-all duration-200 group"
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <HelpCircle size={12} className="text-zinc-600 group-hover:text-indigo-500 transition-colors" />
                                            <span className="font-medium text-zinc-300 group-hover:text-indigo-200">Suggestion</span>
                                        </div>
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 2. Loading State */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center h-full space-y-6 animate-in fade-in">
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse rounded-full" />
                                <Loader2 size={40} className="text-indigo-400 animate-spin relative z-10" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-sm font-medium text-zinc-200">Analyzing your inbox...</p>
                                <p className="text-xs text-zinc-500">Searching through contexts and threads</p>
                            </div>
                        </div>
                    )}

                    {/* 3. Answer State */}
                    {answer && (
                        <div className="animate-in fade-in slide-in-from-bottom-2">
                            {/* User Query Bubble */}
                            <div className="flex justify-end mb-6">
                                <div className="bg-zinc-800/80 text-zinc-200 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm max-w-[80%] border border-zinc-700">
                                    {query}
                                </div>
                            </div>

                            {/* AI Response */}
                            <div className="flex gap-4 max-w-[95%]">
                                <div className="flex-shrink-0 mt-1">
                                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-[0_0_10px_-3px_rgba(99,102,241,0.2)]">
                                        <Sparkles size={14} />
                                    </div>
                                </div>
                                <div className="space-y-2 flex-1">
                                    <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">AI Answer</div>
                                    <div className="p-4 rounded-2xl rounded-tl-sm bg-white/[0.03] border border-white/5 shadow-sm">
                                        <MarkdownRenderer content={answer} />
                                    </div>

                                    {/* Action Buttons: Copy Only */}
                                    <div className="flex justify-start mt-1">
                                        <button
                                            onClick={handleCopy}
                                            className="group flex items-center gap-1.5 p-1.5 rounded-md hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-all"
                                            title="Copy to clipboard"
                                        >
                                            {copied ? (
                                                <Check size={14} className="text-emerald-400" />
                                            ) : (
                                                <Copy size={14} className="group-hover:text-indigo-400 transition-colors" />
                                            )}
                                            <span className={`text-[10px] font-medium ${copied ? 'text-emerald-400' : ''}`}>
                                                {copied ? 'Copied' : 'Copy'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Input Area */}
                <div className="p-4 border-t border-white/5 bg-zinc-900/50 backdrop-blur-md">
                    <div className="relative flex items-center group">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                            placeholder="Ask a question..."
                            className="w-full bg-[#09090b] border border-zinc-800 text-zinc-100 text-sm rounded-xl py-3.5 pl-4 pr-24 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-zinc-600 shadow-inner"
                        />

                        <div className="absolute right-2 flex items-center gap-2">
                            {/* Enter Hint */}
                            <div className="hidden sm:flex items-center justify-center h-6 px-1.5 rounded border border-zinc-700 bg-zinc-800/50 text-[10px] text-zinc-500 font-medium">
                                ⏎
                            </div>

                            <button
                                onClick={handleAsk}
                                disabled={!query.trim() || loading}
                                className={`p-2 rounded-lg transition-all duration-300 ${query.trim() && !loading
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                    }`}
                            >
                                <Send size={16} className={query.trim() && !loading ? 'translate-x-0.5' : ''} />
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}