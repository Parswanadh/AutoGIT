/**
 * In-Browser Python Syntax, Structure & AST Validator
 * Pure client-side validator executing indentation checks, bracket balancing,
 * import resolution, stub detection, and cross-file reference validation with zero server dependencies.
 */

export interface ImportedSymbolRef {
  module: string;
  symbol: string;
  line: number;
}

export interface CodeMetricInfo {
  totalLines: number;
  codeLines: number;
  commentLines: number;
  classesCount: number;
  functionsCount: number;
  hasMainBlock: boolean;
  hasStubs: boolean;
  importedModules: string[];
  definedSymbols: string[];
  docstringsCount?: number;
  assertionsCount?: number;
  importedSymbols?: ImportedSymbolRef[];
}

export interface ValidationError {
  line: number;
  column?: number;
  message: string;
  rule: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  metrics: CodeMetricInfo;
  classes: Array<{ name: string; methods: string[]; docstring?: string }>;
  functions: Array<{ name: string; params: string[]; docstring?: string }>;
}

export interface ProjectValidationResult {
  allValid: boolean;
  fileResults: Record<string, ValidationResult>;
  crossFileErrors: string[];
  missingDependencies: string[];
  unnecessaryStdlibInRequirements: string[];
  summary: {
    totalFiles: number;
    totalLines: number;
    validFilesCount: number;
    hasMainEntry: boolean;
    hasTestSuite: boolean;
    totalClasses?: number;
    totalFunctions?: number;
    totalDocstrings?: number;
    docstringCoverage?: number;
    totalAssertions?: number;
    stubsCount?: number;
  };
}

// Known standard library modules in Python 3.10+
export const PYTHON_STDLIB_MODULES = new Set([
  'abc', 'argparse', 'array', 'ast', 'asyncio', 'base64', 'binascii', 'bisect',
  'builtins', 'bz2', 'calendar', 'cmath', 'collections', 'colorsys', 'concurrent',
  'contextlib', 'contextvars', 'copy', 'copyreg', 'csv', 'ctypes', 'dataclasses',
  'datetime', 'decimal', 'difflib', 'dis', 'doctest', 'email', 'enum', 'errno',
  'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch', 'fractions',
  'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext', 'glob', 'graphlib',
  'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'imaplib', 'imghdr',
  'importlib', 'inspect', 'io', 'ipaddress', 'itertools', 'json', 'keyword',
  'linecache', 'locale', 'logging', 'lzma', 'mailbox', 'mailcap', 'marshal',
  'math', 'mimetypes', 'mmap', 'modulefinder', 'multiprocessing', 'netrc',
  'nntplib', 'numbers', 'operator', 'optparse', 'os', 'pathlib', 'pdb', 'pickle',
  'pickletools', 'pipes', 'pkgutil', 'platform', 'plistlib', 'poplib', 'posixpath',
  'pprint', 'profile', 'pstats', 'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc',
  'queue', 'quopri', 'random', 're', 'readline', 'reprlib', 'resource', 'rlcompleter',
  'runpy', 'sched', 'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil',
  'signal', 'site', 'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver',
  'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct',
  'subprocess', 'sunau', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny',
  'tarfile', 'telnetlib', 'tempfile', 'termios', 'test', 'textwrap', 'threading',
  'time', 'timeit', 'tkinter', 'token', 'tokenize', 'trace', 'traceback',
  'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types', 'typing', 'unicodedata',
  'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings', 'wave', 'weakref',
  'webbrowser', 'wsgiref', 'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile',
  'zipimport', 'zlib', 'zoneinfo'
]);

export class PythonAstValidator {
  /**
   * Deterministically repairs common text artifacts before validation.
   */
  public static deterministicPreFix(code: string): string {
    if (!code || typeof code !== 'string') return '';

    let fixed = code;

    // 1. Strip markdown fences if present
    fixed = fixed.replace(/^```(?:python|py)?\r?\n/i, '');
    fixed = fixed.replace(/\r?\n```\s*$/i, '');

    // 2. Normalize unicode typographic quotes and dashes
    fixed = fixed
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u00A0/g, ' '); // non-breaking space to regular space

