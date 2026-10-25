/** Safe public classification; never expose connection strings or raw provider errors. */
export function databaseIssue(error: unknown): 'quota' | 'unavailable' {
  return error instanceof Error && /account or project has exceeded the quota|compute.*quota.*exceed|quota.*exceed/i.test(error.message) ? 'quota' : 'unavailable';
}
