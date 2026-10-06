# Task

## Light request
ROLE (optional ? defaults per the routing in AGENTS.md)
TASK
ACCEPTANCE CRITERIA
CONSTRAINTS (only genuinely task-specific ones)
OPTIONAL REFERENCES (files, commits, screenshots, issue links, spec path)

## Investigator Fact Report
TASK
FINDINGS
SUBSYSTEM
PRESERVE / INVARIANTS AT RISK
CROSS-SUBSYSTEM IMPACT
EVIDENCE
CHANGE CLASS HINT
VERIFICATION HINT
OPEN QUESTIONS / RISKS (omit when none)

## Planner handoff
TASK
FINDINGS
SCOPE
RELEVANT FILES
PRESERVE / INVARIANTS
OUT OF SCOPE
IMPLEMENTATION DIRECTION
CHANGE CLASS / RISK
VERIFICATION
ACCEPTANCE CRITERIA
DOC IMPACT
OPEN QUESTIONS / RISKS (omit when none)

Keep either form to facts and references needed by the next fresh role context. Do not include
conversation history, reasoning logs, full terminal output, or code already available in the repo.

Invocation conventions: ROLE: Investigator | Planner | Implementer | Verifier or /investigate, /plan, /implement, /verify.
These are agent conventions, not application commands. A typical flow is /investigate with the symptom and acceptance criteria, then a fresh /plan context with the resulting Fact Report, then a fresh /implement context with the Planner handoff, then a fresh /verify context with the handoff and the compact implementation handoff.
