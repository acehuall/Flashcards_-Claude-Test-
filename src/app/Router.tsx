import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, useParams, useLocation } from 'react-router-dom';

import { HomePage }        from '../features/home/HomePage';
import { PackDetailPage }  from '../features/packs/PackDetailPage';
import { CreatePackPage }  from '../features/packs/CreatePackPage';
import { CreateSetPage }   from '../features/sets/CreateSetPage';
import { SetDetailPage }   from '../features/sets/SetDetailPage';
import { CreateCardPage, EditCardPage } from '../features/cards/CardFormPages';
import { ReviewPage }      from '../features/review/ReviewPage';
import { ResultsPage }     from '../features/results/ResultsPage';
import { SettingsPage }    from '../features/settings/SettingsPage';
import { NotFoundPage }    from '../features/notfound/NotFoundPage';
import { LoadingSpinner }  from '../shared/components/StateViews';
import { StandardShell }   from '../shared/layouts/StandardShell';
import type { SessionMode } from '../domain/types';

/**
 * ReviewPageWrapper reads location state so the same ReviewPage component
 * can handle full / flagged / incorrect-only modes from the results screen.
 */
function ReviewPageWrapper() {
  const location = useLocation();
  const state = location.state as { mode?: SessionMode; cardIds?: number[] } | null;
  return (
    <ReviewPage
      mode={state?.mode ?? 'full'}
      seedCardIds={state?.cardIds}
    />
  );
}

function AppFallback() {
  return (
    <StandardShell>
      <LoadingSpinner />
    </StandardShell>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<AppFallback />}>
        <Routes>
          <Route path="/"                        element={<HomePage />} />
          <Route path="/pack/:packId"            element={<PackDetailPage />} />
          <Route path="/set/:setId"              element={<SetDetailPage />} />
          <Route path="/review/:setId"           element={<ReviewPageWrapper />} />
          <Route path="/results/:sessionId"      element={<ResultsPage />} />
          <Route path="/create/pack"             element={<CreatePackPage />} />
          <Route path="/create/set/:packId"      element={<CreateSetPage />} />
          <Route path="/create/card/:setId"      element={<CreateCardPage />} />
          <Route path="/edit/card/:cardId"       element={<EditCardPage />} />
          <Route path="/settings"                element={<SettingsPage />} />
          <Route path="*"                        element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
