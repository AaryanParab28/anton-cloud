export function defineTool({ name, description, run }) {
  if (!name || !description || typeof run !== 'function') {
    throw new Error('Tool must have a name, description, and run(args) function.');
  }
  return { name, description, run };
}
