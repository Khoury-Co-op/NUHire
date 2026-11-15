import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadJobDescription } from './useJobDescription';

// loadJobDescription is the one copy of the assignment -> job PDF lookup that
// five student pages used to each carry. The error tells a page which step
// failed, because jobdes shows a popup for some failures and not others.

type Reply = { ok: boolean; body?: unknown };

function stubFetch(...replies: Reply[]) {
  const urls: string[] = [];
  const queue = [...replies];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const reply = queue.shift() ?? { ok: false };
      return { ok: reply.ok, json: async () => reply.body };
    })
  );
  return urls;
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('loadJobDescription', () => {
  it('finds the job title and then its PDF path', async () => {
    const urls = stubFetch(
      { ok: true, body: { job: 'Two Six Labs' } },
      { ok: true, body: { file_path: 'uploads/jobdescription/two-six.pdf' } }
    );
    const result = await loadJobDescription(1, 42, true);
    expect(result).toEqual({
      job: { title: 'Two Six Labs', filePath: 'uploads/jobdescription/two-six.pdf' },
      error: null,
    });
    expect(urls[0]).toMatch(/\/jobs\/assignment\/1\/42$/);
    expect(urls[1]).toMatch(/\/jobs\/title\?title=Two%20Six%20Labs&class_id=42$/);
  });

  it('stops after the title when the file is not wanted (the dashboard)', async () => {
    const urls = stubFetch({ ok: true, body: { job: 'Carbonite' } });
    const result = await loadJobDescription(1, 42, false);
    expect(result).toEqual({ job: { title: 'Carbonite', filePath: null }, error: null });
    expect(urls).toHaveLength(1);
  });

  it('reports a failed assignment request as "assignment"', async () => {
    stubFetch({ ok: false });
    expect(await loadJobDescription(1, 42, true)).toEqual({ job: null, error: 'assignment' });
  });

  it('reports a group with no job as "none" without asking for a PDF', async () => {
    const urls = stubFetch({
      ok: true,
      body: { message: 'No job assignment found for this group' },
    });
    expect(await loadJobDescription(1, 42, true)).toEqual({ job: null, error: 'none' });
    expect(urls).toHaveLength(1);
  });

  it('reports a failed PDF lookup as "file"', async () => {
    stubFetch({ ok: true, body: { job: 'Carbonite' } }, { ok: false });
    expect(await loadJobDescription(1, 42, true)).toEqual({ job: null, error: 'file' });
  });

  it('reports a request that throws as "network"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    expect(await loadJobDescription(1, 42, true)).toEqual({ job: null, error: 'network' });
  });
});
