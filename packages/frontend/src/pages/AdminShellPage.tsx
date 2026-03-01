import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { fetchAdminSession } from "../auth/session";

export const AdminShellPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("-");
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const session = await fetchAdminSession();
        if (!cancelled) {
          setUsername(session.username);
          setExpiresAt(session.expiresAt);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "加载会话失败");
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    setErrorMessage("");

    try {
      await apiRequest("/admin/logout", {
        method: "POST"
      });
      navigate("/admin/login", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "退出失败");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <main className="shell">
      <div className="row">
        <h1 className="title">管理员后台（P1）</h1>
        <button className="button secondary" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "退出中..." : "退出登录"}
        </button>
      </div>
      <p className="subtle">已登录账号：{username}</p>
      {expiresAt > 0 ? (
        <p className="subtle">会话到期时间（Unix 秒）：{expiresAt}</p>
      ) : null}
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      <p className="subtle">下一阶段将接入用户管理、充值与审计模块。</p>
      <div className="code">Route: /admin</div>
      <p className="subtle">
        预览用户页：<Link to="/status/demo-token">/status/demo-token</Link>
      </p>
    </main>
  );
};
