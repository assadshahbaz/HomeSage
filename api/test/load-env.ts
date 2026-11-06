import { existsSync } from 'node:fs';
import { repoPath } from '../tools/repo-path.ts';

// End to end tests talk to the Docker services, whose settings live in the
// repo root .env. Loading it here keeps the test commands free of flags.
const envPath = repoPath('.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
