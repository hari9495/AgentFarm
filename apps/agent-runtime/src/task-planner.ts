import type { ActionPlan } from '@agentfarm/shared-types';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_API_VERSION = '2023-06-01';
const PLANNER_MODEL = 'claude-opus-4-5';

const PLANNER_SYSTEM_PROMPT = `
You are a task planning agent. Given a natural language task, output a JSON ActionPlan.

Available actions:
- workspace_web_login: params { url, username, password }
- workspace_web_navigate: params { url }
- workspace_web_read_page: params { }
- workspace_web_fill_form: params { fields (JSON string of label:value pairs), submit ("true"|"false") }
- workspace_web_click: params { text }
- workspace_web_extract_data: params { extract_type ("table"|"list"|"fields"|"all") }
- send_email: params { to, subject, body }
- send_slack: params { channel, message }

Output ONLY valid JSON. No markdown fences. No explanation outside the JSON.

Schema:
{
  "goal": "string — restate the task concisely",
  "steps": [
    {
      "action": "action_name",
      "params": { "key": "value" },
      "description": "one sentence why this step is needed"
    }
  ],
  "estimated_steps": number
}
`.trim();

export class PlannerError extends Error {
    constructor(message: string, public rawResponse: string) {
        super(message);
        this.name = 'PlannerError';
    }
}

export async function planTask(task: string, context?: string): Promise<ActionPlan> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const userMessage = context
        ? `Task: ${task}\n\nPrior execution context:\n${context}`
        : `Task: ${task}`;

    const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify({
            model: PLANNER_MODEL,
            max_tokens: 1024,
            system: PLANNER_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
        }),
    });

    if (!response.ok) {
        throw new PlannerError(`Anthropic request failed: ${response.status}`, '');
    }

    const parsed = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
    };

    const raw = (parsed.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');

    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    try {
        const plan = JSON.parse(cleaned) as ActionPlan;
        if (!plan.goal || !Array.isArray(plan.steps)) {
            throw new Error('Missing required fields: goal, steps');
        }
        return plan;
    } catch {
        throw new PlannerError(`Failed to parse plan JSON: ${cleaned.slice(0, 200)}`, raw);
    }
}
