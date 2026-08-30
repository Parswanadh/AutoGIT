/**
 * arXiv Ingestion & Academic Research Parser
 * Pure client-side parsing of arXiv IDs, URLs, Atom XML feeds, and fallback topic extraction.
 */

export interface ArxivPaperMetadata {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated?: string;
  pdfUrl: string;
  categories: string[];
  primaryCategory?: string;
  doi?: string;
  comment?: string;
  journalRef?: string;
}

export interface ResearchContext {
  topic: string;
  paperMetadata?: ArxivPaperMetadata;
  synthesizedSummary: string;
  keyInnovations: string[];
  limitations: string[];
  suggestedArchitecture: string;
  isDirectArxiv: boolean;
}

export class ArxivParser {
  private static readonly ARXIV_API_BASE = 'https://export.arxiv.org/api/query';

  /**
   * Extracts an arXiv identifier from arbitrary text, naked IDs, or full URLs.
   * Matches both modern format (e.g. 2310.06825, 2310.06825v2) and legacy format (e.g. hep-th/9910001).
   */
  public static extractArxivId(input: string | null | undefined): string | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    // 1. Direct or URL-embedded modern arXiv ID: 2310.06825 or 2310.06825v1
    const modernMatch = trimmed.match(
      /(?:(?:arxiv\.org\/(?:abs|pdf|html|format)\/)|(?:arxiv:\s*))?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i
    );
    if (modernMatch && modernMatch[1]) {
      return modernMatch[1].trim();
    }

    // 2. Legacy arXiv format: hep-th/9910001 or cs.AI/0102003
    const legacyMatch = trimmed.match(
      /(?:(?:arxiv\.org\/(?:abs|pdf)\/)|(?:arxiv:\s*))?([a-z\-]+(?:\.[a-z]{2})?\/[0-9]{7}(?:v[0-9]+)?)/i
    );
    if (legacyMatch && legacyMatch[1]) {
      return legacyMatch[1].trim();
    }