    // 3. Fix relative imports to absolute imports
    fixed = fixed.replace(/from\s+\.([a-zA-Z0-9_]+)\s+import/g, 'from $1 import');
    fixed = fixed.replace(/from\s+\.\.\s+import/g, 'from ');

    // 4. Remove carriage returns and trailing whitespaces per line
    const lines = fixed.split(/\r?\n/).map((l) => l.trimEnd());

    // 5. Ensure single trailing newline
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Validates a single Python file's syntax, indentation, and structure.
   */
  public static validateFile(code: string, fileName: string = 'module.py'): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const sanitizedCode = this.deterministicPreFix(code);
    const lines = sanitizedCode.split('\n');

    let totalLines = 0;
    let codeLines = 0;
    let commentLines = 0;
    let hasStubs = false;
    let hasMainBlock = false;
    let docstringsCount = 0;
    let assertionsCount = 0;

    const importedModules: Set<string> = new Set();
    const definedSymbols: Set<string> = new Set();
    const importedSymbolsList: ImportedSymbolRef[] = [];
    const classes: Array<{ name: string; methods: string[]; docstring?: string }> = [];
    const functions: Array<{ name: string; params: string[]; docstring?: string }> = [];

    // State trackers for bracket balance
    const bracketStack: Array<{ char: string; line: number; col: number }> = [];
    const matchingBracket: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

    let inMultilineString: 'single' | 'double' | null = null;
    const indentStack: number[] = [0];
    let expectsIndent = false;
    let expectsIndentLine = 0;

    let currentClass: { name: string; methods: string[]; docstring?: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];
      totalLines++;

      // Check if line is empty or purely whitespace
      if (!rawLine.trim()) {
        continue;
      }

      // Check for main execution block
      if (rawLine.includes("if __name__ == '__main__':") || rawLine.includes('if __name__ == "__main__":')) {
        hasMainBlock = true;
      }

      // 1. Bracket & string literal tokenization
      let col = 0;
      while (col < rawLine.length) {
        const char = rawLine[col];
        const nextTwo = rawLine.slice(col, col + 3);

        if (inMultilineString) {
          if (inMultilineString === 'double' && nextTwo === '"""') {
            inMultilineString = null;
            col += 3;
            continue;
          } else if (inMultilineString === 'single' && nextTwo === "'''") {
            inMultilineString = null;
            col += 3;
            continue;
          }
          col++;
          continue;
        }

        // Check for start of multiline strings
        if (nextTwo === '"""') {
          inMultilineString = 'double';
          col += 3;
          continue;
        }
        if (nextTwo === "'''") {
          inMultilineString = 'single';
          col += 3;
          continue;
        }

        // Single-line string literals
        if (char === '"' || char === "'") {
          const quote = char;
          col++;
          while (col < rawLine.length) {
            if (rawLine[col] === '\\') {
              col += 2; // skip escaped char
            } else if (rawLine[col] === quote) {
              col++;
              break;
            } else {
              col++;
            }
          }
          continue;
        }

        // Comments
        if (char === '#') {
          const commentText = rawLine.slice(col);
          if (commentText.includes('TODO') || commentText.includes('FIXME') || commentText.includes('stub')) {
            hasStubs = true;
            warnings.push({
              line: lineNum,
              column: col + 1,
              message: `Potential stub or placeholder comment detected: "${commentText.trim()}"`,
              rule: 'no-stubs',
              severity: 'warning',
            });
          }
          if (col === 0 || !rawLine.slice(0, col).trim()) {
            commentLines++;
          }
          break; // Stop parsing rest of comment line
        }

        // Brackets
        if (char === '(' || char === '[' || char === '{') {
          bracketStack.push({ char, line: lineNum, col: col + 1 });
        } else if (char === ')' || char === ']' || char === '}') {
          const expected = matchingBracket[char];
          if (bracketStack.length === 0) {
            errors.push({
              line: lineNum,
              column: col + 1,
              message: `Unmatched closing bracket '${char}' with no opening counterpart.`,
              rule: 'syntax-bracket-balance',
              severity: 'error',
            });
          } else {
            const last = bracketStack.pop()!;
            if (last.char !== expected) {
              errors.push({
                line: lineNum,
                column: col + 1,
                message: `Mismatched bracket: expected closing for '${last.char}' from line ${last.line}, but found '${char}'.`,
                rule: 'syntax-bracket-balance',
                severity: 'error',
              });
            }
          }
        }

        col++;
      }

