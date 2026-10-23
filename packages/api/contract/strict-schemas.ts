// Strict response validators built from the corrected OpenAPI snapshot (T-B7, design 01 R-16).
// "Strict": every documented property must be present with the documented type and nullability, and
// undocumented properties fail. A contract test therefore proves what openapi-fix.ts assumes (OA-1:
// every response property is present, `null` when empty) and catches fields the snapshot doesn't know.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { applyFixes, type OpenApiDocument, type SchemaNode } from '../scripts/openapi-fix.ts';
import { SNAPSHOT_FILE } from '../scripts/paths.ts';

const COMPONENT_REF = '#/components/schemas/';
const DEFS_REF = '#/$defs/';
const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const JSON_MEDIA_TYPE = 'application/json';
const DEFAULT_RESPONSE = 'default';

export class ContractSetupError extends Error {
  override name = 'ContractSetupError';
}

/** The pinned snapshot with the same corrections `api:gen` applies. */
export function loadCorrectedDocument(file: string = SNAPSHOT_FILE): OpenApiDocument {
  return applyFixes(JSON.parse(readFileSync(file, 'utf8')) as OpenApiDocument).document;
}

/**
 * Closes every object schema that lists its properties (`additionalProperties: false`). Throws on an
 * `allOf` of several members: closing each member would reject the others' properties, so that shape needs
 * an explicit decision first.
 */
export function strictDocument(document: OpenApiDocument): OpenApiDocument {
  const copy = structuredClone(document);
  const visit = (node: unknown, where: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        visit(item, `${where}[${index}]`);
      });
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const schema = node as SchemaNode;
    if (Array.isArray(schema.allOf) && schema.allOf.length > 1) {
      throw new ContractSetupError(`allOf with ${schema.allOf.length} members at ${where}`);
    }
    if (
      schema.properties !== undefined &&
      typeof schema.properties === 'object' &&
      !('additionalProperties' in schema)
    ) {
      schema.additionalProperties = false;
    }
    for (const [key, value] of Object.entries(schema)) visit(value, `${where}.${key}`);
  };
  visit(copy.components?.schemas, 'components.schemas');
  visit(copy.paths, 'paths');
  return copy;
}

/** A response body the contract rejects; the message names the endpoint and every failing field. */
export class ContractViolation extends Error {
  override name = 'ContractViolation';
}

export interface CheckedResponse {
  readonly method: string;
  /** The concrete path that was called (for the message). */
  readonly path: string;
  readonly status: number;
  readonly body: unknown;
}

export interface Contract {
  /** Throws `ContractViolation` unless `response` matches the documented response of `template`. */
  assertResponse(response: CheckedResponse, template: string): void;
}

const rewriteRefs = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value).replaceAll(COMPONENT_REF, DEFS_REF)) as unknown;

/** `data[0].price` from a Zod issue path. */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return '(body)';
  return path.reduce<string>((label, key) => {
    if (typeof key === 'number') return `${label}[${key}]`;
    return label === '' ? String(key) : `${label}.${String(key)}`;
  }, '');
}

/**
 * One line per failing field. A failed `anyOf` (e.g. `T | null`) only says "Invalid input", so its branches
 * are expanded, leaving out the `null` branch: "expected array, received undefined" is the useful part.
 */
export function describeIssues(
  issues: readonly z.core.$ZodIssue[],
  prefix: readonly PropertyKey[] = [],
): string[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code !== 'invalid_union' || issue.errors.length === 0) {
      return [`${formatIssuePath(path)}: ${issue.message}`];
    }
    const branches = issue.errors.filter(
      (branch) => !branch.every((nested) => nested.code === 'invalid_type' && nested.expected === 'null'),
    );
    return (branches.length > 0 ? branches : issue.errors).flatMap((branch) => describeIssues(branch, path));
  });
}

export function createContract(
  document: OpenApiDocument = strictDocument(loadCorrectedDocument()),
): Contract {
  const defs = rewriteRefs(document.components?.schemas ?? {});
  const validators = new Map<string, z.ZodType>();

  function responseSchema(method: string, template: string, status: number): z.ZodType {
    const key = `${method} ${template} ${status}`;
    const cached = validators.get(key);
    if (cached) return cached;
    const operation = document.paths?.[template]?.[method.toLowerCase()];
    if (!operation) throw new ContractSetupError(`${method} ${template} is not in the OpenAPI snapshot`);
    const responses = (operation.responses ?? {}) as Record<
      string,
      { content?: Record<string, { schema?: unknown }> }
    >;
    const response = responses[String(status)] ?? responses[DEFAULT_RESPONSE];
    if (!response) throw new ContractSetupError(`${method} ${template} documents no ${status} response`);
    const schema = response.content?.[JSON_MEDIA_TYPE]?.schema;
    const validator =
      schema === undefined
        ? z.undefined()
        : z.fromJSONSchema({
            $schema: JSON_SCHEMA_DIALECT,
            ...(rewriteRefs(schema) as object),
            $defs: defs,
          } as Parameters<typeof z.fromJSONSchema>[0]);
    validators.set(key, validator);
    return validator;
  }

  return {
    assertResponse(response, template) {
      const endpoint = `${response.method} ${response.path} → ${response.status}`;
      const result = responseSchema(response.method, template, response.status).safeParse(response.body);
      if (result.success) return;
      const lines = [...new Set(describeIssues(result.error.issues))].map((line) => `  ${line}`);
      throw new ContractViolation(`${endpoint} does not match ${template}:\n${lines.join('\n')}`);
    },
  };
}
