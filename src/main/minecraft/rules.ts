import os from 'os';
import type { Rule } from './versionTypes';

/** Mojang's os.name values: windows | linux | osx */
export const OS_NAME = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
const OS_ARCH = process.arch === 'ia32' ? 'x86' : process.arch; // 'x64' | 'arm64'

export interface FeatureFlags {
  is_demo_user?: boolean;
  has_custom_resolution?: boolean;
  has_quick_plays_support?: boolean;
  is_quick_play_singleplayer?: boolean;
  is_quick_play_multiplayer?: boolean;
  is_quick_play_realms?: boolean;
  [k: string]: boolean | undefined;
}

function ruleMatches(rule: Rule, features: FeatureFlags): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== OS_NAME) return false;
    if (rule.os.arch && rule.os.arch !== OS_ARCH) return false;
    if (rule.os.version) {
      try {
        if (!new RegExp(rule.os.version).test(os.release())) return false;
      } catch {
        /* ignore bad regex */
      }
    }
  }
  if (rule.features) {
    for (const [k, v] of Object.entries(rule.features)) {
      if (Boolean(features[k]) !== v) return false;
    }
  }
  return true;
}

/** Evaluate a Mojang rules array: last matching rule wins; empty/absent = allow. */
export function rulesAllow(rules: Rule[] | undefined, features: FeatureFlags = {}): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule, features)) allowed = rule.action === 'allow';
  }
  return allowed;
}

export function nativeClassifier(natives: Record<string, string> | undefined): string | undefined {
  if (!natives) return undefined;
  const raw = natives[OS_NAME];
  if (!raw) return undefined;
  return raw.replace('${arch}', process.arch === 'ia32' ? '32' : '64');
}
