const DATA_NAME = /^[a-z][a-z_]*$/;

/**
 * Wraps user questions and retrieved text in named tags for the user turn, so
 * the model reads them as data and never as instructions. Any tag in the
 * content that matches one of the block names is escaped, so a question or a
 * seller's answer cannot close its block early and write outside it.
 */
export function renderPromptData(data: Readonly<Record<string, string>>): string {
  const names = Object.keys(data);
  if (names.length === 0) {
    return '';
  }
  for (const name of names) {
    if (!DATA_NAME.test(name)) {
      throw new Error(`Prompt data name ${name} must be lower case letters and underscores`);
    }
  }
  const tags = new RegExp(`<(/?(?:${names.join('|')})\\b)`, 'gi');

  return names
    .map((name) => {
      const content = data[name].replace(tags, '&lt;$1');
      return `<${name}>\n${content}\n</${name}>`;
    })
    .join('\n\n');
}
