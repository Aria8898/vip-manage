import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { STATUS_ROUTES } from "../app/routes";
import { NotFoundPage } from "../pages/NotFoundPage";
import { StatusShellPage } from "../pages/StatusShellPage";

const StatusApp = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={STATUS_ROUTES.home} replace />} />
        <Route path={STATUS_ROUTES.home} element={<StatusShellPage />} />
        <Route path={STATUS_ROUTES.detail} element={<StatusShellPage />} />
        <Route
          path="*"
          element={
            <NotFoundPage
              homePath={STATUS_ROUTES.home}
              homeLabel={STATUS_ROUTES.home}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default StatusApp;
