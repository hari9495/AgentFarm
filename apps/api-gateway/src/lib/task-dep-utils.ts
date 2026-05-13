/**
 * Shared dependency-check helpers for the task queue.
 * Kept minimal so both task-queue routes (using TaskQueuePrisma) and
 * runtime-tasks routes (using full PrismaClient) can consume it
 * without extra type gymnastics.
 */

/**
 * Minimal Prisma-like shape needed by checkDependenciesMet.
 * Both TaskQueuePrisma (after widening) and PrismaClient (via cast)
 * satisfy this interface.
 */
export type DepCheckDb = {
    taskQueueEntry: {
        findMany(args: {
            where: Record<string, unknown>;
            select?: Record<string, boolean>;
        }): Promise<Array<Record<string, unknown>>>;
    };
};

/**
 * Checks whether all listed task IDs have status === 'done'.
 *
 * Returns:
 *   met:      true if every dependency is done (or dependsOn is empty)
 *   blocking: IDs that are either unknown or not yet done
 */
export async function checkDependenciesMet(
    dependsOn: string[],
    db: DepCheckDb,
): Promise<{ met: boolean; blocking: string[] }> {
    if (dependsOn.length === 0) {
        return { met: true, blocking: [] };
    }

    const entries = await db.taskQueueEntry.findMany({
        where: { id: { in: dependsOn } },
        select: { id: true, status: true },
    });

    const foundIds = new Set(entries.map((e) => String(e['id'])));
    const unknownIds = dependsOn.filter((id) => !foundIds.has(id));
    if (unknownIds.length > 0) {
        return { met: false, blocking: unknownIds };
    }

    const blocking = entries
        .filter((e) => e['status'] !== 'done')
        .map((e) => String(e['id']));

    return { met: blocking.length === 0, blocking };
}
