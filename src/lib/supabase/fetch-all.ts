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
