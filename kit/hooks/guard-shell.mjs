import { runHook } from './lib.mjs';

// Existing denials, matched against a real command (prefixes and quoting already removed).
const PREFIXES = [/^gh(\s|$)/, /^vercel\b/, /^npm\s+publish\b/, /^pnpm\s+publish\b/, /^rm\s+-rf\s+\/(\s|$)/, /^rm\s+-rf\s+~/];
const UPLOAD = /(^|\s)(-X\s*POST|-d|--data\S*|-T|-F|--upload-file)(\s|=|$)/;

// Sessions never change git state: the orchestrator reviews the diff and commits.
const GIT_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'ls-files', 'rev-parse', 'blame', 'grep']);
const GIT_OPT_WITH_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix']);
const GIT_HINT = 'Sessions must not change git state. Compare against `git diff` or `git show HEAD:<path>` instead.';

// Placeholders inside a word: EXP replaces text built by substitution or expansion, GLOB precedes an
// unquoted `*` or `?`. A command word holding either is not a literal and is denied.
const EXP = '\u0000';
const GLOB = '\u0001';

// Index of the `)` matching the `(` just before `start`, or src.length.
function findClose(src, start) {
  const n = src.length;
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
}

function findTick(src, start) {
  let j = start;
  while (j < src.length && src[j] !== '`') j += src[j] === '\\' ? 2 : 1;
  return j;
}

// Parse every `$(...)` and backtick substitution in `text` as nested commands. Text is otherwise ignored.
function scanSubst(text, out) {
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === '$' && text[i + 1] === '(') {
      const j = findClose(text, i + 2);
      parse(text.slice(i + 2, j), out);
      i = j + 1;
    } else if (text[i] === '`') {
      const j = findTick(text, i + 1);
      parse(text.slice(i + 1, j), out);
      i = j + 1;
    } else i++;
  }
}

// The `$` at src[i]. Returns [next index, whether the word gets an EXP placeholder].
// Command substitutions inside it are parsed as nested commands.
function expansion(src, i, out, inDq) {
  const n = src.length;
  const c = src[i + 1];
  if (c === '(') {
    const j = findClose(src, i + 2);
    parse(src.slice(i + 2, j), out);
    return [j + 1, true];
  }
  if (c === '{') {
    let d = 1;
    let j = i + 2;
    while (j < n) {
      if (src[j] === '\\') { j += 2; continue; }
      if (src[j] === '{') d++;
      else if (src[j] === '}' && --d === 0) break;
      j++;
    }
    scanSubst(src.slice(i + 2, Math.min(j, n)), out);
    return [Math.min(j, n) + 1, true];
  }
  if (c !== undefined && /[A-Za-z_]/.test(c)) {
    let j = i + 2;
    while (j < n && /\w/.test(src[j])) j++;
    return [j, true];
  }
  if (c !== undefined && /[0-9@*#?$!-]/.test(c)) return [i + 2, true];
  if (!inDq && c === "'") {
    let j = i + 2;
    while (j < n && src[j] !== "'") j += src[j] === '\\' ? 2 : 1;
    return [j + 1, true];
  }
  if (!inDq && c === '"') return [i + 1, false]; // `$"..."`: the quoted text is literal
  return [i + 1, false]; // a lone `$`
}

// Shell-aware split of `src` into commands (arrays of words). Quoted text never becomes a command.
// `$(...)`, backticks and `(...)` are parsed as nested commands. A heredoc body is parsed as commands
// when its command feeds a shell; otherwise only the `$(...)` and backticks of an unquoted body are.
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
        else if (src[i] === '$') {
          const [next, mark] = expansion(src, i, out, true);
          if (mark) word += EXP;
          else word += '$';
          i = next;
        } else if (src[i] === '`') {
          const j = findTick(src, i + 1);
          parse(src.slice(i + 1, j), out);
          word += EXP;
          i = j + 1;
        } else word += src[i++];
      }
      i++;
    } else if (c === '$') {
      const [next, mark] = expansion(src, i, out, false);
      if (mark) word = (word ?? '') + EXP;
      else if (next === i + 1 && src[i + 1] === '"') word = word ?? '';
      else word = (word ?? '') + '$';
      i = next;
    } else if (c === '`') {
      const j = findTick(src, i + 1);
      parse(src.slice(i + 1, j), out);
      word = (word ?? '') + EXP;
      i = j + 1;
    } else if (c === '<' && src[i + 1] === '<' && src[i + 2] === '<') {
      word = (word ?? '') + '<<<';
      i += 3;
    } else if (c === '<' && src[i + 1] === '<') {
      i += 2;
      if (src[i] === '-') i++;
      while (src[i] === ' ' || src[i] === '\t') i++;
      let delim = '';
      let quoted = false;
      while (i < n && !/[\s;|&<>()]/.test(src[i])) {
        if (src[i] === "'" || src[i] === '"' || src[i] === '\\') { quoted = true; i++; }
        else delim += src[i++];
      }
      heredocs.push({ delim, quoted, owner: seg });
    } else if (c === '\n') {
      endSeg();
      i++;
      while (heredocs.length) {
        const h = heredocs.shift();
        const lines = [];
        while (i < n) {
          let e = src.indexOf('\n', i);
          if (e < 0) e = n;
          const line = src.slice(i, e);
          i = e + 1;
          if (line.trim() === h.delim) break;
          lines.push(line);
        }
        const body = lines.join('\n');
        if (feedsShell(h.owner)) parse(body, out);
        else if (!h.quoted) scanSubst(body, out);
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
    } else if (c === '*' || c === '?') {
      word = (word ?? '') + GLOB + c;
      i++;
    } else if (c === '{' && (word !== null || !/[\s]/.test(src[i + 1] ?? ' '))) {
      word = (word ?? '') + GLOB + c; // brace expansion such as {git,x}
      i++;
    } else {
      word = (word ?? '') + c;
      i++;
    }
  }
  endSeg();
  return out;
}

