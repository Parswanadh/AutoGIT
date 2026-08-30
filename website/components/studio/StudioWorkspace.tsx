'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Play,
  Key,
  ShieldCheck,
  Zap,
  Terminal,
  FileCode,
  GitBranch,
  BookOpen,
  Cpu,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { keyStore } from '@/lib/storage/keyStore';
import StudioHeader from '@/components/studio/StudioHeader';
import ApiKeyModal from '@/components/studio/ApiKeyModal';

interface StudioWorkspaceProps {
  currentMode: 'studio' | 'showcase';
  onModeChange: (mode: 'studio' | 'showcase') => void;
}

const PRESET_TOPICS = [
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

export default function StudioWorkspace({
  currentMode,
  onModeChange,
}: StudioWorkspaceProps) {
  const [topic, setTopic] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [hasORKey, setHasORKey] = useState(false);
  const [hasGHPat, setHasGHPat] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  useEffect(() => {
    refreshKeyStatus();
  }, []);

  const refreshKeyStatus = async () => {
    try {
      const or = await keyStore.hasOpenRouterKey();
      const gh = await keyStore.hasGitHubPat();
      setHasORKey(or);
      setHasGHPat(gh);
    } catch {
      // ignore
    }
  };

  const handleSelectPreset = (preset: typeof PRESET_TOPICS[0]) => {
    setSelectedPreset(preset.title);
    setTopic(`${preset.title} (arXiv:${preset.arxiv})`);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Studio Top Navigation Bar */}
      <StudioHeader
        currentMode={currentMode}
        onModeChange={onModeChange}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        topic={topic}
      />

      {/* Main Studio Body */}
      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 lg:p-8 space-y-6">
        {/* BYOK Warning Banner if No Keys */}
        {!hasORKey && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 to-purple-950/60 border border-cyan-500/40 shadow-lg shadow-cyan-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="flex items-start sm:items-center space-x-3">
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Bring Your Own Key (BYOK) — Zero Backend Architecture
                </h3>
                <p className="text-xs text-slate-400">
                  To execute live multi-agent debate and code generation, provide your OpenRouter API key.
                  AutoGIT strictly uses 100% free-tier models (`:free`) at zero cost.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-md shadow-cyan-500/20 shrink-0 transition-all"
            >
              Configure API Keys
            </button>
          </motion.div>
        )}

        {/* Studio Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Research Ingestion & Topic Config */}
          <div className="lg:col-span-5 space-y-6">
            {/* Input Card */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center space-x-2 text-cyan-400">
                <BookOpen className="w-4 h-4" />
                <h3 className="text-sm font-orbitron font-semibold text-white">
                  Research Topic / arXiv Ingestion
                </h3>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400">
                  Enter research paper topic, idea, or arXiv ID:
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Diffusion-based Reinforcement Learning for Robotic Control (arXiv:2403.01234)..."
                  rows={4}
                  className="w-full p-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-sans transition-colors resize-none"
                />
              </div>

              {/* Topic Presets */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Quick-Start Research Presets:
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {PRESET_TOPICS.map((preset) => (
                    <button
                      key={preset.title}
                      onClick={() => handleSelectPreset(preset)}
                      className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                        selectedPreset === preset.title
                          ? 'bg-cyan-950/50 border-cyan-500/60 text-cyan-200'
                          : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-slate-200">{preset.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Free-Tier Model Routing Info Card */}
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-3">
              <div className="flex items-center space-x-2 text-purple-400">
                <Cpu className="w-4 h-4" />
                <h3 className="text-sm font-orbitron font-semibold text-white">
                  Active Free-Tier Model Routing
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                AutoGIT automatically cascades and load-balances across OpenRouter free-tier models with 429 exponential backoff:
              </p>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-cyan-400 font-semibold">Qwen 2.5 Coder 32B :free</span>
                  <span className="text-[10px] text-slate-400">Code Synthesis</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-purple-400 font-semibold">Llama 3.3 70B Instruct :free</span>
                  <span className="text-[10px] text-slate-400">Debate & Architecture</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-emerald-400 font-semibold">Gemini 2.0 Flash :free</span>
                  <span className="text-[10px] text-slate-400">Paper Analysis</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-amber-400 font-semibold">DeepSeek R1 :free</span>
                  <span className="text-[10px] text-slate-400">Reasoning & Review</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Workflow Pipeline Preview & Workspace Stage */}
          <div className="lg:col-span-7 space-y-6">
            {/* Pipeline Stage Visualizer Preview */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/80 border border-cyan-500/20 shadow-xl space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-cyan-400">
                  <GitBranch className="w-5 h-5" />
                  <h3 className="text-base font-orbitron font-semibold text-white">
                    Autonomous 15-Stage Workflow Pipeline
                  </h3>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 font-mono">
                  State Machine Ready
                </span>
              </div>

              {/* Interactive Stage Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] text-cyan-400 font-bold">
                      1
                    </span>
                    Research Discovery
                  </div>
                  <p className="text-[11px] text-slate-400">
                    arXiv ingestion, Atom XML parsing, and dynamic expert generation.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] text-purple-400 font-bold">
                      2
                    </span>
                    Multi-Agent Debate
                  </div>
                  <p className="text-[11px] text-slate-400">
                    6 expert personas, cross-critique matrix, and consensus scoring.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-bold">
                      3
                    </span>
                    Code & GitHub Scaffolding
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Multi-file synthesis, AST validation, Git Data API commit, and .zip export.
                  </p>
                </div>
              </div>

              {/* Status Workspace Box */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <Terminal className="w-4 h-4" /> Live Execution Stream
                  </span>
                  <span className="text-[11px] text-emerald-400">Status: Client Runtime Initialized</span>
                </div>
                <div className="text-slate-400 space-y-1 text-[11px] py-1">
                  <p className="text-slate-500">
                    [system] AutoGIT Web Studio environment ready (Pure Client-Side BYOK mode).
                  </p>
                  <p className="text-slate-500">
                    [security] WebCrypto AES-GCM key store loaded. Zero server secrets.
                  </p>
                  {hasORKey ? (
                    <p className="text-emerald-400">
                      [auth] OpenRouter API key detected. Free-tier routing enabled.
                    </p>
                  ) : (
                    <p className="text-amber-400">
                      [auth] No OpenRouter API key configured. Click &apos;Configure API Keys&apos; to add one.
                    </p>
                  )}
                  {hasGHPat && (
                    <p className="text-purple-400">
                      [github] GitHub PAT loaded for direct browser repository publishing.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BYOK Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        onKeysUpdated={() => {
          refreshKeyStatus();
        }}
      />
    </div>
  );
}
