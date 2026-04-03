/**
 * Seed script — creates example flows via the API.
 * Usage: npx tsx scripts/seed.ts
 * Requires the API server to be running on PORT (default 3000).
 */

const API_BASE = `http://localhost:${process.env.PORT ?? 3000}`;

async function post(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function main() {
  console.log(`Seeding flows against ${API_BASE}...`);

  // 1. Simple transform pipeline: extract → reshape → output
  const transformPipeline = await post('/api/flows', {
    name: 'Transform Pipeline',
    description: 'A 3-step transform pipeline that reshapes data',
    tenantId: 'demo-tenant',
    steps: [
      {
        id: 'extract',
        name: 'Extract Fields',
        type: 'transform',
        dependsOn: [],
        inputMapping: {
          name: { type: 'jsonata', value: 'trigger.data.name' },
          email: { type: 'jsonata', value: 'trigger.data.email' },
        },
      },
      {
        id: 'normalize',
        name: 'Normalize Data',
        type: 'transform',
        dependsOn: ['extract'],
        inputMapping: {
          displayName: { type: 'jsonata', value: '$uppercase(steps.extract.data.name)' },
          email: { type: 'jsonpath', value: '$.steps.extract.data.email' },
        },
      },
      {
        id: 'output',
        name: 'Final Output',
        type: 'transform',
        dependsOn: ['normalize'],
        inputMapping: {
          result: { type: 'template', value: 'User: {{steps.normalize.data.displayName}} <{{steps.normalize.data.email}}>' },
        },
      },
    ],
    errorPolicy: { onStepFailure: 'halt' },
    tags: ['demo', 'transform'],
  });
  console.log(`  Created: "${transformPipeline.name}" (${transformPipeline.id})`);

  // 2. Diamond dependency flow — parallel branches
  const diamondFlow = await post('/api/flows', {
    name: 'Diamond Parallel Flow',
    description: 'A diamond-shaped flow with parallel branches that merge',
    tenantId: 'demo-tenant',
    steps: [
      {
        id: 'start',
        name: 'Start',
        type: 'transform',
        dependsOn: [],
        inputMapping: {
          payload: { type: 'jsonata', value: 'trigger.data' },
        },
      },
      {
        id: 'branch_a',
        name: 'Branch A',
        type: 'transform',
        dependsOn: ['start'],
        inputMapping: {
          result: { type: 'literal', value: 'branch-a-done' },
        },
      },
      {
        id: 'branch_b',
        name: 'Branch B',
        type: 'transform',
        dependsOn: ['start'],
        inputMapping: {
          result: { type: 'literal', value: 'branch-b-done' },
        },
      },
      {
        id: 'merge',
        name: 'Merge Results',
        type: 'transform',
        dependsOn: ['branch_a', 'branch_b'],
        inputMapping: {
          a: { type: 'jsonpath', value: '$.steps.branch_a.data.result' },
          b: { type: 'jsonpath', value: '$.steps.branch_b.data.result' },
        },
      },
    ],
    errorPolicy: { onStepFailure: 'halt' },
    tags: ['demo', 'parallel'],
  });
  console.log(`  Created: "${diamondFlow.name}" (${diamondFlow.id})`);

  // 3. Script step demo
  const scriptFlow = await post('/api/flows', {
    name: 'Script Calculator',
    description: 'Uses a script step to compute values',
    tenantId: 'demo-tenant',
    steps: [
      {
        id: 'setup',
        name: 'Setup Input',
        type: 'transform',
        dependsOn: [],
        inputMapping: {
          numbers: { type: 'jsonata', value: 'trigger.data.numbers' },
        },
      },
      {
        id: 'calculate',
        name: 'Calculate Sum',
        type: 'script',
        dependsOn: ['setup'],
        inputMapping: {
          script: { type: 'literal', value: 'const nums = inputs.numbers || [1,2,3]; output = { sum: nums.reduce((a,b) => a+b, 0), count: nums.length };' },
          numbers: { type: 'jsonpath', value: '$.steps.setup.data.numbers' },
        },
      },
      {
        id: 'format',
        name: 'Format Result',
        type: 'transform',
        dependsOn: ['calculate'],
        inputMapping: {
          summary: { type: 'template', value: 'Sum of {{steps.calculate.data.count}} numbers = {{steps.calculate.data.sum}}' },
        },
      },
    ],
    errorPolicy: { onStepFailure: 'halt' },
    tags: ['demo', 'script'],
  });
  console.log(`  Created: "${scriptFlow.name}" (${scriptFlow.id})`);

  // 4. HTTP action flow (requires worker with HttpConnector)
  const httpFlow = await post('/api/flows', {
    name: 'HTTP Request Flow',
    description: 'Fetches data from an HTTP endpoint using the http connector',
    tenantId: 'demo-tenant',
    steps: [
      {
        id: 'fetch',
        name: 'Fetch JSON',
        type: 'action',
        connectorKey: 'http',
        operationId: 'request',
        dependsOn: [],
        inputMapping: {
          url: { type: 'literal', value: 'https://httpbin.org/json' },
          method: { type: 'literal', value: 'GET' },
        },
        retryPolicy: {
          maxAttempts: 2,
          strategy: 'fixed',
          initialDelayMs: 1000,
          maxDelayMs: 1000,
          retryableErrors: ['network', 'timeout'],
        },
      },
      {
        id: 'extract_data',
        name: 'Extract Response',
        type: 'transform',
        dependsOn: ['fetch'],
        inputMapping: {
          status: { type: 'jsonpath', value: '$.steps.fetch.data.status' },
          body: { type: 'jsonpath', value: '$.steps.fetch.data.body' },
        },
      },
    ],
    errorPolicy: { onStepFailure: 'halt' },
    tags: ['demo', 'http'],
  });
  console.log(`  Created: "${httpFlow.name}" (${httpFlow.id})`);

  console.log('\nDone! Trigger a flow with:');
  console.log(`  curl -X POST ${API_BASE}/api/flows/${transformPipeline.id}/trigger \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"type":"manual","data":{"name":"Alice","email":"alice@example.com"}}'`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
