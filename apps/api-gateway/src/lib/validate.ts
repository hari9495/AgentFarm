export type ValidationRule = {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'uuid';
    maxLength?: number;
    minLength?: number;
    pattern?: RegExp;
};

export type ValidationSchema = Record<string, ValidationRule>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validate(
    data: Record<string, unknown>,
    schema: ValidationSchema,
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [key, rule] of Object.entries(schema)) {
        const value = data[key];
        const missing = value === undefined || value === null || value === '';

        if (rule.required && missing) {
            errors.push(`${key} is required`);
            continue;
        }

        if (missing) continue;

        if (rule.type === 'string' && typeof value !== 'string') {
            errors.push(`${key} must be a string`);
            continue;
        }

        if (rule.type === 'uuid') {
            if (typeof value !== 'string' || !UUID_RE.test(value)) {
                errors.push(`${key} must be a valid UUID`);
                continue;
            }
        }

        if (typeof value === 'string') {
            if (rule.maxLength !== undefined && value.length > rule.maxLength) {
                errors.push(`${key} must be at most ${rule.maxLength} characters`);
                continue;
            }
            if (rule.minLength !== undefined && value.length < rule.minLength) {
                errors.push(`${key} must be at least ${rule.minLength} characters`);
                continue;
            }
            if (rule.pattern !== undefined && !rule.pattern.test(value)) {
                errors.push(`${key} is invalid`);
                continue;
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
