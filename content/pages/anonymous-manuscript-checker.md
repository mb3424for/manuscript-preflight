---
slug: anonymous-manuscript-checker
title: Anonymous Manuscript Checker for Double-Blind Peer Review
description: Check a DOCX for author metadata, acknowledgments, affiliations, comments, and other identity leaks before double-anonymous peer review.
h1: Anonymous manuscript checker for peer review
lede: Inspect the places where author identity commonly survives after names and affiliations have been removed from the first page.
eyebrow: Double-anonymous review
date_modified: 2026-07-23
---
Removing the author name from the title page is not always enough for double-anonymous peer review. Identity can remain in the DOCX metadata, comments, tracked changes, acknowledgments, institutional descriptions, file names, headers, self-citations, or supplementary material.

<div class="callout"><strong>Privacy-first check:</strong> Select “Check for double-anonymous-review identity leaks” in the <a href="../manuscript-checker/">free manuscript checker</a>.</div>

## Common identity leaks in a Word manuscript

### Core document properties

Microsoft Word files can contain the creator's name and the person who last modified the document. These properties are not necessarily visible on the page, but they remain inside the DOCX package.

### Comments and tracked changes

Comments may display an author's name or initials. Tracked changes can preserve revision history and reveal passages that were intended to be removed.

### Front matter

Affiliations, email addresses, ORCID identifiers, acknowledgments, grant numbers, and institution-specific ethics statements can directly identify the author.

### Self-citation language

A normal third-person self-citation is often acceptable, depending on the journal. Phrases such as “in my previous work” or “our laboratory has shown” are much more revealing. Follow the target journal's precise anonymization policy rather than applying a universal rule.

## A safer anonymization workflow

1. Keep a complete author version as the master file.
2. Create a separate anonymous copy.
3. Remove identifying front matter according to the journal's instructions.
4. Inspect comments and tracked changes.
5. Clear document properties and personal information.
6. Search for author names, affiliations, email addresses, grant numbers, and project names.
7. Check figures, supplementary files, and file names.
8. Open the anonymous copy on another computer or account before submission.

## What the free scanner checks

The current browser tool detects core properties, comments, tracked insertions and deletions, email addresses, ORCID-like identifiers, and front-matter phrases such as “university,” “department of,” and “acknowledgment.” These are flags for human inspection, not proof that the paper violates a journal policy.

## Why the final judgment must remain manual

An ethics statement may contain institution-specific wording that cannot be removed without making the methods incomplete. A self-citation may be necessary for the argument. Some journals use single-anonymous rather than double-anonymous review. The correct action depends on the actual author instructions.

<div class="cta-box"><h2>Inspect the anonymous submission copy</h2><p>Run the check after you have created the separate anonymous DOCX, not only on the author version.</p><a class="button" href="../manuscript-checker/">Run the anonymity check</a></div>
