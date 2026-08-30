'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderArchive,
  X,
  Download,
  FileCode,
  FileText,
  CheckCircle2,
  Package,
  Layers,
  Sparkles,
  Check,
} from 'lucide-react';
import { zipExporter, ZipExportOptions } from '@/lib/export/zipExporter';
import { WorkflowFile } from '@/lib/workflow/engine';

export interface ZipExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: Record<string, WorkflowFile>;
  topicOrArxiv?: string;
  projectName?: string;
}

export default function ZipExportModal({
  isOpen,
  onClose,
  files,
  topicOrArxiv,
  projectName: initialProjectName,
}: ZipExportModalProps) {
  const [archiveName, setArchiveName] = useState('');
  const [includeScaffolding, setIncludeScaffolding] = useState(true);
  const [wrapInRootFolder, setWrapInRootFolder] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const baseName = initialProjectName || topicOrArxiv || 'autogit-research';
      const cleanSlug = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 35);
      setArchiveName(`autogit-${cleanSlug || 'repo'}`);
      setDownloadComplete(false);
      setIsExporting(false);
    }
  }, [isOpen, initialProjectName, topicOrArxiv]);

  const fileEntries = useMemo(() => Object.entries(files), [files]);

  const estimatedFiles = useMemo(() => {
    const list = [...fileEntries.map(([name, f]) => ({ name, size: (f.content || '').length }))];
    if (includeScaffolding) {
      if (!files['.gitignore']) list.push({ name: '.gitignore', size: 550 });
      if (!files['LICENSE'] && !files['LICENSE.txt']) list.push({ name: 'LICENSE', size: 1080 });
      if (!files['README.md'] && !files['readme.md']) list.push({ name: 'README.md', size: 850 });
      if (!files['requirements.txt']) list.push({ name: 'requirements.txt', size: 90 });
    }
    return list;
  }, [fileEntries, files, includeScaffolding]);

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archiveName.trim()) return;

    setIsExporting(true);
    try {
      const options: ZipExportOptions = {
        projectName: archiveName.trim(),
        files,
        includeStandardScaffolding: includeScaffolding,
        topicOrArxiv,
        rootFolder: wrapInRootFolder ? archiveName.trim() : false,
      };

      await zipExporter.downloadRepositoryZip(options, `${archiveName.trim()}.zip`);
      setDownloadComplete(true);
      setTimeout(() => {
        setDownloadComplete(false);
      }, 3000);
    } catch (err) {
      console.error('[ZipExportModal] Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-orbitron font-bold text-white">
                Export Repository Archive
              </h3>
              <p className="text-xs text-slate-400">
                Client-side JSZip packaging with standard reproduction scaffolding
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
        <form onSubmit={handleDownload} className="p-6 space-y-4">
          {/* Archive Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Archive File Name
            </label>
            <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 focus-within:border-emerald-500">
              <input
                type="text"
                required
                value={archiveName}
                onChange={(e) => setArchiveName(e.target.value)}
                placeholder="autogit-repository"
                className="flex-1 bg-transparent text-xs text-slate-100 font-mono outline-none"
              />
              <span className="text-xs text-slate-500 font-mono">.zip</span>
            </div>
          </div>

          {/* Options Toggles */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeScaffolding}
                onChange={(e) => setIncludeScaffolding(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/30"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Include standard project scaffolding
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Automatically adds .gitignore, MIT LICENSE, README.md, and requirements.txt
                </span>
              </div>
            </label>

            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={wrapInRootFolder}
                onChange={(e) => setWrapInRootFolder(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/30"
              />
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Wrap contents in a root directory
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Files unpack into <code className="text-emerald-400 font-mono">{archiveName}/</code>
                </span>
              </div>
            </label>
          </div>

          {/* Archive Manifest Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Archive Contents Preview</span>
              <span className="font-mono">{estimatedFiles.length} files</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 max-h-[160px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {estimatedFiles.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2 text-slate-300">
                    <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{wrapInRootFolder ? `${archiveName}/${item.name}` : item.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {Math.max(1, Math.round(item.size / 1024))} KB
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isExporting}
              className="px-5 py-2 rounded-lg text-xs font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 shadow-md shadow-emerald-500/20 font-orbitron transition-all flex items-center gap-1.5"
            >
              {downloadComplete ? (
                <>
                  <Check className="w-4 h-4 text-slate-950" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{isExporting ? 'Packaging...' : 'Download .ZIP'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
