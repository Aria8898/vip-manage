import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AdminShellPage } from "./pages/AdminShellPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { StatusShellPage } from "./pages/StatusShellPage";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminShellPage />} />
        <Route path="/status/:token" element={<StatusShellPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
