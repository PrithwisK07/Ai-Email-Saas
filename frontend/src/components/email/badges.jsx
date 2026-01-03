import React from 'react';

export const Tag = ({ label, color }) => {
    const colors = {
        blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
        white: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
        emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        red: "bg-red-500/10 text-red-400 border-red-500/20",
        yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${colors[color] || colors.white}`}>
            {label}
        </span>
    );
};