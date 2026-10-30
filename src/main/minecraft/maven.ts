/** "group:artifact:version[:classifier][@ext]" -> relative maven path */
export function mavenPath(name: string): string {
  let ext = 'jar';
  let rest = name;
  const atIdx = name.lastIndexOf('@');
  if (atIdx !== -1) {
    ext = name.slice(atIdx + 1);
    rest = name.slice(0, atIdx);
  }
  const parts = rest.split(':');
  const [group, artifact, version] = parts;
  const classifier = parts[3];
  const file = `${artifact}-${version}${classifier ? '-' + classifier : ''}.${ext}`;
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`;
}

/** "group:artifact" key for dedupe (includes classifier when present) */
export function mavenKey(name: string): string {
  const clean = name.split('@')[0];
  const parts = clean.split(':');
  return parts[3] ? `${parts[0]}:${parts[1]}:${parts[3]}` : `${parts[0]}:${parts[1]}`;
}
