import { runHook } from './lib.mjs';

runHook('mcp-log', 'PostToolUse', (ev) => {
  const resp = typeof ev.tool_response === 'string' ? ev.tool_response : JSON.stringify(ev.tool_response ?? '');
  let pass = /"pass"\s*:\s*true|"status"\s*:\s*"pass"|"result"\s*:\s*"pass"/.test(resp);
  try {
    const j = typeof ev.tool_response === 'string' ? JSON.parse(ev.tool_response) : ev.tool_response;
    if (j && typeof j === 'object') pass = j.pass === true || j.status === 'pass' || j.result === 'pass' || pass;
  } catch { /* keep regex answer */ }
  return { result: 'logged', target: ev.tool_name ?? null, detail: `pass=${pass}` };
});
