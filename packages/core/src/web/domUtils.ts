/**
 * Safely find an element by its ID, even if the ID starts with a digit or contains special characters.
 * querySelector('#ID') fails for IDs starting with digits, but attribute selectors [id='ID'] work.
 * This helper also leverages document.getElementById for performance when possible.
 */
export function getElementBySafeId(container: HTMLElement | Document, id: string): HTMLElement | null {
  if (!id) return null;
  // Try direct getElementById first if it's a Document or if container is in a Document
  if (container instanceof Document) {
    return container.getElementById(id);
  }
  if (container.ownerDocument) {
    const el = container.ownerDocument.getElementById(id);
    if (el && container.contains(el)) return el;
  }
  // Fallback to attribute selector which handles IDs starting with digits
  // We escape double quotes in the ID to stay safe
  const escapedId = id.replace(/"/g, '\\"');
  try {
    return container.querySelector(`[id="${escapedId}"]`) as HTMLElement | null;
  } catch (e) {
    return null;
  }
}