const base = (w) => w.slice(w.lastIndexOf('/') + 1);

const KEYWORDS = new Set(['!', '{', 'if', 'then', 'else', 'elif', 'while', 'until', 'do']);
const SHELLS = /^(sh|bash|zsh|dash|ksh)$/;
const MAX_DEPTH = 4;

// Remove env assignments, shell keywords and wrapper commands (sudo, env, command, nohup, time, exec, nice, xargs).
function stripPrefixes(t) {
  t = [...t];
  const ARG_OPTS = { sudo: /^-[ughpCDRTU]$/, env: /^-[uCS]$/, nice: /^-n$/, xargs: /^-[InPLdEs]$/ };
  for (;;) {
    while (t.length && (/^[A-Za-z_]\w*=/.test(t[0]) || KEYWORDS.has(t[0]))) t.shift();
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

// True when `words` (one command) runs text it is given: a shell, `eval`, `source` or `.`.
function feedsShell(words) {
  const t = stripPrefixes(words);
  if (!t.length) return false;
  const cmd = base(t[0]);
  return SHELLS.test(cmd) || cmd === 'eval' || cmd === 'source' || cmd === '.';
}

function denyReason(words, depth = 0) {
  const raw = stripPrefixes(words);
  if (!raw.length) return null;
  if (/[\u0000\u0001]/.test(raw[0])) {
    return `blocked: the command word is not a literal (built by substitution, expansion or glob): ${raw[0].replace(/[\u0000\u0001]/g, '?').slice(0, 40)}`;
  }
  const t = raw.map((w) => w.replaceAll(GLOB, ''));
  const cmd = base(t[0]);
  if (cmd === 'git') return gitReason(t.slice(1));
  const s = [cmd, ...t.slice(1)].join(' ');
  for (const re of PREFIXES) if (re.test(s)) return `blocked command: ${s.slice(0, 80)}`;
  if (/^(curl|wget)\b/.test(s) && UPLOAD.test(s)) return `blocked upload: ${s.slice(0, 80)}`;
  const texts = [];
  if (SHELLS.test(cmd)) {
    const k = t.findIndex((w, j) => j > 0 && /^-\w*c\w*$/.test(w));
    if (k > 0 && t[k + 1] !== undefined) texts.push(t[k + 1]);
  } else if (cmd === 'eval') texts.push(t.slice(1).join(' '));
  if (feedsShell(t)) {
    // A here-string is run as a script too: `sh <<< "git push"`.
    const h = t.findIndex((w) => w.startsWith('<<<'));
    if (h >= 0) texts.push(t[h].length > 3 ? t[h].slice(3) : (t[h + 1] ?? ''));
  }
  for (const inner of texts) {
    if (!inner) continue;
    if (depth >= MAX_DEPTH) return `blocked: shell or eval nested deeper than ${MAX_DEPTH} levels`;
    for (const seg of parse(inner)) {
      const why = denyReason(seg, depth + 1);
      if (why) return why;
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

runHook(
  'guard-shell',
  'PreToolUse',
  (ev) => {
    const cmd = ev.tool_input?.command;
    if (typeof cmd !== 'string' || !cmd.trim()) {
      const why = 'the event has no non-empty string tool_input.command';
      process.stderr.write(`guard-shell: ${why}. Denied: the command cannot be inspected.\n`);
      return { result: 'deny', target: '', detail: why, exit: 2 };
    }
    const why = check(cmd);
    if (why) {
      const tail = why.includes(GIT_HINT) ? '' : '. Publishing, committing and uploads are not allowed for agents here.';
      process.stderr.write(`guard-shell: ${why}${tail}\n`);
      return { result: 'deny', target: cmd.slice(0, 200), detail: why, exit: 2 };
    }
    return { result: 'allow', target: cmd.slice(0, 200) };
  },
  { failClosed: true },
);
