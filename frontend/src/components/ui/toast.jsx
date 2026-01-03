"use client";
import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

// Simple Event Bus for triggering toasts from anywhere
export const toastEvent = {
    listeners: [],
    emit(message, type = 'success') {
        this.listeners.forEach(l => l(message, type));
    },
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }
};

export const toast = {
    success: (msg) => toastEvent.emit(msg, 'success'),
    error: (msg) => toastEvent.emit(msg, 'error'),
};

export function ToastContainer() {
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        return toastEvent.subscribe((message, type) => {
            const id = Date.now();
            setToasts(prev => [...prev, { id, message, type }]);

            // Auto dismiss
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 4000);
        });
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className={`
            pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border 
            animate-in slide-in-from-right-full duration-300
            ${t.type === 'success' ? 'bg-zinc-900 border-green-900/50 text-green-100' : 'bg-zinc-900 border-red-900/50 text-red-100'}
          `}
                >
                    {t.type === 'success' ? <CheckCircle size={18} className="text-green-500" /> : <XCircle size={18} className="text-red-500" />}
                    <p className="text-sm font-medium">{t.message}</p>
                    <button onClick={() => setToasts(prev => prev.filter(i => i.id !== t.id))} className="ml-2 hover:opacity-70">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}