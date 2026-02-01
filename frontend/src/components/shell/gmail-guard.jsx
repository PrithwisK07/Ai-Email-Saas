// components/shell/gmail-guard.jsx
"use client";
import React from 'react';
import { Mail, ArrowRight, ShieldCheck, Zap, Lock, LogOut } from 'lucide-react';
import gmailIcon from "../../../public/[CITYPNG.COM]Google Logo Icon Gsuite HD - 3000x3000.png"; // Ensure path is correct
import Image from 'next/image';

export default function GmailGuard({ children, user }) {
    if (!user) return null;

    if (user.is_gmail_connected) {
        return <>{children}</>;
    }

    const targetId = user.id || user.user_id;

    if (!targetId) {
        return (
            <div className="fixed inset-0 bg-[#09090b] flex flex-col items-center justify-center p-4 z-50 text-center">
                <div className="bg-red-500/10 p-4 rounded-full mb-4">
                    <LogOut size={32} className="text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Session Invalid</h2>
                <p className="text-zinc-400 mb-6">Your session data is incomplete. Please log in again.</p>
                <button
                    onClick={() => {
                        localStorage.removeItem('mailWise_token');
                        localStorage.removeItem('mailWise_user_name');
                        window.location.reload();
                    }}
                    className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-zinc-200 transition-colors"
                >
                    Log Out & Fix
                </button>
            </div>
        );
    }

    // 4. Connect Handler
    const handleConnect = () => {
        // We know targetId exists now because of check #3
        window.location.href = `http://localhost:3001/auth/google/connect?user_id=${targetId}`;
    };

    // 5. Render Connect Screen (Your existing UI)
    return (
        <div className="fixed inset-0 bg-[#09090b] flex items-center justify-center p-4 z-50 overflow-hidden font-sans selection:bg-indigo-500/30">
            {/* Ambient Background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none opacity-50 animate-pulse" style={{ animationDuration: '4s' }} />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>

            <div className="relative w-full max-w-lg bg-zinc-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex flex-col items-center text-center space-y-6">

                    {/* Icon */}
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-40 group-hover:opacity-75 transition duration-500"></div>
                        <div className="relative w-16 h-16 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl flex items-center justify-center shadow-inner border border-white/10">
                            <Mail size={32} className="text-white drop-shadow-md" />
                        </div>
                    </div>

                    <div className="space-y-2 max-w-sm mx-auto">
                        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Connect your Inbox</h1>
                        <p className="text-zinc-400 text-sm leading-relaxed">Unlock the full power of MailWise. Sync your emails safely to enable AI summarization and smart drafting.</p>
                    </div>

                    {/* Features List */}
                    <div className="w-full py-4 space-y-3">
                        <FeatureRow icon={ShieldCheck} color="text-emerald-400" bg="bg-emerald-500/10" title="Secure OAuth2 Link" desc="Official Google verified connection." />
                        <FeatureRow icon={Lock} color="text-blue-400" bg="bg-blue-500/10" title="Private & Encrypted" desc="Your data is encrypted at rest and in transit." />
                        <FeatureRow icon={Zap} color="text-purple-400" bg="bg-purple-500/10" title="AI Superpowers" desc="Automate sorting, drafting, and summaries." />
                    </div>

                    {/* Connect Button */}
                    <button
                        onClick={handleConnect}
                        className="group relative w-full py-3.5 bg-white hover:bg-zinc-100 text-black font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-3 text-base shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_-5px_rgba(255,255,255,0.5)] hover:-translate-y-0.5"
                    >
                        {/* Fallback if image fails, or use standard G icon */}
                        {gmailIcon && <Image src={gmailIcon} alt="G" className="w-5 h-5" />}
                        <span>Connect with Google</span>
                        <ArrowRight size={18} className="text-zinc-400 group-hover:text-black group-hover:translate-x-1 transition-all" />
                    </button>

                    <button
                        onClick={() => {
                            localStorage.removeItem('mailWise_token');
                            localStorage.removeItem('mailWise_user_name');
                            window.location.reload();
                        }}
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-300 transition-colors uppercase tracking-widest underline underline-offset-2"
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}

// Helper component for cleaner code
function FeatureRow({ icon: Icon, color, bg, title, desc }) {
    return (
        <div className="flex items-center gap-3 text-left p-2.5 rounded-xl hover:bg-white/5 transition-colors duration-300 border border-transparent hover:border-white/5">
            <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={color} size={16} />
            </div>
            <div>
                <h3 className="text-zinc-200 font-medium text-sm">{title}</h3>
                <p className="text-zinc-500 text-xs">{desc}</p>
            </div>
        </div>
    );
}