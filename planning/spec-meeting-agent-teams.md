# AgentFarm Spec: Teams Meeting Agent

## Purpose
Define how a workspace bot can join Microsoft Teams meetings as an AI-disclosed participant, provide standup updates, answer scoped questions, and support interview workflows with human oversight.

## Scope
1. Covers Teams meeting participation lifecycle.
2. Covers speech pipeline (transcription and spoken response).
3. Covers policy, approvals, and safety boundaries.
4. Covers data model, APIs, and audit requirements.
5. Does not include final vendor SDK implementation details.

## Product Rule
The meeting agent is an AI teammate, not a hidden human impersonation.

## Non-Negotiable Trust Rules
1. AI disclosure must be visible in meeting join identity, opening statement, and chat responses.
2. The agent must never claim to be a human employee.
3. Recording and transcription require tenant-level consent policy.
4. Interview recommendations are advisory only; final decision requires human reviewer.
5. All responses, approvals, and escalations are stored as audit evidence.

## Supported Modes
### 1. Standup mode (Phase 2)
1. Join meeting.
2. Listen and transcribe.
3. Deliver structured status update from workspace evidence.
4. Answer low-risk status questions only.

### 2. Interactive Q and A mode (Phase 3)
1. Multi-turn spoken responses.
2. Confidence and policy checks before response.
3. Escalate uncertain or sensitive questions.

### 3. Interview assistant mode (Phase 4)
1. Ask role-specific interview questions.
2. Capture candidate responses and rubric signals.
3. Provide summary and recommendation with confidence.
4. Human must approve final outcome.

## Meeting Lifecycle State Model
1. scheduled
2. join_requested
3. joining
4. joined
5. listening
6. speaking
7. paused
8. escalation_required
9. completed
10. failed

## Question Handling State Model
1. received
2. transcribed
3. classified
4. grounded
5. policy_checked
6. approval_pending
7. answered
8. escalated
9. blocked

## Teams Integration Events
### Inbound events
1. meeting.created
2. meeting.started
3. meeting.ended
4. participant.question_detected
5. chat.message_received
6. hand_raise_detected

### Outbound events
1. agent.join_requested
2. agent.joined
3. agent.disclosure_announced
4. agent.response_delivered
5. agent.escalation_created
6. agent.summary_published

## Voice and Reasoning Pipeline
1. Capture audio stream from meeting session.
2. Speech-to-text service transcribes with speaker timestamps.
3. Intent and risk classifier labels the question.
4. Retrieval layer gathers evidence from workspace logs, tasks, and recent activity.
5. Policy engine evaluates response allowance.
6. If allowed, response generator creates answer with citation metadata.
7. Text-to-speech synthesizes spoken response.
8. Response and metadata are logged to audit and meeting transcript store.

## Response Policy and Approval Rules
### Risk levels
1. low
- project status, completed work, next tasks, blockers already logged.
2. medium
- speculative timelines, cross-team commitments, process exceptions.
3. high
- HR outcomes, compensation, legal/compliance statements, sensitive employee evaluation.

### Execution rules
1. Low risk: auto-response allowed with logging.
2. Medium risk: response allowed only if policy permits, else escalate.
3. High risk: never auto-finalize; require human approval or handoff.
4. If confidence is below threshold, escalate regardless of risk level.

## Interview Mode Guardrails
1. Use approved interview rubric per role.
2. Ask only policy-approved question set.
3. Detect and block prohibited or discriminatory question patterns.
4. Do not produce final hire or reject decision automatically.
5. Produce interview summary packet for human reviewer.

## Data Model
### Core entities
1. meeting_sessions
- meeting_session_id
- tenant_id
- workspace_id
- bot_id
- mode
- status
- started_at
- ended_at
- disclosure_version

2. meeting_transcripts
- transcript_id
- meeting_session_id
- speaker_type
- speaker_label
- utterance_text
- started_at
- ended_at
- confidence

3. meeting_questions
- question_id
- meeting_session_id
- asked_by
- text
- risk_level
- confidence
- classification_reason
- created_at

4. meeting_responses
- response_id
- question_id
- response_text
- response_type
- source_evidence_refs
- approval_required
- approval_id
- delivered_at

5. interview_evaluations
- evaluation_id
- meeting_session_id
- candidate_ref
- role_ref
- rubric_scores_json
- recommendation
- recommendation_confidence
- human_final_decision
- reviewed_by
- reviewed_at

## API Surface (Control Plane)
1. POST /workspaces/{workspaceId}/meetings/sessions
- Create session and request join.

2. POST /meetings/sessions/{sessionId}/join
- Trigger join workflow.

3. POST /meetings/sessions/{sessionId}/events
- Ingest Teams lifecycle events.

4. POST /meetings/sessions/{sessionId}/questions
- Submit detected question to policy pipeline.

