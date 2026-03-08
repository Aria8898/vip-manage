import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AdminRouteGuard } from "../components/AdminRouteGuard";
import { ADMIN_ROUTES } from "../app/routes";
import { AlertEventsPage } from "../pages/AlertEventsPage";
import { AdminLoginPage } from "../pages/AdminLoginPage";
import { AdminShellPage } from "../pages/AdminShellPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { RefundRepairTasksPage } from "../pages/RefundRepairTasksPage";
import { ReferralRewardsPage } from "../pages/ReferralRewardsPage";
import { ReferralWithdrawalsPage } from "../pages/ReferralWithdrawalsPage";

const AdminApp = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ADMIN_ROUTES.login} element={<AdminLoginPage />} />
        <Route
          path={ADMIN_ROUTES.home}
          element={
            <AdminRouteGuard>
              <AdminShellPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path={ADMIN_ROUTES.referralRewards}
          element={
            <AdminRouteGuard>
              <ReferralRewardsPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path={ADMIN_ROUTES.referralWithdrawals}
          element={
            <AdminRouteGuard>
              <ReferralWithdrawalsPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path={ADMIN_ROUTES.refundRepairTasks}
          element={
            <AdminRouteGuard>
              <RefundRepairTasksPage />
            </AdminRouteGuard>
          }
        />
        <Route
          path={ADMIN_ROUTES.alertEvents}
          element={
            <AdminRouteGuard>
              <AlertEventsPage />
            </AdminRouteGuard>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default AdminApp;
