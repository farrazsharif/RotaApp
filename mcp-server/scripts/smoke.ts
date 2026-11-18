/**
 * Self-check: starts the built server over stdio, calls its tools as a client
 * would, and exits non-zero on any failure.
 *
 * Runs without Caremid credentials — it then asserts that a tool call fails
 * with a message that says what is missing, which is the behaviour a half-set-up
 * install depends on. With CAREMID_AGENT_EMAIL / CAREMID_AGENT_PASSWORD set it
 * also calls the live API.
 *
 *   npm run build && npm run smoke
 */
import { strict as assert } from 'node:assert';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const EMAIL = process.env.CAREMID_AGENT_EMAIL ?? '';
const PASSWORD = process.env.CAREMID_AGENT_PASSWORD ?? '';
const live = !!EMAIL && !!PASSWORD;

const client = new Client({ name: 'smoke-test', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: {
      ...getDefaultEnvironment(),
      CAREMID_AGENT_EMAIL: EMAIL,
      CAREMID_AGENT_PASSWORD: PASSWORD,
      ...(process.env.CAREMID_API_URL ? { CAREMID_API_URL: process.env.CAREMID_API_URL } : {}),
    },
  }),
);

const { tools } = await client.listTools();
assert.deepEqual(
  tools.map((t) => t.name).sort(),
  [
    'caremid_attach_policy_pdf',
    'caremid_cqc_readiness',
    'caremid_create_policy',
    'caremid_expiring_training',
    'caremid_file_staff_documents',
    'caremid_list_policies',
    'caremid_list_staff',
    'caremid_record_training',
    'caremid_refresh_training',
    'caremid_set_policy_reviews',
    'caremid_staff_compliance',
    'caremid_staff_file',
    'caremid_training_due',
    'caremid_unstaffed_visits',
  ],
  'unexpected tool list',
);

// The tools on this server that write. Every one only ADDS: none can replace,
// amend or delete a record. If this list grows it should grow because somebody
// decided to widen it - not because a write tool slipped in among the
// reporting ones.
const MAY_WRITE = new Set([
  'caremid_create_policy',
  'caremid_attach_policy_pdf',
  'caremid_set_policy_reviews',
  'caremid_file_staff_documents',
  'caremid_record_training',
  'caremid_refresh_training',
]);

for (const t of tools) {
  assert.ok(t.description && t.description.length > 80, `${t.name} needs a description the model can act on`);
  assert.equal(
    t.annotations?.readOnlyHint,
    !MAY_WRITE.has(t.name),
    `${t.name}: readOnlyHint must match whether the tool writes`,
  );
  if (MAY_WRITE.has(t.name)) {
    assert.equal(t.annotations?.destructiveHint, false, `${t.name} must not be marked destructive`);
  }
}

// Bad input is rejected before the handler runs, and comes back as a tool error.
const badDate = await client.callTool({
  name: 'caremid_unstaffed_visits',
  arguments: { from: '17/11/2026', to: '2026-11-23' },
});
assert.equal(badDate.isError, true, 'a non-ISO date should be rejected');

const badSearch = await client.callTool({ name: 'caremid_list_staff', arguments: { search: 'a' } });
assert.equal(badSearch.isError, true, 'a one-character search should be rejected');

if (!live) {
  // Without credentials every call must say so in words, not fail obscurely.
  const noCreds = await client.callTool({ name: 'caremid_list_staff', arguments: {} });
  assert.equal(noCreds.isError, true, 'a call with no credentials should fail');
  const text = JSON.stringify(noCreds.content);
  assert.ok(text.includes('CAREMID_AGENT_EMAIL'), 'the error should name the missing variables');
  console.error('Smoke test passed (offline: protocol, schemas and error paths only)');
} else {
  const staff = await client.callTool({ name: 'caremid_list_staff', arguments: { response_format: 'json' } });
  assert.ok(!staff.isError, `list_staff failed: ${JSON.stringify(staff.content)}`);
  const page = staff.structuredContent as { staff: { id: string; name: string }[]; total: number };
  assert.ok(Array.isArray(page.staff), 'list_staff should return a staff array');
  console.error(`  staff: ${page.total}`);

  const cqc = await client.callTool({ name: 'caremid_cqc_readiness', arguments: { response_format: 'json' } });
  assert.ok(!cqc.isError, `cqc_readiness failed: ${JSON.stringify(cqc.content)}`);
  const readiness = cqc.structuredContent as { overall_score: number; failing_count: number };
  assert.equal(typeof readiness.overall_score, 'number', 'readiness should return a score');
  console.error(`  CQC readiness: ${readiness.overall_score}%, ${readiness.failing_count} not green`);

  const training = await client.callTool({ name: 'caremid_expiring_training', arguments: { days: 90, response_format: 'json' } });
  assert.ok(!training.isError, `expiring_training failed: ${JSON.stringify(training.content)}`);

  const compliance = await client.callTool({ name: 'caremid_staff_compliance', arguments: { response_format: 'json' } });
  assert.ok(!compliance.isError, `staff_compliance failed: ${JSON.stringify(compliance.content)}`);

  console.error('Smoke test passed (live)');
}

await client.close();
