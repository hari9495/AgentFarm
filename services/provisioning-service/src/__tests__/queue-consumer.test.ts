import test from "node:test";
import assert from "node:assert/strict";
import { ProvisioningQueueConsumer } from "../queue-consumer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockJob = { id: string; status: "queued"; createdAt: Date };

const MOCK_JOB: MockJob = { id: "job-1", status: "queued", createdAt: new Date() };

const PROCESS_ONCE_OK = { processed: 1, completed: 1, failed: 0, slaBreaches: 0, timeoutRemediations: 0, stuckAlerts: 0 };

function makePrisma(jobs: MockJob[] = [MOCK_JOB]) {
    return {
        provisioningJob: {
            findMany: async () => jobs,
        },
    };
}

function makeProcessor(result = PROCESS_ONCE_OK) {
    let calls = 0;
    return {
        get callCount() { return calls; },
        processOnce: async () => { calls++; return result; },
    };
}

// ---------------------------------------------------------------------------
// Test 1 — start() runs an initial poll immediately
// ---------------------------------------------------------------------------

test("start() runs an immediate poll on startup", async () => {
    const processor = makeProcessor();
    const consumer = new ProvisioningQueueConsumer(
        makePrisma() as any,
        processor as any,
        { PROVISIONING_POLL_INTERVAL_MS: "9999999", PROVISIONING_BATCH_SIZE: "3" },
    );

    await consumer.start();
    consumer.stop();

    assert.equal(processor.callCount, 1, "processOnce should be called once during startup poll");
});

// ---------------------------------------------------------------------------
// Test 2 — queued jobs trigger processOnce()
// ---------------------------------------------------------------------------

test("queued jobs cause processor.processOnce() to be called", async () => {
    const processor = makeProcessor();
    const consumer = new ProvisioningQueueConsumer(
        makePrisma([MOCK_JOB]) as any,
        processor as any,
        { PROVISIONING_POLL_INTERVAL_MS: "9999999", PROVISIONING_BATCH_SIZE: "3" },
    );

    await consumer.pollOnce();

    assert.equal(processor.callCount, 1, "processOnce should be called when jobs exist");
});

// ---------------------------------------------------------------------------
// Test 3 — empty queue skips processOnce()
// ---------------------------------------------------------------------------

test("empty queue does not call processor.processOnce()", async () => {
    const processor = makeProcessor();
    const consumer = new ProvisioningQueueConsumer(
        makePrisma([]) as any,
        processor as any,
        { PROVISIONING_POLL_INTERVAL_MS: "9999999" },
    );

    await consumer.pollOnce();

    assert.equal(processor.callCount, 0, "processOnce should not be called when queue is empty");
});

// ---------------------------------------------------------------------------
// Test 4 — processor error does not crash the consumer (error is caught)
// ---------------------------------------------------------------------------

test("poll cycle error is caught and consumer remains running", async () => {
    const failingProcessor = {
        processOnce: async () => { throw new Error("simulated processor failure"); },
    };

    const consumer = new ProvisioningQueueConsumer(
        makePrisma() as any,
        failingProcessor as any,
        { PROVISIONING_POLL_INTERVAL_MS: "9999999" },
    );

    // pollOnce should NOT throw
    await assert.doesNotReject(
        () => consumer.pollOnce(),
        "poll cycle errors must be caught internally",
    );
});

// ---------------------------------------------------------------------------
// Test 5 — start() is idempotent (calling twice does not double-start)
// ---------------------------------------------------------------------------

test("calling start() twice is a no-op (idempotent)", async () => {
    const processor = makeProcessor();
    const consumer = new ProvisioningQueueConsumer(
        makePrisma() as any,
        processor as any,
        { PROVISIONING_POLL_INTERVAL_MS: "9999999" },
    );

    await consumer.start();
    await consumer.start(); // second call should be ignored
    consumer.stop();

    assert.equal(processor.callCount, 1, "processOnce should only be called once despite double start()");
});

// ---------------------------------------------------------------------------
// Test 6 — stop() halts the consumer and isRunning() returns false
// ---------------------------------------------------------------------------

test("stop() halts polling and isRunning() returns false", async () => {
    const processor = makeProcessor();
    const consumer = new ProvisioningQueueConsumer(
        makePrisma() as any,
        processor as any,
        { PROVISIONING_POLL_INTERVAL_MS: "10", PROVISIONING_BATCH_SIZE: "3" },
    );

    await consumer.start();
    assert.equal(consumer.isRunning(), true, "consumer should be running after start()");

    consumer.stop();
    assert.equal(consumer.isRunning(), false, "consumer should not be running after stop()");

    const countAtStop = processor.callCount;

    // Wait longer than one interval to confirm no new polls fire
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    assert.equal(
        processor.callCount,
        countAtStop,
        "processOnce should not be called after stop()",
    );
});

// ---------------------------------------------------------------------------
// Test 7 — multiple poll cycles only call processOnce() once per cycle
// (processOnce() handles atomic claiming; consumer delegates cleanly)
// ---------------------------------------------------------------------------

test("each poll cycle calls processOnce() exactly once regardless of job count", async () => {
    const manyJobs: MockJob[] = [
        { id: "j1", status: "queued", createdAt: new Date() },
        { id: "j2", status: "queued", createdAt: new Date() },
        { id: "j3", status: "queued", createdAt: new Date() },
    ];

    const processor = makeProcessor();
    const consumer = new ProvisioningQueueConsumer(
        makePrisma(manyJobs) as any,
        processor as any,
        { PROVISIONING_POLL_INTERVAL_MS: "20", PROVISIONING_BATCH_SIZE: "3" },
    );

    await consumer.start();

    // Wait for at least 2 interval ticks beyond the initial poll
    await new Promise<void>((resolve) => setTimeout(resolve, 70));

    consumer.stop();

    // With interval=20ms and a 70ms wait window, at least 2 additional polls fire.
    // Each poll triggers exactly 1 processOnce() — not 3 (one per job).
    assert.ok(
        processor.callCount >= 2,
        `expected at least 2 processOnce() calls, got ${processor.callCount}`,
    );
    // Verify it's not multiplied by the number of jobs (which would be >=6)
    assert.ok(
        processor.callCount < 6,
        `processOnce should not be called once-per-job; got ${processor.callCount} calls`,
    );
});
