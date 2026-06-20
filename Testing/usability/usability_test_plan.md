# EWC Writing Coach — Usability Test Plan

**Project**: English Writing Coach (EWC) — Grad Project  
**Version**: 1.0  
**Date**: June 2026

---

## 1. Objectives

Evaluate whether real users can:
1. Register, verify their email, and log in without confusion.
2. Complete the writing exam and understand their result.
3. Navigate to their Personalized Plan and start a task.
4. Submit a task and read the feedback.
5. Upload a PDF and view the analysis.

---

## 2. Test Participants

- **Count**: 5–8 participants per round
- **Profile**: Non-native English speakers, intermediate to upper-intermediate level (B1–B2), ages 18–35
- **Recruitment**: University students unfamiliar with the app
- **Compensation**: 30-minute session, no payment required (grad project)

---

## 3. Test Scenarios

### Scenario 1 — Registration & Onboarding

**Goal**: User creates an account and verifies email.

**Steps**:
1. Open the app at the homepage.
2. Click "Sign Up" and complete the registration form.
3. Check email for OTP code and enter it.

**Acceptance criteria**:
- User completes registration without assistance in < 3 minutes.
- OTP email is received within 30 seconds.
- Error messages for invalid inputs are clear and actionable.

**Failure signals**:
- User does not find the "verify email" field.
- User fails 3+ attempts to enter the OTP.
- User abandons the flow.

---

### Scenario 2 — Writing Exam

**Goal**: User takes the writing exam and understands their score.

**Steps**:
1. Navigate to the Exam page.
2. Read each question and write a response.
3. Submit the exam.
4. View the result page showing score, level, and weak areas.

**Acceptance criteria**:
- User understands what each question is asking.
- Timer is visible and not confusing.
- After submission, the result page is clear within 10 seconds of landing on it.
- User can state their CEFR level and at least one weak area when asked.

**Word count guidance check**:
- Users must see the word count indicator under each answer box.
- The "Submit" button state change (disabled → enabled) must be noticeable.

**Failure signals**:
- User submits without writing enough (below minimum words).
- User does not understand the CEFR level displayed.
- User cannot find the exam result after submission.

---

### Scenario 3 — Personalized Plan Navigation

**Goal**: User finds today's tasks in their learning plan.

**Steps**:
1. After exam result, navigate to "My Plan".
2. Find today's date column.
3. Click on a task to open the task detail modal.

**Acceptance criteria**:
- User finds "My Plan" within 30 seconds.
- User identifies today's tasks without confusion.
- Task detail modal opens and shows instructions clearly.

**Failure signals**:
- User confused by the weekly grid layout.
- User cannot identify which tasks are for today.

---

### Scenario 4 — Task Submission & Feedback

**Goal**: User submits a writing task and reads AI feedback.

**Steps**:
1. Open a task from the plan.
2. Read the task prompt.
3. Write a response in the text area.
4. Click "Submit" and wait for feedback.
5. Read the error highlights and suggestions.

**Acceptance criteria**:
- Feedback loads within 15 seconds.
- User can identify at least one specific error from the highlighted text.
- Correction suggestions are readable and not confusing.
- User understands the score display (0–100 scale).

**Failure signals**:
- User does not notice the error highlights in the text.
- User confused by score (expects letter grade, sees number).
- User cannot find the "Submit" button.

---

### Scenario 5 — PDF Upload & Analysis

**Goal**: User uploads a PDF writing sample and views analysis.

**Steps**:
1. Navigate to "PDF Analysis" section.
2. Upload a sample PDF document (provided by test facilitator).
3. Wait for analysis to complete.
4. View the feedback results.

**Acceptance criteria**:
- Upload interface accepts the PDF without errors.
- Analysis completes within 30 seconds for a 1-page PDF.
- Results page shows grammar score and highlighted corrections.

**Failure signals**:
- User cannot find the PDF upload button.
- Upload fails with no clear error message.
- User does not understand the diff highlighting (original vs corrected).

---

## 4. Measurement Rubric

### Task Success Rate

| Score | Definition |
|-------|-----------|
| 4 — Success | User completes the task independently without error |
| 3 — Minor issue | User completes with small confusion or one retry |
| 2 — Assisted | User needs a hint from the facilitator |
| 1 — Failure | User cannot complete the task even with assistance |

### Satisfaction Survey (post-session, 5-point Likert scale)

1. "The exam interface was clear and easy to understand." (1–5)
2. "I could easily find my learning plan and today's tasks." (1–5)
3. "The feedback on my writing was helpful." (1–5)
4. "I would use this app regularly to improve my English writing." (1–5)
5. "Loading times were acceptable." (1–5)

**Target**: Average score ≥ 3.5 on all items before final release.

---

## 5. Session Structure

| Phase | Duration | Activity |
|-------|----------|---------|
| Introduction | 5 min | Consent form, think-aloud instructions |
| Scenarios 1–5 | 20 min | Moderated task completion |
| Debrief | 5 min | Satisfaction survey + open feedback |

**Method**: Think-aloud protocol. Facilitator observes and records (with permission), does not assist except in Scenario 4 (facilitator may hint once).

---

## 6. Acceptance Gate for Release

The app is considered usability-ready when:

- [ ] Task success rate ≥ 3.0 average across all 5 scenarios
- [ ] Zero Scenario 2 (Exam) failures on first attempt
- [ ] Satisfaction survey average ≥ 3.5
- [ ] All P0 usability bugs (score < 2 on any critical step) are fixed

---

## 7. Known Risk Areas (from development observation)

| Area | Risk |
|------|------|
| CEFR level display | Users unfamiliar with A1–C2 scale may not understand their result |
| Exam timer | Timer anxiety may affect writing quality |
| Task status labels | "reviewed" vs "submitted" distinction may be unclear |
| PDF diff highlighting | Red/green color coding may be missed by color-blind users |
| Plan grid on mobile | Weekly grid may be too wide for small screens |
