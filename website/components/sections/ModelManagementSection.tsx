'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const tiers = [
  {
    tier: 1,
    name: 'OpenRouter Free Meta-Router',
    models: ['openrouter/free (Auto Load-Balanced)', 'Dynamic Health Monitoring'],
    status: 'Zero Cost • Auto Model Selection ✓',
    color: '#10B981',
    desc: 'Universal free meta-routing across all active free models',
  },
  {
    tier: 2,
    name: 'Free Deep Reasoning Tier',
    models: ['deepseek/deepseek-r1:free', 'nvidia/nemotron-3-super-120b-a12b:free'],
    status: 'Zero Cost • Chain-of-Thought ✓',
    color: '#3B82F6',
    desc: 'Deep multi-perspective debate and strategic architectural critique',
  },
  {
    tier: 3,
    name: 'Free High-Performance Coding',
    models: ['qwen/qwen-2.5-coder-32b-instruct:free', 'minimax/minimax-m2.7:free'],
    status: 'Zero Cost • Multi-File Synthesis ✓',
    color: '#F59E0B',
    desc: 'Full-stack repository code generation and test scaffolding',
  },
  {
    tier: 4,
    name: 'Free Balanced Architecture',
    models: ['meta-llama/llama-3.3-70b-instruct:free', 'z-ai/glm-5.2:free'],
    status: 'Zero Cost • Long Context ✓',
    color: '#7C3AED',
    desc: 'Requirements extraction and problem formulation',
  },
  {
    tier: 5,
    name: 'Free Ultra-Fast Processing',
    models: ['inclusionai/ling-3.0-flash-fin:free', 'liquid/lfm-2.5-2.6b:free'],
    status: 'Zero Cost • Low Latency ✓',
    color: '#06B6D4',
    desc: 'Instant regex/AST normalization and token stream parsing',
  },
];

const profiles = [
  {
    name: 'fast',
    usage: 'Extraction, simple parsing',
    models: 'inclusionai/ling-3.0-flash-fin:free',
    why: 'Ultra-fast token streaming',
    icon: '⚡',
    color: '#F59E0B',
  },
  {
    name: 'balanced',
    usage: 'Problem extraction, debate',
    models: 'meta-llama/llama-3.3-70b-instruct:free',
    why: 'Reliable general synthesis',
    icon: '⚖️',
    color: '#3B82F6',
  },
  {
    name: 'powerful',
    usage: 'Code generation, review',
    models: 'qwen/qwen-2.5-coder-32b-instruct:free',
    why: 'Top-tier code generation',
    icon: '🚀',
    color: '#7C3AED',
  },
  {
    name: 'reasoning',
    usage: 'Critique, strategy, root-cause',
    models: 'deepseek/deepseek-r1:free',
    why: 'Explicit chain-of-thought',
    icon: '🧠',
    color: '#10B981',
  },
];

const smartFeatures = [
  {
    title: 'ModelHealthCache',
    desc: 'Decommissioned models (404/policy) blacklisted. Rate-limited models (429) receive exponential cooldowns.',
    icon: '💊',
  },
  {
    title: '100% Free Tier Guardrails',
    desc: 'Strict regex enforcement rejects any model not ending in :free or openrouter/free. $0 cost verified per call.',
    icon: '🛡️',
  },
  {
    title: 'Client-Side Cascading Failover',
    desc: 'Zero-downtime execution automatically transitions to healthy free backup models upon rate limits or outages.',
    icon: '🔄',
  },
  {
    title: 'Zero Local LLM Dependencies',
    desc: 'Runs purely in browser with BYOK keys. No local Ollama, no GPUs, and no Python backend server needed.',
    icon: '🌐',
  },
];

export default function ModelManagementSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-24 lg:py-32" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-orbitron font-bold text-3xl md:text-5xl mb-4 bg-gradient-to-r from-[#00D4FF] to-[#7C3AED] bg-clip-text text-transparent">
            27+ AI Models. Zero Cost. Intelligent Fallback.
          </h2>
          <p className="text-lg text-[rgba(248,250,252,0.7)] max-w-3xl mx-auto">
            Free AI models have rate limits, go offline, and vary wildly in quality.
            The solution: a 5-tier provider cascade — like load balancer failover for API endpoints.
          </p>
        </motion.div>

        {/* 5-Tier Cascade */}
        <div className="mb-16 space-y-3">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.tier}
              initial={{ opacity: 0, x: -40 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.12 }}
              className="relative bg-[rgba(3,7,18,0.8)] border rounded-xl p-5 hover-lift"
              style={{ borderColor: `${tier.color}30` }}
            >
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div
                  className="flex items-center gap-3 md:w-56 shrink-0"
                >
                  <span
                    className="font-orbitron font-bold text-xs px-2 py-1 rounded"
                    style={{ background: `${tier.color}25`, color: tier.color }}
                  >
                    TIER {tier.tier}
                  </span>
                  <span className="font-orbitron font-semibold text-white text-sm">
                    {tier.name}
                  </span>
                </div>
                <div className="flex-1 text-sm text-[rgba(248,250,252,0.6)]">
                  {tier.models.join(' · ')}
                </div>
                <div
                  className="text-xs font-mono px-3 py-1 rounded-full shrink-0"
                  style={{ background: `${tier.color}15`, color: tier.color }}
                >
                  {tier.desc}
                </div>
              </div>
              {/* Connector arrow */}
              {i < tiers.length - 1 && (
                <div className="absolute -bottom-3 left-8 text-[rgba(248,250,252,0.15)] text-lg z-10">
                  ↓
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Model Profiles */}
        <motion.h3
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="font-orbitron font-semibold text-xl text-center mb-8 text-white"
        >
          4 Free Model Routing Profiles
        </motion.h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          {profiles.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.9 + i * 0.1 }}
              className="bg-[rgba(3,7,18,0.8)] border border-[rgba(0,212,255,0.15)] rounded-xl p-4 text-center hover-glow"
            >
              <div className="text-2xl mb-2">{p.icon}</div>
              <div
                className="font-mono font-bold text-sm mb-1"
                style={{ color: p.color }}
              >
                {p.name}
              </div>
              <div className="text-xs text-[rgba(248,250,252,0.5)] mb-2">
                {p.usage}
              </div>
              <div className="text-xs text-[rgba(248,250,252,0.4)] font-mono">
                {p.models}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Smart Features */}
        <div className="grid md:grid-cols-2 gap-4">
          {smartFeatures.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 1.2 + i * 0.1 }}
              className="bg-[rgba(3,7,18,0.8)] border border-[rgba(0,212,255,0.12)] rounded-xl p-5 flex gap-4"
            >
              <span className="text-2xl">{f.icon}</span>
              <div>
                <h4 className="font-orbitron font-semibold text-[#00D4FF] text-sm mb-1">
                  {f.title}
                </h4>
                <p className="text-sm text-[rgba(248,250,252,0.6)]">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
