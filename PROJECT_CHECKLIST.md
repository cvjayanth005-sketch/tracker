# Formara implementation checklist

Use this file to track shipped work and the remaining roadmap.

## Completed

### Workout experience

- [x] Wake lock during active workouts, including visibility re-acquisition
- [x] Persistent rest timer across navigation and browser tabs
- [x] Countdown and completion audio cues
- [x] Pause, resume, skip, and quick rest-time adjustments
- [x] Timed exercises with live stopwatch and saved duration
- [x] RIR and RPE scale switcher with both metrics preserved
- [x] Olympic plate calculator with barbell choices and plate breakdown
- [x] Superset pairing and grouped workout display
- [x] Exercise equipment and split-day metadata
- [x] One-rep max estimates and exercise history analytics
- [x] Activity heatmap and muscle body map

### Planning and scheduling

- [x] Calendar signal views for adherence, training, sleep, steps, and weight
- [x] Schedule override storage in IndexedDB (migration v22)
- [x] Skip a scheduled workout
- [x] Move a workout to another date
- [x] Record a make-up session
- [x] Clear schedule changes
- [x] Swap two planned workout dates
- [x] Calendar indicators for moved, skipped, and make-up workouts
- [x] Workout, quick-action, adaptive-training, and compliance logic consumes schedule changes

### Backend and AI

- [x] AI coaching notes with rule-based fallback
- [x] Coach chat integration and caching
- [x] Food text parsing with fallback handling
- [x] Workout and set persistence APIs
- [x] Cloud row-level state merge and tombstones
- [x] Payload-size error reporting for sync failures

### Sync fixes

- [x] Keep edits made while an upload is in flight pending for the next sync
- [x] Preserve workout duration, RPE, equipment, split-day, timed, rest, and superset fields in cloud mapping
- [x] Include schedule overrides in local export and cloud sync mapping
- [x] Apply `docs/workout-sync-migration.sql` to the production cloud database
- [ ] Deploy the updated backend after the migration

### Quality

- [x] Frontend build passes
- [x] Frontend test suite passes (406 tests)
- [x] Backend test suite passes (80 tests)
- [x] Lint passes with existing Fast Refresh warnings only
- [x] Full tracker QA verification passes
- [ ] Add dedicated tests for `frontend/src/domain/plan.ts`
- [ ] Add dedicated tests for `frontend/src/domain/trainingSplits.ts`

## To do next

### Phase 3: scheduling and portability

- [x] Make calendar cells show moved, skipped, and make-up states
- [x] Make workout and compliance calculations consume schedule overrides
- [x] Add swap-day workflow for two planned dates
- [ ] Add a make-up session picker that proposes open training days
- [ ] Export the complete plan and history as JSON
- [ ] Import JSON with validation, preview, and rollback
- [ ] Generate a printable workout sheet/PDF

### Phase 4: integrations and reminders

- [ ] Import workouts from Strong, Hevy, and FitNotes
- [ ] Import supported activity data from Apple Health
- [ ] Add configurable push reminders for planned workouts and check-ins
- [ ] Add missed-workout and rescheduling notifications

### Phase 5: progression and coaching

- [ ] Add pure progression readiness analysis by exercise
- [ ] Suggest weight increases using available plates
- [ ] Suggest rep-range changes and deloads when appropriate
- [ ] Add explicit approve, edit, dismiss, and history actions
- [ ] Show progression suggestions in Workout and Plan screens
- [ ] Add AI explanations that narrate rule-based recommendations
- [ ] Add plan-change snapshots with review and revert

### Phase 6: product hardening

- [ ] Improve onboarding dark-mode visual QA across every chapter
- [ ] Add accessibility audit for keyboard, focus, contrast, and reduced motion
- [ ] Add conflict-resolution tests with two simulated devices
- [ ] Add cloud migration checks to deployment runbook
- [ ] Add backup restore smoke test
- [ ] Document local frontend and backend startup commands
- [ ] Review AGPL licensing obligations before copying any OpenGym code or assets

## Manual release checklist

- [ ] Run frontend with `npm run dev`
- [ ] Run backend with `uv run uvicorn backend.app.main:app --reload`
- [ ] Log a normal workout and verify all sets persist after refresh
- [ ] Log a timed set and verify duration after refresh
- [ ] Edit a set while sync is active and verify it remains after sync completes
- [ ] Test sync on two signed-in devices
- [ ] Test offline logging followed by reconnect and sync
- [ ] Verify moved and skipped workouts in Calendar
- [ ] Verify dark-mode onboarding on desktop and mobile widths
- [ ] Run the full QA command before release
