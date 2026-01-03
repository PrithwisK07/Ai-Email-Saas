// components/ui/ai-summary.jsx
"use client";
import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, RefreshCw, Copy, Check } from 'lucide-react';
import { ActionService } from '@/lib/endpoints';

// --- MEMORY CACHE ---
const summaryCache = new Map();

// --- HELPER: Markdown Parser (Same as AskAI) ---
const MarkdownRenderer = ({ content }) => {
    if (!content) return null;

    // Split by new lines to handle paragraphs and lists
    const lines = content.split('\n');

    return (
        <div className="space-y-2 text-zinc-300 text-sm leading-relaxed">
            {lines.map((line, i) => {
                // 1. Handle Bullet Points (* or -)
                if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
                    const text = line.trim().substring(2);
                    return (
                        <div key={i} className="flex gap-2 pl-1">
                            <span className="text-indigo-400 mt-1.5">•</span>
                            <span dangerouslySetInnerHTML={{ __html: parseBold(text) }} />
                        </div>
                    );
                }

                // 2. Handle Empty Lines (Paragraph breaks)
                if (!line.trim()) {
                    return <div key={i} className="h-2" />;
                }

                // 3. Handle Headings (Lines ending with :) or specifically capitalized
                // This makes sections like "Main Topics:" stand out
                if (line.trim().endsWith(':')) {
                    return (
                        <h4 key={i} className="text-xs font-bold text-indigo-200 uppercase tracking-widest mt-4 mb-1">
                            {line.replace(/\*\*/g, '').replace(':', '')}
                        </h4>
                    )
                }

                // 4. Standard Paragraphs
                return (
                    <p key={i} dangerouslySetInnerHTML={{ __html: parseBold(line) }} />
                );
            })}
        </div>
    );
};

// Regex to replace **text** with bold styled text
const parseBold = (text) => {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-100 font-semibold">$1</strong>');
};

export function AISummary({ emailId }) {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!emailId) return;
        if (summaryCache.has(emailId)) {
            setSummary(summaryCache.get(emailId));
            setLoading(false);
        } else {
            setSummary(null);
            setLoading(false);
        }
        setError(null);
        setCopied(false);
    }, [emailId]);

    const handleGenerate = async () => {
        if (!emailId) return;
        setLoading(true);
        setError(null);
        try {
            const htmlSummary = await ActionService.summarize(emailId);
            summaryCache.set(emailId, htmlSummary);
            setSummary(htmlSummary);
        } catch (err) {
            console.error(err);
            setError("Failed to generate summary. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!summary) return;
        navigator.clipboard.writeText(summary);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // 1. LOADING STATE
    if (loading) {
        return (
            <div className="mb-6 rounded-xl border border-indigo-500/20 bg-indigo-500/5 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full" />
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin relative z-10" />
                    </div>
                    <div className="flex flex-col items-center gap-1 z-10">
                        <span className="text-sm font-medium text-indigo-300">Synthesizing insights...</span>
                        <span className="text-xs text-indigo-400/60">Analyzing thread context & sentiment</span>
                    </div>
                </div>
            </div>
        );
    }

    // 2. SUCCESS STATE (Show Summary)
    if (summary) {
        return (
            <div className="mb-8 group relative animate-in fade-in slide-in-from-top-2 duration-500">
                {/* Glow Effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent rounded-xl blur-sm opacity-30 group-hover:opacity-50 transition duration-700" />

                <div className="relative rounded-xl overflow-hidden bg-[#09090b] border border-white/10 shadow-2xl ring-1 ring-black/50">

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-white/5 to-transparent border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="relative flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/10 ring-1 ring-indigo-500/20 shadow-[0_0_10px_-3px_rgba(99,102,241,0.3)]">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-indigo-100 uppercase tracking-widest leading-none">Executive Brief</h4>
                                <span className="text-[10px] text-zinc-500 font-medium">AI-Generated Analysis</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleCopy}
                                className="p-1.5 text-zinc-500 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-md transition-all active:scale-95"
                                title="Copy to clipboard"
                            >
                                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            </button>
                            <div className="w-px h-3 bg-zinc-800 mx-1" />
                            <button
                                onClick={handleGenerate}
                                className="p-1.5 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-all active:scale-95"
                                title="Regenerate"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 bg-gradient-to-b from-transparent to-black/20">
                        {/* REPLACED dangerouslySetInnerHTML WITH MARKDOWN RENDERER */}
                        <MarkdownRenderer content={summary} />
                    </div>
                </div>
            </div>
        );
    }

    // 3. IDLE STATE (Placeholder Button)
    return (
        <div className="mb-6 animate-in fade-in duration-300">
            <button
                onClick={handleGenerate}
                className="group relative w-full p-[1px] rounded-xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all active:scale-[0.99]"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-800 via-indigo-500/30 to-zinc-800 opacity-50 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative flex items-center justify-between p-4 rounded-xl bg-[#09090b] group-hover:bg-[#0f0f12] transition-colors duration-300">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 group-hover:scale-105 transition-all duration-300">
                            <Sparkles className="w-5 h-5 text-indigo-400/80 group-hover:text-indigo-400" />
                        </div>
                        <div className="text-left space-y-0.5">
                            <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
                                Generate AI Summary
                            </h3>
                            <p className="text-xs text-zinc-500 group-hover:text-zinc-400">
                                Analyze this thread for action items & key points
                            </p>
                        </div>
                    </div>
                </div>
            </button>

            {error && (
                <div className="mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-center animate-in fade-in slide-in-from-top-1">
                    {error}
                </div>
            )}
        </div>
    );
}