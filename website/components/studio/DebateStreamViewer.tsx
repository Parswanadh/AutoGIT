'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquareCode,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Award,
  Layers,
  Filter,
} from 'lucide-react';
import { DebateTurn } from '@/lib/workflow/engine';
import { PERSONAS } from '@/lib/workflow/prompts';

interface DebateStreamViewerProps {
  debateTurns: DebateTurn[];
  consensusScore: number;
  currentRound: number;
  maxRounds: number;
  isStreaming?: boolean;
}

export default function DebateStreamViewer({
  debateTurns,
  consensusScore,
  currentRound,
  maxRounds,
  isStreaming,
}: DebateStreamViewerProps) {
  const [expandedThoughts, setExpandedThoughts] = useState<Record<number, boolean>>({});
  const [selectedPersonaFilter, setSelectedPersonaFilter] = useState<string>('all');
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<number | 'all'>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new turns if near bottom
  useEffect(() => {
    if (containerRef.current && isStreaming) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [debateTurns, isStreaming]);

  const toggleThought = (index: number) => {
    setExpandedThoughts((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const filteredTurns = debateTurns.filter((turn) => {
    if (selectedPersonaFilter !== 'all' && turn.agent !== selectedPersonaFilter) {
      return false;
    }
    if (selectedRoundFilter !== 'all' && turn.round !== selectedRoundFilter) {
      return false;
    }
    return true;
  });

  const availableRounds = Array.from(new Set(debateTurns.map((t) => t.round)));

  return (
    <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4 flex flex-col h-[520px]">
      {/* Header with Consensus Meter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center space-x-2 text-purple-400">
          <MessageSquareCode className="w-5 h-5" />
          <div>
            <h3 className="text-sm font-orbitron font-semibold text-white">
              Multi-Agent Expert Debate Panel
            </h3>
            <p className="text-[11px] text-slate-400">
              6 domain personas deliberating architecture, algorithms & performance
            </p>
          </div>
        </div>

        {/* Consensus Score Gauge */}
        <div className="flex items-center space-x-4 bg-slate-950/80 p-2 px-3 rounded-xl border border-slate-800">
          <div>
            <div className="flex items-center justify-between text-[11px] gap-3">
              <span className="text-slate-400">Consensus Convergence:</span>
              <span className="font-mono font-bold text-purple-400">
                {(consensusScore * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-32 bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800 mt-1">
              <motion.div
                className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(consensusScore * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="text-right border-l border-slate-800 pl-3">
            <span className="text-[10px] text-slate-500 block uppercase">Round</span>
            <span className="text-xs font-mono font-bold text-slate-200">
              {currentRound > 0 ? `${currentRound} / ${maxRounds}` : 'Ready'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center space-x-1.5 overflow-x-auto py-1 scrollbar-none">
          <button
            onClick={() => setSelectedPersonaFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors ${
              selectedPersonaFilter === 'all'
                ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
                : 'bg-slate-950/40 hover:bg-slate-950 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Personas
          </button>
          {Object.values(PERSONAS).map((persona) => (
            <button
              key={persona.id}
              onClick={() => setSelectedPersonaFilter(persona.name)}
              className={`px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-colors ${
                selectedPersonaFilter === persona.name
                  ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
                  : 'bg-slate-950/40 hover:bg-slate-950 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>{persona.avatar} </span>
              <span>{persona.name}</span>
            </button>
          ))}
        </div>

        {availableRounds.length > 1 && (
          <div className="flex items-center space-x-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedRoundFilter}
              onChange={(e) =>
                setSelectedRoundFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="bg-slate-950 border border-slate-800 rounded-lg text-[11px] p-1 text-slate-300 focus:outline-none focus:border-purple-400"
            >
              <option value="all">All Rounds</option>
              {availableRounds.map((r) => (
                <option key={r} value={r}>
                  Round {r}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Turns Feed Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 scrollbar-thin scrollbar-thumb-slate-800"
      >
        {filteredTurns.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-slate-500">
            <BrainCircuit className="w-10 h-10 text-slate-700 stroke-1" />
            <div>
              <p className="text-xs font-semibold text-slate-400">Debate Panel Standby</p>
              <p className="text-[11px] text-slate-600 max-w-sm mt-1">
                When you launch the pipeline, 6 specialized domain agents will engage in multi-round peer critique and consensus synthesis.
              </p>
            </div>
          </div>
        ) : (
          filteredTurns.map((turn, index) => {
            const isThoughtOpen = Boolean(expandedThoughts[index]);
            const personaConfig = Object.values(PERSONAS).find((p) => p.name === turn.agent);
            const avatar = turn.avatar || personaConfig?.avatar || '🤖';
            const color = turn.color || personaConfig?.color || '#a855f7';

            return (
              <motion.div
                key={`${turn.agent}-${turn.round}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-2.5 shadow-md shadow-slate-950/40"
              >
                {/* Turn Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shadow-inner"
                      style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}
                    >
                      {avatar}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-100">{turn.agent}</span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-mono uppercase"
                          style={{
                            backgroundColor: `${color}15`,
                            color: color,
                            border: `1px solid ${color}30`,
                          }}
                        >
                          {turn.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {turn.feasibilityScore !== undefined && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                        Feasibility: <strong className="text-purple-400">{turn.feasibilityScore}/10</strong>
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-500/30 text-purple-300 font-mono">
                      Round {turn.round}
                    </span>
                  </div>
                </div>

                {/* Turn Message Body */}
                <div className="text-xs text-slate-300 leading-relaxed font-sans pl-9 whitespace-pre-wrap">
                  {turn.message}
                </div>

                {/* Collapsible <think> Reasoning Box */}
                {turn.reasoning && (
                  <div className="pl-9 pt-1">
                    <button
                      onClick={() => toggleThought(index)}
                      className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-mono transition-colors"
                    >
                      <BrainCircuit className="w-3 h-3" />
                      <span>{isThoughtOpen ? 'Hide Internal Chain-of-Thought' : 'Inspect Agent Reasoning (<think>)'}</span>
                      {isThoughtOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    <AnimatePresence>
                      {isThoughtOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 p-3 rounded-lg bg-purple-950/30 border border-purple-500/20 text-[11px] font-mono text-purple-200/80 leading-relaxed whitespace-pre-wrap"
                        >
                          {turn.reasoning}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