      if (inMultilineString) {
        continue;
      }

      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      codeLines++;

      // 2. Indentation check
      const leadingSpaces = rawLine.search(/\S/);
      if (rawLine.slice(0, leadingSpaces).includes('\t')) {
        errors.push({
          line: lineNum,
          message: 'Tab character used for indentation. AutoGIT strictly requires 4-space indentation.',
          rule: 'indentation-no-tabs',
          severity: 'error',
        });
      }

      if (expectsIndent) {
        if (leadingSpaces <= indentStack[indentStack.length - 1]) {
          errors.push({
            line: lineNum,
            message: `Expected an indented block after statement at line ${expectsIndentLine}, but got indentation ${leadingSpaces}.`,
            rule: 'indentation-expected-block',
            severity: 'error',
          });
        } else {
          indentStack.push(leadingSpaces);
        }
        expectsIndent = false;
      } else {
        // If line is not in bracket continuation
        if (bracketStack.length === 0) {
          const currentIndent = indentStack[indentStack.length - 1];
          if (leadingSpaces > currentIndent) {
            warnings.push({
              line: lineNum,
              message: `Unexpected indentation increase from ${currentIndent} to ${leadingSpaces} spaces without preceding colon block.`,
              rule: 'indentation-unexpected-increase',
              severity: 'warning',
            });
            indentStack.push(leadingSpaces);
          } else if (leadingSpaces < currentIndent) {
            while (indentStack.length > 1 && indentStack[indentStack.length - 1] > leadingSpaces) {
              indentStack.pop();
            }
            if (indentStack[indentStack.length - 1] !== leadingSpaces) {
              errors.push({
                line: lineNum,
                message: `Unindent does not match any outer indentation level (current: ${leadingSpaces}, stack: [${indentStack.join(', ')}]).`,
                rule: 'indentation-unindent-mismatch',
                severity: 'error',
              });
            }
          }
        }
      }

      // Check if line ends with a colon initiating a block
      if (
        trimmed.endsWith(':') &&
        (trimmed.startsWith('def ') ||
          trimmed.startsWith('async def ') ||
          trimmed.startsWith('class ') ||
          trimmed.startsWith('if ') ||
          trimmed.startsWith('elif ') ||
          trimmed === 'else:' ||
          trimmed.startsWith('for ') ||
          trimmed.startsWith('async for ') ||
          trimmed.startsWith('while ') ||
          trimmed === 'try:' ||
          trimmed.startsWith('except') ||
          trimmed === 'finally:' ||
          trimmed.startsWith('with ') ||
          trimmed.startsWith('async with '))
      ) {
        expectsIndent = true;
        expectsIndentLine = lineNum;
      }

      // 3. Stub Detection
      if (
        trimmed === 'raise NotImplementedError' ||
        trimmed === 'raise NotImplementedError()' ||
        trimmed === 'pass  # TODO' ||
        trimmed === 'pass  # stub' ||
        trimmed === '...'
      ) {
        hasStubs = true;
        warnings.push({
          line: lineNum,
          message: `Incomplete method stub detected: "${trimmed}".`,
          rule: 'no-stubs',
          severity: 'warning',
        });
      }

