# Multi-Level Navigation Bar - Folder Structure Proposal

## Overview

This document outlines the recommended folder structure for handling multi-level navigation menus in the PNSQC website project.

## Problem Statement

The website has different navigation needs:
- **Single-page items**: Board & Organization (one page only)
- **Multi-level items**: Governance (with multiple policy pages underneath)

We need a consistent, scalable folder structure that handles both cases gracefully.

## Recommended Structure

```
src/about/
  ├── board_organization/
  │   └── index.html                    # Single page: /about/board_organization/
  │
  ├── governance/
  │   ├── index.html                    # Landing page: /about/governance/
  │   ├── code-of-conduct/
  │   │   └── index.html                # /about/governance/code-of-conduct/
  │   ├── cancellation-policy/
  │   │   └── index.html                # /about/governance/cancellation-policy/
  │   ├── generative-ai-policy/
  │   │   └── index.html
  │   ├── conflict-of-interest-policy/
  │   │   └── index.html
  │   ├── document-retention-policy/
  │   │   └── index.html
  │   ├── privacy-compliance-policy/
  │   │   └── index.html
  │   ├── whistle-blower-policy/
  │   │   └── index.html
  │   └── financial-policy/
  │       └── index.html
  │
  ├── donate/
  │   └── index.html                    # Single page: /about/donate/
  │
  └── contact/
      └── index.html                    # Single page: /about/contact/
```

## Key Benefits

1. **Consistent pattern**: Every page is `index.html` in its own folder
2. **Clean URLs**: `/about/governance/`, `/about/governance/code-of-conduct/`
3. **Scalable**: Easy to add sub-pages later (e.g., if "Board & Organization" needs multiple pages in the future)
4. **Clear hierarchy**: Folder structure mirrors navigation structure
5. **SEO-friendly**: Descriptive URLs without `.html` extensions
6. **Future-proof**: If a single-page item needs to become multi-level, just add files to its folder

## Navigation Logic

In the header/navigation implementation:

- **Top-level items** (Board & Organization, Donate, Contact):
  - Direct links to the page
  - No submenu

- **Parent items with children** (Governance):
  - Can be clickable to `/about/governance/` landing page
  - Shows submenu with all policy pages
  - The `governance/index.html` serves as an overview/landing page that lists and links to all policies

## URL Examples

```
/about/board_organization/
/about/governance/
/about/governance/code-of-conduct/
/about/governance/cancellation-policy/
/about/governance/generative-ai-policy/
/about/donate/
/about/contact/
```

## Implementation Notes

- All pages follow the same HTML template structure from CLAUDE.md
- Empty `<header></header>` and `<footer></footer>` tags in `src/` files
- Build process handles injection into `dist/` files
- Each page has its own meta block for SEO
