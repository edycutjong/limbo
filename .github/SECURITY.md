# Security Policy

## Supported versions
| Version | Supported |
|---|---|
| latest release and `main` | yes |

## Reporting a vulnerability
Please **do not** open a public issue for security vulnerabilities. Report them privately with GitHub's
[private vulnerability reporting](https://github.com/edycutjong/limbo/security/advisories/new)
(Security, then Report a vulnerability).

You will get an acknowledgment within 48 hours and a resolution timeline after triage. Please give us a reasonable
window to patch before public disclosure.

## Scope notes
LIMBO is a local-first demo skeleton and two demo apps. The apps keep their data in the browser (IndexedDB) and send nothing to a
server of ours; the only network path is the optional dev-only test relay, which is stripped from production builds.
