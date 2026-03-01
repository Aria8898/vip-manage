import { type PropsWithChildren, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { ApiRequestError } from "../api/client";
import { fetchAdminSession } from "../auth/session";

type GuardState = "checking" | "authorized" | "unauthorized" | "error";

export const AdminRouteGuard = ({ children }: PropsWithChildren) => {
  const location = useLocation();
  const [state, setState] = useState<GuardState>("checking");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        await fetchAdminSession();
        if (!cancelled) {
          setState("authorized");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiRequestError && error.status === 401) {
          setState("unauthorized");
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Unknown error");
        setState("error");
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return (
      <main className="shell shell-compact">
        <h1 className="title">正在校验登录状态</h1>
        <p className="subtle">请稍候...</p>
      </main>
    );
  }

  if (state === "unauthorized") {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (state === "error") {
    return (
      <main className="shell shell-compact">
        <h1 className="title">鉴权检查失败</h1>
        <p className="subtle">{errorMessage}</p>
      </main>
    );
  }

  return <>{children}</>;
};

