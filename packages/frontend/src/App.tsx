import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AdminRouteGuard } from "./components/AdminRouteGuard";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminShellPage } from "./pages/AdminShellPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { StatusShellPage } from "./pages/StatusShellPage";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <AdminRouteGuard>
              <AdminShellPage />
            </AdminRouteGuard>
          }
        />
        <Route path="/status/:token" element={<StatusShellPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
