import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import Admin from './pages/Admin';
import GoogleSheetViewer from './pages/GoogleSheetViewer';
import RankedCandidates from './pages/RankedCandidates';
function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/about" element={<About />} />
      <Route path="/rankings" element={<RankedCandidates />} />
      <Route path="/review" element={<GoogleSheetViewer />} />
    </Routes>
  );
}

export default App;
