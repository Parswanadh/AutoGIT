'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  FileCode,
  FileText,
  FileSpreadsheet,
  FolderGit2,
  Plus,
  Trash2,
  Copy,
  Check,
  Download,
  GitBranch,
  FolderArchive,
  Eye,
  Edit3,
  Search,
  Code2,
  SplitSquareVertical,
  ExternalLink,
} from 'lucide-react';
import { WorkflowFile } from '@/lib/workflow/engine';

// Dynamically import Monaco Editor to prevent SSR hydration issues
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full min-h-[350px] bg-[#020617] text-slate-500 font-mono text-xs">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading Monaco Editor...</span>
        </div>
      </div>
    ),
  }
);

export interface CodeWorkspaceProps {
  files: Record<string, WorkflowFile>;
  selectedFile: string;
  onSelectFile: (fileName: string) => void;
  onUpdateFile?: (fileName: string, newContent: string) => void;
  onCreateFile?: (fileName: string, initialContent?: string) => void;
  onDeleteFile?: (fileName: string) => void;
  onPublishToGitHub?: () => void;
  onExportZip?: () => void;
  onOpenDiff?: () => void;
  readOnly?: boolean;
  hasGitHubPat?: boolean;
}

export default function CodeWorkspace({
  files,
  selectedFile,
  onSelectFile,
  onUpdateFile,
  onCreateFile,
  onDeleteFile,
  onPublishToGitHub,
  onExportZip,
  onOpenDiff,
  readOnly = false,
  hasGitHubPat = false,
}: CodeWorkspaceProps) {
  const [copied, setCopied] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditable, setIsEditable] = useState(!readOnly);

  const fileEntries = useMemo(() => Object.entries(files), [files]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return fileEntries;
    return fileEntries.filter(([name]) =>
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [fileEntries, searchQuery]);

  const activeFileObj = files[selectedFile] || fileEntries[0]?.[1];
  const activeFileName = activeFileObj ? (activeFileObj.path || selectedFile) : '';

  const getLanguage = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py':
        return 'python';
      case 'md':
        return 'markdown';
      case 'json':
        return 'json';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'sh':
      case 'bash':
        return 'shell';
      case 'yml':
      case 'yaml':
        return 'yaml';
      default:
        return 'plaintext';
    }
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.py')) {
      return <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    }
    if (fileName.endsWith('.md')) {
      return <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    }
    if (fileName.endsWith('.json')) {
      return <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
    if (fileName === 'requirements.txt' || fileName === '.gitignore' || fileName === 'LICENSE') {
      return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    }
    return <Code2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  const handleCopyContent = async () => {
    if (!activeFileObj) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(activeFileObj.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // fallback
    }
  };

  const handleDownloadSingleFile = () => {
    if (!activeFileObj || typeof window === 'undefined') return;
    const blob = new Blob([activeFileObj.content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFileName || 'file.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    const cleanName = newFileName.trim().replace(/^\/+/, '');
    onCreateFile?.(cleanName, '# Created via AutoGIT Code Studio\n');
    onSelectFile(cleanName);
    setNewFileName('');
    setIsCreatingFile(false);
  };

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl overflow-hidden flex flex-col font-sans">
      {/* Studio Top Control Bar */}
      <div className="px-4 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <FolderGit2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-orbitron font-bold text-white flex items-center gap-2">
              <span>Synthesized Code Studio</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-500/30 text-[10px] font-mono">
                {fileEntries.length} files
              </span>
            </h3>
          </div>
        </div>

        {/* Global Studio Actions */}
        <div className="flex items-center space-x-2">
          {onOpenDiff && (
            <button
              onClick={onOpenDiff}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-purple-300 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/40 transition-colors flex items-center gap-1.5"
              title="Compare side-by-side with baseline"
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span>Diff View</span>
            </button>
          )}

          {onExportZip && (
            <button
              onClick={onExportZip}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 transition-colors flex items-center gap-1.5"
              title="Download full project .zip archive"
            >
              <FolderArchive className="w-3.5 h-3.5" />
              <span>Export ZIP</span>
            </button>
          )}

          {onPublishToGitHub && (
            <button
              onClick={onPublishToGitHub}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-blue-400 hover:from-cyan-300 hover:to-blue-300 shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5 font-orbitron"
              title="Publish repository to GitHub via PAT"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Publish to GitHub</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Body: Left Sidebar File Tree + Right Monaco Editor */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[460px]">
        {/* Left Sidebar: File Explorer */}
        <div className="md:col-span-4 lg:col-span-3 bg-slate-950/40 border-r border-slate-800/80 p-3 flex flex-col space-y-3">
          {/* File search & New File trigger */}
          <div className="flex items-center space-x-1.5">
            <div className="relative flex-1">
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60"
              />
            </div>
            {onCreateFile && (
              <button
                onClick={() => setIsCreatingFile(!isCreatingFile)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                title="Create New File"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* New File Inline Form */}
          {isCreatingFile && (
            <form onSubmit={handleCreateSubmit} className="p-2 rounded-lg bg-slate-900/90 border border-cyan-500/40 space-y-2">
              <input
                type="text"
                placeholder="filename.py"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                autoFocus
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 font-mono"
              />
              <div className="flex items-center justify-end space-x-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingFile(false)}
                  className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2 py-0.5 text-[10px] bg-cyan-500 text-slate-950 font-semibold rounded"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          {/* File Tree List */}
          <div className="flex-1 overflow-y-auto space-y-1 max-h-[380px] scrollbar-thin scrollbar-thumb-slate-800">
            {filteredFiles.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No matching files found
              </div>
            ) : (
              filteredFiles.map(([name, fileObj]) => {
                const isSelected = activeFileName === name;
                const lineCount = (fileObj.content || '').split('\n').length;

                return (
                  <div
                    key={name}
                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-200 border border-blue-500/40 font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                    }`}
                    onClick={() => onSelectFile(name)}
                  >
                    <div className="flex items-center space-x-2 min-w-0 truncate">
                      {getFileIcon(name)}
                      <span className="truncate font-mono text-[11px]">{name}</span>
                    </div>

                    <div className="flex items-center space-x-1.5 opacity-60 group-hover:opacity-100">
                      <span className="text-[10px] font-mono text-slate-500">
                        {lineCount}L
                      </span>
                      {onDeleteFile && fileEntries.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete ${name}?`)) {
                              onDeleteFile(name);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-400 transition-opacity"
                          title="Delete File"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Monaco Editor & Tabs */}
        <div className="md:col-span-8 lg:col-span-9 flex flex-col bg-[#020617]">
          {/* File Tabs Bar */}
          <div className="flex items-center justify-between bg-slate-950 border-b border-slate-800/80 px-2 overflow-x-auto scrollbar-none">
            <div className="flex items-center space-x-1 py-1.5 overflow-x-auto">
              {fileEntries.map(([name]) => {
                const isSelected = activeFileName === name;
                return (
                  <button
                    key={name}
                    onClick={() => onSelectFile(name)}
                    className={`px-3 py-1 rounded-md text-xs font-mono flex items-center space-x-1.5 transition-all shrink-0 ${
                      isSelected
                        ? 'bg-slate-900 text-cyan-300 border border-slate-700 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                    }`}
                  >
                    {getFileIcon(name)}
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>

            {/* Active File Actions */}
            {activeFileObj && (
              <div className="flex items-center space-x-1.5 py-1 pl-2">
                <button
                  onClick={() => setIsEditable(!isEditable)}
                  className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-colors ${
                    isEditable
                      ? 'text-cyan-400 bg-cyan-950/60 border border-cyan-500/40'
                      : 'text-slate-500 bg-slate-900 border border-slate-800'
                  }`}
                  title={isEditable ? 'Switch to Read-only' : 'Switch to Edit mode'}
                >
                  {isEditable ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{isEditable ? 'Edit' : 'View'}</span>
                </button>

                <button
                  onClick={handleCopyContent}
                  className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-mono flex items-center gap-1 transition-colors"
                  title="Copy File Content"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadSingleFile}
                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                  title="Download this file"
                >
                  <Download className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Monaco Editor Container */}
          <div className="flex-1 min-h-[380px] relative">
            {activeFileObj ? (
              <div className="h-full min-h-[380px]">
                {/* Fallback for test / SSR environments */}
                {typeof window === 'undefined' ? (
                  <textarea
                    value={activeFileObj.content}
                    readOnly={!isEditable}
                    onChange={(e) => onUpdateFile?.(activeFileName, e.target.value)}
                    className="w-full h-full min-h-[380px] p-4 bg-[#020617] font-mono text-xs text-slate-300 border-none outline-none resize-none"
                  />
                ) : (
                  <MonacoEditor
                    height="390px"
                    theme="vs-dark"
                    language={getLanguage(activeFileName)}
                    value={activeFileObj.content}
                    options={{
                      readOnly: !isEditable,
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                      smoothScrolling: true,
                      automaticLayout: true,
                      tabSize: 4,
                      renderWhitespace: 'selection',
                      fontFamily: "'Fira Code', 'Courier New', monospace",
                    }}
                    onChange={(value) => {
                      if (onUpdateFile && value !== undefined) {
                        onUpdateFile(activeFileName, value);
                      }
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[380px] text-slate-500 font-mono text-xs">
                No files available. Launch a workflow to synthesize research code.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
