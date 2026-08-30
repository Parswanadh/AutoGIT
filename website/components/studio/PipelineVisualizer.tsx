'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  GitBranch,
  BookOpen,
  Users,
  Search,
  MessageSquareCode,
  CheckCheck,
  Award,
  Layers,
  Code,
  ShieldAlert,
  TestTube,
  Sparkles,
  Wrench,
  Terminal,
  Activity,
  Target,
  FolderArchive,
  Rocket,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { WorkflowStage } from '@/lib/workflow/engine';

export interface StageNodeDef {
  id: WorkflowStage;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  description: string;
  group: 'discovery' | 'debate' | 'codegen' | 'validation' | 'publish';
}

export const WORKFLOW_STAGES: StageNodeDef[] = [
  {
    id: 'research_discovery',
    label: 'arXiv Research Discovery',
    shortLabel: 'Research',
    icon: BookOpen,
    description: 'Fetch and parse arXiv Atom XML metadata & abstract',
    group: 'discovery',
  },
  {
    id: 'perspectives_generation',
    label: 'Perspectives Synthesis',
    shortLabel: 'Perspectives',
    icon: Users,
    description: 'Generate multi-domain persona questions',
    group: 'discovery',
  },
  {
    id: 'problem_extraction',
    label: 'Problem Extraction',
    shortLabel: 'Problem',
    icon: Search,
    description: 'Formulate core domain challenges & requirements',
    group: 'discovery',
  },
  {
    id: 'multi_agent_debate',
    label: '6-Persona Multi-Agent Debate',
    shortLabel: 'Debate',
    icon: MessageSquareCode,
    description: 'Turn-by-turn debate across 6 specialized personas',
    group: 'debate',
  },
  {
    id: 'consensus_check',
    label: 'Consensus Meter & Scoring',
    shortLabel: 'Consensus',
    icon: CheckCheck,
    description: 'Evaluate agreement convergence threshold',
    group: 'debate',
  },
  {
    id: 'solution_selection',
    label: 'Solution Selection',
    shortLabel: 'Selection',
    icon: Award,
    description: 'Synthesize optimal winning architecture',
    group: 'debate',
  },
  {
    id: 'architect_specification',
    label: 'Architect Spec Blueprint',
    shortLabel: 'Architect',
    icon: Layers,
    description: 'Generate file tree, class signatures & data flow',
    group: 'codegen',
  },
  {
    id: 'code_generation',
    label: 'Autonomous Code Synthesis',
    shortLabel: 'Code Gen',
    icon: Code,
    description: 'Generate runnable Python files with zero stubs',
    group: 'codegen',
  },
  {
    id: 'code_review',
    label: 'AST & Semantic Review',
    shortLabel: 'Review',
    icon: ShieldAlert,
    description: 'In-browser AST syntax and import verification',
    group: 'validation',
  },
  {
    id: 'code_testing',
    label: 'Unit Test Verification',
    shortLabel: 'Unit Tests',
    icon: TestTube,
    description: 'Verify pytest suites and edge cases',
    group: 'validation',
  },
  {
    id: 'feature_verification',
    label: 'Feature Coverage Check',
    shortLabel: 'Features',
    icon: Sparkles,
    description: 'Check runtime feature adherence vs requirements',
    group: 'validation',
  },
  {
    id: 'self_healing_fix',
    label: 'Self-Healing Reflection',
    shortLabel: 'Self-Heal',
    icon: Wrench,
    description: 'Iterative strategy reasoner & auto-repair loop',
    group: 'validation',
  },
  {
    id: 'smoke_test',
    label: 'Standalone Smoke Test',
    shortLabel: 'Smoke Test',
    icon: Terminal,
    description: 'Verify main.py entry point execution structure',
    group: 'validation',
  },
  {
    id: 'pipeline_self_eval',
    label: 'Pipeline Self-Evaluation',
    shortLabel: 'Self-Eval',
    icon: Activity,
    description: 'Holistic modularity, completeness and quality score',
    group: 'validation',
  },
  {
    id: 'goal_achievement_eval',
    label: 'Goal Achievement Check',
    shortLabel: 'Goal Eval',
    icon: Target,
    description: 'Validate 100% of user research goals satisfied',
    group: 'validation',
  },
  {
    id: 'scaffolding',
    label: 'Repository Scaffolding',
    shortLabel: 'Scaffold',
    icon: FolderArchive,
    description: 'Scaffold README.md, requirements.txt & LICENSE',
    group: 'publish',
  },
  {
    id: 'ready_to_publish',
    label: 'Ready for GitHub Publishing',
    shortLabel: 'Publish Ready',
    icon: Rocket,
    description: 'Atomic Git Data API commit & JSZip export ready',
    group: 'publish',
  },
];

