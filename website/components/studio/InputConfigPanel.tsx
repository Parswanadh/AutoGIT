'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Sparkles,
  Play,
  Square,
  Pause,
  Sliders,
  Cpu,
  Key,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export interface PresetTopic {
  title: string;
  arxiv: string;
  desc: string;
}

export const PRESET_TOPICS: PresetTopic[] = [
  {
    title: 'Self-Correction Agent with AST Validation',
    arxiv: '2305.18290',
    desc: 'Multi-turn self-healing Python code synthesizer with AST verification',
  },
  {
    title: 'Linear Attention & State-Space Mamba',
    arxiv: '2312.00752',
    desc: 'Selective state-space architecture implementation with fast PyTorch kernels',
  },
  {
    title: '4-bit NormalFloat Quantization Engine',
    arxiv: '2305.14314',
    desc: 'QLoRA custom dequantization routines with memory-efficient backprop',
  },
  {
    title: 'Graph Neural Network for Drug Discovery',
    arxiv: '2106.05234',
    desc: 'Message-passing molecular graph representation and property prediction',
  },
];

interface InputConfigPanelProps {
  topic: string;
  onTopicChange: (topic: string) => void;
  selectedPreset: string | null;
  onSelectPreset: (preset: PresetTopic) => void;
  selectedProfile: 'reasoning' | 'powerful' | 'balanced' | 'fast';
  onSelectProfile: (profile: 'reasoning' | 'powerful' | 'balanced' | 'fast') => void;
  maxRounds: number;
  onMaxRoundsChange: (rounds: number) => void;
  isRunning: boolean;
  isPaused: boolean;
  hasOpenRouterKey: boolean;
  onLaunch: () => void;
  onPauseResume: () => void;
  onCancel: () => void;
  onOpenKeyModal: () => void;
}

export default function InputConfigPanel({
  topic,
  onTopicChange,
  selectedPreset,
  onSelectPreset,
  selectedProfile,
  onSelectProfile,
  maxRounds,
  onMaxRoundsChange,
  isRunning,
  isPaused,
  hasOpenRouterKey,
  onLaunch,
  onPauseResume,
  onCancel,
  onOpenKeyModal,
}: InputConfigPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-5">
      {/* Research Ingestion Card */}
      <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-cyan-400">
            <BookOpen className="w-4 h-4" />
            <h3 className="text-sm font-orbitron font-semibold text-white">
              Research Topic / arXiv Ingestion
            </h3>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 font-mono">
            Pure Client-Side
          </span>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400 font-medium">
            Enter arXiv ID (e.g. 2310.06825), arXiv URL, or research topic:
          </label>
          <textarea
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            disabled={isRunning}
            placeholder="e.g. Diffusion-based Reinforcement Learning for Robotic Control (arXiv:2403.01234)..."
            rows={3}
            className="w-full p-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-sans transition-colors resize-none disabled:opacity-50"
          />
        </div>

        {/* Quick Presets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Curated Research Presets
            </label>
            <span className="text-[10px] text-slate-500">1-click launch</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_TOPICS.map((preset) => (
              <button
                key={preset.title}
                type="button"
                disabled={isRunning}
                onClick={() => onSelectPreset(preset)}
                className={`text-left p-2.5 rounded-xl border text-xs transition-all disabled:opacity-50 ${
                  selectedPreset === preset.title
                    ? 'bg-cyan-950/50 border-cyan-500/60 text-cyan-200 shadow-md shadow-cyan-950/40'
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-slate-200 truncate">{preset.title}</div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">arXiv:{preset.arxiv}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Model Routing Profile Picker */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-xs text-purple-400 font-medium">
              <Cpu className="w-3.5 h-3.5" />
              <span>Free-Tier Routing Profile</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
            >
              <Sliders className="w-3 h-3" />
              <span>{showAdvanced ? 'Simple' : 'Advanced'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'reasoning', label: 'Reasoning', desc: 'R1 / Nemotron' },
                { id: 'powerful', label: 'Powerful', desc: 'Qwen 32B' },
                { id: 'balanced', label: 'Balanced', desc: 'Gemini / Llama' },
                { id: 'fast', label: 'Fast', desc: 'Low-latency' },
              ] as const
            ).map((profile) => (
              <button
                key={profile.id}
                type="button"
                disabled={isRunning}
                onClick={() => onSelectProfile(profile.id)}
                className={`p-2 rounded-xl border text-center transition-all disabled:opacity-50 ${
                  selectedProfile === profile.id
                    ? 'bg-purple-950/60 border-purple-500/60 text-purple-200 shadow-sm shadow-purple-950/40'
                    : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">{profile.label}</div>
                <div className="text-[10px] text-slate-500">{profile.desc}</div>
              </button>
            ))}
          </div>

          {/* Advanced Sliders */}
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 pt-3 mt-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Max Multi-Agent Debate Rounds:</span>
                <span className="font-mono text-cyan-400 font-bold">{maxRounds}</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                value={maxRounds}
                onChange={(e) => onMaxRoundsChange(Number(e.target.value))}
                disabled={isRunning}
                className="w-full accent-cyan-400 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
              />
            </motion.div>
          )}
        </div>

        {/* Execution Control Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row gap-2">
          {!isRunning ? (
            <button
              type="button"
              onClick={hasOpenRouterKey ? onLaunch : onOpenKeyModal}
              disabled={!topic.trim()}
              className="flex-1 py-3 px-4 rounded-xl font-orbitron font-semibold text-xs tracking-wider flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {hasOpenRouterKey ? (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Launch Autonomous Pipeline</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>Add Key to Launch</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex-1 flex gap-2">
              <button
                type="button"
                onClick={onPauseResume}
                className="flex-1 py-2.5 px-3 rounded-xl font-orbitron font-semibold text-xs tracking-wider flex items-center justify-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all"
              >
                {isPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="py-2.5 px-4 rounded-xl font-orbitron font-semibold text-xs tracking-wider flex items-center justify-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
