import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateApiDocFromOpenApi, generateApiDocFromCode } from './api-doc-generator.js';
import type { OpenApiDocument } from './api-doc-generator.js';

describe('generateApiDocFromOpenApi', () => {
    it('OpenAPI with GET and POST produces correct Markdown headings', () => {
        const spec: OpenApiDocument = {
            openapi: '3.0.0',
            info: { title: 'Test API', version: '1.0.0' },
            paths: {
                '/users': {
                    get: {
                        summary: 'List users',
                        responses: { '200': { description: 'OK' } },
                    },
                    post: {
                        summary: 'Create user',
                        responses: { '201': { description: 'Created' }, '400': { description: 'Bad Request' } },
                    },
                },
            },
        };
        const result = generateApiDocFromOpenApi(spec);
        assert.ok(result.includes('# Test API'), 'Should include title heading');
        assert.ok(result.includes('## GET /users'), 'Should include GET heading');
        assert.ok(result.includes('## POST /users'), 'Should include POST heading');
        assert.ok(result.includes('List users'), 'Should include GET summary');
        assert.ok(result.includes('Create user'), 'Should include POST summary');
        assert.ok(result.includes('`200`'), 'Should include 200 response');
        assert.ok(result.includes('`201`'), 'Should include 201 response');
    });

    it('OpenAPI with no paths returns minimal output', () => {
        const spec: OpenApiDocument = {
            openapi: '3.0.0',
            info: { title: 'Empty API', version: '0.1.0' },
            paths: {},
        };
        const result = generateApiDocFromOpenApi(spec);
        assert.ok(result.includes('# Empty API'), 'Should include title');
        assert.ok(result.includes('No paths defined'), 'Should note empty paths');
    });

    it('OpenAPI with parameters renders parameter table', () => {
        const spec: OpenApiDocument = {
            openapi: '3.0.0',
            info: { title: 'Param API', version: '1.0.0' },
            paths: {
                '/items': {
                    get: {
                        summary: 'Get items',
                        parameters: [
                            { name: 'limit', in: 'query', required: false, description: 'Max results', schema: { type: 'integer' } },
                            { name: 'id', in: 'path', required: true, description: 'Item ID', schema: { type: 'string' } },
                        ],
                        responses: { '200': { description: 'OK' } },
                    },
                },
            },
        };
        const result = generateApiDocFromOpenApi(spec);
        assert.ok(result.includes('`limit`'), 'Should include limit param');
        assert.ok(result.includes('`id`'), 'Should include id param');
        assert.ok(result.includes('**required**'), 'Should mark required params');
        assert.ok(result.includes('optional'), 'Should mark optional params');
    });
});

describe('generateApiDocFromCode', () => {
    it('TypeScript source with JSDoc extracts doc', () => {
        const source = `
/**
 * Creates a new user account.
 * @param name - The user's display name.
 * @returns The created user ID.
 */
export async function createUser(name: string): Promise<string> {
    return 'id';
}
`;
        const result = generateApiDocFromCode(source, 'typescript');
        assert.ok(result.includes('## `createUser`'), 'Should include function heading');
        assert.ok(result.includes("Creates a new user account"), 'Should include description');
    });

    it('TypeScript source with no JSDoc comments returns empty string', () => {
        const source = `
export function noDoc(x: number): number {
    return x * 2;
}
`;
        const result = generateApiDocFromCode(source, 'typescript');
        assert.equal(result, '', 'Should return empty string when no comments');
    });

    it('Python source with docstrings extracts doc', () => {
        const source = `
def get_user(user_id: str):
    """
    Retrieve a user by their ID.

    Args:
        user_id: The unique identifier of the user.
    """
    return None
`;
        const result = generateApiDocFromCode(source, 'python');
        assert.ok(result.includes('## `get_user`'), 'Should include function heading');
        assert.ok(result.includes('Retrieve a user by their ID'), 'Should include docstring content');
    });

    it('Python source with no docstrings returns empty string', () => {
        const source = `
def no_doc():
    pass
`;
        const result = generateApiDocFromCode(source, 'python');
        assert.equal(result, '', 'Should return empty string when no docstrings');
    });
});