interface PipelineVisualizerProps {
  currentStage: WorkflowStage;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
  onSelectStage?: (stage: WorkflowStage) => void;
}

export default function PipelineVisualizer({
  currentStage,
  status,
  errorMessage,
  onSelectStage,
}: PipelineVisualizerProps) {
  const currentStageIndex = WORKFLOW_STAGES.findIndex((s) => s.id === currentStage);

  const getNodeState = (stageId: WorkflowStage, index: number) => {
    if (status === 'error' && stageId === currentStage) return 'error';
    if (status === 'completed') return 'complete';
    if (status === 'idle') return 'pending';

    if (index < currentStageIndex) return 'complete';
    if (index === currentStageIndex) return 'running';
    return 'pending';
  };

  const calculateProgress = () => {
    if (status === 'completed') return 100;
    if (status === 'idle' || currentStageIndex === -1) return 0;
    return Math.round(((currentStageIndex + 1) / WORKFLOW_STAGES.length) * 100);
  };

  const progressPct = calculateProgress();

  return (
    <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-5">
      {/* Header & Progress Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 text-cyan-400">
          <GitBranch className="w-5 h-5" />
          <div>
            <h3 className="text-sm font-orbitron font-semibold text-white">
              Autonomous 15-Stage Workflow Pipeline
            </h3>
            <p className="text-[11px] text-slate-400">
              Real-time state machine execution with self-healing feedback loops
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-cyan-400">{progressPct}%</span>
            <span className="text-[10px] text-slate-500 block">Progress</span>
          </div>
          <div className="w-24 bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <motion.div
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>

      {/* Error Banner if Pipeline Error */}
      {status === 'error' && errorMessage && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-start space-x-2.5 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Pipeline Execution Failed: </span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* DAG Stepper Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {WORKFLOW_STAGES.map((stage, index) => {
          const nodeState = getNodeState(stage.id, index);
          const Icon = stage.icon;

          let cardStyle = 'bg-slate-950/40 border-slate-800/80 text-slate-500';
          let iconStyle = 'bg-slate-900 text-slate-500';
          let badgeText = 'Pending';
          let badgeStyle = 'bg-slate-900 text-slate-600';

          if (nodeState === 'running') {
            cardStyle =
              'bg-gradient-to-b from-cyan-950/60 to-slate-900 border-cyan-500/80 text-cyan-200 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/50';
            iconStyle = 'bg-cyan-500/20 text-cyan-300';
            badgeText = 'Running';
            badgeStyle = 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 animate-pulse';
          } else if (nodeState === 'complete') {
            cardStyle = 'bg-slate-950/80 border-emerald-500/40 text-slate-200';
            iconStyle = 'bg-emerald-500/20 text-emerald-400';
            badgeText = 'Done';
            badgeStyle = 'bg-emerald-950 text-emerald-400 border border-emerald-500/30';
          } else if (nodeState === 'error') {
            cardStyle = 'bg-rose-950/40 border-rose-500/80 text-rose-200 shadow-lg shadow-rose-950/40';
            iconStyle = 'bg-rose-500/20 text-rose-400';
            badgeText = 'Error';
            badgeStyle = 'bg-rose-950 text-rose-400 border border-rose-500/40';
          }

          return (
            <motion.div
              key={stage.id}
              whileHover={{ scale: 1.02 }}
              onClick={() => onSelectStage?.(stage.id)}
              className={`p-3 rounded-xl border flex flex-col justify-between transition-all cursor-pointer select-none ${cardStyle}`}
            >
              <div className="flex items-start justify-between gap-1.5 mb-2">
                <div className={`p-1.5 rounded-lg ${iconStyle}`}>
                  {nodeState === 'running' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : nodeState === 'complete' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${badgeStyle}`}>
                  {badgeText}
                </span>
              </div>

              <div>
                <div className="text-xs font-semibold truncate text-slate-200">{stage.shortLabel}</div>
                <div className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-tight">
                  {stage.description}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
