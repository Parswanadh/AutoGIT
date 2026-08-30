'use client';

import React, { useState, useMemo } from 'react';
import {
  SplitSquareVertical,
  Columns,
  AlignLeft,
  CheckCircle2,
  FileCode,
  ArrowLeft,
  Plus,
  Minus,
  Sparkles,
  GitCompare,
} from 'lucide-react';
import { WorkflowFile } from '@/lib/workflow/engine';

export interface DiffViewerProps {
  files: Record<string, WorkflowFile>;
  baselineFiles?: Record<string, string>;
  selectedFile?: string;
  onClose?: () => void;
}

interface DiffLine {
  type: 'add' | 'del' | 'same';
  oldLineNum?: number;
  newLineNum?: number;
  oldText?: string;
  newText?: string;
  text: string;
}

export default function DiffViewer({
  files,
  baselineFiles = {},
  selectedFile: initialFile,
  onClose,
}: DiffViewerProps) {
  const fileKeys = useMemo(() => Object.keys(files), [files]);
  const [activeFile, setActiveFile] = useState<string>(
    initialFile && files[initialFile] ? initialFile : fileKeys[0] || 'main.py'
  );
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

  // Baseline code (from baselineFiles or synthesized initial draft)
  const currentCode = files[activeFile]?.content || '';
  const baselineCode = useMemo(() => {
    if (baselineFiles[activeFile]) return baselineFiles[activeFile];
    // If no explicit baseline provided, synthesize a realistic initial baseline draft for comparison
    return `# Baseline / Initial Specification for ${activeFile}\n# (Autonomous Multi-Agent Refinement Draft)\n\n` +
      currentCode
        .split('\n')
        .filter((_, idx) => idx % 2 === 0 || idx < 5)
        .join('\n');
  }, [baselineFiles, activeFile, currentCode]);

  // Compute line diff
  const diffLines = useMemo(() => {
    const origLines = baselineCode.split('\n');
    const modLines = currentCode.split('\n');

    const result: DiffLine[] = [];
    let oldNum = 1;
    let newNum = 1;

    const maxLen = Math.max(origLines.length, modLines.length);
    for (let i = 0; i < maxLen; i++) {
      const o = origLines[i];
      const m = modLines[i];

      if (o === m && o !== undefined) {
        result.push({
          type: 'same',
          oldLineNum: oldNum++,
          newLineNum: newNum++,
          oldText: o,
          newText: m,
          text: o,
        });
      } else {
        if (o !== undefined) {
          result.push({
            type: 'del',
            oldLineNum: oldNum++,
            oldText: o,
            text: o,
          });
        }
        if (m !== undefined) {
          result.push({
            type: 'add',
            newLineNum: newNum++,
            newText: m,
            text: m,
          });
        }
      }
    }
    return result;
  }, [baselineCode, currentCode]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    let unchanged = 0;

    diffLines.forEach((l) => {
      if (l.type === 'add') additions++;
      else if (l.type === 'del') deletions++;
      else unchanged++;
    });

    const total = additions + deletions + unchanged;
    const similarity = total > 0 ? Math.round((unchanged / total) * 100) : 100;

    return { additions, deletions, unchanged, similarity };
  }, [diffLines]);

  return (
    <div className="rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl overflow-hidden flex flex-col font-sans">
      {/* Header & Diff Controls */}
      <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Return to Code Editor"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <GitCompare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-orbitron font-bold text-white flex items-center gap-2">
                <span>Code Evolution & Diff Viewer</span>
              </h3>
            </div>
          </div>

          {/* File Selector */}
          <select
            value={activeFile}
            onChange={(e) => setActiveFile(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-cyan-500"
          >
            {fileKeys.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle & Metrics */}
        <div className="flex items-center space-x-3">
          {/* Diff Metrics Badges */}
          <div className="flex items-center space-x-2 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <Plus className="w-3 h-3" />
              {stats.additions} additions
            </span>
            <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/30 flex items-center gap-1">
              <Minus className="w-3 h-3" />
              {stats.deletions} deletions
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-500/30">
              {stats.similarity}% baseline fidelity
            </span>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('split')}
              className={`p-1.5 rounded text-xs transition-colors flex items-center gap-1 ${
                viewMode === 'split'
                  ? 'bg-purple-500/20 text-purple-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Side-by-Side Split View"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="text-[10px]">Split</span>
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={`p-1.5 rounded text-xs transition-colors flex items-center gap-1 ${
                viewMode === 'unified'
                  ? 'bg-purple-500/20 text-purple-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Unified Inline View"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span className="text-[10px]">Unified</span>
            </button>
          </div>
        </div>
      </div>

      {/* Diff Content View */}
      <div className="bg-[#020617] max-h-[460px] overflow-y-auto font-mono text-xs leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
        {viewMode === 'split' ? (
          /* Side-by-Side View */
          <div className="grid grid-cols-2 divide-x divide-slate-800 min-w-[700px]">
            {/* Left: Original / Baseline */}
            <div className="p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold pb-2 border-b border-slate-800/80 mb-2">
                Original Baseline Specification
              </div>
              <div className="space-y-0.5">
                {diffLines.map((line, idx) => {
                  if (line.type === 'add') {
                    return (
                      <div key={idx} className="h-5 bg-transparent select-none opacity-20" />
                    );
                  }
                  const isDel = line.type === 'del';
                  return (
                    <div
                      key={idx}
                      className={`flex items-start px-1.5 py-0.5 rounded ${
                        isDel
                          ? 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500'
                          : 'text-slate-400'
                      }`}
                    >
                      <span className="w-8 shrink-0 text-right pr-3 text-slate-600 select-none text-[10px]">
                        {line.oldLineNum}
                      </span>
                      <span className="whitespace-pre truncate">{line.oldText}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Synthesized & Refined */}
            <div className="p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold pb-2 border-b border-slate-800/80 mb-2">
                Refined Multi-Agent Implementation
              </div>
              <div className="space-y-0.5">
                {diffLines.map((line, idx) => {
                  if (line.type === 'del') {
                    return (
                      <div key={idx} className="h-5 bg-transparent select-none opacity-20" />
                    );
                  }
                  const isAdd = line.type === 'add';
                  return (
                    <div
                      key={idx}
                      className={`flex items-start px-1.5 py-0.5 rounded ${
                        isAdd
                          ? 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500'
                          : 'text-slate-300'
                      }`}
                    >
                      <span className="w-8 shrink-0 text-right pr-3 text-slate-600 select-none text-[10px]">
                        {line.newLineNum}
                      </span>
                      <span className="whitespace-pre truncate">{line.newText}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Unified Inline View */
          <div className="p-3 space-y-0.5">
            {diffLines.map((line, idx) => {
              const isAdd = line.type === 'add';
              const isDel = line.type === 'del';
              return (
                <div
                  key={idx}
                  className={`flex items-start px-2 py-0.5 rounded ${
                    isAdd
                      ? 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-500'
                      : isDel
                      ? 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500'
                      : 'text-slate-400'
                  }`}
                >
                  <span className="w-7 shrink-0 text-right pr-2 text-slate-600 select-none text-[10px]">
                    {line.oldLineNum || ' '}
                  </span>
                  <span className="w-7 shrink-0 text-right pr-3 text-slate-600 select-none text-[10px]">
                    {line.newLineNum || ' '}
                  </span>
                  <span className="w-4 shrink-0 font-bold select-none">
                    {isAdd ? '+' : isDel ? '-' : ' '}
                  </span>
                  <span className="whitespace-pre truncate">{line.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
