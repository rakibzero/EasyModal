/**
 * Shared env for every Modal CLI invocation.
 *
 * Forces UTF-8 for the child process's stdio. Without this, on Windows the
 * Python interpreter Modal ships inherits the system ANSI codepage (cp1252),
 * and any non-ASCII byte in pip / build output crashes with:
 *   'charmap' codec can't encode characters in position N-M: character maps to <undefined>
 * Setting PYTHONIOENCODING=utf-8 + PYTHONUTF8=1 makes Python use UTF-8 for both
 * stdio and the default filesystem/argument encoding, which kills the charmap
 * error at the source. LANG/LC_ALL cover any non-Python helpers in the chain.
 */
export function modalEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
  };
}
