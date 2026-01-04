// components/email/reader.jsx
"use client";
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Archive, Trash2, Clock, Reply, RotateCcw, XCircle, Forward, ChevronDown, Inbox, Paperclip, Download, Keyboard, Tag } from 'lucide-react';
import { IconButton, KeyboardShortcut } from '../email/actions';
import { AISummary } from '../email/ai-summary';
// Import the Badge component with a different name to avoid conflict with the Tag icon
import { Tag as EmailBadge } from '../email/badges';

// components/ui/reader.jsx

function SnoozeDropdown({ onSnooze }) {
    const [isOpen, setIsOpen] = useState(false);
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [customDate, setCustomDate] = useState("");

    const options = [
        {
            label: 'Test (20 seconds)',
            getTime: () => new Date(Date.now() + 20 * 1000)
        },
        {
            label: 'Later Today (3 hours)',
            getTime: () => new Date(Date.now() + 3 * 60 * 60 * 1000)
        },
        {
            label: 'Tomorrow Morning',
            getTime: () => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                d.setHours(9, 0, 0, 0);
                return d;
            }
        },
        {
            label: 'Next Week',
            getTime: () => {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                d.setHours(9, 0, 0, 0);
                return d;
            }
        },
    ];

    const handleCustomSubmit = (e) => {
        e.preventDefault();
        if (!customDate) return;

        const date = new Date(customDate);
        if (isNaN(date.getTime())) {
            alert("Invalid date format");
            return;
        }
        if (date <= new Date()) {
            alert("Please select a future date/time");
            return;
        }

        onSnooze(date);
        setIsOpen(false);
        setShowCustomInput(false);
    };

    return (
        <div className="relative">
            <button
                onClick={() => { setIsOpen(!isOpen); setShowCustomInput(false); }}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                title="Snooze"
            >
                <Clock size={18} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 top-full mt-2 w-56 bg-[#141416] border border-zinc-800 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-3 py-2 text-xs font-semibold text-zinc-500 border-b border-zinc-800">Snooze until...</div>

                        {!showCustomInput ? (
                            <>
                                {options.map((opt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => { onSnooze(opt.getTime()); setIsOpen(false); }}
                                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-indigo-400 transition-colors border-b border-zinc-800/50 last:border-0"
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setShowCustomInput(true)}
                                    className="w-full text-left px-4 py-2 text-sm text-indigo-400 hover:bg-zinc-800 font-medium transition-colors"
                                >
                                    Pick Date & Time...
                                </button>
                            </>
                        ) : (
                            <div className="p-3">
                                <input
                                    type="datetime-local"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded text-xs text-white p-2 mb-2 outline-none focus:border-indigo-500"
                                    value={customDate}
                                    onChange={(e) => setCustomDate(e.target.value)}
                                    // Set min to current time formatted for input
                                    min={new Date().toISOString().slice(0, 16)}
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowCustomInput(false)}
                                        className="flex-1 px-2 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleCustomSubmit}
                                        className="flex-1 px-2 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded font-medium"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function LabelDropdown({ currentLabel, onSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const labels = [
        { name: 'General', color: 'bg-zinc-500' },
        { name: 'Meeting', color: 'bg-purple-500' },
        { name: 'Task', color: 'bg-blue-500' },
        { name: 'Info', color: 'bg-emerald-500' },
    ];

    return (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs font-medium text-zinc-300 border border-zinc-700"
            >
                <Tag size={14} />
                {currentLabel || 'Label'}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-32 bg-[#141416] border border-zinc-800 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {labels.map((l) => (
                            <button
                                key={l.name}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect(l.name);
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                            >
                                <div className={`w-2 h-2 rounded-full ${l.color}`} />
                                {l.name}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// --- 2. MAIN COMPONENT ---
export default function ReadingPane({
    email,
    totalCount,
    currentIndex,
    onNavigate,
    onAction,
    onReply,
    onOpenShortcuts,
    onLabelChange
}) {
    const [iframeHeight, setIframeHeight] = useState(600);
    const iframeRef = useRef(null);

    useEffect(() => {
        setIframeHeight(600);
    }, [email?.id]);

    const safeSrcDoc = useMemo(() => {
        if (!email) return "";
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <base target="_blank">
        <style>
          ::-webkit-scrollbar { display: none; }
          html { -ms-overflow-style: none; scrollbar-width: none; }
          body { 
            margin: 0; 
            padding: 24px; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: ${email.folder === 'sent' || email.folder === 'drafts' ? '#ffffff' : '#09090b'};
            background-color: ${email.folder === 'sent' || email.folder === 'drafts' ? '#09090b' : '#ffffff'};
            overflow: hidden; cursor: text; line-height: 1.6;
          }
          a { color: #2563eb; text-decoration: none; } 
          a:hover { text-decoration: underline; }
          img { max-width: 100%; height: auto; display: block; }
          blockquote { margin-left: 0; padding-left: 16px; border-left: 4px solid #e5e7eb; color: #4b5563; }
        </style>
      </head>
      <body>${email.body}</body>
      </html>
    `;
    }, [email]);

    const handleIframeLoad = (e) => {
        const iframe = e.target;
        if (iframe.contentWindow) {
            const contentHeight = iframe.contentWindow.document.documentElement.scrollHeight;
            setIframeHeight(contentHeight + 20);
        }
    };

    if (!email) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 bg-[#09090b]">
                <div className="w-20 h-20 bg-zinc-900/50 rounded-full flex items-center justify-center mb-4">
                    <Inbox size={40} className="text-zinc-700" strokeWidth={1} />
                </div>
                <p>No message selected</p>
            </div>
        );
    }

    const isArchived = email.folder === 'archive';
    const isTrash = email.folder === 'trash';

    return (
        <div className="flex-1 flex flex-col bg-[#09090b] relative z-0 min-w-0 h-full">
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/* HEADER */}
            <div className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b border-zinc-900/50 bg-black/20 backdrop-blur-md z-20">
                <div className="flex gap-1">
                    {isTrash ? (
                        /* TRASH MODE: Restore + Delete Forever */
                        <>
                            <IconButton
                                icon={RotateCcw}
                                label="Restore to Inbox"
                                onClick={() => onAction('restore', email.id)}
                            />
                            <IconButton
                                icon={XCircle}
                                label="Delete Forever"
                                color="text-red-400 hover:bg-red-500/10"
                                onClick={() => onAction('delete', email.id)}
                            />
                        </>
                    ) : (
                        /* NORMAL MODE: Archive + Trash + Snooze */
                        <>
                            {isArchived ? (
                                <IconButton icon={InboxIcon} label="Move to Inbox" onClick={() => onAction('unarchive', email.id)} />
                            ) : (
                                <IconButton icon={Archive} label="Archive (E)" shortcut="E" onClick={() => onAction('archive', email.id)} />
                            )}

                            <IconButton icon={Trash2} label="Delete (#)" shortcut="#" onClick={() => onAction('delete', email.id)} />

                            <div className="w-px h-4 bg-zinc-800 mx-2"></div>
                            <SnoozeDropdown onSnooze={(date) => onAction('snooze', email.id, date)} />
                        </>
                    )}

                    <IconButton icon={Keyboard} label="Shortcuts" onClick={() => onOpenShortcuts()} />
                    <div className="w-px h-6 bg-zinc-800 mx-2 self-center"></div>
                    <IconButton icon={Reply} label="Reply (R)" shortcut="R" onClick={() => onReply(email)} />
                    <IconButton
                        icon={Forward}
                        label="Forward"
                        onClick={() => onAction('forward', email.id)}
                    />
                </div>

                <div className="flex items-center gap-3 text-zinc-500 text-sm">
                    {/* DROPDOWN IN HEADER */}
                    <LabelDropdown
                        currentLabel={email.tag}
                        onSelect={(newLabel) => onLabelChange(email.id, newLabel)}
                    />
                    <span className="hidden lg:inline">{currentIndex + 1} of {totalCount}</span>
                    <div className="flex bg-zinc-900/50 rounded-lg p-0.5">
                        <button onClick={() => onNavigate('prev')} className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30" disabled={currentIndex === 0}><ChevronDown className="rotate-180" size={16} /></button>
                        <button onClick={() => onNavigate('next')} className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors disabled:opacity-30" disabled={currentIndex === totalCount - 1}><ChevronDown size={16} /></button>
                    </div>
                </div>
            </div>

            {/* BODY */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-32 scroll-smooth no-scrollbar">
                <div className="px-6 pt-8 lg:px-8">
                    <div className="w-full">

                        {/* SUBJECT & TAG */}
                        <div className="flex items-start justify-between mb-6 break-words">
                            <h1 className="text-2xl font-bold text-zinc-100 leading-tight">
                                {email.subject}
                            </h1>
                            {/* --- RESTORED TAG HERE --- */}
                            <div className="flex gap-2 flex-shrink-0 ml-4">
                                <EmailBadge label={email.tag} color={email.tagColor} />
                            </div>
                        </div>

                        {/* SENDER INFO */}
                        <div className="flex items-center justify-between mb-6 pb-6 border-b border-zinc-900">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-zinc-300 font-medium text-lg border border-zinc-700 shadow-inner">
                                    {email.sender[0]}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-semibold text-zinc-200 truncate">{email.sender}</span>
                                        <span className="text-zinc-600 text-sm truncate hidden sm:inline">&lt;{email.email}&gt;</span>
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-0.5 truncate">
                                        To <span className="text-zinc-400">{email.to}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-sm text-zinc-500 font-mono flex-shrink-0 ml-2">
                                {email.time}
                            </div>
                        </div>

                        <AISummary emailId={email.id} />

                        {/* EMAIL CONTENT */}
                        <div className={`w-full ${email.folder === 'sent' || email.folder === 'drafts' ? 'bg-zinc-800/50' : 'bg-white'} rounded-lg border border-zinc-800/50 mt-6`}>
                            <iframe
                                ref={iframeRef}
                                srcDoc={safeSrcDoc}
                                onLoad={handleIframeLoad}
                                style={{ height: `${iframeHeight}px`, overflow: 'hidden' }}
                                className="w-full border-0 block transition-all duration-300 ease-out"
                                title="Email Content"
                                sandbox="allow-same-origin allow-popups"
                                scrolling="no"
                            />
                        </div>

                        {/* ATTACHMENTS */}
                        {email.attachments && email.attachments.length > 0 && (
                            <div className="mt-8 pt-6 border-t border-zinc-900">
                                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Paperclip size={14} />
                                    {email.attachments.length} Attachment{email.attachments.length > 1 && 's'}
                                </h3>
                                <div className="flex flex-wrap gap-3">
                                    {email.attachments.map((file, i) => (
                                        <a
                                            key={i}
                                            href={`data:application/octet-stream;base64,${file.content}`}
                                            download={file.filename}
                                            className="group flex items-center gap-3 p-3 pr-4 rounded-lg border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-800 hover:border-zinc-700 transition-all min-w-[180px] max-w-[300px] cursor-pointer text-left"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0 flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-700 transition-colors">
                                                <Paperclip size={20} />
                                            </div>
                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                <p className="text-sm font-medium text-zinc-300 truncate group-hover:text-zinc-100 transition-colors">
                                                    {file.filename}
                                                </p>
                                                <p className="text-xs text-zinc-600 group-hover:text-zinc-500 transition-colors">Click to download</p>
                                            </div>
                                            <Download size={16} className="text-zinc-600 group-hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* REPLY BOX */}
            <div className="absolute bottom-0 left-0 w-full px-6 lg:px-8 pb-6 pt-4 border-t border-zinc-900/80 bg-[#09090b]/95 backdrop-blur-sm z-30">
                <div className="w-full flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white mt-1 shadow-lg shadow-indigo-500/20">ME</div>
                    <div className="flex-1">
                        <div
                            onClick={() => onReply(email)}
                            className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 text-zinc-400 text-sm cursor-text hover:border-zinc-700 transition-colors group shadow-sm"
                        >
                            Click here to <span className="text-indigo-400 group-hover:text-indigo-300 transition-colors">Reply</span> or press <KeyboardShortcut keys={['R']} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}