'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Trash2,
  X,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  keyStore,
  maskKey,
  validateOpenRouterKey,
  validateGitHubPat,
  STORAGE_KEY_MODE,
  type ApiKeys,
} from '@/lib/storage/keyStore';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysUpdated?: () => void;
}

export default function ApiKeyModal({ isOpen, onClose, onKeysUpdated }: ApiKeyModalProps) {
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [storageMode, setStorageMode] = useState<'persistent' | 'session' | 'encrypted'>('persistent');

  const [showOpenRouter, setShowOpenRouter] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  // Validation States
  const [validatingOR, setValidatingOR] = useState(false);
  const [orResult, setOrResult] = useState<{ valid?: boolean; message?: string } | null>(null);

  const [validatingGH, setValidatingGH] = useState(false);
  const [ghResult, setGhResult] = useState<{ valid?: boolean; message?: string; username?: string; scopes?: string[] } | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadExistingKeys();
    }
  }, [isOpen]);

  const loadExistingKeys = async () => {
    try {
      const keys = await keyStore.getKeys();
      setOpenRouterKey(keys.openRouterKey || '');
      setGithubPat(keys.githubPat || '');

      if (typeof window !== 'undefined') {
        const mode = window.localStorage.getItem(STORAGE_KEY_MODE) as any;
        if (mode === 'session' || mode === 'encrypted' || mode === 'persistent') {
          setStorageMode(mode);
        }
      }
      setOrResult(null);
      setGhResult(null);
      setStatusNotice(null);
    } catch (err) {
      console.error('Failed to load keys', err);
    }
  };

  const handleTestOpenRouter = async () => {
    if (!openRouterKey.trim()) {
      setOrResult({ valid: false, message: 'Please enter an OpenRouter API key first' });
      return;
    }
    setValidatingOR(true);
    setOrResult(null);
    try {
      const res = await validateOpenRouterKey(openRouterKey);
      if (res.valid) {
        setOrResult({
          valid: true,
          message: res.limitInfo?.label
            ? `Active (${res.limitInfo.label})`
            : 'Key Verified & Free Tier Ready',
        });
      } else {
        setOrResult({
          valid: false,
          message: res.error || 'Invalid OpenRouter Key',
        });
      }
    } catch (err: any) {
      setOrResult({ valid: false, message: err.message || 'Validation failed' });
    } finally {
      setValidatingOR(false);
    }
  };

  const handleTestGitHub = async () => {
    if (!githubPat.trim()) {
      setGhResult({ valid: false, message: 'Please enter a GitHub Personal Access Token first' });
      return;
    }
    setValidatingGH(true);
    setGhResult(null);
    try {
      const res = await validateGitHubPat(githubPat);
      if (res.valid) {
        setGhResult({
          valid: true,
          username: res.username,
          scopes: res.scopes,
          message: `Connected as @${res.username || 'user'} (${(res.scopes || []).join(', ') || 'contents:write'})`,
        });
      } else {
        setGhResult({
          valid: false,
          message: res.error || 'Invalid GitHub PAT',
        });
      }
    } catch (err: any) {
      setGhResult({ valid: false, message: err.message || 'Validation failed' });
    } finally {
      setValidatingGH(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusNotice(null);
    try {
      if (storageMode === 'encrypted') {
        if (!passphrase.trim()) {
          setStatusNotice('Please provide a master encryption PIN/passphrase.');
          setSaving(false);
          return;
        }
        await keyStore.saveEncryptedKeys(
          { openRouterKey: openRouterKey.trim(), githubPat: githubPat.trim() },
          passphrase.trim()
        );
      } else {
        const isPersistent = storageMode === 'persistent';
        await keyStore.saveKeys(
          { openRouterKey: openRouterKey.trim(), githubPat: githubPat.trim() },
          isPersistent
        );
      }

      setStatusNotice('Keys saved securely in browser.');
      onKeysUpdated?.();
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      setStatusNotice(`Failed to save keys: ${err?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (confirm('Are you sure you want to clear all stored keys from this browser?')) {
      await keyStore.clearKeys();
      setOpenRouterKey('');
      setGithubPat('');
      setPassphrase('');
      setOrResult(null);
      setGhResult(null);
      setStatusNotice('All keys cleared from browser.');
      onKeysUpdated?.();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Dialog Card */}
          <motion.div
            className="relative w-full max-w-2xl bg-gradient-to-b from-[#0B0F19] to-[#030712] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 p-6 md:p-8 text-white z-10 overflow-hidden"
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
          >
            {/* Top Glowing Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-purple-500" />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-orbitron font-bold text-white flex items-center gap-2">
                    BYOK Key Management
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-400 font-mono">
                      Client-Only
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Keys are stored 100% locally in your browser with zero server exfiltration.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Form */}
            <div className="mt-6 space-y-5">
              {/* OpenRouter API Key Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" />
                    OpenRouter API Key
                  </label>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
                  >
                    Get Free Key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="relative flex items-center">
                  <input
                    type={showOpenRouter ? 'text' : 'password'}
                    value={openRouterKey}
                    onChange={(e) => {
                      setOpenRouterKey(e.target.value);
                      setOrResult(null);
                    }}
                    placeholder="sk-or-v1-••••••••••••••••"
                    className="w-full pl-3 pr-24 py-2.5 bg-slate-950/70 border border-slate-700/70 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors font-mono"
                  />
                  <div className="absolute right-2 flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setShowOpenRouter(!showOpenRouter)}
                      className="p-1.5 text-slate-400 hover:text-cyan-300 rounded"
                    >
                      {showOpenRouter ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleTestOpenRouter}
                      disabled={validatingOR || !openRouterKey.trim()}
                      className="px-2 py-1 text-xs font-medium rounded bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      {validatingOR ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </button>
                  </div>
                </div>

                {orResult && (
                  <div
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border ${
                      orResult.valid
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {orResult.valid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span>{orResult.message}</span>
                  </div>
                )}
              </div>

              {/* GitHub PAT Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" />
                    GitHub Personal Access Token (PAT)
                  </label>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-purple-400 flex items-center gap-1 transition-colors"
                  >
                    Create Token (`repo` scope) <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="relative flex items-center">
                  <input
                    type={showGithub ? 'text' : 'password'}
                    value={githubPat}
                    onChange={(e) => {
                      setGithubPat(e.target.value);
                      setGhResult(null);
                    }}
                    placeholder="ghp_••••••••••••••••"
                    className="w-full pl-3 pr-24 py-2.5 bg-slate-950/70 border border-slate-700/70 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-400 transition-colors font-mono"
                  />
                  <div className="absolute right-2 flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setShowGithub(!showGithub)}
                      className="p-1.5 text-slate-400 hover:text-purple-300 rounded"
                    >
                      {showGithub ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleTestGitHub}
                      disabled={validatingGH || !githubPat.trim()}
                      className="px-2 py-1 text-xs font-medium rounded bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/40 text-purple-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      {validatingGH ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Test'
                      )}
                    </button>
                  </div>
                </div>

                {ghResult && (
                  <div
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border ${
                      ghResult.valid
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {ghResult.valid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span>{ghResult.message}</span>
                  </div>
                )}
              </div>

              {/* Storage Mode Selector */}
              <div className="pt-2 border-t border-slate-800/80">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-2">
                  Browser Storage Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStorageMode('persistent')}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                      storageMode === 'persistent'
                        ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3 text-cyan-400" /> Persistent
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Saved in localStorage</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStorageMode('session')}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                      storageMode === 'session'
                        ? 'bg-purple-950/40 border-purple-500/60 text-purple-200'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1">
                      <Unlock className="w-3 h-3 text-purple-400" /> Ephemeral
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Cleared on tab close</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStorageMode('encrypted')}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                      storageMode === 'encrypted'
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-400" /> AES Encrypted
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">AES-GCM Master PIN</div>
                  </button>
                </div>

                {storageMode === 'encrypted' && (
                  <div className="mt-3 space-y-1">
                    <label className="text-xs text-slate-400">Master Passphrase / PIN:</label>
                    <div className="relative flex items-center">
                      <input
                        type={showPassphrase ? 'text' : 'password'}
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Enter master PIN to encrypt keys"
                        className="w-full pl-3 pr-10 py-2 bg-slate-950/80 border border-emerald-500/40 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="absolute right-2 p-1 text-slate-400 hover:text-emerald-300"
                      >
                        {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Notice */}
              {statusNotice && (
                <div className="text-xs text-center text-cyan-300 bg-cyan-950/30 border border-cyan-500/30 py-1.5 px-3 rounded-lg">
                  {statusNotice}
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-900/50 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All Keys
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-cyan-300 hover:from-cyan-300 hover:to-cyan-200 rounded-lg shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all"
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  Save Configuration
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
