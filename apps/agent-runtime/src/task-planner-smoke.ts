import { runTask } from './planner-loop.js';

async function smoke() {
    const result = await runTask(
        'Navigate to https://example.com, read the page, then send a slack message to #general with a one-line summary',
        'default',
        'smoke-agent-001'
    );

    console.log('=== SMOKE TEST RESULT ===');
    console.log('Success:', result.success);
    console.log('Goal:', result.goal);
    console.log('Steps taken:', result.steps_taken);
    console.log('Replans used:', result.replans_used);
    console.log('\n=== STEP DETAILS ===');
    for (const r of result.final_results) {
        const icon = r.success ? '✓' : '✗';
        console.log(`${icon} [${r.step_index}] ${r.action} (${r.duration_ms}ms)`);
        if (r.output) console.log('  output:', r.output.slice(0, 120));
        if (r.error) console.log('  error:', r.error);
    }
}

smoke().catch(console.error);
