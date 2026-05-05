'use client';

import { useEffect, useRef, useState } from 'react';

type MissionMiniNavItem = {
    id: string;
    label: string;
};

type MissionMiniNavProps = {
    items: MissionMiniNavItem[];
};

type PillStyle = {
    left: number;
    top: number;
    width: number;
    height: number;
    opacity: number;
};

export function MissionMiniNav({ items }: MissionMiniNavProps) {
    const [activeId, setActiveId] = useState(items[0]?.id ?? '');
    const [pillStyle, setPillStyle] = useState<PillStyle>({ left: 0, top: 0, width: 0, height: 0, opacity: 0 });
    const navRef = useRef<HTMLElement | null>(null);
    const linkRefsMap = useRef<Map<string, HTMLAnchorElement>>(new Map());

    // Measure scroll offset from sticky nav height
    useEffect(() => {
        const navElement = navRef.current;

        if (!navElement) {
            return;
        }

        const setScrollOffset = () => {
            const navHeight = navElement.offsetHeight;
            const computedStyle = window.getComputedStyle(navElement);
            const stickyTop = Number.parseFloat(computedStyle.top || '0') || 0;
            const anchorBuffer = 10;
            const offset = Math.ceil(navHeight + stickyTop + anchorBuffer);
            document.documentElement.style.setProperty('--mission-scroll-offset', `${offset}px`);
        };

        setScrollOffset();

        const resizeObserver = new ResizeObserver(() => {
            setScrollOffset();
        });

        resizeObserver.observe(navElement);
        window.addEventListener('resize', setScrollOffset);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', setScrollOffset);
            document.documentElement.style.removeProperty('--mission-scroll-offset');
        };
    }, []);

    // Update sliding pill position whenever activeId changes
    useEffect(() => {
        const nav = navRef.current;
        const link = linkRefsMap.current.get(activeId);

        if (!nav || !link) {
            return;
        }

        const navRect = nav.getBoundingClientRect();
        const linkRect = link.getBoundingClientRect();

        setPillStyle({
            left: linkRect.left - navRect.left,
            top: linkRect.top - navRect.top,
            width: linkRect.width,
            height: linkRect.height,
            opacity: 1,
        });
    }, [activeId]);

    useEffect(() => {
        if (items.length === 0) {
            return;
        }

        const sections = items
            .map((item) => document.getElementById(item.id))
            .filter((section): section is HTMLElement => section instanceof HTMLElement);

        if (sections.length === 0) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const visibleEntries = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

                if (visibleEntries.length > 0) {
                    setActiveId(visibleEntries[0].target.id);
                    return;
                }

                const viewportAnchor = window.innerHeight * 0.24;
                const closestSection = sections
                    .map((section) => ({
                        id: section.id,
                        distance: Math.abs(section.getBoundingClientRect().top - viewportAnchor),
                    }))
                    .sort((a, b) => a.distance - b.distance)[0];

                if (closestSection) {
                    setActiveId(closestSection.id);
                }
            },
            {
                root: null,
                rootMargin: '-18% 0px -58% 0px',
                threshold: [0.1, 0.35, 0.6, 0.85],
            },
        );

        for (const section of sections) {
            observer.observe(section);
        }

        return () => {
            observer.disconnect();
        };
    }, [items]);

    return (
        <nav ref={navRef} className="mission-mini-nav" aria-label="One view section navigation">
            <span
                aria-hidden
                className="mission-mini-nav-pill"
                style={{
                    transform: `translate(${pillStyle.left}px, ${pillStyle.top}px)`,
                    width: `${pillStyle.width}px`,
                    height: `${pillStyle.height}px`,
                    opacity: pillStyle.opacity,
                }}
            />
            {items.map((item) => {
                const isActive = item.id === activeId;

                return (
                    <a
                        key={item.id}
                        ref={(el) => {
                            if (el) linkRefsMap.current.set(item.id, el);
                            else linkRefsMap.current.delete(item.id);
                        }}
                        href={`#${item.id}`}
                        className={`mission-mini-nav-link ${isActive ? 'active' : ''}`}
                        aria-current={isActive ? 'location' : undefined}
                        onClick={() => setActiveId(item.id)}
                    >
                        {item.label}
                    </a>
                );
            })}
            <div className="mission-mini-nav-progress" aria-hidden>
                <div
                    className="mission-mini-nav-progress-fill"
                    style={{
                        width: `${items.length > 1 ? (items.findIndex((item) => item.id === activeId) / (items.length - 1)) * 100 : 0}%`,
                    }}
                />
            </div>
        </nav>
    );
}
