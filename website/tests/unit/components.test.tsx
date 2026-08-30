import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ApiKeyModal from '@/components/studio/ApiKeyModal';
import StudioHeader from '@/components/studio/StudioHeader';
import Navigation from '@/components/Navigation';
import { keyStore } from '@/lib/storage/keyStore';

// Mock framer-motion animations to render clean HTML elements without DOM attribute warnings
vi.mock('framer-motion', () => {
  const filterProps = (props: any) => {
    const {
      whileHover,
      whileTap,
      layoutId,
      initial,
      animate,
      exit,
      transition,
      ...cleanProps
    } = props;
    return cleanProps;
  };

  return {
    motion: {
      div: ({ children, ...props }: any) => <div {...filterProps(props)}>{children}</div>,
      nav: ({ children, ...props }: any) => <nav {...filterProps(props)}>{children}</nav>,
      a: ({ children, ...props }: any) => <a {...filterProps(props)}>{children}</a>,
      button: ({ children, ...props }: any) => <button {...filterProps(props)}>{children}</button>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

describe('ApiKeyModal Component', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders correctly when open', async () => {
    await act(async () => {
      render(<ApiKeyModal isOpen={true} onClose={() => {}} />);
    });
    expect(screen.getByText(/BYOK Key Management/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/sk-or-v1-/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/ghp_/i)).toBeDefined();
    expect(screen.getByText(/Persistent/i)).toBeDefined();
    expect(screen.getByText(/Ephemeral/i)).toBeDefined();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<ApiKeyModal isOpen={false} onClose={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('saves keys to KeyStore when save is clicked', async () => {
    const onKeysUpdated = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      render(<ApiKeyModal isOpen={true} onClose={onClose} onKeysUpdated={onKeysUpdated} />);
    });

    const openRouterInput = screen.getByPlaceholderText(/sk-or-v1-/i);
    const githubInput = screen.getByPlaceholderText(/ghp_/i);

    await act(async () => {
      fireEvent.change(openRouterInput, { target: { value: 'sk-or-v1-my-sample-key' } });
      fireEvent.change(githubInput, { target: { value: 'ghp_my_sample_pat' } });
    });

    const saveButton = screen.getByText(/Save Configuration/i);
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(async () => {
      const keys = await keyStore.getKeys();
      expect(keys.openRouterKey).toBe('sk-or-v1-my-sample-key');
      expect(keys.githubPat).toBe('ghp_my_sample_pat');
      expect(onKeysUpdated).toHaveBeenCalled();
    });
  });
});

describe('StudioHeader Component', () => {
  it('renders studio mode and handles mode switching', async () => {
    const onModeChange = vi.fn();
    const onOpenKeyModal = vi.fn();

    await act(async () => {
      render(
        <StudioHeader
          currentMode="studio"
          onModeChange={onModeChange}
          onOpenKeyModal={onOpenKeyModal}
        />
      );
    });

    expect(screen.getByText(/Auto-GIT/i)).toBeDefined();
    expect(screen.getByText(/Studio Workspace/i)).toBeDefined();
    expect(screen.getByText(/Showcase Presentation/i)).toBeDefined();

    const showcaseBtn = screen.getByText(/Showcase Presentation/i);
    fireEvent.click(showcaseBtn);
    expect(onModeChange).toHaveBeenCalledWith('showcase');

    const keyBtn = screen.getByText(/BYOK Keys/i);
    fireEvent.click(keyBtn);
    expect(onOpenKeyModal).toHaveBeenCalled();
  });
});

describe('Navigation Component', () => {
  it('renders navigation links and mode toggle', async () => {
    const onModeChange = vi.fn();
    const onOpenKeyModal = vi.fn();

    await act(async () => {
      render(
        <Navigation
          mode="showcase"
          onModeChange={onModeChange}
          onOpenKeyModal={onOpenKeyModal}
        />
      );
    });

    expect(screen.getByText(/Auto-GIT/i)).toBeDefined();
    expect(screen.getByText(/Home/i)).toBeDefined();
    expect(screen.getByText(/Pipeline/i)).toBeDefined();

    const studioBtn = screen.getByText('Studio');
    fireEvent.click(studioBtn);
    expect(onModeChange).toHaveBeenCalledWith('studio');
  });
});
