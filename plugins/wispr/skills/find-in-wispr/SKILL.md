---
name: find-in-wispr
description: Answer "what did we say or decide" from Wispr Flow — narrow to the right meeting by date and people, read the notes before the transcript, and cite the meeting behind every claim. Use when the user asks what happened in a meeting, wants to prep for an upcoming one, or refers to a call, scratchpad note, or calendar event they captured with Wispr Flow.
argument-hint: the meeting, person, topic, or question to look up
allowed-tools: mcp__wispr__*
---

# Find what was said in Wispr Flow

The Wispr Flow server is read-only. It can search and read meetings,
transcripts, scratchpad notes, and calendar events, and it cannot change
any of them. Your task is to find the right record, read it, and keep what
was decided apart from what was only discussed.

## 1. Narrow before you search

"The call with Acme last Tuesday" gives a date and an attendee. It is not
a keyword. Find the meeting from the calendar and the meeting list by time
and people first. Use a full-text search only when the user remembers a
topic and not when it happened.

## 2. Notes first, transcript when the wording matters

The meeting notes are enough for "what did we decide". Read the transcript
only when the exact words matter, such as a commitment, a number, or a
quote. Then quote the line. Do not paraphrase it.

## 3. Prep from history

To prepare for a meeting, read the calendar event, find earlier meetings
with the same people, and list the open questions and commitments from
them. Say which meetings you read.

## 4. Separate decided from discussed

Report a decision only when the notes record one: an owner, a date, or an
explicit "agreed". If people discussed a topic and did not agree, say that
the question is still open.

## 5. Cite the record

Every claim names the meeting or note title and date. If two meetings
disagree, report the conflict. Do not resolve it silently.

## When nothing comes back

Meeting notes need Notetaker with Cloud Sync turned on. On Enterprise
accounts, an admin must enable the MCP connector, and Scratchpad access is a
separate setting. Before you say that no meeting exists, tell the user which
date range and terms you searched, and name these settings as possible
causes.
