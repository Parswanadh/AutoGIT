/**
 * AutoGIT Client-Side JSZip Package Exporter
 * Generates downloadable repository zip archives directly in the browser runtime
 * with complete standard project scaffolding (README, LICENSE, .gitignore, requirements.txt).
 */

import JSZip from 'jszip';
import { WorkflowFile } from '../workflow/engine';

export interface ZipExportOptions {
  projectName?: string;
  files: Record<string, WorkflowFile | { path?: string; content: string } | string>;
  includeStandardScaffolding?: boolean;
  topicOrArxiv?: string;
  rootFolder?: boolean | string;
  author?: string;
  licenseType?: 'MIT' | 'Apache-2.0';
}

export interface ZipFileEntry {
  path: string;
  size: number;
}

export interface ZipInspectionResult {
  totalFiles: number;
  totalBytes: number;
  fileList: ZipFileEntry[];
}

export class ZipExporter {
  public static readonly DEFAULT_GITIGNORE = `# Python bytecode & caches
__pycache__/
*.py[cod]
*$py.class
*.so

# Distribution / packaging
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Virtual Environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/

# Testing & Type Checking
.pytest_cache/
.coverage
htmlcov/
.mypy_cache/
.ruff_cache/

# IDE & OS Artifacts
.vscode/
.idea/
*.swp
*.swo
.DS_Store
Thumbs.db
`;

  public static getDefaultLicense(author: string = 'AutoGIT Autonomous Researcher', year: number = 2026): string {
    return `MIT License

Copyright (c) ${year} ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  }

  public static getDefaultReadme(projectName: string = 'AutoGIT Research Implementation', topic?: string): string {
    return `# ${projectName}

Autonomous Python implementation and reproduction synthesized by **AutoGIT Web Studio**.

${topic ? `> **Research Context / Topic:** ${topic}\n` : ''}
## Architecture & Features
- Modular neural and algorithmic architecture.
- In-browser AST-validated execution pipeline.
- Standalone runner and reproduction test suite.

## Quickstart

\`\`\`bash
# 1. Setup virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\\Scripts\\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run standalone reproduction demo
python main.py

# 4. Run test suite
pytest test_pipeline.py
\`\`\`

## License
MIT License. Generated with AutoGIT Web Studio.
`;
  }

  public static getDefaultRequirements(): string {
    return `numpy>=1.24.0
torch>=2.0.0
pytest>=7.0.0
`;
  }

  /**
   * Generates a JSZip instance populated with all project and scaffolding files.
   */
  public async generateZip(options: ZipExportOptions): Promise<JSZip> {
    const zip = new JSZip();
    const projectName = (options.projectName || 'autogit-repo').trim().replace(/[^a-zA-Z0-9._-]/g, '-');
    const includeScaffolding = options.includeStandardScaffolding !== false;

    let rootPrefix = '';
    if (options.rootFolder === true) {
      rootPrefix = `${projectName}/`;
    } else if (typeof options.rootFolder === 'string' && options.rootFolder.trim().length > 0) {
      rootPrefix = `${options.rootFolder.trim().replace(/\/+$/, '')}/`;
    }

    const fileMap: Map<string, string> = new Map();

    // 1. Add provided files
    for (const [key, val] of Object.entries(options.files || {})) {
      let filePath = key;
      let content = '';

      if (typeof val === 'string') {
        content = val;
      } else if (typeof val === 'object' && val !== null) {
        filePath = val.path || key;
        content = val.content ?? '';
      }

      // Normalize path (strip leading slashes)
      filePath = filePath.replace(/^\/+/, '');
      if (filePath.length > 0) {
        fileMap.set(filePath, content);
      }
    }

    // 2. Add standard scaffolding if missing and enabled
    if (includeScaffolding) {
      if (!fileMap.has('.gitignore')) {
        fileMap.set('.gitignore', ZipExporter.DEFAULT_GITIGNORE);
      }
      if (!fileMap.has('LICENSE') && !fileMap.has('LICENSE.txt') && !fileMap.has('LICENSE.md')) {
        fileMap.set('LICENSE', ZipExporter.getDefaultLicense(options.author));
      }
      if (!fileMap.has('README.md') && !fileMap.has('README') && !fileMap.has('readme.md')) {
        fileMap.set('README.md', ZipExporter.getDefaultReadme(options.projectName, options.topicOrArxiv));
      }
      if (!fileMap.has('requirements.txt')) {
        fileMap.set('requirements.txt', ZipExporter.getDefaultRequirements());
      }
    }

    // 3. Write files to JSZip instance
    for (const [path, content] of fileMap.entries()) {
      const fullPath = `${rootPrefix}${path}`;
      zip.file(fullPath, content);
    }

    return zip;
  }

  /**
   * Generates a downloadable binary Blob for the zip archive.
   */
  public async exportRepositoryZip(options: ZipExportOptions): Promise<Blob> {
    const zip = await this.generateZip(options);
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    return blob;
  }

  /**
   * Triggers client-side browser download of the blob.
   */
  public triggerDownload(blob: Blob, filename: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const cleanFilename = filename.endsWith('.zip') ? filename : `${filename}.zip`;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = cleanFilename;

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 150);
  }

  /**
   * Generates and triggers browser download in a single action.
   */
  public async downloadRepositoryZip(options: ZipExportOptions, filename?: string): Promise<Blob> {
    const blob = await this.exportRepositoryZip(options);
    const downloadName = filename || `${options.projectName || 'autogit-repository'}.zip`;
    this.triggerDownload(blob, downloadName);
    return blob;
  }

  /**
   * Helper to inspect the contents of a zip blob for verification.
   */
  public async inspectZip(blob: Blob): Promise<ZipInspectionResult> {
    const zip = await JSZip.loadAsync(blob);
    const fileList: ZipFileEntry[] = [];
    let totalBytes = 0;

    const filePromises: Promise<void>[] = [];

    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir) {
        filePromises.push(
          zipEntry.async('uint8array').then((data) => {
            fileList.push({
              path: relativePath,
              size: data.byteLength,
            });
            totalBytes += data.byteLength;
          })
        );
      }
    });

    await Promise.all(filePromises);

    return {
      totalFiles: fileList.length,
      totalBytes,
      fileList,
    };
  }
}

export const zipExporter = new ZipExporter();
