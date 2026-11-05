import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

/** A prompt file's text, with the name and version eval reports record it under. */
export interface Prompt {
  readonly name: string;
  readonly version: number;
  readonly text: string;
}

/**
 * Reads versioned prompt files, `<name>.v<version>.md`, from the folder of the
 * feature that owns them. A change to a prompt is a new version file, so eval
 * results stay comparable. Each file is read once and then served from memory.
 */
@Injectable()
export class PromptLoader {
  private readonly cache = new Map<string, Promise<Prompt>>();

  /**
   * Loads a prompt by name and version from `directory`. A version that does not
   * exist rejects with the full path, so a typo never falls back to another prompt.
   */
  public load(directory: string, name: string, version: number): Promise<Prompt> {
    const file = join(directory, `${name}.v${String(version)}.md`);
    const cached = this.cache.get(file);
    if (cached) {
      return cached;
    }

    const loading = readFile(file, 'utf8').then(
      (text) => ({ name, version, text }),
      (error: unknown) => {
        // A failed read is not cached, so a file added later is picked up.
        this.cache.delete(file);
        throw new Error(`Prompt ${name} version ${String(version)} not found at ${file}`, {
          cause: error,
        });
      },
    );
    this.cache.set(file, loading);
    return loading;
  }
}
