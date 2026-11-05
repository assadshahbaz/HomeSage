import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromptLoader } from './prompt-loader.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'prompts-'));
  await writeFile(join(directory, 'sql.v1.md'), 'Version one.');
  await writeFile(join(directory, 'sql.v2.md'), 'Version two.');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('PromptLoader', () => {
  it('loads a prompt by name and version', async () => {
    await expect(new PromptLoader().load(directory, 'sql', 2)).resolves.toEqual({
      name: 'sql',
      version: 2,
      text: 'Version two.',
    });
  });

  it('reads a file once and serves it from memory after that', async () => {
    const loader = new PromptLoader();
    await loader.load(directory, 'sql', 1);
    await writeFile(join(directory, 'sql.v1.md'), 'Changed on disk.');

    await expect(loader.load(directory, 'sql', 1)).resolves.toMatchObject({ text: 'Version one.' });
  });

  it('fails loudly on a version that does not exist, naming the file', async () => {
    await expect(new PromptLoader().load(directory, 'sql', 3)).rejects.toThrow(
      `Prompt sql version 3 not found at ${join(directory, 'sql.v3.md')}`,
    );
  });

  it('does not remember a failed read', async () => {
    const loader = new PromptLoader();
    await expect(loader.load(directory, 'sql', 3)).rejects.toThrow();
    await writeFile(join(directory, 'sql.v3.md'), 'Version three.');

    await expect(loader.load(directory, 'sql', 3)).resolves.toMatchObject({
      text: 'Version three.',
    });
  });
});
