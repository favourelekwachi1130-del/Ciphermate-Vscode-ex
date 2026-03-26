/**
 * Citation Service
 * 
 * Tracks sources, references, and citations used during AI operations.
 * Shows citations like thinking process - appears and disappears dynamically.
 * 
 * NO dependencies on Mastra or AI frameworks.
 */

export interface Citation {
  id: string;
  type: 'file' | 'tool' | 'service' | 'pattern' | 'reference';
  source: string;
  description: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface CitationGroup {
  id: string;
  citations: Citation[];
  timestamp: Date;
}

export class CitationService {
  private citations: Map<string, CitationGroup> = new Map();
  private activeCitations: Map<string, Citation[]> = new Map();

  /**
   * Add citation for a message/operation
   */
  addCitation(messageId: string, citation: Omit<Citation, 'id' | 'timestamp'>): string {
    const citationId = `cite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullCitation: Citation = {
      ...citation,
      id: citationId,
      timestamp: new Date(),
    };

    // Add to active citations for this message
    if (!this.activeCitations.has(messageId)) {
      this.activeCitations.set(messageId, []);
    }
    this.activeCitations.get(messageId)!.push(fullCitation);

    // Store in citation group
    if (!this.citations.has(messageId)) {
      this.citations.set(messageId, {
        id: messageId,
        citations: [],
        timestamp: new Date(),
      });
    }
    this.citations.get(messageId)!.citations.push(fullCitation);

    return citationId;
  }

  /**
   * Get citations for a message
   */
  getCitations(messageId: string): Citation[] {
    return this.activeCitations.get(messageId) || [];
  }

  /**
   * Get citation group for a message
   */
  getCitationGroup(messageId: string): CitationGroup | undefined {
    return this.citations.get(messageId);
  }

  /**
   * Clear active citations for a message (for dynamic display)
   */
  clearActiveCitations(messageId: string): void {
    this.activeCitations.delete(messageId);
  }

  /**
   * Add file citation
   */
  addFileCitation(messageId: string, filePath: string, line?: number): string {
    return this.addCitation(messageId, {
      type: 'file',
      source: filePath,
      description: line ? `File: ${filePath} (line ${line})` : `File: ${filePath}`,
      metadata: { filePath, line },
    });
  }

  /**
   * Add tool citation
   */
  addToolCitation(messageId: string, toolName: string, description: string): string {
    return this.addCitation(messageId, {
      type: 'tool',
      source: toolName,
      description: `Tool: ${description}`,
      metadata: { toolName },
    });
  }

  /**
   * Add service citation
   */
  addServiceCitation(messageId: string, serviceName: string, operation: string): string {
    return this.addCitation(messageId, {
      type: 'service',
      source: serviceName,
      description: `Service: ${serviceName}.${operation}`,
      metadata: { serviceName, operation },
    });
  }

  /**
   * Add pattern citation
   */
  addPatternCitation(messageId: string, patternName: string, matches: number): string {
    return this.addCitation(messageId, {
      type: 'pattern',
      source: patternName,
      description: `Pattern: ${patternName} (${matches} matches)`,
      metadata: { patternName, matches },
    });
  }

  /**
   * Deduped rows for webview Sources (file paths, tools, services).
   */
  citationsToDisplayStrings(citations: Citation[]): string[] {
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const c of citations) {
      const key = `${c.type}:${c.source}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (c.type === 'file') {
        const line = c.metadata?.line as number | undefined;
        rows.push(line != null && line > 0 ? `${c.source}:${line}` : c.source);
      } else if (c.type === 'tool') {
        rows.push(`Tool: ${c.source}`);
      } else if (c.type === 'service') {
        rows.push(`Service: ${c.source}`);
      } else {
        rows.push(c.description || c.source);
      }
    }
    return rows;
  }

  /**
   * Format citations for display
   */
  formatCitations(citations: Citation[]): string {
    if (citations.length === 0) {
      return '';
    }

    const deduped: Citation[] = [];
    const seen = new Set<string>();
    for (const cite of citations) {
      const key = `${cite.type}:${cite.source}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(cite);
    }

    const grouped = deduped.reduce((acc, cite) => {
      if (!acc[cite.type]) {
        acc[cite.type] = [];
      }
      acc[cite.type].push(cite);
      return acc;
    }, {} as Record<string, Citation[]>);

    const parts: string[] = [];
    
    if (grouped.file) {
      parts.push(`**Files:** ${grouped.file.map(c => c.source).join(', ')}`);
    }
    if (grouped.tool) {
      parts.push(`**Tools:** ${grouped.tool.map(c => c.source).join(', ')}`);
    }
    if (grouped.service) {
      parts.push(`**Services:** ${grouped.service.map(c => c.source).join(', ')}`);
    }
    if (grouped.pattern) {
      parts.push(`**Patterns:** ${grouped.pattern.map(c => c.source).join(', ')}`);
    }

    return parts.join(' | ');
  }

  /**
   * Get citation summary for a message
   */
  getCitationSummary(messageId: string): string {
    const citations = this.getCitations(messageId);
    return this.formatCitations(citations);
  }

  /**
   * Clear all citations (cleanup)
   */
  clearAll(): void {
    this.citations.clear();
    this.activeCitations.clear();
  }
}

// Singleton instance
let citationServiceInstance: CitationService | null = null;

export function getCitationService(): CitationService {
  if (!citationServiceInstance) {
    citationServiceInstance = new CitationService();
  }
  return citationServiceInstance;
}
