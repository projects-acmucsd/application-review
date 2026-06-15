import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const Home = lazy(() => import('./pages/Home'));
const Admin = lazy(() => import('./pages/Admin'));
const GoogleSheetViewer = lazy(() => import('./pages/GoogleSheetViewer'));
const RankedCandidates = lazy(() => import('./pages/RankedCandidates'));

function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/about" element={<Navigate to="/" replace />} />
        <Route path="/rankings" element={<RankedCandidates />} />
        <Route path="/review" element={<GoogleSheetViewer />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
