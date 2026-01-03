"use client";
import React, { useState, useEffect } from 'react';
import { X, Save, User } from 'lucide-react';

export default function SettingsModal({ onClose }) {
    const [signature, setSignature] = useState("");

    useEffect(() => {
        const saved = localStorage.getItem("mailWise_signature");
        if (saved) setSignature(saved);
    }, []);

    const handleSave = () => {
        localStorage.setItem("mailWise_signature", signature);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-[#141416] w-full max-w-md rounded-xl border border-zinc-800 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/30">
                    <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
                        <User size={18} className="text-indigo-400" /> Account Settings
                    </h2>
                    <button onClick={onClose}><X size={18} className="text-zinc-500 hover:text-white" /></button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-2">Email Signature</label>
                        <textarea
                            className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 transition-all resize-none placeholder:text-zinc-600"
                            placeholder="Sent from my AI Email Client..."
                            value={signature}
                            onChange={(e) => setSignature(e.target.value)}
                        />
                        <p className="text-xs text-zinc-500 mt-2">This will be appended to every new email you compose.</p>
                    </div>
                </div>

                <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md flex items-center gap-2">
                        <Save size={14} /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}