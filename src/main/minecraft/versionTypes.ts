export interface Rule {
  action: 'allow' | 'disallow';
  os?: { name?: string; arch?: string; version?: string };
  features?: Record<string, boolean>;
}

export interface Artifact {
  path?: string;
  url: string;
  sha1?: string;
  size?: number;
}

export interface Library {
  name: string;
  downloads?: {
    artifact?: Artifact;
    classifiers?: Record<string, Artifact>;
  };
  natives?: Record<string, string>;
  extract?: { exclude?: string[] };
  rules?: Rule[];
  /** maven base url (fabric/forge style entries) */
  url?: string;
}

export type ArgValue = string | { rules: Rule[]; value: string | string[] };

export interface VersionJson {
  id: string;
  inheritsFrom?: string;
  jar?: string;
  type?: string;
  mainClass?: string;
  minecraftArguments?: string;
  arguments?: { game?: ArgValue[]; jvm?: ArgValue[] };
  assetIndex?: { id: string; url: string; sha1?: string; size?: number; totalSize?: number };
  assets?: string;
  javaVersion?: { component: string; majorVersion: number };
  downloads?: { client?: Artifact; client_mappings?: Artifact };
  libraries?: Library[];
  logging?: {
    client?: { argument: string; file: { id: string; url: string; sha1?: string; size?: number }; type: string };
  };
  releaseTime?: string;
}

export interface AssetIndexJson {
  objects: Record<string, { hash: string; size: number }>;
  virtual?: boolean;
  map_to_resources?: boolean;
}
