# Feature Proposal: Intelligent Workout Progression System

## Overview
Build an intelligent workout progression system that analyzes historical workout performance and suggests appropriate progressive overload adjustments (weight increases, rep scheme changes, exercise substitutions) based on the user's training data, effort levels, and recovery metrics.

This feature complements the recent workout enhancements by adding intelligent recommendations that leverage the existing domain logic (effort tracking, double progression, plate calculator) while maintaining the project's core philosophy: the engine proposes, the user approves.

## Core Concepts

### 1. Progressive Overload Analysis
- Analyze workout set history for each exercise
- Detect when user is ready for progression based on:
  - Consistent RIR/RPE values in target range
  - Successful completion of target rep ranges
  - Volume trends over time
  - Exercise-specific performance patterns

### 2. Progression Recommendation Types
- **Weight Increase**: Suggest +2.5kg/5lb increments when ready
- **Rep Scheme Adjustment**: Suggest altering rep ranges when plateaued
- **Exercise Substitution**: Recommend alternatives when stalled or equipment-limited
- **Deload Suggestion**: Recommend reducing volume/intensity when fatigue detected
- **Set Addition**: Suggest adding sets when adaptation stalled

### 3. Integration Points
- **Domain Layer**: Extend existing progression logic in `src/domain/`
- **Backend**: Add progression analysis API endpoints
- **Frontend**: Add progression suggestions to WorkoutScreen and Plan screen
- **UI**: Non-intrusive suggestion banners/modals requiring explicit user approval

## Technical Implementation Plan

### Phase 1: Data Collection & Analysis (Backend)
1. **Enhance Workout Tracking Schema**
   - Add progression metadata to workout sets (if not already present)
   - Track RIR/RPE values per set
   - Record perceived difficulty notes

2. **Create Progression Analysis Service** (`backend/app/progression.py`)
   - Functions to analyze exercise performance trends
   - Algorithms to detect readiness for progression
   - Integration with existing double progression logic
   - Fatigue/recovery signal detection from workout data

3. **API Endpoints**
   - `GET /api/workout-progression?exercise={exercise}` - Get progression suggestions
   - `POST /api/workout-progression/apply` - Apply user-approved progression
   - `GET /api/exercise-history/{exercise}` - Get performance trends

### Phase 2: Domain Logic Enhancement (Frontend)
1. **Extend Progression Utilities** (`src/domain/progression.ts`)
   - Pure functions for analyzing set history
   - RIR-based readiness detection
   - Weight increment calculation aligned with plate calculator
   - Exercise similarity mapping for substitutions

2. **Enhance Existing Progression Systems**
   - Build upon `double_progression_ready()` logic
   - Integrate with effort scale system (RIR/RPE)
   - Use plate calculator for practical weight suggestions

### Phase 3: Frontend Integration
1. **WorkoutScreen Enhancements**
   - Subtle progression suggestion banner after workout completion
   - "Suggested Progression" card in workout details
   - One-tap apply for approved suggestions

2. **Plan Screen Integration**
   - Progression suggestions visible in phase planning
   - Ability to auto-apply suggestions on phase transition
   - Historical progression tracking visualization

3. **New Components**
   - `ProgressionSuggestion.tsx` - Display suggestion with rationale
   - `ExerciseHistoryChart.tsx` - Visualize performance trends
   - `ProgressionSettings.tsx` - Configure aggressiveness of suggestions

### Phase 4: User Experience & Controls
1. **Approval Workflow** (Consistent with existing philosophy)
   - Suggestions appear as non-intrusive notifications
   - Require explicit "Apply" action (never automatic)
   - Show clear rationale: "Based on 3x8 @ RIR 2 last week, suggest +2.5kg"
   - Option to dismiss or modify suggestions

2. **Customization & Settings**
   - Progression aggressiveness (conservative/moderate/aggressive)
   - Minimum sessions required before suggesting progression
   - Preferred increment sizes (aligned with available plates)
   - Exercise-specific progression rules

