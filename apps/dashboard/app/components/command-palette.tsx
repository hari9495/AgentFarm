'use client';

import { useEffect, useRef, useState } from 'react';

type CommandGroup = 'Navigate' | 'Agents' | 'Tasks' | 'Approvals' | 'Playbooks' | 'Actions' | 'Settings';

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

type SearchResult = {
    id: string;
    label: string;
    description: string;
    href: string;
    group: CommandGroup;
};

const NAV_ICON = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
);

const BOT_ICON = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="15" x2="8" y2="15" /><line x1="12" y1="15" x2="12" y2="15" /><line x1="16" y1="15" x2="16" y2="15" />
    </svg>
);

const TASK_ICON = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
);

const APPROVAL_ICON = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
);

const PLAYBOOK_ICON = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
);

export function CommandPalette({ sections, workspaceId, isUnifiedView }: CommandPaletteProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(0);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const base = `/?workspaceId=${encodeURIComponent(workspaceId)}`;

    const staticItems: CommandItem[] = [
        ...sections.map((s) => ({
            id: `nav-${s.id}`,
            label: s.label,
            description: `Jump to ${s.label} section`,
            group: 'Navigate' as CommandGroup,
            href: isUnifiedView ? `#${s.id}` : `${base}&tab=${s.label.toLowerCase()}`,
            badge: 'Section',
            icon: NAV_ICON,
        })),
        {
            id: 'nav-agents',
            label: 'Agents',
            description: 'View and manage all agents',
            group: 'Navigate',
            href: '/agents',
            badge: 'Page',
            icon: BOT_ICON,
        },
        {
            id: 'nav-tasks',
            label: 'Tasks',
            description: 'View all tasks and their status',
            group: 'Navigate',
            href: '/tasks',
            badge: 'Page',
            icon: TASK_ICON,
        },
        {
            id: 'nav-approvals',
            label: 'Approvals',
            description: 'Pending approvals queue',
            group: 'Navigate',
            href: `${base}&tab=approvals`,
            badge: 'Page',
            icon: APPROVAL_ICON,
        },
        {
            id: 'nav-playbooks',
            label: 'Playbooks',
            description: 'Automation playbook library',
            group: 'Navigate',
            href: '/playbooks',
            badge: 'Page',
            icon: PLAYBOOK_ICON,
        },
        {
            id: 'nav-compare',
            label: 'Agent Comparison',
            description: 'Compare two agents side-by-side',
            group: 'Navigate',
            href: '/agents/compare',
            badge: 'Page',
            icon: BOT_ICON,
        },
        {
            id: 'nav-analytics',
            label: 'Analytics',
            description: 'Cost, performance, and token usage heatmap',
            group: 'Navigate',
            href: '/analytics',
            badge: 'Page',
            icon: NAV_ICON,
        },
        {
            id: 'nav-health',
            label: 'Agent Health',
            description: 'Agent health dashboard',
            group: 'Navigate',
            href: '/agents/health',
            badge: 'Page',
            icon: BOT_ICON,
        },
        {
            id: 'nav-sla',
            label: 'SLA Alerts',
            description: 'Configure P95 latency breach alerts',
            group: 'Navigate',
            href: '/sla-alerts',
            badge: 'Page',
            icon: NAV_ICON,
        },
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

    const dynamicItems: CommandItem[] = searchResults.map((r) => ({
        id: `dyn-${r.id}`,
        label: r.label,
        description: r.description,
        group: r.group,
        href: r.href,
        icon: r.group === 'Agents' ? BOT_ICON
            : r.group === 'Tasks' ? TASK_ICON
            : r.group === 'Approvals' ? APPROVAL_ICON
            : r.group === 'Playbooks' ? PLAYBOOK_ICON
            : NAV_ICON,
    }));

    const allItems = query.trim() ? [...dynamicItems, ...staticItems] : staticItems;

    const filtered = query.trim()
        ? allItems.filter(
            (item) =>
                item.label.toLowerCase().includes(query.toLowerCase()) ||
                item.description.toLowerCase().includes(query.toLowerCase()),
        )
        : staticItems;

    const groupOrder: CommandGroup[] = ['Agents', 'Tasks', 'Approvals', 'Playbooks', 'Navigate', 'Actions', 'Settings'];
    const groupedItems = groupOrder
        .map((g) => ({ group: g, items: filtered.filter((item) => item.group === g) }))
        .filter((g) => g.items.length > 0);

    const flatFiltered = groupedItems.flatMap((g) => g.items);

    // Dynamic entity search
    const runSearch = (q: string) => {
        if (!q.trim() || q.length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const wsParam = workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : '';
        const qParam = encodeURIComponent(q);

        Promise.allSettled([
            fetch(`/api/agents?search=${qParam}${wsParam}`).then((r) => r.ok ? r.json() : { bots: [] }) as Promise<{ bots?: Array<{ id: string; name: string; role: string }> }>,
            fetch(`/api/tasks?search=${qParam}${wsParam}`).then((r) => r.ok ? r.json() : { tasks: [] }) as Promise<{ tasks?: Array<{ task_id: string; goal: string; status: string }> }>,
            fetch(`/api/playbooks?search=${qParam}${wsParam}`).then((r) => r.ok ? r.json() : { playbooks: [] }) as Promise<{ playbooks?: Array<{ id: string; name: string }> }>,
        ]).then(([agents, tasks, playbooks]) => {
            const results: SearchResult[] = [];

            const agentData = agents.status === 'fulfilled' ? agents.value : { bots: [] };
            for (const bot of (agentData.bots ?? []).slice(0, 4)) {
                results.push({
                    id: `agent-${bot.id}`,
                    label: bot.name,
                    description: `Agent · ${bot.role}`,
                    href: `/agents/${bot.id}`,
                    group: 'Agents',
                });
            }

            const taskData = tasks.status === 'fulfilled' ? tasks.value : { tasks: [] };
            for (const task of (taskData.tasks ?? []).slice(0, 4)) {
                results.push({
                    id: `task-${task.task_id}`,
                    label: task.goal,
                    description: `Task · ${task.status}`,
                    href: `/tasks?highlight=${task.task_id}`,
                    group: 'Tasks',
                });
            }

            const playbookData = playbooks.status === 'fulfilled' ? playbooks.value : { playbooks: [] };
            for (const pb of (playbookData.playbooks ?? []).slice(0, 4)) {
                results.push({
                    id: `pb-${pb.id}`,
                    label: pb.name,
                    description: 'Playbook',
                    href: `/playbooks?highlight=${pb.id}`,
                    group: 'Playbooks',
                });
            }

            setSearchResults(results);
            setSearching(false);
        }).catch(() => {
            setSearchResults([]);
            setSearching(false);
        });
    };

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen((prev) => !prev);
                setQuery('');
                setSearchResults([]);
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

    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => runSearch(query), 220);
        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                        placeholder="Search agents, tasks, approvals, playbooks…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Command search"
                        autoComplete="off"
                    />
                    {searching && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', marginRight: '0.5rem' }}>
                            searching…
                        </span>
                    )}
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
                    {flatFiltered.length === 0 && !searching && (
                        <p className="cmd-palette-empty">No results for &ldquo;{query}&rdquo;</p>
                    )}
                    {flatFiltered.length === 0 && searching && (
                        <p className="cmd-palette-empty">Searching…</p>
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
