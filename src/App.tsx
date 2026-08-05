import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardView } from './views/DashboardView';
import { EditorView } from './views/EditorView';
import { LandingView } from './views/LandingView';
import { KaiHubView } from './views/KaiHubView';
import { isHubHost } from './lib/site';

function WriterRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingView />} />
      <Route path="/hub" element={<KaiHubView />} />
      <Route path="/app" element={<DashboardView />} />
      <Route path="/doc/:id" element={<EditorView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HubRoutes() {
  return (
    <Routes>
      <Route path="/" element={<KaiHubView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const hub = isHubHost();
  return (
    <Router>
      {hub ? <HubRoutes /> : <WriterRoutes />}
    </Router>
  );
}

export default App;
