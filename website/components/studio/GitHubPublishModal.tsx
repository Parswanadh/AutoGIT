'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  X,
  Lock,
  Globe,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Key,
  FolderGit2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { keyStore } from '@/lib/storage/keyStore';
import { gitHubPublisher, PublishResult, GitHubUserVerification } from '@/lib/github/publisher';
import { WorkflowFile } from '@/lib/workflow/engine';

export interface GitHubPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: Record<string, WorkflowFile>;
  topicOrArxiv?: string;
  paperTitle?: string;
  paperSummary?: string;
  onSuccess?: (result: PublishResult) => void;
}

export default function GitHubPublishModal({
  isOpen,
  onClose,
  files,
  topicOrArxiv,
  paperTitle,
  paperSummary,
  onSuccess,
}: GitHubPublishModalProps) {
  const [pat, setPat] = useState('');
  const [repoName, setRepoName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [commitMessage, setCommitMessage] = useState('feat: autonomous research implementation via AutoGIT');

  const [verification, setVerification] = useState<GitHubUserVerification | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'success' | 'error'>('idle');
  const [progressStep, setProgressStep] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copiedClone, setCopiedClone] = useState(false);

  // Initialize defaults on open
  useEffect(() => {
    if (isOpen) {
      // Form default repo name from title or topic
      const baseTitle = paperTitle || topicOrArxiv || 'autogit-research';
      const cleanSlug = baseTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

      const generatedName = `autogit-${cleanSlug || 'pipeline'}`;
      setRepoName(generatedName);
      setDescription(
        paperSummary
          ? `${paperSummary.slice(0, 160)}... Synthesized via AutoGIT Web Studio.`
          : `Autonomous reproduction of ${baseTitle} generated with AutoGIT Studio.`
      );

      // Load saved PAT
      keyStore.getKeys().then((keys) => {
        if (keys.githubPat) {
          setPat(keys.githubPat);
          verifyPat(keys.githubPat);
        } else {
          setVerification(null);
        }
      });

      setPublishStatus('idle');
      setPublishError(null);
      setProgressPercent(0);
      setProgressStep('');
    }
  }, [isOpen, paperTitle, topicOrArxiv, paperSummary]);

  const verifyPat = async (tokenToVerify: string) => {
    if (!tokenToVerify.trim()) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const result = await gitHubPublisher.verifyToken(tokenToVerify.trim());
      setVerification(result);
      // Save token if verified
      await keyStore.saveKeys({ githubPat: tokenToVerify.trim() }, true);
    } catch (err: any) {
      setVerification(null);
      setVerifyError(err.message || 'Failed to verify GitHub token.');
    } finally {
      setIsVerifying(false);
    }
  };

  const fileCount = useMemo(() => Object.keys(files).length, [files]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat.trim()) {
      setVerifyError('GitHub Personal Access Token is required to publish.');
      return;
    }
    if (!repoName.trim()) {
      setPublishError('Repository name is required.');
      return;
    }
    if (fileCount === 0) {
      setPublishError('No files found to publish in this repository.');
      return;
    }

    setPublishStatus('publishing');
    setPublishError(null);
    setProgressPercent(10);
    setProgressStep('Verifying credentials...');

    try {
      const result = await gitHubPublisher.createAndPushRepo(
        pat.trim(),
        {
          repoName: repoName.trim(),
          description: description.trim(),
          isPrivate,
          files,
          commitMessage: commitMessage.trim(),
        },
        (step, progress) => {
          setProgressStep(step);
          setProgressPercent(progress);
        }
      );

      setPublishResult(result);
      setPublishStatus('success');
      onSuccess?.(result);
    } catch (err: any) {
      setPublishStatus('error');
      setPublishError(err.message || 'An error occurred while publishing to GitHub.');
    }
  };

  const handleCopyClone = async () => {
    if (!publishResult) return;
    try {
      await navigator.clipboard.writeText(`git clone ${publishResult.cloneUrl}`);
      setCopiedClone(true);
      setTimeout(() => setCopiedClone(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-orbitron font-bold text-white">
                Publish Repository to GitHub
              </h3>
              <p className="text-xs text-slate-400">
                Direct browser Git Data API deployment via your Personal Access Token
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          {publishStatus === 'success' && publishResult ? (
            /* Success View */
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-base font-orbitron font-bold text-white">
                  Repository Published Successfully!
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Pushed {publishResult.publishedFilesCount} files to GitHub with commit SHA{' '}
                  <code className="text-cyan-400 font-mono">{publishResult.commitSha.slice(0, 7)}</code>
                </p>
              </div>

              {/* Repo Link Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Repository URL</span>
                  <a
                    href={publishResult.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono hover:underline"
                  >
                    <span>View on GitHub</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <code className="text-xs text-slate-200 font-mono truncate mr-2">
                    git clone {publishResult.cloneUrl}
                  </code>
                  <button
                    onClick={handleCopyClone}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
                    title="Copy Clone Command"
                  >
                    {copiedClone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Close
                </button>
                <a
                  href={publishResult.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 flex items-center gap-1.5 font-orbitron"
                >
                  <span>Open GitHub</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ) : (
            /* Publish Form & Progress */
            <form onSubmit={handlePublish} className="space-y-4">
              {/* GitHub PAT Configuration */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    <span>GitHub Personal Access Token (PAT)</span>
                  </label>
                  {verification && (
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      @{verification.username}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={pat}
                    onChange={(e) => setPat(e.target.value)}
                    onBlur={() => verifyPat(pat)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => verifyPat(pat)}
                    disabled={isVerifying || !pat.trim()}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 disabled:opacity-50 transition-colors"
                  >
                    {isVerifying ? 'Checking...' : 'Verify'}
                  </button>
                </div>

                {verifyError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{verifyError}</span>
                  </p>
                )}
              </div>

              {/* Repo Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Repository Name <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 focus-within:border-cyan-500">
                  <span className="text-xs text-slate-500 font-mono mr-1">
                    {verification?.username ? `${verification.username}/` : 'github.com/.../'}
                  </span>
                  <input
                    type="text"
                    required
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="autogit-project-name"
                    className="flex-1 bg-transparent text-xs text-slate-100 font-mono outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Autonomous research implementation..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              {/* Privacy Setting */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <div className="p-1.5 rounded-lg bg-slate-900 text-slate-300">
                    {isPrivate ? <Lock className="w-4 h-4 text-amber-400" /> : <Globe className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      {isPrivate ? 'Private Repository' : 'Public Repository (Recommended)'}
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      {isPrivate
                        ? 'Only you and authorized collaborators can view this repository.'
                        : 'Open science & reproducible research for everyone on GitHub.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPrivate(!isPrivate)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors ${
                    isPrivate
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  }`}
                >
                  {isPrivate ? 'Private' : 'Public'}
                </button>
              </div>

              {/* Commit Message */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Initial Commit Message
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Progress Stepper when Publishing */}
              {publishStatus === 'publishing' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-cyan-500/40 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-cyan-300 flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {progressStep}
                    </span>
                    <span className="text-cyan-400 font-bold">{progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {publishError && (
                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{publishError}</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 font-mono">
                  {fileCount} files staged
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={publishStatus === 'publishing'}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={publishStatus === 'publishing' || !pat.trim() || !repoName.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-blue-400 hover:from-cyan-300 hover:to-blue-300 disabled:opacity-50 shadow-md shadow-cyan-500/20 font-orbitron transition-all flex items-center gap-1.5"
                  >
                    {publishStatus === 'publishing' ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <>
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>Create & Push</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
