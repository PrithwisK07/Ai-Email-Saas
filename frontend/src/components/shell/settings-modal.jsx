"use client";
import React, { useState, useEffect } from 'react';
import { X, Save, User, ChevronDown, Loader2, Link as LinkIcon, CheckCircle, Lock } from 'lucide-react';
import { AuthService } from '@/lib/endpoints';
import { toast } from '@/components/ui/toast';
import gmailIcon from "../../../public/[CITYPNG.COM]Google Logo Icon Gsuite HD - 3000x3000.png";
import Image from 'next/image';

export default function SettingsModal({ onClose }) {
    const [name, setName] = useState("");
    const [avatar, setAvatar] = useState("");
    const [signature, setSignature] = useState("");
    const [retention, setRetention] = useState("30");

    // Auth & Connection State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [connectedEmail, setConnectedEmail] = useState(null);
    const [isGmailConnected, setIsGmailConnected] = useState(false);

    // --- 1. Load Settings on Mount ---
    useEffect(() => {
        async function load() {
            try {
                const data = await AuthService.getSettings();

                // Populate fields
                if (data.name) setName(data.name);
                if (data.avatar_url) setAvatar(data.avatar_url);
                if (data.signature) setSignature(data.signature);
                if (data.trash_retention_days) setRetention(String(data.trash_retention_days));

                // Set Connection Status
                setConnectedEmail(data.connected_email);
                setIsGmailConnected(!!data.is_gmail_connected);
            } catch (e) {
                console.error(e);
                toast.error("Could not load settings");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // --- 2. Handle Connect / Reconnect ---
    const handleConnectGmail = () => {
        try {
            const userStr = localStorage.getItem('mailWise_user_name');
            const userId = userStr ? JSON.parse(userStr).id : "";
            if (!userId) {
                toast.error("User ID missing. Please relogin.");
                return;
            }
            // Redirect to Backend OAuth
            window.location.href = `http://localhost:3001/auth/google/connect?user_id=${userId}`;
        } catch (e) {
            console.error("Connect error", e);
            toast.error("Failed to initiate connection");
        }
    };

    // --- 3. Save Changes ---
    const handleSave = async () => {
        setSaving(true);
        try {
            await AuthService.updateSettings({
                // We don't send 'name' back because it's locked to Google
                signature: signature,
                trash_retention_days: retention
            });

            // Update Local Cache for instant UI updates
            localStorage.setItem("mailWise_signature", signature);

            toast.success("Saved!");
            onClose();
            // Trigger storage event so other tabs/components update
            window.dispatchEvent(new Event("storage"));
        } catch (e) {
            console.error(e);
            toast.error("Failed to save");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-[#141416] w-full max-w-md rounded-xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/30 shrink-0">
                    <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
                        <User size={18} className="text-indigo-400" /> Account Settings
                    </h2>
                    <button onClick={onClose}><X size={18} className="text-zinc-500 hover:text-white" /></button>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">

                    {/* --- PROFILE SECTION --- */}
                    <div className="flex items-center gap-4">
                        {/* Avatar Display */}
                        <div className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center relative shrink-0">
                            {avatar ? (
                                <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-2xl font-bold text-zinc-500">{name.charAt(0)}</span>
                            )}
                        </div>

                        <div className="flex-1 space-y-1.5">
                            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Display Name</label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={name}
                                    disabled // Locked field
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg pl-3 pr-10 py-2 text-zinc-400 cursor-not-allowed outline-none text-sm group-hover:bg-zinc-900 transition-colors"
                                />
                                <Lock size={14} className="absolute right-3 top-2.5 text-zinc-600" />
                            </div>
                            <p className="text-[10px] text-zinc-600">
                                Synced from Google Account
                            </p>
                        </div>
                    </div>

                    <div className="h-px bg-zinc-800 w-full" />

                    {/* --- SIGNATURE --- */}
                    <div>
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-2">Email Signature</label>
                        <textarea
                            className="w-full h-28 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 transition-all resize-none placeholder:text-zinc-600 custom-scrollbar focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="Sent from my AI Email Client..."
                            value={signature}
                            onChange={(e) => setSignature(e.target.value)}
                        />
                    </div>

                    {/* --- RETENTION --- */}
                    <div>
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-2">Trash Auto-Deletion</label>
                        <div className="relative">
                            <select
                                value={retention}
                                onChange={(e) => setRetention(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 outline-none focus:border-indigo-500 appearance-none cursor-pointer hover:bg-zinc-800 transition-colors"
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
                    </div>

                    {/* --- INTEGRATION SECTION --- */}
                    <div className="pt-2">
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-2">Connected Accounts</label>

                        <div className={`
                            w-full bg-zinc-900 border rounded-lg p-3 flex items-center justify-between transition-colors
                            ${isGmailConnected ? 'border-zinc-700' : 'border-zinc-700 hover:border-zinc-600'}
                        `}>
                            <div className="flex items-center gap-3">
                                {/* Icon Container */}
                                <div className="w-9 h-9 bg-white rounded-md flex items-center justify-center p-1.5 shadow-sm shrink-0">
                                    <Image src={gmailIcon} alt="G" className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-sm font-medium text-zinc-200 truncate">Google Gmail</span>
                                    <span className="text-[11px] text-zinc-500 truncate max-w-[180px]">
                                        {isGmailConnected
                                            ? `Connected as ${connectedEmail || 'User'}`
                                            : "Not connected"}
                                    </span>
                                </div>
                            </div>

                            {/* Action Button */}
                            {isGmailConnected ? (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-400 text-xs font-medium rounded-md border border-green-500/20 shrink-0 select-none">
                                    <CheckCircle size={12} />
                                    <span>Active</span>
                                </div>
                            ) : (
                                <button
                                    onClick={handleConnectGmail}
                                    className="group flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md transition-all shadow-lg shadow-indigo-500/10 shrink-0"
                                >
                                    <LinkIcon size={12} className="opacity-70 group-hover:opacity-100" />
                                    Connect
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold rounded-md flex items-center gap-2 disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
}