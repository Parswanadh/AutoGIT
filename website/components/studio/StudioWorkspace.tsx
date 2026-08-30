'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Layers,
  MessageSquareCode,
  Code2,
  FolderArchive,
  RefreshCw,
} from 'lucide-react';
import { keyStore } from '@/lib/storage/keyStore';
import { OpenRouterClient } from '@/lib/openrouter/client';
import { WorkflowEngine, WorkflowState } from '@/lib/workflow/engine';
import StudioHeader from '@/components/studio/StudioHeader';
import ApiKeyModal from '@/components/studio/ApiKeyModal';
import InputConfigPanel, { PRESET_TOPICS, PresetTopic } from '@/components/studio/InputConfigPanel';
import PipelineVisualizer from '@/components/studio/PipelineVisualizer';
import DebateStreamViewer from '@/components/studio/DebateStreamViewer';
import TerminalLogViewer from '@/components/studio/TerminalLogViewer';

interface StudioWorkspaceProps {
  currentMode: 'studio' | 'showcase';
  onModeChange: (mode: 'studio' | 'showcase') => void;
}

export default function StudioWorkspace({
  currentMode,
  onModeChange,
}: StudioWorkspaceProps) {
  const [topic, setTopic] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [hasORKey, setHasORKey] = useState(false);
  const [hasGHPat, setHasGHPat] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<'reasoning' | 'powerful' | 'balanced' | 'fast'>('balanced');
  const [maxRounds, setMaxRounds] = useState(2);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'debate' | 'terminal' | 'code'>('pipeline');
  const [selectedFile, setSelectedFile] = useState<string>('main.py');

  // Workflow State tracking
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    stage: 'idle',
    topicOrArxiv: '',
    currentRound: 0,
    maxRounds: 2,
    consensusScore: 0,
    debateTurns: [],
    generatedFiles: {},
    logs: [],
    activeModel: 'openrouter/free',
    status: 'idle',
    fixAttempts: 0,
    maxFixAttempts: 3,
  });

  const engineRef = useRef<WorkflowEngine | null>(null);

  const bindEngineEvents = React.useCallback((engine: WorkflowEngine) => {
    engine.on('state_change', (state: WorkflowState) => {
      setWorkflowState({ ...state });
      setSelectedFile((curr) => {
        const fileNames = Object.keys(state.generatedFiles);
        if (fileNames.length > 0 && !state.generatedFiles[curr]) {
          return fileNames[0];
        }
        return curr;
      });
    });
  }, []);

  const refreshKeyStatus = React.useCallback(async () => {
    try {
      const or = await keyStore.hasOpenRouterKey();
      const gh = await keyStore.hasGitHubPat();
      setHasORKey(or);
      setHasGHPat(gh);

      const keys = await keyStore.getKeys();
      if (keys.openRouterKey) {
        const client = new OpenRouterClient({ apiKey: keys.openRouterKey });
        engineRef.current = new WorkflowEngine({
          client,
          maxDebateRounds: maxRounds,
          consensusThreshold: 0.8,
        });
        bindEngineEvents(engineRef.current);
      }
    } catch {
      // ignore
    }
  }, [maxRounds, bindEngineEvents]);

  useEffect(() => {
    refreshKeyStatus();
  }, [refreshKeyStatus]);

  const handleSelectPreset = (preset: PresetTopic) => {
    setSelectedPreset(preset.title);
    setTopic(`${preset.title} (arXiv:${preset.arxiv})`);
  };

  const handleLaunch = async () => {
    if (!topic.trim()) return;

    try {
      const keys = await keyStore.getKeys();
      const client = new OpenRouterClient({ apiKey: keys.openRouterKey || '' });
      const engine = new WorkflowEngine({
        client,
        maxDebateRounds: maxRounds,
        consensusThreshold: 0.8,
      });
      engineRef.current = engine;
      bindEngineEvents(engine);

      // Auto-switch to pipeline or debate tab on launch
      setActiveTab('pipeline');
      await engine.execute(topic);
    } catch (err) {
      console.error('[StudioWorkspace] Launch error:', err);
    }
  };

  const handlePauseResume = () => {
    if (!engineRef.current) return;
    if (workflowState.status === 'paused') {
      engineRef.current.resume();
    } else {
      engineRef.current.pause();
    }
  };

  const handleCancel = () => {
    if (engineRef.current) {
      engineRef.current.cancel();
    }
  };

  const isRunning = workflowState.status === 'running' || workflowState.status === 'paused';
  const isPaused = workflowState.status === 'paused';
  const generatedFileNames = Object.keys(workflowState.generatedFiles);

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
        {/* BYOK Banner if No Keys */}
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
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-md shadow-cyan-500/20 shrink-0 transition-all font-orbitron"
            >
              Configure API Keys
            </button>
          </motion.div>
        )}

        {/* Studio Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Research Ingestion & Config Panel */}
          <div className="lg:col-span-5 space-y-6">
            <InputConfigPanel
              topic={topic}
              onTopicChange={(t) => {
                setTopic(t);
                setSelectedPreset(null);
              }}
              selectedPreset={selectedPreset}
              onSelectPreset={handleSelectPreset}
              selectedProfile={selectedProfile}
              onSelectProfile={setSelectedProfile}
              maxRounds={maxRounds}
              onMaxRoundsChange={setMaxRounds}
              isRunning={isRunning}
              isPaused={isPaused}
              hasOpenRouterKey={hasORKey}
              onLaunch={handleLaunch}
              onPauseResume={handlePauseResume}
              onCancel={handleCancel}
              onOpenKeyModal={() => setIsKeyModalOpen(true)}
            />
          </div>

          {/* Right Column: Execution Workspace (DAG, Debate, Console, Code) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Tab Navigation Header */}
            <div className="flex items-center justify-between bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800">
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setActiveTab('pipeline')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === 'pipeline'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Pipeline DAG</span>
                </button>

                <button
                  onClick={() => setActiveTab('debate')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === 'debate'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquareCode className="w-3.5 h-3.5" />
                  <span>Debate Panel</span>
                  {workflowState.debateTurns.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-purple-950 text-[10px] text-purple-300 border border-purple-500/30">
                      {workflowState.debateTurns.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('terminal')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === 'terminal'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Streaming Logs</span>
                  {workflowState.logs.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-950 text-[10px] text-emerald-300 border border-emerald-500/30">
                      {workflowState.logs.length}
                    </span>
                  )}
                </button>

                {generatedFileNames.length > 0 && (
                  <button
                    onClick={() => setActiveTab('code')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      activeTab === 'code'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Files ({generatedFileNames.length})</span>
                  </button>
                )}
              </div>

              {/* Status Indicator */}
              <div className="pr-2 text-[11px] font-mono flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRunning ? 'bg-cyan-400 animate-ping' : workflowState.status === 'completed' ? 'bg-emerald-400' : 'bg-slate-600'
                  }`}
                />
                <span className="text-slate-400 uppercase text-[10px] font-bold">
                  {workflowState.status}
                </span>
              </div>
            </div>

            {/* Active Tab View Body */}
            <div>
              {activeTab === 'pipeline' && (
                <PipelineVisualizer
                  currentStage={workflowState.stage}
                  status={workflowState.status}
                  errorMessage={workflowState.errorMessage}
                  onSelectStage={(stage) => {
                    if (stage === 'multi_agent_debate' || stage === 'consensus_check') {
                      setActiveTab('debate');
                    } else if (stage === 'code_generation' && generatedFileNames.length > 0) {
                      setActiveTab('code');
                    }
                  }}
                />
              )}

              {activeTab === 'debate' && (
                <DebateStreamViewer
                  debateTurns={workflowState.debateTurns}
                  consensusScore={workflowState.consensusScore}
                  currentRound={workflowState.currentRound}
                  maxRounds={workflowState.maxRounds}
                  isStreaming={isRunning}
                />
              )}

              {activeTab === 'terminal' && (
                <TerminalLogViewer
                  logs={workflowState.logs}
                  isStreaming={isRunning}
                  onClearLogs={() => {
                    setWorkflowState((prev) => ({ ...prev, logs: [] }));
                  }}
                />
              )}

              {activeTab === 'code' && (
                <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center space-x-2">
                      <FileCode className="w-4 h-4 text-blue-400" />
                      <h4 className="text-xs font-orbitron font-semibold text-white">
                        Synthesized Repository Files
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {generatedFileNames.length} Files Generated
                    </span>
                  </div>

                  {/* File Tabs */}
                  <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {generatedFileNames.map((fileName) => (
                      <button
                        key={fileName}
                        onClick={() => setSelectedFile(fileName)}
                        className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors ${
                          selectedFile === fileName
                            ? 'bg-blue-950/80 text-blue-300 border border-blue-500/40'
                            : 'bg-slate-950/40 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {fileName}
                      </button>
                    ))}
                  </div>

                  {/* File Code Display */}
                  {workflowState.generatedFiles[selectedFile] ? (
                    <div className="rounded-xl bg-[#020617] border border-slate-800 p-4 max-h-[380px] overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre scrollbar-thin scrollbar-thumb-slate-800">
                      {workflowState.generatedFiles[selectedFile].content}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No file selected or files are currently generating...
                    </div>
                  )}
                </div>
              )}
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
