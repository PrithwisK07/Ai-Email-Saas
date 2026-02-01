// components/shell/sidebar.jsx
"use client";
import React, { useState, useEffect } from 'react';
import {
    Inbox, Star, Send, FileText, Keyboard, Archive, Trash2,
    Plus, Settings, LogOut, ChevronUp, Loader2, RefreshCw,
    Sparkles, PanelLeft
} from 'lucide-react';
import { AuthService } from '@/lib/endpoints';

export default function Sidebar({
    isOpen,
    setIsOpen,
    activeTab,
    setActiveTab,
    counts = {},
    onCompose,
    isSyncing,
    onSync,
    onAskAI,
    onOpenSettings,
    onOpenShortcuts
}) {
    const [profileOpen, setProfileOpen] = useState(false);
    const [user, setUser] = useState({ name: "User", email: "", avatar_url: null });

    useEffect(() => {
        // 1. Initial Load from LocalStorage
        const loadUser = () => {
            const storedUser = localStorage.getItem("mailWise_user_name"); // Note: You might want to rename this key to 'mailWise_user' eventually since it stores the whole obj
            if (storedUser) {
                try {
                    const parsed = JSON.parse(storedUser);
                    setUser(parsed);
                } catch (e) {
                    console.error("Failed to parse user in sidebar", e);
                }
            }
        };
        loadUser();

        // 2. Listen for storage changes (e.g. after Settings update)
        const handleStorageChange = () => loadUser();
        window.addEventListener("storage", handleStorageChange);

        // Custom event listener if you emit one from page.jsx (Optional but good for SPA updates)
        window.addEventListener("user-updated", loadUser);

        return () => {
            window.removeEventListener("storage", handleStorageChange);
            window.removeEventListener("user-updated", loadUser);
        };
    }, []);

    const menuItems = [
        { id: 'inbox', icon: Inbox, label: 'Inbox', count: counts.inbox || 0 },
        { id: 'starred', icon: Star, label: 'Starred', count: counts.starred || 0 },
        { id: 'sent', icon: Send, label: 'Sent', count: counts.sent || 0 },
        { id: 'drafts', icon: FileText, label: 'Drafts', count: counts.drafts || 0 },
        { id: 'archive', icon: Archive, label: 'Archive', count: counts.archive || 0 },
        { id: 'trash', icon: Trash2, label: 'Trash', count: counts.trash || 0 },
    ];

    const labels = [
        { color: 'bg-purple-500', label: 'Meeting' },
        { color: 'bg-blue-500', label: 'Task' },
        { color: 'bg-emerald-500', label: 'Info' },
        { color: 'bg-zinc-500', label: 'General' },
    ];

    const handleLogout = () => {
        AuthService.logout();
        window.location.reload();
    };

    return (
        <div
            style={{
                width: isOpen ? '16rem' : '5rem',
                minWidth: isOpen ? '16rem' : '5rem',
                maxWidth: isOpen ? '16rem' : '5rem'
            }}
            className={`${isOpen ? 'w-64' : 'w-20'} flex-shrink-0 bg-black/40 border-r border-zinc-900 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] relative z-20`}
        >
            {/* Header */}
            <div className="h-14 flex items-center px-4 lg:px-6 border-b border-zinc-900/50 justify-between flex-shrink-0">
                {/* Logo Area */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`flex items-center group outline-none ${!isOpen && 'w-full justify-center'}`}
                >
                    <div className={`w-8 h-8 min-w-[2rem] rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-900/20 transition-transform duration-300 flex-shrink-0 ${!isOpen && 'rotate-180'}`}>
                        <div className="w-4 h-4 border-2 border-white rounded-sm rotate-45"></div>
                    </div>
                    <span className={`ml-3 font-bold text-zinc-100 tracking-tight text-lg overflow-hidden whitespace-nowrap transition-all duration-300 ${isOpen ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
                        MailWise
                    </span>
                </button>

                {/* Right Side Actions */}
                {isOpen && (
                    <div className="flex items-center gap-1 animate-in fade-in duration-300 flex-shrink-0">
                        <button
                            onClick={onSync}
                            disabled={isSyncing}
                            className={`p-1.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-md transition-all flex-shrink-0 ${isSyncing ? 'cursor-not-allowed' : ''}`}
                            title="Sync Emails"
                        >
                            {isSyncing ? (
                                <Loader2 size={16} className="animate-spin text-indigo-500" />
                            ) : (
                                <RefreshCw size={16} />
                            )}
                        </button>

                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-md transition-all flex-shrink-0"
                            title="Collapse Sidebar"
                        >
                            <PanelLeft size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 py-6 space-y-2 px-3 overflow-x-hidden">
                <div className="space-y-3 mb-6 px-1">

                    {/* Compose Button */}
                    <button
                        onClick={onCompose}
                        className={`w-full flex items-center gap-3 bg-zinc-100 hover:bg-white hover:scale-[1.02] active:scale-95 text-black py-2.5 px-4 rounded-lg font-medium transition-all shadow-lg shadow-zinc-900/50 group flex-shrink-0 ${!isOpen && 'justify-center px-0'}`}
                        title={!isOpen ? "Compose" : ""}
                    >
                        <Plus size={18} className="flex-shrink-0" />
                        {isOpen && (
                            <>
                                <span className="whitespace-nowrap">Compose</span>
                                <span className="ml-auto text-xs text-zinc-400 font-normal bg-zinc-200 px-1.5 rounded">C</span>
                            </>
                        )}
                    </button>

                    {/* Ask AI Button */}
                    <button
                        onClick={onAskAI}
                        className={`w-full flex items-center gap-2 bg-gradient-to-r from-indigo-900/50 to-purple-900/50 hover:from-indigo-900/70 hover:to-purple-900/70 border border-indigo-500/30 text-indigo-200 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-indigo-900/10 group flex-shrink-0 ${!isOpen ? 'justify-center px-0' : 'px-4'}`}
                        title={!isOpen ? "Ask AI" : ""}
                    >
                        <Sparkles size={16} className="text-indigo-400 group-hover:text-indigo-300 transition-colors flex-shrink-0" />
                        {isOpen && <span className="whitespace-nowrap">Ask AI</span>}
                    </button>
                </div>

                {/* Menu Items */}
                <div className="space-y-1">
                    {menuItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                title={!isOpen ? item.label : ""}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 active:scale-95 flex-shrink-0 ${isActive
                                    ? 'bg-zinc-800/80 text-zinc-100 font-medium'
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    } ${!isOpen && 'justify-center'}`}
                            >
                                <item.icon size={18} strokeWidth={isActive ? 2 : 1.5} className={`${isActive ? 'text-indigo-400' : ''} flex-shrink-0`} />
                                {isOpen && (
                                    <div className="flex-1 flex justify-between items-center animate-in fade-in duration-300 overflow-hidden">
                                        <span className="whitespace-nowrap">{item.label}</span>
                                        {item.count > 0 && (
                                            <span className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded min-w-[20px] text-center">{item.count}</span>
                                        )}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Labels Section */}
                <div className={`mt-8 px-3 text-xs font-semibold text-zinc-600 uppercase tracking-wider transition-opacity duration-300 whitespace-nowrap ${!isOpen ? 'opacity-0 hidden' : 'opacity-100'}`}>
                    Labels
                </div>
                {isOpen && (
                    <div className="space-y-1 mt-2 animate-in fade-in duration-300">
                        {labels.map((tag) => {
                            const isActive = activeTab === tag.label;
                            return (
                                <button
                                    key={tag.label}
                                    onClick={() => setActiveTab(tag.label)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors active:scale-95 ${isActive ? 'bg-zinc-800/80 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                                        }`}
                                >
                                    <div className={`w-2 h-2 rounded-full ${tag.color} flex-shrink-0`}></div>
                                    <span className="whitespace-nowrap">{tag.label}</span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-zinc-900/50 flex-shrink-0">
                <div className="relative">
                    <button
                        onClick={() => setProfileOpen(!profileOpen)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-800/50 transition-colors group ${!isOpen && 'justify-center'}`}
                    >
                        {/* Avatar Image or Initials */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-indigo-500/20 flex-shrink-0 overflow-hidden">
                            {user?.avatar_url ? (
                                <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span>{(user?.name || "U").charAt(0).toUpperCase()}</span>
                            )}
                        </div>

                        {isOpen && (
                            <>
                                <div className="flex-1 min-w-0 text-left animate-in fade-in duration-300">
                                    <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white">
                                        {user?.name || "User"}
                                    </p>
                                    <p className="text-[10px] text-zinc-500 truncate">
                                        {user?.email || ""}
                                    </p>
                                </div>
                                <ChevronUp size={14} className={`text-zinc-600 transition-transform flex-shrink-0 ${profileOpen ? 'rotate-180' : ''}`} />
                            </>
                        )}
                    </button>

                    {/* Profile Menu Popover */}
                    {isOpen && profileOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-full bg-[#141416] border border-zinc-800 rounded-xl shadow-2xl z-20 overflow-hidden animate-in slide-in-from-bottom-2 fade-in">
                                <button onClick={() => { onOpenSettings(); setProfileOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                                    <Settings size={14} /> Settings
                                </button>
                                <button onClick={() => { if (onOpenShortcuts) onOpenShortcuts(); setProfileOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2">
                                    <Keyboard size={14} /> Shortcuts
                                </button>
                                <div className="h-px bg-zinc-800 my-1"></div>
                                <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-zinc-800 flex items-center gap-2">
                                    <LogOut size={14} /> Log out
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}