/**
 * Unwrap a list response.
 *
 * The API is paginated, so list endpoints answer `{count, next, previous,
 * results: [...]}`. A bare array is still accepted because a few endpoints
 * (custom actions, and anything hit with `?page_size=`) can return one, and
 * because a component that renders `[]` on a shape it didn't expect fails
 * silently — the list just looks empty, which reads as "no bookings yet"
 * rather than as a bug.
 */
export const asList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

/**
 * Total number of matching rows, not just the ones on this page.
 *
 * Pair with `?page_size=1` when all you want is the tally — the server counts
 * with SQL instead of the client paging through the whole table to do it.
 */
export const countOf = (data) => {
  if (typeof data?.count === 'number') return data.count;
  return asList(data).length;
};

export default asList;
