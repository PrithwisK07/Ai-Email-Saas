// components/email/list.jsx
"use client";
import React, { useState } from 'react';
import { Search, RefreshCw, Filter, MoreVertical, Inbox, Star, Archive, Trash2, Inbox as InboxIcon } from 'lucide-react';
import { Tag as EmailTag } from '../email/badges';

export default function EmailList({
    emails,
    activeTab,
    selectedEmailId,
    onSelect,
    onToggleStar,
    onUnarchive,
    onArchive,
    onDelete,
    onSearchClick,
    showUnreadOnly, onToggleUnread, onRefresh
}) {
    const handleAction = (e, callback, id) => {
        e.stopPropagation();
        callback(id);
    };

    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div
            style={{
                width: '400px',
                minWidth: '400px',
                maxWidth: '400px'
            }}
            className="flex-shrink-0 flex flex-col border-r border-zinc-900 bg-black/20 backdrop-blur-xl"
        >
            {/* Inject the global utility class for hiding scrollbars */}
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;  /* IE and Edge */
                    scrollbar-width: none;  /* Firefox */
                }
            `}</style>

            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-900/50">
                <h2 className="font-semibold text-zinc-200 capitalize flex items-center gap-2">
                    {activeTab}
                    <span className="text-xs font-normal text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded-md border border-zinc-800">{emails.length}</span>
                </h2>
                <div className="flex items-center gap-1">
                    <button onClick={onSearchClick} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors active:scale-90">
                        <Search size={18} />
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className={`p-2 hover:bg-zinc-800 rounded-md transition-colors ${showUnreadOnly ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-400'}`}
                        >
                            <MoreVertical size={18} />
                        </button>

                        {menuOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                                <div className="absolute right-0 top-full mt-2 w-48 bg-[#141416] border border-zinc-800 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    <button
                                        onClick={() => { onToggleUnread(); setMenuOpen(false); }}
                                        className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2 border-b border-zinc-800/50"
                                    >
                                        <Filter size={14} className={showUnreadOnly ? "text-indigo-400" : "text-zinc-500"} />
                                        {showUnreadOnly ? "Show All" : "Unread Only"}
                                    </button>
                                    <button
                                        onClick={() => { onRefresh(); setMenuOpen(false); }}
                                        className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                                    >
                                        <RefreshCw size={14} className="text-zinc-500" />
                                        Refresh List
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar no-scrollbar">
                {emails.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4">
                        <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center">
                            <Inbox size={32} strokeWidth={1} />
                        </div>
                        <p className="text-sm">No emails in {activeTab}</p>
                    </div>
                ) : (
                    emails.map((email, index) => (
                        <div
                            key={email.id}
                            onClick={() => onSelect(email.id)}
                            style={{ animationDelay: `${index * 50}ms` }}
                            className={`group relative p-4 border-b border-zinc-900/50 cursor-pointer transition-all duration-200 animate-in slide-in-from-bottom-2 fade-in fill-mode-forwards ${selectedEmailId === email.id
                                ? 'bg-zinc-900/80 border-l-2 border-l-indigo-500'
                                : 'hover:bg-zinc-900/30 border-l-2 border-l-transparent hover:pl-[18px]'
                                }`}
                        >
                            {/* Row Content */}
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                    {!email.read && <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>}
                                    <span className={`text-sm ${!email.read ? 'text-white font-semibold' : 'text-zinc-400'}`}>{email.sender}</span>
                                </div>
                                <span className="text-xs text-zinc-600 whitespace-nowrap">{email.time}</span>
                            </div>
                            <h3 className={`text-sm mb-1 truncate ${!email.read ? 'text-zinc-200 font-medium' : 'text-zinc-500'}`}>
                                {email.subject}
                            </h3>
                            <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
                                {email.preview}
                            </p>

                            <div className="mt-3 flex items-center justify-between">
                                <EmailTag label={email.tag} color={email.tagColor} />

                                {/* Actions Container */}
                                <div className="flex gap-1 items-center">

                                    {/* Star Button - Modified to hide when unstarred/unhovered */}
                                    <button
                                        onClick={(e) => handleAction(e, onToggleStar, email.id)}
                                        className={`p-1 rounded transition-all duration-200 hover:bg-zinc-700 
                                            ${email.isStarred
                                                ? 'text-yellow-500 opacity-100 translate-x-0' // If starred: Always visible
                                                : 'text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0' // If not starred: Hidden until hover
                                            }`}
                                    >
                                        <Star size={14} fill={email.isStarred ? "currentColor" : "none"} />
                                    </button>

                                    {/* Archive & Delete - Only visible on hover */}
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
                                        <button
                                            onClick={(e) => handleAction(e, email.folder === "archive" ? onUnarchive : onArchive, email.id)}
                                            className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                                            title={email.folder === "archive" ? "Move to Inbox (E)" : "Archive (E)"}>
                                            {email.folder === "archive" ? <InboxIcon size={14} /> : <Archive size={14} />}
                                        </button>
                                        <button
                                            onClick={(e) => handleAction(e, onDelete, email.id)}
                                            className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                                            title="Delete (#)">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}