      // 4. Imports and Assertion parsing
      if (trimmed.startsWith('assert ') || trimmed.startsWith('assert(')) {
        assertionsCount++;
      }

      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        docstringsCount++;
      }

      if (trimmed.startsWith('import ')) {
        const parts = trimmed.slice(7).split(',');
        for (const p of parts) {
          const mod = p.trim().split(/\s+as\s+/)[0].split('.')[0];
          if (mod) importedModules.add(mod);
        }
      } else if (trimmed.startsWith('from ')) {
        const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+(.+)$/);
        if (fromMatch) {
          const mod = fromMatch[1].split('.')[0];
          importedModules.add(mod);
          const rawSymbols = fromMatch[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
          for (const sym of rawSymbols) {
            importedSymbolsList.push({ module: mod, symbol: sym, line: lineNum });
          }
        }
      }

      // 5. Class & Function extraction
      const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\((.*?)\))?:/);
      if (classMatch) {
        const className = classMatch[1];
        definedSymbols.add(className);
        currentClass = { name: className, methods: [] };
        classes.push(currentClass);
      }

      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)(?:\s*->\s*.*?)?:/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const params = funcMatch[2]
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        definedSymbols.add(funcName);

        if (currentClass && leadingSpaces > 0) {
          currentClass.methods.push(funcName);
        } else {
          currentClass = null;
          functions.push({ name: funcName, params });
        }
      }
    }

    // Check for unclosed brackets at EOF
    if (bracketStack.length > 0) {
      for (const unclosed of bracketStack) {
        errors.push({
          line: unclosed.line,
          column: unclosed.col,
          message: `Unclosed bracket '${unclosed.char}' opened at line ${unclosed.line}.`,
          rule: 'syntax-bracket-unclosed',
          severity: 'error',
        });
      }
    }

    if (inMultilineString) {
      errors.push({
        line: lines.length,
        message: `Unterminated multiline string (${inMultilineString} quotes) at end of file.`,
        rule: 'syntax-unterminated-string',
        severity: 'error',
      });
    }

    const isValid = errors.length === 0;

    return {
      valid: isValid,
      errors,
      warnings,
      metrics: {
        totalLines,
        codeLines,
        commentLines,
        classesCount: classes.length,
        functionsCount: functions.length + classes.reduce((acc, c) => acc + c.methods.length, 0),
        hasMainBlock,
        hasStubs,
        importedModules: Array.from(importedModules),
        definedSymbols: Array.from(definedSymbols),
        docstringsCount,
        assertionsCount,
        importedSymbols: importedSymbolsList,
      },
      classes,
      functions,
    };
  }

  /**
   * Validates an entire multi-file project workspace including cross-file imports and dependencies.
   */
  public static validateProject(files: Record<string, string>): ProjectValidationResult {
    const fileResults: Record<string, ValidationResult> = {};
    const crossFileErrors: string[] = [];
    const missingDependencies: string[] = [];
    const unnecessaryStdlibInRequirements: string[] = [];

    const projectFileBaseNames = new Set<string>();
    for (const f of Object.keys(files)) {
      projectFileBaseNames.add(f.replace(/\.py$/, '').replace(/^.*\//, ''));
      const parts = f.split('/');
      if (parts.length > 1) {
        projectFileBaseNames.add(parts[0]);
      }
    }

    let totalLines = 0;
    let validFilesCount = 0;
    let hasMainEntry = false;
    let hasTestSuite = false;

    // Parse requirements.txt if present
    const declaredRequirements = new Set<string>();
    if (files['requirements.txt']) {
      const reqLines = files['requirements.txt'].split('\n');
      for (const line of reqLines) {
        const clean = line.trim().split(/[=><~;]/)[0].trim().toLowerCase();
        if (clean && !clean.startsWith('#')) {
          declaredRequirements.add(clean);
          if (PYTHON_STDLIB_MODULES.has(clean)) {
            unnecessaryStdlibInRequirements.push(clean);
          }
        }
      }
    }

    // Step 1: Validate each file individually
    for (const [filePath, content] of Object.entries(files)) {
      if (!filePath.endsWith('.py')) {
        continue;
      }

      const result = this.validateFile(content, filePath);
      fileResults[filePath] = result;
      totalLines += result.metrics.totalLines;

      if (result.valid) {
        validFilesCount++;
      }

      if (filePath === 'main.py' || result.metrics.hasMainBlock) {
        hasMainEntry = true;
      }

      if (filePath.includes('test_') || filePath.endsWith('_test.py')) {
        hasTestSuite = true;
      }

      // Check external dependencies vs stdlib vs local modules
      for (const mod of result.metrics.importedModules) {
        if (PYTHON_STDLIB_MODULES.has(mod)) {
          continue;
        }
        if (projectFileBaseNames.has(mod)) {
          continue;
        }
        // Common alias normalization (e.g. cv2 -> opencv-python, sklearn -> scikit-learn)
        const normalized = mod.toLowerCase();
        const isDeclared =
          declaredRequirements.has(normalized) ||
          (normalized === 'cv2' && declaredRequirements.has('opencv-python')) ||
          (normalized === 'sklearn' && declaredRequirements.has('scikit-learn')) ||
          (normalized === 'yaml' && declaredRequirements.has('pyyaml')) ||
          (normalized === 'pil' && declaredRequirements.has('pillow'));

        if (!isDeclared && files['requirements.txt']) {
          if (!missingDependencies.includes(mod)) {
            missingDependencies.push(mod);
          }
        }
      }
    }

    // Step 2: Cross-file symbol verification
    const projectSymbolsMap: Record<string, Set<string>> = {};
    for (const [filePath, res] of Object.entries(fileResults)) {
      const baseName = filePath.replace(/\.py$/, '').replace(/^.*\//, '');
      projectSymbolsMap[baseName] = new Set(res.metrics.definedSymbols);
      projectSymbolsMap[filePath] = new Set(res.metrics.definedSymbols);
    }

    for (const [filePath, res] of Object.entries(fileResults)) {
      for (const imp of res.metrics.importedSymbols || []) {
        if (projectSymbolsMap[imp.module]) {
          const available = projectSymbolsMap[imp.module];
          if (imp.symbol !== '*' && !available.has(imp.symbol)) {
            crossFileErrors.push(
              `[cross-file] ${filePath}:${imp.line}: Symbol '${imp.symbol}' imported from '${imp.module}' is not defined in ${imp.module}.py.`
            );
          }
        }
      }
    }

    // Step 3: Compute aggregate code quality metrics
    const totalClasses = Object.values(fileResults).reduce((acc, r) => acc + r.metrics.classesCount, 0);
    const totalFunctions = Object.values(fileResults).reduce((acc, r) => acc + r.metrics.functionsCount, 0);
    const totalDocstrings = Object.values(fileResults).reduce((acc, r) => acc + (r.metrics.docstringsCount || 0), 0);
    const totalAssertions = Object.values(fileResults).reduce((acc, r) => acc + (r.metrics.assertionsCount || 0), 0);
    const stubsCount = Object.values(fileResults).reduce((acc, r) => acc + (r.metrics.hasStubs ? 1 : 0), 0);
    const docstringTarget = totalClasses + totalFunctions;
    const docstringCoverage = docstringTarget > 0 ? Math.min(100, Math.round((totalDocstrings / docstringTarget) * 100)) : 100;

    const allValid =
      Object.values(fileResults).every((r) => r.valid) &&
      crossFileErrors.length === 0 &&
      unnecessaryStdlibInRequirements.length === 0;

    return {
      allValid,
      fileResults,
      crossFileErrors,
      missingDependencies,
      unnecessaryStdlibInRequirements,
      summary: {
        totalFiles: Object.keys(files).length,
        totalLines,
        validFilesCount,
        hasMainEntry,
        hasTestSuite,
        totalClasses,
        totalFunctions,
        totalDocstrings,
        docstringCoverage,
        totalAssertions,
        stubsCount,
      },
    };
  }
}
