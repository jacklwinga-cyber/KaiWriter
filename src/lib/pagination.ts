/**
 * Works out where each page ends, the same way a printer would: a block that
 * doesn't fit on the current page moves to the next one, a block taller than a
 * page is split at the page height, and a manual page break always starts a
 * new page.
 */
export function computePageBreaks(
  blocks: Array<{ top: number; bottom: number; isPageBreak: boolean }>,
  contentHeight: number,
): number[] {
  const breaks: number[] = [];
  let pageStart = 0;
  for (const block of blocks) {
    if (block.isPageBreak) {
      breaks.push(block.bottom);
      pageStart = block.bottom;
      continue;
    }
    if (block.bottom > pageStart + contentHeight && block.top > pageStart) {
      breaks.push(block.top);
      pageStart = block.top;
    }
    while (block.bottom > pageStart + contentHeight) {
      pageStart += contentHeight;
      breaks.push(pageStart);
    }
  }
  return breaks;
}
