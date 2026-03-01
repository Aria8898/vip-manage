import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";

export const StatusShellPage = () => {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();

  const safeToken = useMemo(() => {
    const queryToken = new URLSearchParams(location.search).get("t");
    return token || queryToken || "(missing)";
  }, [location.search, token]);

  return (
    <main className="shell">
      <h1 className="title">用户状态页（P0 壳页面）</h1>
      <p className="subtle">后续会在这里展示 VIP 状态、剩余天数和变动历史。</p>
      <div className="code">Route: /status/:token | token: {safeToken}</div>
    </main>
  );
};
