const ANY_PLACEHOLDER = /\{\{[^}]*\}\}/;

/**
 * Fills each `{{key}}` in a prompt template with the value under that key. A
 * template missing a placeholder, or carrying one nobody fills, is a broken
 * prompt version and fails loudly, naming the prompt.
 */
export function fillPromptTemplate(
  prompt: string,
  template: string,
  fills: Readonly<Record<string, () => string>>,
): string {
  let rendered = template;
  for (const [key, fill] of Object.entries(fills)) {
    const placeholder = `{{${key}}}`;
    if (!rendered.includes(placeholder)) {
      throw new Error(`${prompt} prompt template has no ${placeholder}`);
    }
    rendered = rendered.replaceAll(placeholder, fill());
  }
  const leftover = ANY_PLACEHOLDER.exec(rendered);
  if (leftover) {
    throw new Error(`${prompt} prompt template has an unknown placeholder ${leftover[0]}`);
  }
  return rendered;
}
