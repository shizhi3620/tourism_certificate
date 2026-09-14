# Tourism Context

## Purpose

Tourism is a study service for the national tour-guide qualification exam,
with English-language practical-exam training for the selected province. The
MVP starts with Sichuan candidates and is designed to expand to every province
without duplicating the application code.

## Initial Vocabulary

- **Candidate**: A person preparing for the national tour-guide qualification
  exam and, where applicable, an English-language practical exam.
- **National written exam**: The shared written-exam scope defined by the
  current national syllabus.
- **Provincial practical exam**: A province-specific on-site exam, including
  Sichuan's 2026 syllabus for the MVP.
- **Question source**: The provenance category for study content: official
  public material, self-authored or licensed content, or recalled questions.
- **Past exam question**: A question from a previous exam, clearly labeled with
  year, province, subject, source, and review status.
- **Province pack**: Configuration and content for one province's practical
  exam, including attractions, scripts, questions, and scoring guidance.

## MVP Scope

- Candidate-facing web/PWA, mobile-first and desktop-compatible.
- National written-exam outline, study progress, chapter practice, past exam
  questions, wrong-question review, mock exams, and basic statistics.
- The written exam always follows the four subjects and scope in the national
  syllabus. Sichuan is the first province pack; its practical-exam interview
  training uses Chinese explanations with English practice.
- Past questions are a first-class source, separate from mock questions. Only
  public, licensed, or independently authored material is included.
- A voluntary support/donation entry may be displayed. It does not unlock
  content, create membership rights, or promise examination results.

## Deployment and privacy boundary

- The MVP runs on a home NAS and is exposed through a Cloudflare Tunnel.
- The operating target is the free tier; no paid cloud service is required for
  the initial release.
- The tunnel is not an application security boundary. Authentication,
  rate-limiting, backups, update procedures, and NAS isolation remain required
  before public access.
- Candidate progress may start locally. Cloud synchronization is optional
  future work; recordings should not be retained by default.
