## Company History Types

export type ApplicationStage =
| "applied"
| "screen"
| "technical_interview"
| "hiring_manager_interview"
| "panel"
| "final_round"
| "offer"

export type ApplicationOutcome =
| "pending"
| "rejected"
| "withdrawn"
| "offer_accepted"
| "offer_declined"
| "ghosted"

export type CompanySignal =
| "neutral"
| "positive_reapply_invited"
| "possible_overqualified"
| "possible_underqualified"
| "explicit_decline_future_contact"
| "unknown"

export type CompanyStatus =
| "active"
| "caution"
| "blocked"

export interface ApplicationRecord {
role: string
appliedDate: string
source: string
stageReached: ApplicationStage
outcome: ApplicationOutcome
outcomeDate: string | null
contact: string | null
signal: CompanySignal
notes: string
}

export interface CompanyHistoryEntry {
displayName: string
aliases: string[]
applications: ApplicationRecord[]
reapplyInvited: boolean | null
status: CompanyStatus
statusReason: string
lastUpdated: string
}

export type CompanyHistory = Record<string, CompanyHistoryEntry>

## Company History example

{
"acme-robotics": {
"displayName": "Acme Robotics",
"aliases": ["Acme Robotics", "Acme", "acmerobotics"],
"applications": [
{
"role": "Lead SDET",
"appliedDate": "",
"source": "direct",
"stageReached": "hiring_manager_interview",
"outcome": "rejected",
"outcomeDate": "",
"contact": "",
"signal": "positive_reapply_invited",
"notes": "Placeholder example — describe the outcome and any signal about reapplying, without naming interviewers or pasting real interview details."
}
],
"reapplyInvited": true,
"status": "active",
"statusReason": "Explicit invitation to reapply outweighs a single rejection. Would want a second unanswered application before this counts as a real signal either way.",
"lastUpdated": "2026-07-16"
},
"widgetco": {
"displayName": "WidgetCo",
"aliases": ["WidgetCo", "WidgetCo Inc", "widgetco"],
"applications": [
{
"role": "QA Engineer",
"appliedDate": "",
"source": "direct",
"stageReached": "technical_interview",
"outcome": "rejected",
"outcomeDate": "",
"contact": "",
"signal": "possible_overqualified",
"notes": "Placeholder example — a rejection with a specific speculative signal about why."
},
{
"role": "Senior QA Engineer",
"appliedDate": "",
"source": "direct",
"stageReached": "applied",
"outcome": "pending",
"outcomeDate": null,
"contact": "",
"signal": "unknown",
"notes": "Placeholder example — a second application at the same company after an earlier ambiguous rejection."
}
],
"reapplyInvited": null,
"status": "active",
"statusReason": "First rejection reads as role-specific, not a hard pass. Waiting on the Senior QA Engineer outcome before drawing a conclusion.",
"lastUpdated": "2026-07-16"
}
}
