const PAGE_SIZE = 1000;

type QueryPage<T> = {
  data: T[] | null;
  error: unknown;
};

type RangeQuery<T> = {
  range(from: number, to: number): PromiseLike<QueryPage<T>>;
};

export async function fetchAllSupabaseRows<T>(
  queryFactory: () => RangeQuery<T>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await queryFactory().range(from, to);

    if (error) {
      throw error;
    }

    rows.push(...(data ?? []));

    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
}

// Pagination limits response size, not the URL produced by an IN filter.
// Keep each request small enough for the proxy, including UUID identifiers.
export async function fetchSupabaseRowsForIds<T, Id extends string | number>(
  ids: readonly Id[],
  queryFactory: (batch: Id[]) => RangeQuery<T>,
): Promise<T[]> {
  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];
  const batchSize = 100;
  const concurrency = 3;

  for (let start = 0; start < uniqueIds.length; start += batchSize * concurrency) {
    const queries: Promise<T[]>[] = [];
    for (let offset = start; offset < Math.min(start + batchSize * concurrency, uniqueIds.length); offset += batchSize) {
      const batch = uniqueIds.slice(offset, offset + batchSize);
      queries.push(fetchAllSupabaseRows(() => queryFactory(batch)));
    }
    // Reject the whole export on a failed page rather than returning a partial file.
    for (const batchRows of await Promise.all(queries)) rows.push(...batchRows);
  }

  return rows;
}
