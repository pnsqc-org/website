---
name: use-gmail
description: Read, search, send, and draft Gmail emails and Google contacts. Use when the user asks to check email, find emails, search messages, send emails, create drafts, look up contacts, or find someone's email/phone. Supports multiple accounts.
allowed-tools: Bash, Read
---

# Use-Gmail Skill - Email & Contacts Access

Read, search, and send Gmail emails. Access Google contacts.

Run commands with the CLI at `"$SKILL_DIR/scripts/gmailcli.js"` (`SKILL_DIR` is the directory containing this `SKILL.md`).

## CRITICAL: Email Sending Confirmation Required

**Before sending ANY email, you MUST get explicit user confirmation.**

When the user asks to send an email:
1. First, show them the complete email details:
   - From (which account)
   - To
   - CC/BCC (if any)
   - Subject
   - Full body text
2. Ask: "Do you want me to send this email?"
3. ONLY run the send command AFTER the user explicitly confirms (e.g., "yes", "send it", "go ahead")
4. NEVER send an email without this confirmation, even if the user asked you to send it initially

This applies even when:
- The user says "send an email to X"
- You are in "dangerously skip permissions" mode
- The user seems to be in a hurry

Always confirm first. No exceptions.

## First-Time Setup (One-Time, ~2 minutes)

On first run, the script will guide you through setup. You need to create a Google Cloud OAuth client once:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or select existing)
3. Enable **Gmail API** and **People API** (APIs & Services → Library)
4. Configure OAuth consent screen:
   - User Type: External
   - App name: Use Gmail
   - Add yourself as test user
   - Add scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `contacts.readonly`
5. Create OAuth client ID:
   - Application type: **Desktop app**
   - Copy the **Client ID** and **Client Secret**
6. Add them to the repo root `.env` file:
   - `GMAIL_CLIENT_ID=...`
   - `GMAIL_CLIENT_SECRET=...`

Then run any command (from the repo root using the `node` command examples below) - browser opens, you approve, done. Works for all your accounts.

**Note:** If you previously used gmail-reader, you'll need to re-authenticate to grant the new `gmail.send` scope.
**Note:** OAuth tokens and account metadata are stored in the repo root `.env` as base64 JSON (`GMAIL_SKILL_TOKENS_B64`, `GMAIL_SKILL_ACCOUNTS_META_B64`).

## Commands

### Search Emails

```bash
node "$SKILL_DIR/scripts/gmailcli.js" search "query" [--max-results N] [--account EMAIL]
```

**Query examples:**
- `from:john@example.com` - from specific sender
- `subject:meeting after:2026/01/01` - subject + date
- `has:attachment filename:pdf` - with PDF attachments
- `is:unread` - unread emails
- `"exact phrase"` - exact match

### Read Email

```bash
node "$SKILL_DIR/scripts/gmailcli.js" read EMAIL_ID [--account EMAIL]
```

### List Recent Emails

```bash
node "$SKILL_DIR/scripts/gmailcli.js" list [--max-results N] [--label LABEL] [--account EMAIL]
```

### Send Email (Requires Confirmation)

```bash
node "$SKILL_DIR/scripts/gmailcli.js" send --to EMAIL --subject "Subject" --body "Body text" [--cc EMAIL] [--bcc EMAIL] [--account EMAIL] [--yes]
```

**Required arguments:**
- `--to` / `-t` - Recipient email address
- `--subject` / `-s` - Email subject line
- `--body` / `-b` - Email body text

**Optional arguments:**
- `--cc` - CC recipients (comma-separated)
- `--bcc` - BCC recipients (comma-separated)
- `--account` / `-a` - Send from specific account
- `--yes` - Skip interactive prompt (ONLY after explicit user confirmation)

**Example:**
```bash
node "$SKILL_DIR/scripts/gmailcli.js" send \
  --to "recipient@example.com" \
  --subject "Meeting Tomorrow" \
  --body "Hi, just confirming our meeting at 2pm tomorrow." \
  --account work@company.com \
  --yes
```

### Mark as Read

```bash
node "$SKILL_DIR/scripts/gmailcli.js" mark-read EMAIL_ID [--account EMAIL]
```

### Mark as Unread

```bash
node "$SKILL_DIR/scripts/gmailcli.js" mark-unread EMAIL_ID [--account EMAIL]
```

Both mark-read and mark-unread support multiple IDs (comma-separated):
```bash
node "$SKILL_DIR/scripts/gmailcli.js" mark-read "id1,id2,id3" --account user@gmail.com
```

### Mark Done (Archive)

Archives email(s) by removing from inbox. Equivalent to Gmail's 'e' keyboard shortcut.

```bash
node "$SKILL_DIR/scripts/gmailcli.js" mark-done EMAIL_ID [--account EMAIL]
```

### Unarchive

