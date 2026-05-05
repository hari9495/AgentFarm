'use client';

import { useEffect, useRef, useState } from 'react';

type CommandGroup = 'Navigate' | 'Actions' | 'Settings';

type CommandItem = {
    id: string;
    label: string;
    description: string;
    group: CommandGroup;
    href?: string;
    badge?: string;
    icon: React.ReactNode;
};

type CommandPaletteProps = {
    sections: Array<{ id: string; label: string }>;
    workspaceId: string;
    isUnifiedView: boolean;
};

export function CommandPalette({ sections, workspaceId, isUnifiedView }: CommandPaletteProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const base = `/?workspaceId=${encodeURIComponent(workspaceId)}`;

    const allItems: CommandItem[] = [
        ...sections.map((s) => ({
            id: `nav-${s.id}`,
            label: s.label,
            description: `Jump to ${s.label} section`,
            group: 'Navigate' as CommandGroup,
            href: isUnifiedView ? `#${s.id}` : `${base}&tab=${s.label.toLowerCase()}`,
            badge: 'Section',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
            ),
        })),
        {
            id: 'view-all',
            label: 'Open One View',
            description: 'Show all dashboard sections at once',
            group: 'Actions',
            href: `${base}&view=all`,
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
            ),
        },
        {
            id: 'view-tabbed',
            label: 'Switch to Tabbed View',
            description: 'Return to single-section tabbed layout',
            group: 'Actions',
            href: `${base}&tab=overview`,
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M3 5h18" /><rect x="3" y="9" width="18" height="12" rx="1" />
                </svg>
            ),
        },
        {
            id: 'presentation',
            label: 'Presentation Mode',
            description: 'Hide chrome, maximize signal panels for demos',
            group: 'Actions',
            href: `${base}&view=all&mode=present`,
            badge: 'Focus',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
            ),
        },
        {
            id: 'compact',
            label: 'Toggle Compact Density',
            description: 'Reduce visual padding for denser data view',
            group: 'Settings',
            href: `${base}&view=all&density=compact`,
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            ),
        },
        {
            id: 'skills',
            label: 'Internal Skill Manager',
            description: 'Manage and catalog internal agent skills',
            group: 'Settings',
            href: `/internal/skills?workspaceId=${encodeURIComponent(workspaceId)}`,
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
            ),
        },
    ];

    const filtered = query.trim()
        ? allItems.filter(
            (item) =>
                item.label.toLowerCase().includes(query.toLowerCase()) ||
                item.description.toLowerCase().includes(query.toLowerCase()),
        )
        : allItems;

    const groups: CommandGroup[] = ['Navigate', 'Actions', 'Settings'];
    const groupedItems = groups
        .map((g) => ({ group: g, items: filtered.filter((item) => item.group === g) }))
        .filter((g) => g.items.length > 0);

    const flatFiltered = groupedItems.flatMap((g) => g.items);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen((prev) => !prev);
                setQuery('');
                setFocusedIndex(0);
            }
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        if (open) {
            const timer = setTimeout(() => inputRef.current?.focus(), 20);
            return () => clearTimeout(timer);
        }
    }, [open]);

    useEffect(() => {
        setFocusedIndex(0);
    }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = flatFiltered[focusedIndex];
            if (item?.href) {
                window.location.href = item.href;
                setOpen(false);
            }
        }
    };

    if (!open) {
        return null;
    }

    let flatIndex = 0;

    return (
        <div
            className="cmd-palette-backdrop"
            role="dialog"
            aria-modal
            aria-label="Command palette"
            onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
            }}
        >
            <div className="cmd-palette" onKeyDown={handleKeyDown}>
                <div className="cmd-palette-header">
                    <svg className="cmd-palette-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                        ref={inputRef}
                        className="cmd-palette-input"
                        placeholder="Search sections and actions…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Command search"
                        autoComplete="off"
                    />
                    <span className="cmd-palette-shortcut">ESC</span>
                </div>
                <div className="cmd-palette-list" role="listbox">
                    {groupedItems.map(({ group, items }) => (
                        <div key={group}>
                            <p className="cmd-palette-group-label">{group}</p>
                            {items.map((item) => {
                                const isFocused = flatIndex === focusedIndex;
                                const currentIndex = flatIndex;
                                flatIndex++;
                                return (
                                    <a
                                        key={item.id}
                                        href={item.href ?? '#'}
                                        role="option"
                                        aria-selected={isFocused}
                                        className={`cmd-palette-item ${isFocused ? 'focused' : ''}`}
                                        onClick={() => setOpen(false)}
                                        onMouseEnter={() => setFocusedIndex(currentIndex)}
                                    >
                                        <span className="cmd-palette-item-icon">{item.icon}</span>
                                        <span className="cmd-palette-item-meta">
                                            <span className="cmd-palette-item-label">{item.label}</span>
                                            <span className="cmd-palette-item-desc">{item.description}</span>
                                        </span>
                                        {item.badge && <span className="cmd-palette-item-badge">{item.badge}</span>}
                                    </a>
                                );
                            })}
                        </div>
                    ))}
                    {flatFiltered.length === 0 && (
                        <p className="cmd-palette-empty">No results for &ldquo;{query}&rdquo;</p>
                    )}
                </div>
                <div className="cmd-palette-footer">
                    <span><kbd>↑↓</kbd> navigate</span>
                    <span><kbd>↵</kbd> open</span>
                    <span><kbd>esc</kbd> dismiss</span>
                </div>
            </div>
        </div>
    );
}
