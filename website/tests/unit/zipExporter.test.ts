import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import { ZipExporter, zipExporter, ZipExportOptions } from '@/lib/export/zipExporter';

describe('ZipExporter Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportRepositoryZip', () => {
    it('creates a valid zip blob containing all user files and default scaffolding', async () => {
      const options: ZipExportOptions = {
        projectName: 'mamba-state-space',
        topicOrArxiv: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces (2312.00752)',
        files: {
          'main.py': { path: 'main.py', content: 'print("Mamba Demo")', language: 'python' },
          'model.py': { path: 'model.py', content: 'class MambaModel: pass', language: 'python' },
          'pipeline.py': 'class Pipeline: pass',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/zip');
      expect(blob.size).toBeGreaterThan(100);

      // Verify unzipping and inspect files
      const zip = await JSZip.loadAsync(blob);
      const fileNames = Object.keys(zip.files);

      expect(fileNames).toContain('main.py');
      expect(fileNames).toContain('model.py');
      expect(fileNames).toContain('pipeline.py');
      expect(fileNames).toContain('.gitignore');
      expect(fileNames).toContain('LICENSE');
      expect(fileNames).toContain('README.md');
      expect(fileNames).toContain('requirements.txt');

      const mainContent = await zip.file('main.py')?.async('text');
      expect(mainContent).toBe('print("Mamba Demo")');

      const readmeContent = await zip.file('README.md')?.async('text');
      expect(readmeContent).toContain('mamba-state-space');
      expect(readmeContent).toContain('2312.00752');

      const gitignoreContent = await zip.file('.gitignore')?.async('text');
      expect(gitignoreContent).toContain('__pycache__/');
      expect(gitignoreContent).toContain('.venv');
    });

    it('preserves custom README and LICENSE when provided by user', async () => {
      const customReadme = '# Custom Title\nSpecial instructions\n';
      const customLicense = 'Custom Proprietary License 2026';

      const options: ZipExportOptions = {
        projectName: 'custom-project',
        files: {
          'README.md': customReadme,
          'LICENSE': customLicense,
          'app.py': 'print("hello")',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const zip = await JSZip.loadAsync(blob);

      const readme = await zip.file('README.md')?.async('text');
      expect(readme).toBe(customReadme);

      const license = await zip.file('LICENSE')?.async('text');
      expect(license).toBe(customLicense);
    });

    it('does not add scaffolding when includeStandardScaffolding is false', async () => {
      const options: ZipExportOptions = {
        projectName: 'minimal-pkg',
        includeStandardScaffolding: false,
        files: {
          'code.py': 'x = 42',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const zip = await JSZip.loadAsync(blob);
      const fileNames = Object.keys(zip.files);

      expect(fileNames).toEqual(['code.py']);
      expect(fileNames).not.toContain('.gitignore');
      expect(fileNames).not.toContain('LICENSE');
      expect(fileNames).not.toContain('README.md');
      expect(fileNames).not.toContain('requirements.txt');
    });

    it('wraps files in a root directory when rootFolder is true or string', async () => {
      const options: ZipExportOptions = {
        projectName: 'my-boxed-repo',
        rootFolder: true,
        includeStandardScaffolding: false,
        files: {
          'main.py': 'print(1)',
          'tests/test_main.py': 'assert True',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const zip = await JSZip.loadAsync(blob);
      const fileNames = Object.keys(zip.files);

      expect(fileNames).toContain('my-boxed-repo/main.py');
      expect(fileNames).toContain('my-boxed-repo/tests/test_main.py');

      const customFolderOptions: ZipExportOptions = {
        projectName: 'ignored-name',
        rootFolder: 'bundle-root',
        includeStandardScaffolding: false,
        files: {
          'script.sh': 'echo 123',
        },
      };

      const blob2 = await zipExporter.exportRepositoryZip(customFolderOptions);
      const zip2 = await JSZip.loadAsync(blob2);
      expect(Object.keys(zip2.files)).toContain('bundle-root/script.sh');
    });

    it('handles nested directory paths properly', async () => {
      const options: ZipExportOptions = {
        projectName: 'nested-structure',
        includeStandardScaffolding: false,
        files: {
          'src/core/engine.py': 'class Engine: pass',
          'src/utils/helpers.py': 'def helper(): pass',
          'tests/unit/test_engine.py': 'def test_engine(): pass',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const zip = await JSZip.loadAsync(blob);

      expect(await zip.file('src/core/engine.py')?.async('text')).toBe('class Engine: pass');
      expect(await zip.file('src/utils/helpers.py')?.async('text')).toBe('def helper(): pass');
      expect(await zip.file('tests/unit/test_engine.py')?.async('text')).toBe('def test_engine(): pass');
    });
  });

  describe('inspectZip', () => {
    it('returns accurate file summary and byte counts', async () => {
      const options: ZipExportOptions = {
        projectName: 'inspect-test',
        includeStandardScaffolding: false,
        files: {
          'a.txt': '12345',
          'b.txt': '67890',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const inspection = await zipExporter.inspectZip(blob);

      expect(inspection.totalFiles).toBe(2);
      expect(inspection.totalBytes).toBe(10);
      expect(inspection.fileList.map((f) => f.path)).toEqual(expect.arrayContaining(['a.txt', 'b.txt']));
    });
  });

  describe('triggerDownload & downloadRepositoryZip', () => {
    it('triggers DOM anchor click and revokes object URL in browser', async () => {
      const clickSpy = vi.fn();
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        (node as any).click = clickSpy;
        return node;
      });
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      const blob = new Blob(['test content'], { type: 'application/zip' });
      zipExporter.triggerDownload(blob, 'test-archive.zip');

      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();

      // downloadRepositoryZip combined test
      const downloadBlob = await zipExporter.downloadRepositoryZip(
        {
          projectName: 'quick-dl',
          includeStandardScaffolding: false,
          files: { 'f.txt': 'hello' },
        },
        'quick-dl.zip'
      );

      expect(downloadBlob).toBeInstanceOf(Blob);
      expect(clickSpy).toHaveBeenCalledTimes(2);
    });
  });
});
