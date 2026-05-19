/**
 * workspace-vm-repository.ts
 *
 * Manages the WorkspaceVm record that tracks the single shared VM per workspace.
 * Multiple bot containers run on this VM to avoid spinning up one VM per agent.
 *
 * Port allocation strategy:
 *   - First bot on a new workspace VM always gets port 8080 (default agent port).
 *   - WorkspaceVm.nextContainerPort starts at 8081 and increments atomically.
 *   - claimContainerSlot() does both the port allocation and the count increment
 *     in a single Prisma update so concurrent provisioning jobs never collide.
 */

import type { PrismaClient } from "@prisma/client";

export type WorkspaceVmRecord = {
    id: string;
    workspaceId: string;
    tenantId: string;
    vmName: string;
    vmResourceId: string;
    resourceGroup: string;
    privateIp: string;
    region: string;
    vmSize: string;
    status: string;
    activeContainerCount: number;
    nextContainerPort: number;
};

export type CreateWorkspaceVmInput = Omit<
    WorkspaceVmRecord,
    "id" | "status" | "activeContainerCount" | "nextContainerPort"
>;

export interface WorkspaceVmRepository {
    /** Returns the shared VM for a workspace, or null if none exists yet. */
    findByWorkspaceId(workspaceId: string): Promise<WorkspaceVmRecord | null>;

    /** Creates a new WorkspaceVm record when the first bot in a workspace is provisioned. */
    create(input: CreateWorkspaceVmInput): Promise<WorkspaceVmRecord>;

    /**
     * Atomically claims a container slot on an existing VM:
     *   - increments activeContainerCount by 1
     *   - increments nextContainerPort by 1
     *   - returns the port allocated AND the new activeContainerCount
     */
    claimContainerSlot(workspaceVmId: string): Promise<{ port: number; activeContainerCount: number }>;

    /**
     * Releases a container slot (bot terminated):
     *   - decrements activeContainerCount by 1
     *   - returns the new count (0 means the VM can now be deprovisioned)
     */
    releaseContainerSlot(workspaceVmId: string): Promise<number>;

    /** Updates the vmSize field after an in-place resize. */
    updateVmSize(workspaceVmId: string, newVmSize: string): Promise<void>;

    /** Deletes the WorkspaceVm record after the VM has been fully deprovisioned. */
    delete(workspaceVmId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Prisma implementation
// ---------------------------------------------------------------------------

export class PrismaWorkspaceVmRepository implements WorkspaceVmRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async findByWorkspaceId(workspaceId: string): Promise<WorkspaceVmRecord | null> {
        return (this.prisma as any).workspaceVm.findUnique({
            where: { workspaceId },
        }) as Promise<WorkspaceVmRecord | null>;
    }

    async create(input: CreateWorkspaceVmInput): Promise<WorkspaceVmRecord> {
        return (this.prisma as any).workspaceVm.create({
            data: {
                ...input,
                // First bot always gets port 8080; next one will read 8081 via claimContainerSlot
                activeContainerCount: 1,
                nextContainerPort: 8081,
                status: "running",
            },
        }) as Promise<WorkspaceVmRecord>;
    }

    async claimContainerSlot(workspaceVmId: string): Promise<{ port: number; activeContainerCount: number }> {
        // Increment both fields in one atomic write, then derive allocated port from the result.
        // new nextContainerPort = old + 1  →  allocated port = new - 1
        const updated = await (this.prisma as any).workspaceVm.update({
            where: { id: workspaceVmId },
            data: {
                activeContainerCount: { increment: 1 },
                nextContainerPort: { increment: 1 },
            },
            select: { nextContainerPort: true, activeContainerCount: true },
        }) as { nextContainerPort: number; activeContainerCount: number };
        return { port: updated.nextContainerPort - 1, activeContainerCount: updated.activeContainerCount };
    }

    async releaseContainerSlot(workspaceVmId: string): Promise<number> {
        const updated = await (this.prisma as any).workspaceVm.update({
            where: { id: workspaceVmId },
            data: { activeContainerCount: { decrement: 1 } },
            select: { activeContainerCount: true },
        }) as { activeContainerCount: number };
        return updated.activeContainerCount;
    }

    async updateVmSize(workspaceVmId: string, newVmSize: string): Promise<void> {
        await (this.prisma as any).workspaceVm.update({
            where: { id: workspaceVmId },
            data: { vmSize: newVmSize },
        });
    }

    async delete(workspaceVmId: string): Promise<void> {
        await (this.prisma as any).workspaceVm.delete({ where: { id: workspaceVmId } });
    }
}
