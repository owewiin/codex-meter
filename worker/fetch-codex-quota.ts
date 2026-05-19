import { chromium } from 'playwright';
import { parseQuotaText } from './parser';
import type { CodexStatus } from '../src/shared/types';

interface Args {
  mode: 'fixture' | 'login' | 'fetch';
  text?: string;
  profile?: string;
  url?: string;
  timeoutMs: number;
}

function readArg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function parseArgs(): Args {
  const mode = (process.argv[2] ?? 'fixture') as Args['mode'];
  if (!['fixture', 'login', 'fetch'].includes(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }
  return {
    mode,
    text: readArg('text', ''),
    profile: readArg('profile'),
    url: readArg('url', 'https://chatgpt.com/'),
    timeoutMs: Number(readArg('timeout-ms', '60000')),
  };
}

function failure(errorCode: CodexStatus extends infer _ ? 'WORKER_ERROR' : never, error: string, url?: string): CodexStatus {
  return {
    ok: false,
    source: 'chatgpt_web',
    errorCode,
    error,
    fetchedAt: new Date().toISOString(),
    usagePageUrl: url,
  };
}

async function login(args: Args): Promise<CodexStatus> {
  if (!args.profile) return failure('WORKER_ERROR', 'Missing --profile path', args.url);
  const context = await chromium.launchPersistentContext(args.profile, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(args.url ?? 'https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
  await page.waitForTimeout(5000);
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  await context.close();
  const parsed = parseQuotaText(text, { usagePageUrl: args.url });
  if (parsed.ok) return parsed;
  return {
    ok: false,
    source: 'chatgpt_web',
    errorCode: 'LOGIN_REQUIRED',
    error: 'Login window opened; quota text was not visible yet. Log in, then run refresh again.',
    fetchedAt: new Date().toISOString(),
    usagePageUrl: args.url,
    rawText: parsed.rawText,
  };
}

async function fetchQuota(args: Args): Promise<CodexStatus> {
  if (!args.profile) return failure('WORKER_ERROR', 'Missing --profile path', args.url);
  const context = await chromium.launchPersistentContext(args.profile, {
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(args.url ?? 'https://chatgpt.com/', { waitUntil: 'networkidle', timeout: args.timeoutMs });
    const text = await page.locator('body').innerText({ timeout: 10000 });
    return parseQuotaText(text, { usagePageUrl: args.url });
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs();
  let result: CodexStatus;
  if (args.mode === 'fixture') {
    result = parseQuotaText(args.text ?? '', { source: 'fixture', usagePageUrl: args.url });
  } else if (args.mode === 'login') {
    result = await login(args);
  } else {
    result = await fetchQuota(args);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify(failure('WORKER_ERROR', message), null, 2)}\n`);
  process.exitCode = 1;
});