Moves email(s) back to inbox (undo archive).

```bash
node "$SKILL_DIR/scripts/gmailcli.js" unarchive EMAIL_ID [--account EMAIL]
```

### Star / Unstar

```bash
node "$SKILL_DIR/scripts/gmailcli.js" star EMAIL_ID [--account EMAIL]
node "$SKILL_DIR/scripts/gmailcli.js" unstar EMAIL_ID [--account EMAIL]
```

All label commands support multiple IDs (comma-separated):
```bash
node "$SKILL_DIR/scripts/gmailcli.js" star "id1,id2,id3" --account user@gmail.com
```

### Create Draft

Creates a draft email. Use `--reply-to-id` when replying to an existing email to ensure proper threading in email clients like Superhuman.

```bash
node "$SKILL_DIR/scripts/gmailcli.js" draft --to EMAIL --subject "Subject" --body "Body text" [--reply-to-id EMAIL_ID] [--cc EMAIL] [--bcc EMAIL] [--account EMAIL]
```

**Required arguments:**
- `--to` / `-t` - Recipient email address
- `--subject` / `-s` - Email subject line
- `--body` / `-b` - Email body text

**Optional arguments:**
- `--reply-to-id` / `-r` - Message ID to reply to (adds proper In-Reply-To and References headers for threading)
- `--cc` - CC recipients (comma-separated)
- `--bcc` - BCC recipients (comma-separated)
- `--account` / `-a` - Create draft in specific account

**Example (new email):**
```bash
node "$SKILL_DIR/scripts/gmailcli.js" draft \
  --to "recipient@example.com" \
  --subject "Draft for Review" \
  --body "Here's my draft message."
```

**Example (reply to existing email):**
```bash
node "$SKILL_DIR/scripts/gmailcli.js" draft \
  --to "sender@example.com" \
  --subject "Re: Original Subject" \
  --body "Thanks for your email..." \
  --reply-to-id 19b99b3127793843 \
  --account work@company.com
```

### List Labels

```bash
node "$SKILL_DIR/scripts/gmailcli.js" labels [--account EMAIL]
```

### List Contacts

```bash
node "$SKILL_DIR/scripts/gmailcli.js" contacts [--max-results N] [--account EMAIL]
```

### Search Contacts

```bash
node "$SKILL_DIR/scripts/gmailcli.js" search-contacts "query" [--account EMAIL]
```

### Manage Accounts

```bash
# List all authenticated accounts
node "$SKILL_DIR/scripts/gmailcli.js" accounts

# Remove an account
node "$SKILL_DIR/scripts/gmailcli.js" logout --account user@gmail.com
```

## Multi-Account Support

Add accounts by using `--account` with a new email - browser opens for that account:

```bash
# First account (auto-authenticates)
node "$SKILL_DIR/scripts/gmailcli.js" list

# Add work account
node "$SKILL_DIR/scripts/gmailcli.js" list --account work@company.com

# Add personal account
node "$SKILL_DIR/scripts/gmailcli.js" list --account personal@gmail.com

# Use specific account
node "$SKILL_DIR/scripts/gmailcli.js" search "from:boss" --account work@company.com
```

Tokens and account metadata are stored in the repo root `.env`:
- `GMAIL_SKILL_TOKENS_B64`
- `GMAIL_SKILL_ACCOUNTS_META_B64`

## Examples

### Find unread emails from this week

```bash
node "$SKILL_DIR/scripts/gmailcli.js" search "is:unread after:2026/01/01"
```

### Read a specific email

```bash
node "$SKILL_DIR/scripts/gmailcli.js" read 18d5a3b2c1f4e5d6
```

### Send a quick email

```bash
node "$SKILL_DIR/scripts/gmailcli.js" send \
  --to "friend@example.com" \
  --subject "Hello!" \
  --body "Just wanted to say hi." \
  --yes
```

### Find someone's contact info

```bash
node "$SKILL_DIR/scripts/gmailcli.js" search-contacts "John Smith"
```

### Check work email from personal machine

```bash
node "$SKILL_DIR/scripts/gmailcli.js" list --account work@company.com --max-results 5
```

## Output

All commands output JSON for easy parsing.

## Requirements

- Node.js 18+ (Node 20+ recommended)
- Google OAuth Desktop App credentials in repo root `.env`:
  - `GMAIL_CLIENT_ID`
  - `GMAIL_CLIENT_SECRET`

## Security Notes

- **Send confirmation required** - You must always confirm with the user before sending emails, then use `--yes`
- Tokens/account metadata stored in repo root `.env` (`GMAIL_SKILL_TOKENS_B64`, `GMAIL_SKILL_ACCOUNTS_META_B64`)
- Revoke access anytime: https://myaccount.google.com/permissions
- Apps in "testing" mode may require re-auth every 7 days (publish app to avoid)
