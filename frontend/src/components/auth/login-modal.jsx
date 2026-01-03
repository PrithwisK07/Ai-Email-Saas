// components/auth/login-modal.jsx
"use client";
import React, { useState } from 'react';
import { AuthService } from '@/lib/endpoints';
import { Loader2, AlertCircle } from 'lucide-react';

export default function LoginModal({ onLoginSuccess }) {
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState(''); // Only for register
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isRegistering) {
                await AuthService.register(name, email, password);
                // Auto-login after register, or ask user to switch to login. 
                // For simplicity, let's switch them to login view:
                setIsRegistering(false);
                setError("Account created! Please log in.");
                setLoading(false);
            } else {
                await AuthService.login(email, password);
                setLoading(false);
                if (onLoginSuccess) onLoginSuccess();
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || "Authentication failed");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#141416] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 text-center">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-900/20 mx-auto mb-4">
                        <div className="w-6 h-6 border-2 border-white rounded-sm rotate-45"></div>
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                        {isRegistering ? 'Create Account' : 'Welcome Back'}
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1">
                        {isRegistering ? 'Join the MailWise workspace' : 'Sign in to access your emails'}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {isRegistering && (
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-zinc-500 uppercase">Company / Name</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 outline-none focus:border-indigo-500 transition-colors"
                                placeholder="Acme Corp"
                            />
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-500 uppercase">Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 outline-none focus:border-indigo-500 transition-colors"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-500 uppercase">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 outline-none focus:border-indigo-500 transition-colors"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {isRegistering ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 text-center">
                    <button
                        onClick={() => {
                            setIsRegistering(!isRegistering);
                            setError(null);
                        }}
                        className="text-sm text-zinc-500 hover:text-indigo-400 transition-colors"
                    >
                        {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
                    </button>
                </div>
            </div>
        </div>
    );
}