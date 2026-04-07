import { describe, it, expect } from 'vitest';
import { BaseConnector } from '../src/base/BaseConnector.js';
import type { HttpConnectorConfig } from '../src/base/types.js';

const config: HttpConnectorConfig = {
  baseUrl: 'https://example.com',
  auth: { type: 'none' },
};

class FakeConnector extends BaseConnector {
  private callCount = 0;
  private pages: Array<{ data: unknown[]; pageInfo: { hasNextPage: boolean; cursor?: string } | null }>;

  constructor(pages: Array<{ data: unknown[]; pageInfo: { hasNextPage: boolean; cursor?: string } | null }>) {
    super(config);
    this.pages = pages;
  }

  protected registerOperations(): void {
    this.registerOperation('items.list', async (_inputs) => {
      const page = this.pages[this.callCount++];
      return page as unknown as Record<string, unknown>;
    });
  }
}

describe('BaseConnector.executeAll', () => {
  it('fetches all pages until hasNextPage is false', async () => {
    const connector = new FakeConnector([
      { data: [{ id: 1 }, { id: 2 }], pageInfo: { hasNextPage: true, cursor: 'c1' } },
      { data: [{ id: 3 }, { id: 4 }], pageInfo: { hasNextPage: true, cursor: 'c2' } },
      { data: [{ id: 5 }], pageInfo: null },
    ]);

    const result = await connector.executeAll('items.list');

    expect(result.data).toHaveLength(5);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
    expect(result.pageInfo).toBeNull();
  });

  it('stops at maxPages even if more pages exist', async () => {
    const connector = new FakeConnector([
      { data: [{ id: 1 }], pageInfo: { hasNextPage: true, cursor: 'c1' } },
      { data: [{ id: 2 }], pageInfo: { hasNextPage: true, cursor: 'c2' } },
      { data: [{ id: 3 }], pageInfo: { hasNextPage: true, cursor: 'c3' } },
    ]);

    const result = await connector.executeAll('items.list', {}, 2);

    expect(result.data).toHaveLength(2);
    expect(result.pageInfo).toEqual({ hasNextPage: true, cursor: 'c2' });
  });

  it('handles a single page with no next page', async () => {
    const connector = new FakeConnector([
      { data: [{ id: 1 }], pageInfo: null },
    ]);

    const result = await connector.executeAll('items.list');

    expect(result.data).toHaveLength(1);
    expect(result.pageInfo).toBeNull();
  });

  it('handles empty first page', async () => {
    const connector = new FakeConnector([
      { data: [], pageInfo: null },
    ]);

    const result = await connector.executeAll('items.list');

    expect(result.data).toHaveLength(0);
  });

  it('passes original inputs through to each page request', async () => {
    const receivedInputs: Record<string, unknown>[] = [];
    const connector = new (class extends BaseConnector {
      protected registerOperations(): void {
        let call = 0;
        this.registerOperation('items.list', async (inputs) => {
          receivedInputs.push({ ...inputs });
          if (call++ === 0) {
            return { data: [1], pageInfo: { hasNextPage: true, cursor: 'c1' } } as unknown as Record<string, unknown>;
          }
          return { data: [2], pageInfo: null } as unknown as Record<string, unknown>;
        });
      }
    })(config);

    await connector.executeAll('items.list', { status: 'active', limit: 10 });

    expect(receivedInputs[0]).toEqual({ status: 'active', limit: 10 });
    expect(receivedInputs[1]).toEqual({ status: 'active', limit: 10, pageInfo: { hasNextPage: true, cursor: 'c1' } });
  });
});
