import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Account } from '@easymodal/shared';

/**
 * Local plaintext config store — matches how `modal`, `aws`, `gh`, and `git`
 * CLI tools store credentials: a user-readable file protected by filesystem
 * permissions (0600). No encryption layer, no native deps, no passphrase.
 *
 * Location: ~/.easymodal/config.json
 */
const CONFIG_DIR = process.env.EASYMODAL_CONFIG_DIR || join(homedir(), '.easymodal');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface StoredAccount extends Account {
  /** Optional HuggingFace token associated with this account. */
  huggingfaceToken?: string;
  /**
   * Persistent AI Toolkit web-UI auth token for this account. Generated once
   * on first AI Toolkit deploy, then reused so ModHeader config stays stable
   * across redeploys. If absent, a new one is minted + persisted on next deploy.
   */
  aiToolkitAuthToken?: string;
}

interface ConfigShape {
  accounts: StoredAccount[];
  activeAccountId: string | null;
}

function emptyConfig(): ConfigShape {
  return { accounts: [], activeAccountId: null };
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function readConfig(): ConfigShape {
  try {
    if (!existsSync(CONFIG_FILE)) return emptyConfig();
    const raw = readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ConfigShape;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      activeAccountId: parsed.activeAccountId ?? null,
    };
  } catch {
    return emptyConfig();
  }
}

export function writeConfig(cfg: ConfigShape): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  // Belt-and-suspenders: explicitly tighten perms (in case file already existed).
  try {
    chmodSync(CONFIG_FILE, 0o600);
  } catch {
    /* non-fatal on some platforms */
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function listAccounts(): StoredAccount[] {
  return readConfig().accounts;
}

export function getAccount(id: string): StoredAccount | undefined {
  return readConfig().accounts.find((a) => a.id === id);
}

export function saveAccount(account: StoredAccount): StoredAccount {
  const cfg = readConfig();
  const idx = cfg.accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) {
    cfg.accounts[idx] = account;
  } else {
    cfg.accounts.push(account);
  }
  if (cfg.activeAccountId === null) cfg.activeAccountId = account.id;
  writeConfig(cfg);
  return account;
}

export function deleteAccount(id: string): boolean {
  const cfg = readConfig();
  const before = cfg.accounts.length;
  cfg.accounts = cfg.accounts.filter((a) => a.id !== id);
  if (cfg.activeAccountId === id) {
    cfg.activeAccountId = cfg.accounts[0]?.id ?? null;
  }
  writeConfig(cfg);
  return cfg.accounts.length < before;
}

export function setActiveAccount(id: string): void {
  const cfg = readConfig();
  cfg.activeAccountId = id;
  writeConfig(cfg);
}

/** Get this account's persisted AI Toolkit web-UI auth token, if any. */
export function getAiToolkitAuthToken(accountId: string): string | undefined {
  return getAccount(accountId)?.aiToolkitAuthToken;
}

/** Persist the AI Toolkit auth token on the account (generated once, reused). */
export function setAiToolkitAuthToken(accountId: string, token: string): void {
  const cfg = readConfig();
  const idx = cfg.accounts.findIndex((a) => a.id === accountId);
  if (idx >= 0) {
    cfg.accounts[idx].aiToolkitAuthToken = token;
    writeConfig(cfg);
  }
}
