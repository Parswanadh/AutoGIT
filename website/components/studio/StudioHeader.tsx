'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Key,
  Play,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Github,
  Zap,
  Layers,
  Layout,
  Radio,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { keyStore } from '@/lib/storage/keyStore';

interface StudioHeaderProps {
  currentMode: 'studio' | 'showcase';
  onModeChange: (mode: 'studio' | 'showcase') => void;
  onOpenKeyModal: () => void;
  isRunning?: boolean;
  onRunPipeline?: () => void;
  onResetPipeline?: () => void;
  topic?: string;
}

export default function StudioHeader({
  currentMode,
  onModeChange,
  onOpenKeyModal,
  isRunning = false,
  onRunPipeline,
  onResetPipeline,
  topic = '',
}: StudioHeaderProps) {
  const [hasORKey, setHasORKey] = useState(false);
  const [hasGHPat, setHasGHPat] = useState(false);

  useEffect(() => {
    checkKeys();
  }, []);

  const checkKeys = async () => {
    try {
      const or = await keyStore.hasOpenRouterKey();
      const gh = await keyStore.hasGitHubPat();
      setHasORKey(or);
      setHasGHPat(gh);
    } catch {
      // ignore
    }
  };

  return (
    <header className="w-full bg-[#030712]/95 backdrop-blur-md border-b border-cyan-500/20 px-4 py-2.5 z-40 sticky top-0">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding & Mode Switcher */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-orbitron font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
                Auto-GIT
              </span>
              <span className="ml-1.5 text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                Studio v2.0
              </span>
            </div>
          </div>

          {/* Dual-Mode Toggle Switcher */}
          <div className="bg-slate-900/90 p-1 rounded-xl border border-slate-800 flex items-center shadow-inner">
            <button
              onClick={() => onModeChange('studio')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                currentMode === 'studio'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              Studio Workspace
            </button>
            <button
              onClick={() => onModeChange('showcase')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                currentMode === 'showcase'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Showcase Presentation
            </button>
          </div>
        </div>

        {/* Right: Key Status, BYOK modal trigger, Run Pipeline & Reset */}
        <div className="flex items-center space-x-2.5">
          {/* OpenRouter Key Indicator */}
          <button
            onClick={onOpenKeyModal}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all ${
              hasORKey
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/40 animate-pulse'
            }`}
            title="OpenRouter Free-Tier Key Status"
          >
            {hasORKey ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="font-mono">{hasORKey ? 'OpenRouter :free' : 'Add OpenRouter Key'}</span>
          </button>

          {/* GitHub PAT Indicator */}
          <button
            onClick={onOpenKeyModal}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all ${
              hasGHPat
                ? 'bg-purple-950/40 border-purple-500/40 text-purple-300 hover:bg-purple-900/40'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="GitHub Personal Access Token Status"
          >
            <Github className="w-3.5 h-3.5" />
            <span className="font-mono">{hasGHPat ? 'GitHub Connected' : 'Connect PAT'}</span>
          </button>

          {/* BYOK Settings Trigger */}
          <button
            onClick={onOpenKeyModal}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors"
          >
            <Key className="w-3.5 h-3.5" />
            <span>BYOK Keys</span>
          </button>

          {/* Reset Workspace */}
          {onResetPipeline && (
            <button
              onClick={onResetPipeline}
              disabled={isRunning}
              className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40 transition-colors"
              title="Reset Pipeline & Workspace"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Run Pipeline Action Button */}
          {onRunPipeline && (
            <button
              onClick={onRunPipeline}
              disabled={isRunning || !hasORKey}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
                isRunning
                  ? 'bg-cyan-950 border border-cyan-500/40 text-cyan-300 cursor-wait'
                  : hasORKey
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 shadow-cyan-500/25'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              {isRunning ? (
                <>
                  <Radio className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Workflow</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
