'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Search,
  Trash2,
  Copy,
  Check,
  ArrowDownCircle,
  Filter,
  ShieldCheck,
} from 'lucide-react';
import { WorkflowLog } from '@/lib/workflow/engine';

interface TerminalLogViewerProps {
  logs: WorkflowLog[];
  onClearLogs?: () => void;
  isStreaming?: boolean;
}

export default function TerminalLogViewer({
  logs,
  onClearLogs,
  isStreaming,
}: TerminalLogViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && consoleBottomRef.current && typeof consoleBottomRef.current.scrollIntoView === 'function') {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = async () => {
    const rawText = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.stage}] ${l.message}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (selectedLevel !== 'all' && log.level !== selectedLevel) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.stage.toLowerCase().includes(q) ||
        log.level.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="rounded-2xl bg-[#020617] border border-slate-800 shadow-2xl flex flex-col h-[400px] font-mono text-xs overflow-hidden">
      {/* Terminal Title Bar */}
      <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <div className="flex items-center space-x-1.5 pl-2 text-slate-400">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-semibold text-slate-200">
              AutoGIT Execution Stream (BYOK Client-Side)
            </span>
          </div>
        </div>

        {/* Console Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 px-2 rounded text-[10px] flex items-center gap-1 transition-colors ${
              autoScroll ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40' : 'bg-slate-900 text-slate-500'
            }`}
            title="Auto-scroll on new logs"
          >
            <ArrowDownCircle className="w-3 h-3" />
            <span>Autoscroll</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="p-1 px-2 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10px] flex items-center gap-1 transition-colors"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="p-1 px-1.5 rounded bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 text-[10px] transition-colors"
              title="Clear terminal logs"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filter / Search Strip */}
      <div className="bg-slate-950/90 px-4 py-2 border-b border-slate-800/60 flex items-center justify-between gap-3 text-[11px]">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter logs or stages..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center space-x-1">
          {(['all', 'info', 'warn', 'error', 'success'] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setSelectedLevel(lvl)}
              className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono transition-colors ${
                selectedLevel === lvl
                  ? 'bg-slate-800 text-cyan-300 border border-slate-700'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Scroll Area */}
      <div
        ref={containerRef}
        className="flex-1 p-4 overflow-y-auto space-y-1 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-800 bg-[#020617]"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 py-6 text-center select-none">
            [system] Ready. No log events recorded yet.
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            let color = 'text-slate-300';
            let badgeBg = 'bg-slate-800 text-slate-400';

            if (log.level === 'error') {
              color = 'text-rose-400';
              badgeBg = 'bg-rose-950/80 text-rose-300 border border-rose-500/40';
            } else if (log.level === 'warn') {
              color = 'text-amber-400';
              badgeBg = 'bg-amber-950/80 text-amber-300 border border-amber-500/40';
            } else if (log.level === 'success') {
              color = 'text-emerald-400';
              badgeBg = 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40';
            } else if (log.level === 'info') {
              color = 'text-cyan-200/90';
              badgeBg = 'bg-cyan-950/80 text-cyan-400 border border-cyan-500/30';
            }

            const timeStr = new Date(log.timestamp).toLocaleTimeString();

            return (
              <div key={`${log.timestamp}-${index}`} className="flex items-start space-x-2 py-0.5 hover:bg-slate-900/40 px-1 rounded">
                <span className="text-slate-600 select-none shrink-0 text-[10px]">{timeStr}</span>
                <span className={`px-1 rounded text-[9px] font-bold uppercase shrink-0 ${badgeBg}`}>
                  {log.level}
                </span>
                <span className="text-slate-500 shrink-0 text-[10px]">[{log.stage}]</span>
                <span className={`${color} break-all whitespace-pre-wrap flex-1`}>{log.message}</span>
              </div>
            );
          })
        )}
        <div ref={consoleBottomRef} />
      </div>
    </div>
  );
}