5. POST /meetings/responses/{responseId}/deliver
- Deliver approved response to meeting.

6. POST /meetings/responses/{responseId}/approve
- Human approval endpoint for medium or high-risk responses.

7. GET /meetings/sessions/{sessionId}/summary
- Return transcript summary, responses, escalations, and action items.

## Audit and Evidence Requirements
1. Every response stores source evidence references.
2. Every blocked or escalated response stores policy reason.
3. Every human override stores approver identity and timestamp.
4. Meeting disclosure statement version is logged per session.
5. Interview mode stores rubric version and reviewer signoff.

## Reliability and Quality Targets
1. Join success rate >= 99.0 percent in staging.
2. Speech transcription latency target <= 2.5 seconds p95.
3. Response generation latency target <= 4.0 seconds p95 for low-risk questions.
4. Evidence citation coverage >= 95 percent for auto-answered questions.
5. False-safe rate target: zero high-risk questions answered without required approval.

## Security and Privacy
1. Data encrypted at rest and in transit.
2. Tenant isolation enforced by workspace boundary.
3. Retention policy configurable by tenant compliance profile.
4. PII redaction pipeline for transcript exports.
5. Least-privilege Graph permissions for meeting participation.

## Rollout Plan
### Phase 2 release
1. Teams join, disclosure, listen, standup update, low-risk status response.
2. Dashboard summary and audit visibility.
3. No interview mode in this phase.

### Phase 3 release
1. Interactive Q and A with confidence gates.
2. Human escalation workflow for medium and high-risk items.

### Phase 4 release
1. Interview assistant mode with rubric support.
2. Mandatory human decision checkpoint.

## v1 and MVP Boundary
1. This spec is post-MVP and starts in Phase 2.
2. MVP remains focused on core workflow, approvals, and connector baseline without live meeting speech mode.

## Definition of Done for Phase 2
1. Agent can join Teams meetings with clear disclosure.
2. Agent can deliver standup update from workspace evidence.
3. Low-risk Q and A path is functional with transcript and audit logs.
4. Medium and high-risk paths escalate correctly.
5. Session summary appears in dashboard with action items and citations.

## Deployment Tiers and Cost Strategy (Open-Source First)

### Principle
Default delivery is open-source and self-hosted for speech and language paths. Paid managed services are optional by tier, not mandatory for all tenants.

### Tier Model
1. Base tier (default for all tenants)
- Audio-only meeting bot.
- Open-source STT, translation, and TTS.
- LLM handles intent/entity extraction directly in the meeting prompt pipeline.
2. Pro tier (optional add-on)
- Audio-only with premium voice quality.
- Same open-source STT/translation by default.
- Optional managed neural TTS provider for higher voice quality.
3. Enterprise tier (optional add-on)
- Audio or video avatar mode.
- Optional managed avatar provider.
- Highest SLA and multilingual coverage profile.

### Cost Guardrail
1. Base tier must avoid per-minute managed speech/avatar charges.
2. Pro and Enterprise add-ons carry explicit pass-through pricing.
3. No blanket price increase across all customers is required.

---

## Multilingual Capability

### Requirement
Every meeting bot must understand and respond in the language the human participant is speaking. Language switching mid-call must be handled without human intervention.

### Language Detection and Routing
1. Base default: Whisper large-v3 (self-hosted) performs multilingual transcription and language detection.
2. Optional managed mode: Azure AI Speech can be enabled per tenant for hosted multilingual STT.
3. Supported language set is defined per bot role in BotCapabilitySnapshotRecord under a new `supportedLanguages` field (BCP-47 codes, e.g. `en-US`, `es-ES`, `hi-IN`, `zh-CN`, `fr-FR`, `de-DE`, `ja-JP`, `ar-SA`, `pt-BR`, `ko-KR`).
4. Language detected at utterance level is stored in `meeting_transcripts` alongside speaker type and confidence.
5. Response is generated in the same language detected for that utterance.
6. If detected language is not in `supportedLanguages`, the bot escalates with `unsupported_language` reason and publishes a localized handoff note.

### Translation Pipeline
1. Base default: self-hosted translation model (NLLB-200 or Helsinki-NLP) translates evidence as needed before grounding.
2. Optional managed mode: Azure Translator may replace translation in tenants that prefer managed operations.
3. LLM prompt includes a system instruction to reply in the detected language code.
4. Base TTS default: open-source TTS (Kokoro, Coqui, or Piper) in matching locale where available.
5. Optional managed TTS: Azure Neural TTS can be enabled for premium voice quality.
6. Translated response and original-language evidence references are both stored in `meeting_responses`.

### Language Support Tiers
| Tier | Languages | Voice Stack |
|------|-----------|-------------|
| Base (default) | en-US, en-GB plus configured locales | Open-source TTS |
| Pro (add-on) | Base plus expanded locales by role | Managed neural TTS optional |
| Enterprise (add-on) | Full configured locale portfolio | Managed or hybrid voice stack |

