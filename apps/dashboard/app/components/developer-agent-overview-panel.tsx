'use client'

import Link from 'next/link'

interface DevTile {
    href: string
    icon: string
    title: string
    description: string
}

const TILES: DevTile[] = [
    {
        href: '/pr-drafts',
        icon: '⎇',
        title: 'PR Drafts',
        description: 'Review and publish AI-generated pull request drafts awaiting human sign-off.',
    },
    {
        href: '/ci',
        icon: '⚙',
        title: 'CI / CD Triage',
        description: 'Diagnose pipeline failures, root-cause hypotheses, and actionable fix suggestions.',
    },
    {
        href: '/memory',
        icon: '◉',
        title: 'Agent Memory',
        description: 'Browse episodic and semantic memory entries recorded by your Developer agent.',
    },
]

export function DeveloperAgentOverviewPanel() {
    return (
        <section aria-label="Developer Agent" className="dev-agent-panel">
            <header className="dev-agent-panel-header">
                <p className="eyebrow">Developer Agent</p>
                <span className="dev-agent-panel-header-sep" aria-hidden="true">—</span>
                <p className="dev-agent-panel-subtitle">Quick Actions</p>
            </header>

            <div className="dev-agent-tiles">
                {TILES.map((tile) => (
                    <Link key={tile.href} href={tile.href} className="dev-agent-tile card">
                        <div className="dev-agent-tile-header">
                            <span className="dev-agent-tile-icon" aria-hidden="true">
                                {tile.icon}
                            </span>
                            <h3 className="dev-agent-tile-title">{tile.title}</h3>
                        </div>
                        <p className="dev-agent-tile-desc">{tile.description}</p>
                    </Link>
                ))}
            </div>
        </section>
    )
}
