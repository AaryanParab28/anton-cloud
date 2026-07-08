import { defineTool } from './base.js';

const WIKIPEDIA_SEARCH_ENDPOINT = 'https://en.wikipedia.org/w/api.php';

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '');
}

async function run(args) {
  const query = (args?.query || '').trim();
  if (!query) {
    return 'web_search error: no query provided.';
  }

  const url =
    `${WIKIPEDIA_SEARCH_ENDPOINT}?action=query&list=search&format=json&origin=*` +
    `&srlimit=3&srsearch=${encodeURIComponent(query)}`;

  let response;
  try {
    response = await fetch(url);
  } catch {
    return 'web_search error: network error reaching the search endpoint.';
  }

  if (!response.ok) {
    return `web_search error: search endpoint returned ${response.status}.`;
  }

  const data = await response.json();
  const results = data?.query?.search ?? [];
  if (results.length === 0) {
    return `No Wikipedia results found for "${query}".`;
  }

  return results
    .map((r, i) => `${i + 1}. ${r.title} — ${stripHtml(r.snippet)}`)
    .join('\n');
}

export default defineTool({
  name: 'web_search',
  description:
    'Search Wikipedia for a query and return the top matching article titles and snippets. ' +
    'This searches Wikipedia only, not the general web. Args: {"query": string}.',
  run,
});
