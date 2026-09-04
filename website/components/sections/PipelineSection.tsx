'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

const pipelineNodes = [
  { id: 'requirements_extraction', name: '1. Requirements' },
  { id: 'research', name: '2. arXiv Research' },
  { id: 'generate_perspectives', name: '3. Perspectives' },
  { id: 'problem_extraction', name: '4. Problem' },
  { id: 'solution_generation', name: '5. Solutions' },
  { id: 'critique', name: '6. Debate Panel' },
  { id: 'consensus_check', name: '7. Consensus' },
  { id: 'solution_selection', name: '8. Selection' },
  { id: 'architect_spec', name: '9. Architect Spec' },
  { id: 'code_generation', name: '10. Code Gen' },
  { id: 'code_review_agent', name: '11. AST Review' },
  { id: 'code_testing', name: '12. Unit Tests' },
  { id: 'feature_verification', name: '13. Features' },
  { id: 'strategy_reasoner', name: '14. Strategy' },
  { id: 'code_fixing', name: '15. Self-Healing' },
  { id: 'smoke_test', name: '16. Smoke Test' },
  { id: 'pipeline_self_eval', name: '17. Self-Eval' },
  { id: 'goal_achievement_eval', name: '18. Goal Eval' },
  { id: 'git_publishing', name: '19. Git Publish' },
];

export default function PipelineSection() {
  const [activeNode, setActiveNode] = useState(-1);

  const play = () => {
    setActiveNode(0);
    for (let i = 1; i < pipelineNodes.length; i++) {
      setTimeout(() => setActiveNode(i), i * 200);
    }
  };

  return (
    <section className="relative py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Title with fade-in */}
        <motion.h2
          className="font-orbitron font-bold text-4xl md:text-5xl mb-4 bg-gradient-to-r from-[#00D4FF] to-[#7C3AED] bg-clip-text text-transparent text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
        >
          19-Node LangGraph Architecture
        </motion.h2>

        {/* Enhanced play button with hover effects */}
        <motion.button
          onClick={play}
          className="mx-auto block px-8 py-4 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#7C3AED] text-white font-semibold mb-8 relative overflow-hidden group"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.2 }}
          style={{
            boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3)'
          }}
        >
          <span className="relative z-10">Play 19-Node Pipeline</span>
          {/* Shine effect on hover */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-20"
            initial={{ x: '-100%' }}
            whileHover={{ x: '100%' }}
            transition={{ duration: 0.6 }}
          />
        </motion.button>

        {/* Pipeline nodes with staggered animations */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 justify-center">
          {pipelineNodes.map((node, i) => (
            <motion.div
              key={node.id}
              className={`p-4 rounded-xl border-2 text-center relative overflow-hidden ${activeNode >= i
                  ? 'border-[#00D4FF] bg-[rgba(0,212,255,0.1)]'
                  : 'border-[rgba(0,212,255,0.2)] bg-[rgba(3,7,18,0.8)]'
                }`}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileHover={{ scale: 1.05, y: -5 }}
              animate={activeNode === i ? {
                boxShadow: ['0 0 0px rgba(0, 212, 255, 0)', '0 0 30px rgba(0, 212, 255, 0.6)'],
                borderColor: ['#00D4FF', '#7C3AED', '#00D4FF']
              } : {}}
            >
              <motion.div
                className="font-orbitron font-semibold text-lg text-[#00D4FF] relative z-10"
                animate={activeNode === i ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {node.name}
              </motion.div>
              {/* Pulse effect when active */}
              {activeNode === i && (
                <motion.div
                  className="absolute inset-0 bg-[#00D4FF] opacity-20"
                  initial={{ scale: 0, opacity: 0.5 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