### Language Contract Addition (shared-types)
The BotCapabilitySnapshotRecord will add:
```typescript
supportedLanguages: string[];       // BCP-47 list, minimum ["en-US"]
defaultLanguage: string;            // fallback if detection confidence < 0.80
languageTier: "base" | "pro" | "enterprise";
speechProvider: "oss" | "azure" | "hybrid";
translationProvider: "oss" | "azure" | "hybrid";
ttsProvider: "oss" | "azure" | "hybrid";
```

---

## Avatar and Human-Presence Capability

### Requirement
Meeting bots that operate in video calls need a visible, trustworthy on-screen presence. This must be AI-disclosed at all times and must never impersonate a specific human.

### Avatar Provider Strategy
1. Base and Pro default to `audio-only` for cost control.
2. Enterprise enables video avatar as an explicit add-on.
3. Managed avatar option can use Azure AI Avatar.
4. Self-hosted avatar option can use open-source pipeline (for example Wav2Lip or SadTalker) where quality trade-offs are acceptable.
5. Avatar is rendered as a generic professional figure with visible AI badge in all speaking states.

### Avatar Operating Rules
1. Avatar profile is tenant-level configuration:
- `avatarStyle`: `"professional-neutral"` | `"minimal-icon"` | `"audio-only"`
- `aiDisclosureBadge`: always `true` and non-configurable.
- `name`: disclosed meeting identity (e.g., `"AgentFarm Bot [AI]"`).
2. Lip-sync is driven by TTS output.
3. In `listening`, avatar is idle.
4. In `escalation_required`, avatar is muted and shows "Transferring to human".
5. Interview mode defaults to `audio-only` unless tenant policy explicitly enables avatar.

### Bot Capability Profile Update
BotCapabilitySnapshotRecord will add:
```typescript
avatarEnabled: boolean;
avatarStyle: "professional-neutral" | "minimal-icon" | "audio-only";
avatarProvider: "none" | "oss" | "azure" | "hybrid";
avatarLocale: string;               // matches defaultLanguage for lip-sync accuracy
```

---

## Conversation Understanding (Multi-Turn Context)

### Requirement
Bots must understand a question in the context of the full meeting conversation so far, not only the latest utterance.

### Conversation Context Window
1. Each meeting session maintains rolling context of last N utterances (default 20, configurable up to 50).
2. Context is held in-memory during session and persisted to `meeting_transcripts` for audit.
3. Before each LLM inference, full context is prepended as structured history with speaker labels.

### Intent and Coreference Resolution
1. Base default: intent and entity extraction are performed by the primary LLM prompt flow (no extra paid classifier required).
2. Optional managed classifier mode: Azure CLU can be enabled per tenant if separate classifier governance is required.
3. Resolved entities (project names, task refs, decision points) are attached to `meeting_questions`.
4. If intent confidence is below threshold (default 0.75), question is marked `low_confidence` and escalated.

### Conversation Memory Across Sessions
1. Within a single meeting session: rolling context is active.
2. Across sessions: bot may use workspace evidence store (tasks, approvals, action items), but does not carry raw transcript memory by default.
3. Cross-session transcript memory requires explicit tenant opt-in and compliance profile approval.

### Safety: Prompt Injection and Content Controls
1. All human utterances are sanitized before context insertion.
2. Injection-like instruction patterns are flagged, excluded from context, and logged as `prompt_injection_attempt`.
3. Base default: open-source safety model (for example Llama Guard) evaluates input and output.
4. Optional managed mode: Azure AI Content Safety can be enabled per tenant.

### Latency Budget for Conversation Understanding
| Stage | Target p95 |
|-------|-----------|
| STT transcription | 1.5s |
| Intent/entity extraction | 0.4s |
| Context assembly + LLM | 2.0s |
| TTS synthesis | 0.5s |
| Avatar render start | 0.8s (video mode only) |
| **Total (audio mode)** | **4.4s** |
| **Total (video/avatar mode)** | **5.2s** |

---

## Updated Reliability and Quality Targets (Tier-Aware)
1. Join success rate >= 99.0 percent in staging.
2. Speech transcription latency target <= 1.5 seconds p95.
3. Language detection accuracy target >= 95 percent for Base, >= 97 percent for Pro and Enterprise.
4. Response delivery latency target <= 4.4 seconds p95 (audio mode), <= 5.2 seconds p95 (video/avatar mode).
5. Evidence citation coverage >= 95 percent for auto-answered questions.
6. False-safe rate target: zero high-risk questions answered without required approval.
7. Prompt injection evaluation coverage: 100 percent of utterances before context insertion.

## Related Specs
1. Teams Graph auth and consent
- planning/spec-teams-graph-auth-and-consent.md

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.
