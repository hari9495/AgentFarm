'use client';

import { useState } from 'react';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, Search } from 'lucide-react';

type SearchResult = {
    id: string;
    content: string;
    sourceType: string;
    sourceUrl?: string | null;
    similarity: number;
};

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' };
const inputS: React.CSSProperties = { width: '100%', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

export default function KnowledgeBaseUploadPanel({ botId }: { botId?: string }) {
    const [sourceType, setSourceType] = useState('company_docs');
    const [content, setContent] = useState('');
    const [uploading, setUploading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [queryText, setQueryText] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<SearchResult[] | null>(null);

    const submitText = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;
        setUploading(true); setError(null); setNotice(null);
        try {
            const res = await fetch('/api/knowledge-base/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, sourceType, botId: botId || undefined }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? 'Ingestion failed');
            setNotice('Chunk ingested into the knowledge base.');
            setContent('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ingestion failed');
        } finally {
            setUploading(false);
        }
    };

    const uploadFile = async (file: File) => {
        setUploading(true); setError(null); setNotice(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('sourceType', sourceType);
            if (botId) fd.append('botId', botId);
            const res = await fetch('/api/knowledge-base/ingest-file', { method: 'POST', body: fd });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? 'Upload failed');
            setNotice(`Ingested "${body.originalFilename ?? file.name}" — ${body.chunkCount} chunk(s).`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const runSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!queryText.trim()) return;
        setSearching(true); setError(null);
        try {
            const res = await fetch('/api/knowledge-base/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queryText, botId: botId || undefined }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? 'Search failed');
            setResults(body.results ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setSearching(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
                <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, color: '#e5484d', borderColor: '#e5484d' }}>
                    <AlertCircle size={14} /> {error}
                </div>
            )}
            {notice && (
                <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)' }}>
                    <CheckCircle2 size={14} /> {notice}
                </div>
            )}

            <div style={card}>
                <label style={label}>Source type</label>
                <input
                    style={{ ...inputS, marginBottom: 12, maxWidth: 320 }}
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value)}
                    placeholder="e.g. company_docs, onboarding_guide, faq"
                />

                <label style={label}>Upload a document (PDF, DOCX, XLSX, PPTX, HTML)</label>
                <input
                    type="file"
                    style={{ marginBottom: 16 }}
                    disabled={uploading}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadFile(file);
                        e.target.value = '';
                    }}
                />

                <form onSubmit={submitText}>
                    <label style={label}>Or paste text directly</label>
                    <textarea
                        style={{ ...inputS, minHeight: 100, resize: 'vertical', marginBottom: 10 }}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Paste a policy excerpt, FAQ answer, or company knowledge chunk…"
                    />
                    <button type="submit" style={btn} disabled={uploading || !content.trim()}>
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        Ingest chunk
                    </button>
                </form>
            </div>

            <div style={card}>
                <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input
                        style={inputS}
                        value={queryText}
                        onChange={(e) => setQueryText(e.target.value)}
                        placeholder="Search the knowledge base…"
                    />
                    <button type="submit" style={btn} disabled={searching || !queryText.trim()}>
                        {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        Search
                    </button>
                </form>

                {results && results.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>No matching chunks above the similarity threshold.</p>
                )}
                {results && results.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {results.map((r) => (
                            <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 9, padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <FileText size={12} /> {r.sourceType}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{(r.similarity * 100).toFixed(1)}% match</span>
                                </div>
                                <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
