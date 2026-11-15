import { runHook } from './lib.mjs';

// Existing denials, matched against a real command (prefixes and quoting already removed).
const PREFIXES = [/^gh(\s|$)/, /^vercel\b/, /^npm\s+publish\b/, /^pnpm\s+publish\b/, /^rm\s+-rf\s+\/(\s|$)/, /^rm\s+-rf\s+~/];
const UPLOAD = /(^|\s)(-X\s*POST|-d|--data\S*|-T|-F|--upload-file)(\s|=|$)/;

// Sessions never change git state: the orchestrator reviews the diff and commits.
const GIT_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'ls-files', 'rev-parse', 'blame', 'grep']);
const GIT_OPT_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix']);
const GIT_HINT = 'Sessions must not change git state. Compare against `git diff` or `git show HEAD:<path>` instead.';

// Shell-aware split of `src` into commands (arrays of unquoted words). Quoted text and heredoc
// bodies never become commands. `$(...)`, backticks and `(...)` are parsed as nested commands.
function parse(src, out = []) {
  const n = src.length;
  let i = 0;
  let seg = [];
  let word = null;
  const heredocs = [];
  const pushWord = () => {
    if (word !== null) seg.push(word);
    word = null;
  };
  const endSeg = () => {
    pushWord();
    if (seg.length) out.push(seg);
    seg = [];
  };
  // Index of the `)` matching the `(` just before `start`, or n.
  const findClose = (start) => {
    let depth = 1;
    let j = start;
    let q = null;
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (q) { if (c === q) q = null; }
      else if (c === "'" || c === '"') q = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) return j;
      j++;
    }
    return n;
  };
  const findTick = (start) => {
    let j = start;
    while (j < n && src[j] !== '`') j += src[j] === '\\' ? 2 : 1;
    return j;
  };
  while (i < n) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] !== '\n') word = (word ?? '') + (src[i + 1] ?? '');
      i += 2;
    } else if (c === "'") {
      let j = src.indexOf("'", i + 1);
      if (j < 0) j = n;
      word = (word ?? '') + src.slice(i + 1, j);
      i = j + 1;
    } else if (c === '"') {
      word = word ?? '';
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\') { word += src[i + 1] ?? ''; i += 2; }
        else if (src[i] === '$' && src[i + 1] === '(') {
          const j = findClose(i + 2);
          parse(src.slice(i + 2, j), out);
          i = j + 1;
        } else if (src[i] === '`') {
          const j = findTick(i + 1);
          parse(src.slice(i + 1, j), out);
          i = j + 1;
        } else word += src[i++];
      }
      i++;
    } else if (c === '$' && src[i + 1] === '(') {
      const j = findClose(i + 2);
      parse(src.slice(i + 2, j), out);
      word = (word ?? '') + 'x';
      i = j + 1;
    } else if (c === '`') {
      const j = findTick(i + 1);
      parse(src.slice(i + 1, j), out);
      word = (word ?? '') + 'x';
      i = j + 1;
    } else if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      i += 2;
      if (src[i] === '-') i++;
      while (src[i] === ' ' || src[i] === '\t') i++;
      let delim = '';
      while (i < n && !/[\s;|&<>()]/.test(src[i])) {
        if (src[i] === "'" || src[i] === '"' || src[i] === '\\') i++;
        else delim += src[i++];
      }
      heredocs.push(delim);
    } else if (c === '\n') {
      endSeg();
      i++;
      while (heredocs.length) {
        const d = heredocs.shift();
        while (i < n) {
          let e = src.indexOf('\n', i);
          if (e < 0) e = n;
          const line = src.slice(i, e);
          i = e + 1;
          if (line.trim() === d) break;
        }
      }
    } else if (c === '&' && (src[i - 1] === '>' || src[i + 1] === '>')) {
      word = (word ?? '') + c;
      i++;
    } else if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')') {
      endSeg();
      i++;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      pushWord();
      i++;
    } else if (c === '#' && word === null) {
      while (i < n && src[i] !== '\n') i++;
    } else {
      word = (word ?? '') + c;
      i++;
    }
  }
  endSeg();
  return out;
}

const base = (w) => w.slice(w.lastIndexOf('/') + 1);

// Remove env assignments and wrapper commands (sudo, env, command, nohup, time, exec, nice, xargs).
function stripPrefixes(t) {
  t = [...t];
  const ARG_OPTS = { sudo: /^-[ughpCDRTU]$/, env: /^-[uCS]$/, nice: /^-n$/, xargs: /^-[InPLdEs]$/ };
  for (;;) {
    while (t.length && /^[A-Za-z_]\w*=/.test(t[0])) t.shift();
    if (!t.length) return t;
    const cmd = base(t[0]);
    if (!['sudo', 'env', 'command', 'nohup', 'time', 'exec', 'builtin', 'nice', 'xargs'].includes(cmd)) return t;
    t.shift();
    while (t.length && (t[0].startsWith('-') || (cmd === 'env' && /^[A-Za-z_]\w*=/.test(t[0])))) {
      const o = t.shift();
      if (ARG_OPTS[cmd]?.test(o)) t.shift();
    }
  }
}

function gitReason(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += GIT_OPT_WITH_ARG.has(args[i]) ? 2 : 1;
  const sub = args[i];
  if (sub === undefined) return null; // `git --version`, bare `git`
  if (GIT_READ_ONLY.has(sub)) return null;
  if (sub === 'branch' && i + 1 >= args.length) return null; // bare list
  return `blocked git subcommand: git ${sub}. ${GIT_HINT}`;
}

function denyReason(words, depth = 0) {
  const t = stripPrefixes(words);
  if (!t.length) return null;
  const cmd = base(t[0]);
  if (cmd === 'git') return gitReason(t.slice(1));
  const s = [cmd, ...t.slice(1)].join(' ');
  for (const re of PREFIXES) if (re.test(s)) return `blocked command: ${s.slice(0, 80)}`;
  if (/^(curl|wget)\b/.test(s) && UPLOAD.test(s)) return `blocked upload: ${s.slice(0, 80)}`;
  if (depth < 4) {
    let inner = null;
    if (/^(sh|bash|zsh|dash|ksh)$/.test(cmd)) {
      const k = t.findIndex((w, j) => j > 0 && /^-\w*c\w*$/.test(w));
      if (k > 0) inner = t[k + 1];
    } else if (cmd === 'eval') inner = t.slice(1).join(' ');
    if (inner) {
      for (const seg of parse(inner)) {
        const why = denyReason(seg, depth + 1);
        if (why) return why;
      }
    }
  }
  return null;
}

function check(cmd) {
  for (const seg of parse(cmd)) {
    const why = denyReason(seg);
    if (why) return why;
  }
  return null;
}

runHook('guard-shell', 'PreToolUse', (ev) => {
  const cmd = String(ev.tool_input?.command ?? '');
  const why = check(cmd);
  if (why) {
    const tail = why.includes(GIT_HINT) ? '' : '. Publishing, committing and uploads are not allowed for agents here.';
    process.stderr.write(`guard-shell: ${why}${tail}\n`);
    return { result: 'deny', target: cmd.slice(0, 200), detail: why, exit: 2 };
  }
  return { result: 'allow', target: cmd.slice(0, 200) };
});
