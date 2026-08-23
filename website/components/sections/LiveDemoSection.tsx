'use client';

import { motion } from 'framer-motion';
import { Play, Sparkles } from 'lucide-react';
import LivePipeline from '@/components/bridge/LivePipeline';

// ponytail: replaced static demo with SSE bridge – live feed kept minimal
export default function LiveDemoSection() {
  return (
    <section className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm mb-6"
            whileHover={{ scale: 1.05 }}
          >
            <Sparkles className="w-4 h-4" />
            <span>Live Pipeline</span>
          </motion.div>

          <h2 className="font-orbitron font-bold text-4xl md:text-5xl mb-4 bg-gradient-to-r from-[#00D4FF] to-[#7C3AED] bg-clip-text text-transparent">
            Watch Auto-GIT in Action
          </h2>

          <p className="text-xl text-[rgba(248,250,252,0.7)] max-w-3xl mx-auto">
            Live SSE feed from <span className="font-mono text-cyan-400">localhost:8787/events</span> via{' '}
            <span className="font-mono text-purple-400">/api/events</span> — fallback to mock if bridge offline
          </p>
        </motion.div>

        <motion.div
          className="max-w-4xl mx-auto bg-[rgba(0,0,0,0.4)] border border-slate-800 rounded-xl p-6 backdrop-blur"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <span className="ml-4 text-slate-400 text-sm font-mono">live-pipeline — virtualized (100 cap)</span>
          </div>

          <LivePipeline />
        </motion.div>

        <motion.div
          className="text-center mt-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <motion.a
            href="https://github.com/Parswanadh/auto-git"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-xl text-white font-semibold text-lg shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            <Play className="w-5 h-5" fill="currentColor" />
            Try Auto-GIT Yourself
          </motion.a>

          <p className="mt-4 text-slate-400 text-sm">Open source · Free to use · No API keys required</p>
        </motion.div>
      </div>
    </section>
  );
}
