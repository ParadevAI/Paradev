---
name: check-service-health
description: Check a ClickHouse Cloud service's operational state — is it running, are backups being taken and kept, and are ClickPipes ingesting without errors — and report what needs attention. Use when the user asks whether a ClickHouse service is healthy, why data stopped arriving, whether backups are in place, or for a pre-change or on-call check of their ClickHouse setup.
argument-hint: the service name, or the organization to sweep
allowed-tools: mcp__clickhouse__get_organizations, mcp__clickhouse__get_organization_details, mcp__clickhouse__get_services_list, mcp__clickhouse__get_service_details, mcp__clickhouse__list_service_backups, mcp__clickhouse__get_service_backup_details, mcp__clickhouse__get_service_backup_configuration, mcp__clickhouse__list_clickpipes, mcp__clickhouse__get_clickpipe
---

# Health is three questions

For a ClickHouse Cloud service: is it up, can it be restored, and is data
arriving? Answer each from the control plane, then say what needs a person.

## 1. Find the services

`get_organizations`, then `get_services_list` for the organization. For one
named service, match it by name and confirm with `get_service_details`; for a
sweep, check each ClickHouse service.

## 2. Is it running?

`get_service_details` gives the state (running, idle, stopped, provisioning),
region, tier and scaling settings. An idle service wakes on the next query;
that is expected on services with idle scaling, not an outage. A stopped or
degraded state is the finding.

## 3. Can it be restored?

`get_service_backup_configuration` gives the schedule and retention, and
`list_service_backups` the backups actually taken, newest first. Compare them:
the newest backup should be no older than the schedule allows, and recent
backups should have succeeded. A failed or missing backup is a finding even
when the service is running.

## 4. Is data arriving?

`list_clickpipes` lists the service's ingestion pipes. For each, `get_clickpipe`
gives its state and source. A pipe that is stopped, failed or paused explains
"the data stopped" faster than any query. To confirm, check the newest row in
the pipe's destination table with the `query-clickhouse` skill.

## 5. Report

One line per service: state, last good backup, pipes running out of total, and
anything that needs action, with the reason. "All healthy" names what was
checked.

## Anti-patterns

- **Calling an idle service down.** Check its idle scaling setting first.
- **Trusting the backup schedule.** The schedule is intent; the backup list is
  evidence.
- **Querying for missing data before checking the pipe.** A stopped pipe is the
  cheaper answer.
