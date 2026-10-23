# Security Policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue.

Use GitHub's private reporting: open the **Security** tab of this repository and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and the version or commit you tested. You can expect a first reply within a week.

## Scope

This is a personal finance project that handles bank statements and account data. Reports about the following are especially welcome:

- Authentication or row-level-security bypasses (access to another owner's data)
- Exposed credentials or personal data in the repository or its history
- Unsafe handling of uploaded files (PDF, CSV, images)
- Prompt injection or data leaks through the AI chat and agents

## Secrets and personal data

Real credentials and real financial documents must never be committed. The repository runs gitleaks in CI, and GitHub secret scanning with push protection is enabled. If you spot a leaked secret, report it through the channel above so it can be rotated.