3. **Education & Transparency**
   - Tooltips explaining progression rationale
   - Links to training science principles
   - History of applied progressions

## Integration with Existing Systems

### Connects to Current Features:
- **Effort Scale System**: Uses RIR/RPE values to determine readiness
- **Plate Calculator**: Suggests weights that align with available plates
- **Double Progression Logic**: Enhances existing readiness detection
- **Workout Set Tracking**: Utilizes the newly tracked set-level data
- **AI Coaching**: Could provide natural language explanations of suggestions
- **Rules Engine**: Follows the "propose, don't dictate" pattern

### Data Flow:
```
Workout Sets (with RIR/RPE) 
       ↓
Progression Analysis Service 
       ↓ 
Suggested Progression (Weight/Rep/Exercise change)
       ↓
User Review & Approval 
       ↓
Applied to Future Workouts 
       ↓
Updated Performance History
```

## Benefits

### For Users:
- Reduces guesswork in progressive overload
- Provides data-driven training recommendations
- Maintains user agency (approval required)
- Helps break through plateaus intelligently
- Educates users on training principles

### For the Project:
- Enhances the core value proposition (intelligent tracking)
- Increases user engagement with workout features
- Demonstrates advanced use of the rules engine
- Creates foundation for more advanced AI features
- Differentiates from basic workout loggers

## Implementation Considerations

### Scope Management:
- Start with weight progression suggestions (most concrete)
- Add rep scheme adjustments next
- Exercise substitutions as advanced feature
- Deload suggestions require more sophisticated fatigue detection

### Technical Challenges:
- Determining meaningful progression signals from noisy data
- Balancing suggestion frequency (avoiding annoyance)
- Handling missing/inconsistent RIR/RPE data
- Exercise name normalization for cross-workout comparisons

### Testing Strategy:
- Unit tests for progression analysis algorithms
- Integration tests for API endpoints
- Manual testing of suggestion accuracy and UX
- Edge case testing (new exercises, inconsistent logging, etc.)

## Files to Create/Modify

### New Files:
- `backend/app/progression.py` - Progression analysis service
- `src/domain/progression.ts` - Pure progression logic utilities
- `src/components/workout/ProgressionSuggestion.tsx` - Suggestion UI
- `src/components/workout/ExerciseHistoryChart.tsx` - Trends visualization
- `src/hooks/useProgression.ts` - Hook for accessing progression data
- `backend/tests/test_progression.py` - Backend test suite
- `frontend/src/domain/progression.test.ts` - Frontend unit tests

### Modified Files:
- `backend/app/services.py` - Add progression analysis calls
- `frontend/src/screens/WorkoutScreen.tsx` - Display suggestions
- `frontend/src/screens/Plan.tsx` - Show progression in phase planning
- `frontend/src/db/repo.ts` - Add progression-related database queries
- `frontend/src/domain/types.ts` - Add progression-related types
- `frontend/App.tsx` - Potentially add progression context/provider

## Dependency Requirements
- No new major dependencies required (uses existing axios/httpx, charting libraries if needed for visualization)
- May enhance existing chart components if advanced visualization desired
- All logic can be implemented with current TypeScript/Python stack

## Success Metrics
- Percentage of suggestions that users approve/applies
- User retention/engagement with workout features
- Reduction in perceived plateau incidents (via user feedback)
- Accuracy of progression predictions (retrospective analysis)
- Increase in workout logging consistency

## Next Steps
1. Review and refine this proposal with stakeholder feedback
2. Begin with Phase 1: Backend progression analysis service
3. Implement core algorithms using existing workout data
4. Create API endpoints for frontend consumption
5. Build frontend components to display and apply suggestions
6. Add user controls and customization options
7. Test with real workout data and iterate based on feedback

This feature would represent a significant enhancement to the tracker's intelligence while staying true to its core principles of user agency and data-driven decision making.