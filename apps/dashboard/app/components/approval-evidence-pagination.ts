export type EvidencePaginationState = {
    page: number;
    pageCount: number;
    canPrev: boolean;
    canNext: boolean;
    startIndex: number;
    endIndex: number;
};

export const getEvidencePaginationState = (
    total: number,
    limit: number,
    offset: number,
): EvidencePaginationState => {
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;
    const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

    const pageCount = Math.max(1, Math.ceil(safeTotal / safeLimit));
    const page = Math.floor(safeOffset / safeLimit) + 1;
    const clampedPage = Math.min(pageCount, Math.max(1, page));

    const startIndex = safeTotal === 0 ? 0 : Math.min(safeTotal, safeOffset + 1);
    const endIndex = safeTotal === 0 ? 0 : Math.min(safeTotal, safeOffset + safeLimit);

    return {
        page: clampedPage,
        pageCount,
        canPrev: safeOffset > 0,
        canNext: safeOffset + safeLimit < safeTotal,
        startIndex,
        endIndex,
    };
};

export const isEvidencePaginationEnabled = (flagValue: string | undefined): boolean => {
    return flagValue === 'true';
};
