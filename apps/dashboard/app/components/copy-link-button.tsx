'use client';

import { useState } from 'react';

type CopyLinkButtonProps = {
    href: string;
    label?: string;
    className?: string;
};

export function CopyLinkButton({ href, label = 'Copy Link', className }: CopyLinkButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const value = href.startsWith('http') ? href : `${window.location.origin}${href}`;

        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
        } catch {
            setCopied(false);
        }
    };

    return (
        <button type="button" onClick={() => void handleCopy()} className={className}>
            {copied ? 'Copied' : label}
        </button>
    );
}
