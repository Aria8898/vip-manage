import { type FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AdminLoginResponseDTO } from "@vip/shared";

import { ApiRequestError, apiRequest } from "../api/client";
import { fetchAdminSession } from "../auth/session";

interface LocationState {
  from?: string;
}

export const AdminLoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const redirectIfLoggedIn = async () => {
      try {
        await fetchAdminSession();
        if (!cancelled) {
          navigate("/admin", { replace: true });
        }
      } catch {
        // Not logged in, keep on current page.
      }
    };

    void redirectIfLoggedIn();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");

    try {
      await apiRequest<AdminLoginResponseDTO>("/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username,
          password
        })
      });

      const routeState = location.state as LocationState | null;
      navigate(routeState?.from || "/admin", { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.status === 429) {
          setErrorMessage("登录失败次数过多，请稍后重试。");
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setErrorMessage(error instanceof Error ? error.message : "登录失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="shell shell-compact">
      <h1 className="title">管理员登录</h1>
      <p className="subtle">P1 鉴权闭环：登录后才可访问后台页面与管理接口。</p>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>用户名</span>
          <input
            className="input"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span>密码</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button className="button" type="submit" disabled={submitting}>
          {submitting ? "登录中..." : "登录"}
        </button>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      </form>
    </main>
  );
};

