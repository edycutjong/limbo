import { runHook } from './lib.mjs';

const PREFIXES = [/^git\s+commit\b/, /^git\s+push\b/, /^git\s+tag\b/, /^git\s+reset\s+--hard\b/, /^git\s+rebase\b/, /^gh(\s|$)/, /^vercel\b/, /^npm\s+publish\b/, /^pnpm\s+publish\b/, /^rm\s+-rf\s+\/(\s|$)/, /^rm\s+-rf\s+~/];
const UPLOAD = /(^|\s)(-X\s*POST|-d|--data\S*|-T|-F|--upload-file)(\s|=|$)/;

function denyReason(seg) {
  let s = seg.trim().replace(/^(\w+=\S*\s+)+/, '').replace(/^(sudo|command|env)\s+/, '');
  for (const re of PREFIXES) if (re.test(s)) return `blocked command: ${s.slice(0, 80)}`;
  if (/^(curl|wget)\b/.test(s) && UPLOAD.test(s)) return `blocked upload: ${s.slice(0, 80)}`;
  return null;
}

runHook('guard-shell', 'PreToolUse', (ev) => {
  const cmd = String(ev.tool_input?.command ?? '');
  for (const seg of cmd.split(/&&|\|\||;|\|/)) {
    const why = denyReason(seg);
    if (why) {
      process.stderr.write(`guard-shell: ${why}. Publishing, committing and uploads are not allowed for agents here.\n`);
      return { result: 'deny', target: cmd.slice(0, 200), detail: why, exit: 2 };
    }
  }
  return { result: 'allow', target: cmd.slice(0, 200) };
});
