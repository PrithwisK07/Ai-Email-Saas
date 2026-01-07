"use client";
import React, { useState, useEffect } from 'react';
import { X, Save, User, ChevronDown, Loader2 } from 'lucide-react';
import { AuthService } from '@/lib/endpoints';
import { toast } from '@/components/ui/toast'; // <--- Import Toast

export default function SettingsModal({ onClose }) {
    const [name, setName] = useState("");
    const [signature, setSignature] = useState("");
    const [retention, setRetention] = useState("30");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        async function load() {
            try {
                const data = await AuthService.getSettings();
                if (data.name) setName(data.name);
                if (data.signature) setSignature(data.signature);
                if (data.trash_retention_days) setRetention(String(data.trash_retention_days));

                console.log(data);
            } catch (e) {
                console.error(e);
                toast.error("Could not load settings");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // 2. Save Settings
    const handleSave = async () => {
        setSaving(true);
        try {
            await AuthService.updateSettings({
                name: name, // <--- Send Name
                signature: signature,
                trash_retention_days: retention
            });

            // Update LocalStorage so Sidebar updates immediately without refresh
            localStorage.setItem("mailWise_user_name", name);
            localStorage.setItem("mailWise_signature", signature);

            toast.success("Saved!");
            onClose();

            // Optional: Force a reload or trigger an event to update Sidebar
            window.dispatchEvent(new Event("storage"));
        } catch (e) {
            console.error(e);
            toast.error("Failed to save");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-[#141416] w-full max-w-md rounded-xl border border-zinc-800 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/30">
                    <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
                        <User size={18} className="text-indigo-400" /> Account Settings
                    </h2>
                    <button onClick={onClose}><X size={18} className="text-zinc-500 hover:text-white" /></button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-2">Display Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. John Doe"
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 transition-colors"
                        />
                        <p className="text-xs text-zinc-500 mt-2">This name will appear in your sidebar and sent emails.</p>
                    </div>

                    {/* Signature */}
                    <div>
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-2">Email Signature</label>
                        <textarea
                            className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 transition-all resize-none placeholder:text-zinc-600"
                            placeholder="Sent from my AI Email Client..."
                            value={signature}
                            onChange={(e) => setSignature(e.target.value)}
                        />
                    </div>

                    {/* Retention */}
                    <div>
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-2">Trash Auto-Deletion</label>
                        <div className="relative">
                            <select
                                value={retention}
                                onChange={(e) => setRetention(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                            >
                                <option value="30">Delete after 30 days</option>
                                <option value="60">Delete after 60 days</option>
                                <option value="90">Delete after 90 days</option>
                                <option value="never">Never delete</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                                <ChevronDown size={14} />
                            </div>
                        </div>
                        <p className="text-xs text-zinc-500 mt-2">Emails in trash older than this will be permanently removed.</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md flex items-center gap-2 disabled:opacity-50">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}