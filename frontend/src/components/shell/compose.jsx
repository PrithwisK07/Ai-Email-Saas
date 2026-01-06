"use client";
import React, { useState, useEffect, useRef } from 'react';
import {
    X, Paperclip, Sparkles, Loader2, Wand2,
    Bold, Italic, Underline, Strikethrough,
    List, Link as LinkIcon,
    AlignLeft, AlignCenter, AlignRight, Check,
    FileText, UploadCloud
} from 'lucide-react';
import { ActionService, ContactService } from '@/lib/endpoints';

export default function ComposeModal({ onClose, initialData = {}, onSend }) {
    // --- Helper to safely format array/string to string ---
    const formatField = (val) => {
        if (!val) return '';
        if (Array.isArray(val)) return val.join(', ');
        return val;
    };

    // --- Fields ---
    const [to, setTo] = useState(formatField(initialData.to));
    const [cc, setCc] = useState(formatField(initialData.cc));
    const [bcc, setBcc] = useState(formatField(initialData.bcc));
    const [subject, setSubject] = useState(initialData.subject || '');
    const [attachments, setAttachments] = useState(initialData.attachments || []);

    // UI States
    const [showCcBcc, setShowCcBcc] = useState(!!initialData.cc || !!initialData.bcc);
    const [isSending, setIsSending] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showAiPrompt, setShowAiPrompt] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");

    const editorRef = useRef(null);
    const fileInputRef = useRef(null);

    const [isMassMail, setIsMassMail] = useState(false);
    const [extractedEmails, setExtractedEmails] = useState([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const massMailInputRef = useRef(null);

    useEffect(() => {
        async function fetchContacts() {
            try {
                const list = await ContactService.getSuggestions();
                setSuggestions(list);
            } catch (e) {
                console.error("Failed to load contact suggestions", e);
            }
        }
        fetchContacts();
    }, []);

    // --- Initialize Editor HTML ---
    useEffect(() => {
        if (editorRef.current) {
            // If editing a draft, use that.
            if (initialData.html) {
                if (editorRef.current.innerHTML.trim() === "") {
                    editorRef.current.innerHTML = initialData.html;
                }
            } else {
                // NEW: If starting fresh, append signature
                const savedSig = localStorage.getItem("mailWise_signature");
                if (savedSig && editorRef.current.innerHTML.trim() === "") {
                    editorRef.current.innerHTML = `<br><br>--<br>${savedSig.replace(/\n/g, "<br>")}`;
                }
            }
        }
    }, [initialData.html]);

    // Helper inside component to convert file to base64
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve({
            filename: file.name,
            content: reader.result.split(',')[1],
            encoding: 'base64'
        });
        reader.onerror = error => reject(error);
    });

    // --- SAVE ON CLOSE LOGIC ---
    const handleClose = async () => {
        const hasContent = to || subject || (editorRef.current && editorRef.current.innerText.trim());

        if (hasContent && !isSending) {
            try {
                // 1. Convert attachments to Base64 so they save in DB
                const processedAttachments = await Promise.all(
                    attachments.map(f => (f instanceof File ? toBase64(f) : f))
                );

                const payload = {
                    id: initialData.id,
                    to: to ? to.split(',').map(e => e.trim()).filter(Boolean) : [],
                    cc: cc ? cc.split(',').map(e => e.trim()).filter(Boolean) : [],
                    bcc: bcc ? bcc.split(',').map(e => e.trim()).filter(Boolean) : [],
                    subject,
                    html: editorRef.current?.innerHTML || "",
                    attachments: processedAttachments // <--- Now serializable
                };

                await ActionService.saveDraft(payload);
                console.log("Draft saved successfully");
            } catch (e) {
                console.error("Failed to save draft:", e);
            }
        }
        onClose();
    };

    const handleExtraction = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsExtracting(true);
        try {
            // This now calls our deterministic backend route
            const emails = await ActionService.extractEmailsFromFile(file);

            if (emails && emails.length > 0) {
                // Combine with existing extracted list + remove duplicates
                setExtractedEmails(prev => [...new Set([...prev, ...emails])]);
                setIsMassMail(true);
                // toast.success(`Imported ${emails.length} emails`); // Optional: visual feedback
                console.log(`[📂] Imported ${emails.length} addresses.`);
            } else {
                alert("No email addresses found in this file.");
            }
        } catch (error) {
            console.error("Extraction failed:", error);
            alert("Failed to read file.");
        } finally {
            setIsExtracting(false);
            e.target.value = ''; // Reset input so you can upload the same file again if needed
        }
    };

    // --- Handlers ---
    const executeCommand = (command, value = null) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
    };

    const insertLink = () => {
        if (linkUrl) {
            executeCommand('createLink', linkUrl);
            setLinkUrl("");
            setShowLinkInput(false);
        }
    };

    const handleAttachmentClick = () => fileInputRef.current?.click();

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setAttachments(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    const removeAttachment = (index) => setAttachments(prev => prev.filter((_, i) => i !== index));

    const handleSendClick = async () => {
        if ((!to && !isMassMail) || !subject) return;
        setIsSending(true);

        // helper to convert file to base64
        const toBase64 = file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve({
                filename: file.name,
                content: reader.result.split(',')[1],
                encoding: 'base64'
            });
            reader.onerror = error => reject(error);
        });

        try {
            const processedAttachments = await Promise.all(
                attachments.map(f => (f instanceof File ? toBase64(f) : f)) // Handle existing vs new files
            );

            const htmlContent = editorRef.current.innerHTML;

            if (isMassMail) {
                if (extractedEmails.length === 0) return;
                const manualRecipients = to ? to.split(',').map(e => e.trim()).filter(Boolean) : [];
                const finalRecipients = [...new Set([...manualRecipients, ...extractedEmails])];

                await ActionService.sendMassMail({
                    recipients: finalRecipients,
                    subject,
                    html: htmlContent,
                    attachments: processedAttachments
                });
            } else {
                const emailPayload = {
                    to: to.split(',').map(e => e.trim()).filter(e => e),
                    cc: cc ? cc.split(',').map(e => e.trim()).filter(e => e) : [],
                    bcc: bcc ? bcc.split(',').map(e => e.trim()).filter(e => e) : [],
                    subject,
                    html: htmlContent,
                    attachments: processedAttachments
                };

                await onSend(emailPayload);
            }

            onClose();
        } catch (error) {
            console.error("Send failed", error);
            setIsSending(false);
        }
    };

    const handleAiDraft = async () => {
        if (!aiPrompt.trim()) return;
        setIsGenerating(true);
        try {
            const res = await ActionService.draft({
                prompt: aiPrompt,
                context: initialData.subject ? `Replying to: ${initialData.subject}` : "",
                auto_send: false
            });

            if (res.to?.length > 0 && !to) setTo(res.to.join(', '));
            if (res.cc?.length > 0 && !cc) { setCc(res.cc.join(', ')); setShowCcBcc(true); }
            if (res.bcc?.length > 0 && !bcc) { setBcc(res.bcc.join(', ')); setShowCcBcc(true); }
            if (res.subject && !subject) setSubject(res.subject);
            if (res.body) {
                const newHtml = (editorRef.current.innerHTML + (editorRef.current.innerHTML ? "<br/><br/>" : "") + res.body);
                editorRef.current.innerHTML = newHtml;
            }
            setShowAiPrompt(false); setAiPrompt("");
        } catch (error) { console.error("AI Draft failed", error); } finally { setIsGenerating(false); }
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSendClick();
            if (e.key === 'Escape') handleClose(); // Save on Esc
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [to, cc, bcc, subject]);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
            <div className="bg-[#141416] w-full max-w-4xl rounded-xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col h-[80vh] animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/30">
                    <span className="text-sm font-semibold text-zinc-300">New Message</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowCcBcc(!showCcBcc)}
                            className={`text-xs px-2 py-1 rounded transition-colors ${showCcBcc ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Cc/Bcc
                        </button>
                        <button onClick={handleClose} className="text-zinc-500 hover:text-white transition-colors active:scale-90 rounded-full p-1 hover:bg-zinc-800">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* AI Prompt Input */}
                {showAiPrompt && (
                    <div className="bg-indigo-900/20 border-b border-indigo-500/30 p-3 flex gap-2 animate-in slide-in-from-top-2">
                        <Wand2 size={18} className="text-indigo-400 mt-2" />
                        <div className="flex-1">
                            <input
                                type="text"
                                className="w-full bg-transparent border-none outline-none text-indigo-100 placeholder:text-indigo-400/50 text-sm"
                                placeholder="Ask AI to write this email..."
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAiDraft()}
                                autoFocus
                            />
                        </div>
                        {isGenerating && <Loader2 size={18} className="animate-spin text-indigo-400" />}
                    </div>
                )}

                {/* Form Fields */}
                <div className="flex flex-col flex-1 p-6 space-y-4 overflow-y-auto">
                    <div className="border-b border-zinc-800 pb-2 focus-within:border-zinc-600 transition-colors">
                        <div className="flex items-center gap-2">
                            <RecipientInput
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder={isMassMail ? "Additional Recipients (comma separated)" : "To"}
                                suggestions={suggestions}
                                autoFocus={!initialData.to}
                                className="flex-1"
                            />

                            <input
                                type="file"
                                ref={massMailInputRef}
                                className="hidden"
                                onChange={handleExtraction}
                                accept=".pdf,.docx,.txt,.csv,.jpg,.png"
                            />
                            <button
                                onClick={() => massMailInputRef.current?.click()}
                                disabled={isExtracting}
                                className="flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[10px] uppercase font-bold tracking-tight transition-all flex-shrink-0"
                                title="Upload a document to extract emails"
                            >
                                {isExtracting ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                                {isMassMail ? "Add List" : "Import List"}
                            </button>
                        </div>

                        {isMassMail && extractedEmails.length > 0 && (
                            <div className="mt-2 animate-in fade-in slide-in-from-top-1">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                                        Extracted Recipients ({extractedEmails.length})
                                    </span>
                                    <button
                                        onClick={() => { setIsMassMail(false); setExtractedEmails([]); }}
                                        className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
                                    >
                                        Clear List
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto no-scrollbar p-2 bg-zinc-900/50 rounded-lg border border-zinc-800">
                                    {extractedEmails.map(email => (
                                        <div key={email} className="bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded text-[11px] flex items-center gap-1.5">
                                            {email}
                                            <button
                                                onClick={() => setExtractedEmails(prev => prev.filter(e => e !== email))}
                                                className="hover:text-white"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {showCcBcc && (
                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 fade-in">
                            <div className="border-b border-zinc-800 pb-2 focus-within:border-zinc-600 transition-colors">
                                <RecipientInput
                                    value={cc}
                                    onChange={(e) => setCc(e.target.value)}
                                    placeholder="Cc"
                                    suggestions={suggestions}
                                />
                            </div>
                            <div className="border-b border-zinc-800 pb-2 focus-within:border-zinc-600 transition-colors">
                                <RecipientInput
                                    value={bcc}
                                    onChange={(e) => setBcc(e.target.value)}
                                    placeholder="Bcc"
                                    suggestions={suggestions}
                                />
                            </div>
                        </div>
                    )}

                    <div className="border-b border-zinc-800 pb-2 focus-within:border-zinc-600 transition-colors">
                        <input type="text" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full bg-transparent outline-none text-zinc-200 placeholder:text-zinc-600 font-medium" />
                    </div>

                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {attachments.map((file, i) => (
                                <div key={i} className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1 rounded text-xs text-zinc-300 border border-zinc-700">
                                    <span className="truncate max-w-37.5">
                                        {file.name || file.filename || "Attachment"}
                                    </span>
                                    <button onClick={() => removeAttachment(i)} className="hover:text-white"><X size={12} /></button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex-1 flex flex-col bg-zinc-900/10 rounded-lg border border-zinc-800/50 focus-within:border-zinc-700 transition-colors overflow-hidden">
                        <div className="flex items-center gap-1 p-2 border-b border-zinc-800/50 bg-zinc-900/30 overflow-x-auto no-scrollbar">
                            {!showLinkInput ? (
                                <>
                                    <ToolbarBtn icon={Bold} onClick={() => executeCommand('bold')} label="Bold" />
                                    <ToolbarBtn icon={Italic} onClick={() => executeCommand('italic')} label="Italic" />
                                    <ToolbarBtn icon={Underline} onClick={() => executeCommand('underline')} label="Underline" />
                                    <ToolbarBtn icon={Strikethrough} onClick={() => executeCommand('strikethrough')} label="Strike" />
                                    <div className="w-px h-4 bg-zinc-800 mx-1 flex-shrink-0"></div>
                                    <ToolbarBtn icon={List} onClick={() => executeCommand('insertUnorderedList')} label="List" />
                                    <div className="w-px h-4 bg-zinc-800 mx-1 flex-shrink-0"></div>
                                    <ToolbarBtn icon={AlignLeft} onClick={() => executeCommand('justifyLeft')} label="Align Left" />
                                    <ToolbarBtn icon={AlignCenter} onClick={() => executeCommand('justifyCenter')} label="Align Center" />
                                    <ToolbarBtn icon={AlignRight} onClick={() => executeCommand('justifyRight')} label="Align Right" />
                                    <div className="w-px h-4 bg-zinc-800 mx-1 flex-shrink-0"></div>
                                    <ToolbarBtn icon={LinkIcon} onClick={() => setShowLinkInput(true)} label="Link" />
                                </>
                            ) : (
                                <div className="flex items-center gap-2 w-full animate-in fade-in slide-in-from-left-2">
                                    <LinkIcon size={14} className="text-zinc-500 ml-2" />
                                    <input
                                        type="text"
                                        placeholder="Paste URL..."
                                        className="flex-1 bg-transparent border-none outline-none text-xs text-zinc-200"
                                        value={linkUrl}
                                        onChange={(e) => setLinkUrl(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && insertLink()}
                                        autoFocus
                                    />
                                    <button onClick={insertLink} className="p-1 hover:bg-zinc-700 rounded text-green-400"><Check size={14} /></button>
                                    <button onClick={() => setShowLinkInput(false)} className="p-1 hover:bg-zinc-700 rounded text-red-400"><X size={14} /></button>
                                </div>
                            )}
                        </div>
                        <div
                            ref={editorRef}
                            contentEditable
                            className="flex-1 p-4 outline-none text-zinc-300 overflow-y-auto no-scrollbar prose prose-invert max-w-none prose-p:my-1 prose-ul:my-1"
                            style={{ minHeight: '200px' }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex justify-between items-center">
                    <div className="flex gap-2">
                        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                        <button onClick={handleAttachmentClick} className="p-2 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white transition-colors active:scale-90" title="Attach File"><Paperclip size={18} /></button>
                        <button onClick={() => setShowAiPrompt(!showAiPrompt)} className={`p-2 rounded transition-colors active:scale-90 ${showAiPrompt ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`} title="AI Write"><Sparkles size={18} /></button>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-zinc-500 hidden sm:inline">Cmd + Enter to send</span>
                        <button onClick={handleSendClick} disabled={isSending || !to && extractedEmails.length === 0} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-md font-medium text-sm transition-all shadow-lg shadow-indigo-900/20 active:scale-95 hover:shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {isSending && <Loader2 size={16} className="animate-spin" />}
                            {isSending ? 'Sending...' : 'Send'}
                        </button>
                    </div>
                </div>
            </div>
            <datalist id="contacts-list">
                {suggestions.map((email) => (
                    <option key={email} value={email} />
                ))}
            </datalist>
        </div>
    );
}

const ToolbarBtn = ({ icon: Icon, onClick, label }) => (
    <button onMouseDown={(e) => { e.preventDefault(); onClick(); }} className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors" title={label}><Icon size={14} /></button>
);

const RecipientInput = ({ value, onChange, placeholder, suggestions = [], autoFocus, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const [cursorPosition, setCursorPosition] = useState(0);
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    // 1. Determine what the user is currently typing (the last segment after a comma)
    const getCurrentSearchTerm = (val) => {
        const parts = val.split(',');
        return parts[parts.length - 1].trim();
    };

    // 2. Filter suggestions based on that search term
    useEffect(() => {
        const term = getCurrentSearchTerm(value);
        if (term.length > 0 && isOpen) {
            const filtered = suggestions.filter(email =>
                email.toLowerCase().includes(term.toLowerCase()) &&
                !value.includes(email) // Exclude already added
            );
            setFilteredSuggestions(filtered);
            setActiveIndex(0);
        } else {
            setFilteredSuggestions([]);
        }
    }, [value, isOpen, suggestions]);

    // 3. Handle selecting an email
    const selectEmail = (email) => {
        const parts = value.split(',');
        parts.pop(); // Remove partial
        parts.push(email);
        const newValue = parts.join(', ') + ', ';
        onChange({ target: { value: newValue } });
        setIsOpen(false);
        inputRef.current?.focus();
    };

    // 4. Keyboard Navigation
    const handleKeyDown = (e) => {
        if (filteredSuggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 1) % filteredSuggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (isOpen && filteredSuggestions[activeIndex]) {
                e.preventDefault();
                selectEmail(filteredSuggestions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                    onChange(e);
                    setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setTimeout(() => setIsOpen(false), 200)} // Delay to allow click
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                autoFocus={autoFocus}
                className="w-full bg-transparent outline-none text-zinc-200 placeholder:text-zinc-600 text-sm"
                autoComplete="off"
            />

            {/* Custom Dropdown */}
            {isOpen && filteredSuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-[#141416] border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <div className="max-h-60 overflow-y-auto no-scrollbar py-1">
                        {filteredSuggestions.map((email, index) => (
                            <button
                                key={email}
                                onMouseDown={(e) => { e.preventDefault(); selectEmail(email); }}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${index === activeIndex
                                    ? 'bg-indigo-600/10 text-indigo-300'
                                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                                    }`}
                            >
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${index === activeIndex ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-500'
                                    }`}>
                                    {email[0].toUpperCase()}
                                </div>
                                {email}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};