    return null;
  }

  /**
   * Parses an Atom XML response string into structured ArxivPaperMetadata.
   * Uses browser DOMParser when available, with regex fallback for headless/SSR test runners.
   */
  public static parseAtomXml(xmlString: string | null | undefined): ArxivPaperMetadata | null {
    if (!xmlString || typeof xmlString !== 'string' || !xmlString.includes('<entry>')) {
      return null;
    }

    // Attempt DOMParser if available in browser / jsdom
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
        const parserError = xmlDoc.getElementsByTagName('parsererror');
        if (parserError.length === 0) {
          const entry = xmlDoc.getElementsByTagName('entry')[0];
          if (entry) {
            const rawId = entry.getElementsByTagName('id')[0]?.textContent || '';
            const id = rawId.replace(/https?:\/\/arxiv\.org\/abs\//i, '').trim();

            const title = (entry.getElementsByTagName('title')[0]?.textContent || '')
              .replace(/\s+/g, ' ')
              .trim();

            const summary = (entry.getElementsByTagName('summary')[0]?.textContent || '')
              .replace(/\s+/g, ' ')
              .trim();

            const authorNodes = entry.getElementsByTagName('author');
            const authors: string[] = [];
            for (let i = 0; i < authorNodes.length; i++) {
              const nameNode = authorNodes[i].getElementsByTagName('name')[0];
              if (nameNode?.textContent) {
                authors.push(nameNode.textContent.trim());
              }
            }

            const published = entry.getElementsByTagName('published')[0]?.textContent?.trim() || '';
            const updated = entry.getElementsByTagName('updated')[0]?.textContent?.trim();

            const categoryNodes = entry.getElementsByTagName('category');
            const categories: string[] = [];
            let primaryCategory: string | undefined;
            for (let i = 0; i < categoryNodes.length; i++) {
              const term = categoryNodes[i].getAttribute('term');
              if (term) {
                categories.push(term);
                if (!primaryCategory) primaryCategory = term;
              }
            }

            // PDF Link
            let pdfUrl: string | undefined;
            const linkNodes = entry.getElementsByTagName('link');
            for (let i = 0; i < linkNodes.length; i++) {
              const rel = linkNodes[i].getAttribute('rel');
              const titleAttr = linkNodes[i].getAttribute('title');
              const href = linkNodes[i].getAttribute('href');
              if ((rel === 'related' && titleAttr === 'pdf') || (href && href.includes('/pdf/'))) {
                pdfUrl = href || undefined;
                break;
              }
            }

            if (!pdfUrl && id) {
              const cleanId = id.replace(/v\d+$/i, '');
              pdfUrl = `https://arxiv.org/pdf/${cleanId}.pdf`;
            }

            const doi = entry.getElementsByTagName('arxiv:doi')[0]?.textContent?.trim() || undefined;
            const comment = entry.getElementsByTagName('arxiv:comment')[0]?.textContent?.trim() || undefined;
            const journalRef = entry.getElementsByTagName('arxiv:journal_ref')[0]?.textContent?.trim() || undefined;

            if (id && title) {
              return {
                id,
                title,
                summary,
                authors: authors.length > 0 ? authors : ['Unknown Author'],
                published: published || new Date().toISOString(),
                updated,
                pdfUrl: pdfUrl || `https://arxiv.org/pdf/${id}.pdf`,
                categories: categories.length > 0 ? categories : ['cs.AI'],
                primaryCategory: primaryCategory || categories[0] || 'cs.AI',
                doi,
                comment,
                journalRef,
              };
            }
          }
        }
      } catch {
        // Fallback to regex parser
      }
    }

    // Regex parsing fallback
    try {
      const getTag = (xml: string, tag: string): string => {
        const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return m ? m[1].trim() : '';
      };

      const entryMatch = xmlString.match(/<entry>([\s\S]*?)<\/entry>/i);
      if (!entryMatch) return null;
      const entryXml = entryMatch[1];

      const rawId = getTag(entryXml, 'id').replace(/https?:\/\/arxiv\.org\/abs\//i, '').trim();
      const rawTitle = getTag(entryXml, 'title').replace(/\s+/g, ' ').trim();
      const rawSummary = getTag(entryXml, 'summary').replace(/\s+/g, ' ').trim();

      const authorMatches = Array.from(
        entryXml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)
      );
      const authors = authorMatches.map((m) => m[1].trim());

      const published = getTag(entryXml, 'published');
      const updated = getTag(entryXml, 'updated');

      const categories: string[] = [];
      const catMatches = Array.from(entryXml.matchAll(/<category[^>]*term="([^"]+)"/gi));
      catMatches.forEach((m) => categories.push(m[1]));

      if (!rawId || !rawTitle) return null;

      const cleanId = rawId.replace(/v\d+$/i, '');

      return {
        id: rawId,
        title: rawTitle,
        summary: rawSummary,
        authors: authors.length > 0 ? authors : ['Unknown Author'],
        published: published || new Date().toISOString(),
        updated: updated || undefined,
        pdfUrl: `https://arxiv.org/pdf/${cleanId}.pdf`,
        categories: categories.length > 0 ? categories : ['cs.AI'],
        primaryCategory: categories[0] || 'cs.AI',
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetches metadata for a single arXiv paper ID from the official arXiv Export API.
   */
  public static async fetchPaperById(
    arxivId: string,
    fetchFn?: typeof fetch
  ): Promise<ArxivPaperMetadata | null> {
    const cleanId = this.extractArxivId(arxivId) || arxivId.trim();
    if (!cleanId) return null;

    const fetchImpl = fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    const url = `${this.ARXIV_API_BASE}?id_list=${encodeURIComponent(cleanId)}`;

    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/atom+xml, application/xml, text/xml',
        },
      });

      if (!res.ok) {
        return null;
      }

      const xmlText = await res.text();
      return this.parseAtomXml(xmlText);
    } catch {
      return null;
    }
  }

  /**
   * Searches arXiv by topic keywords or query string.
   */
  public static async searchPapers(
    query: string,
    maxResults: number = 5,
    fetchFn?: typeof fetch
  ): Promise<ArxivPaperMetadata[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const fetchImpl = fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    const formattedQuery = encodeURIComponent(`all:${trimmed}`);
    const url = `${this.ARXIV_API_BASE}?search_query=${formattedQuery}&max_results=${maxResults}`;

    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/atom+xml, application/xml, text/xml',
        },
      });

      if (!res.ok) return [];

      const xmlText = await res.text();
      const results: ArxivPaperMetadata[] = [];

      // Split multiple entries
      const entryMatches = xmlText.match(/<entry>[\s\S]*?<\/entry>/gi);
      if (entryMatches) {
        for (const entryXml of entryMatches) {
          const parsed = this.parseAtomXml(entryXml);
          if (parsed) {
            results.push(parsed);
          }
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Unified ingestion method: accepts either an arXiv ID / URL or a free-form research idea.
   * Returns a complete ResearchContext ready for downstream multi-agent debate and specification.
   */
  public static async ingestTopicOrId(
    input: string,
    fetchFn?: typeof fetch
  ): Promise<ResearchContext> {
    const trimmed = input.trim();
    const arxivId = this.extractArxivId(trimmed);

    if (arxivId) {
      const paper = await this.fetchPaperById(arxivId, fetchFn);
      if (paper) {
        return {
          topic: paper.title,
          paperMetadata: paper,
          synthesizedSummary: `Paper Title: ${paper.title}\nAuthors: ${paper.authors.join(', ')}\narXiv ID: ${paper.id} (${paper.categories.join(', ')})\n\nAbstract:\n${paper.summary}`,
          keyInnovations: [
            `Novel architecture proposed in arXiv:${paper.id}`,
            'Rigorous empirical benchmarking and mathematical formulations',
            'Modular pipeline design for reproducibility',
          ],
          limitations: [
            'Requires clean PyTorch/Python reference implementation',
            'High computational complexity in naive baseline formulation',
          ],
          suggestedArchitecture: 'Modular Python package with clear class interfaces, dataset utilities, and standalone demo.',
          isDirectArxiv: true,
        };
      }
    }

    // Fallback: Free-form topic/idea mode
    return {
      topic: trimmed,
      synthesizedSummary: `Research Objective: ${trimmed}\n\nDeconstructed into theoretical foundations, mathematical problem statement, architectural specification, and standalone implementation requirements.`,
      keyInnovations: [
        `Custom implementation designed for ${trimmed}`,
        'Robust multi-agent synthesized architecture with AST validation',
        'End-to-end execution with zero external runtime dependencies',
      ],
      limitations: [
        'Must handle edge-case inputs gracefully with in-memory fallbacks',
        'Requires comprehensive unit testing suite',
      ],
      suggestedArchitecture: 'Multi-module Python system featuring domain engine, evaluation metrics, and runnable main.py demo.',
      isDirectArxiv: false,
    };
  }
}
