# Security policy

## Supported versions

WriterVerse has no numbered releases yet. We fix security problems on the `main` branch only. If you self-host, keep up to date with the latest `main`.

| Version | Supported |
| --- | --- |
| latest `main` | yes |
| anything older | no |

## Reporting a problem

Please **do not open a public issue** for a security problem. Report it privately in one of these ways:

1. **GitHub private vulnerability reporting (preferred).** Open the repository's **Security** tab and click **Report a vulnerability**. Only the maintainers can see the report.
2. **Email:** security@writerverse.info

Please include:

- what the problem is and what an attacker could do with it,
- the steps or a small proof of concept to show it,
- the commit you tested (`git rev-parse --short HEAD`) and whether it was the hosted app or a self-hosted copy.

Please do not access, change or delete other people's data, and do not run tests that slow down or break the hosted app for others. Test against your own local copy (`make local`) where you can.

## What to expect

WriterVerse is built by a small team, so this is best effort:

- We aim to confirm we got your report within **5 working days**.
- We will tell you whether we can reproduce it and keep you posted while we fix it.
- Once a fix is on `main`, we are happy to credit you in the advisory, if you want.

There is no paid bug bounty at the moment.

## Scope notes

- **Hosted app and this code** are both in scope.
- **Self-hosting:** a copy started with development settings is not safe on the internet. Before you put WriterVerse online, follow the production checklist in the docs: run in production mode, set your own secret key, turn off debug, and keep your API keys and database password in environment variables, never in the code.
- **Out of scope:** problems that need a stolen device or account, missing best-practice headers with no real attack, and bugs in third-party services we use (report those to the service).
