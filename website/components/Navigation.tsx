'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Layout, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import { keyStore } from '@/lib/storage/keyStore';

const navItems = [
  { name: 'Home', href: '#hero' },
  { name: 'Problem', href: '#problem' },
  { name: 'Pipeline', href: '#pipeline' },
  { name: 'Models', href: '#model-showcase' },
  { name: 'Architecture', href: '#architecture' },
  { name: 'Demo', href: '#demo' },
];

interface NavigationProps {
  mode?: 'studio' | 'showcase';
  onModeChange?: (mode: 'studio' | 'showcase') => void;
  onOpenKeyModal?: () => void;
}

export default function Navigation({
  mode = 'showcase',
  onModeChange,
  onOpenKeyModal,
}: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [hasKeys, setHasKeys] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const sections = navItems.map((item) => item.href.slice(1));
      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 100 && rect.bottom >= 100) {
            setActiveSection(section);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const checkKeys = async () => {
      try {
        const or = await keyStore.hasOpenRouterKey();
        setHasKeys(or);
      } catch {
        // ignore
      }
    };
    checkKeys();
  }, []);

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 bg-[rgba(3,7,18,0.92)] backdrop-blur-md border-b border-[rgba(0,212,255,0.15)]"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo with subtle glow on hover */}
          <div className="flex items-center space-x-3">
            <motion.div
              className="font-orbitron font-bold text-xl text-[#00D4FF] cursor-pointer"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
              onClick={() => onModeChange?.('showcase')}
            >
              Auto-GIT
            </motion.div>
            <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-500/30 text-cyan-400">
              BYOK Web Studio
            </span>
          </div>

          {/* Desktop nav with hover effects */}
          <div className="hidden lg:flex items-center space-x-6">
            {mode === 'showcase' &&
              navItems.map((item, index) => (
                <motion.a
                  key={item.name}
                  href={item.href}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ y: -2 }}
                  className={`text-sm font-medium transition-colors relative ${
                    activeSection === item.href.slice(1)
                      ? 'text-[#00D4FF]'
                      : 'text-[rgba(248,250,252,0.7)] hover:text-[#00D4FF]'
                  }`}
                  style={{
                    textShadow:
                      activeSection === item.href.slice(1)
                        ? '0 0 10px rgba(0, 212, 255, 0.5)'
                        : 'none',
                  }}
                >
                  {item.name}
                  {/* Active indicator */}
                  {activeSection === item.href.slice(1) && (
                    <motion.div
                      className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#00D4FF]"
                      layoutId="activeIndicator"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </motion.a>
              ))}
          </div>

          {/* Right Action Controls: Mode Switcher + BYOK Key Button */}
          <div className="hidden sm:flex items-center space-x-3">
            {/* Mode Switcher Pill */}
            {onModeChange && (
              <div className="bg-slate-900/90 p-1 rounded-xl border border-slate-800 flex items-center shadow-inner">
                <button
                  type="button"
                  onClick={() => onModeChange('studio')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    mode === 'studio'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layout className="w-3.5 h-3.5" />
                  Studio
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange('showcase')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    mode === 'showcase'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Showcase
                </button>
              </div>
            )}

            {/* BYOK Key Trigger */}
            {onOpenKeyModal && (
              <button
                type="button"
                onClick={onOpenKeyModal}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  hasKeys
                    ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 hover:border-cyan-400'
                    : 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/50 text-amber-300 hover:border-amber-400'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>{hasKeys ? 'BYOK Config' : 'Set API Keys'}</span>
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <motion.button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 rounded-lg text-[rgba(248,250,252,0.7)] hover:text-[#00D4FF]"
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </motion.button>
        </div>

        {/* Mobile menu with animation */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              className="lg:hidden py-4 space-y-3 border-t border-slate-800"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Mobile Mode Switcher */}
              {onModeChange && (
                <div className="grid grid-cols-2 gap-2 pb-2">
                  <button
                    onClick={() => {
                      onModeChange('studio');
                      setIsOpen(false);
                    }}
                    className={`p-2 rounded-lg text-xs font-semibold text-center ${
                      mode === 'studio'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-300'
                    }`}
                  >
                    Studio Workspace
                  </button>
                  <button
                    onClick={() => {
                      onModeChange('showcase');
                      setIsOpen(false);
                    }}
                    className={`p-2 rounded-lg text-xs font-semibold text-center ${
                      mode === 'showcase'
                        ? 'bg-purple-600 text-white font-bold'
                        : 'bg-slate-900 text-slate-300'
                    }`}
                  >
                    Showcase
                  </button>
                </div>
              )}

              {/* Mobile BYOK trigger */}
              {onOpenKeyModal && (
                <button
                  onClick={() => {
                    onOpenKeyModal();
                    setIsOpen(false);
                  }}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 flex items-center justify-center gap-2"
                >
                  <Key className="w-4 h-4" />
                  Manage API Keys & BYOK
                </button>
              )}

              {navItems.map((item, index) => (
                <motion.a
                  key={item.name}
                  href={item.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="block px-4 py-2 rounded-lg text-[rgba(248,250,252,0.7)] hover:text-[#00D4FF] hover:bg-[rgba(0,212,255,0.1)]"
                  onClick={() => setIsOpen(false)}
                  whileHover={{ x: 5 }}
                >
                  {item.name}
                </motion.a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
}
