import { useMemo } from "react";
import { useParams } from "react-router-dom";

export const StatusShellPage = () => {
  const { token } = useParams<{ token: string }>();

  const safeToken = useMemo(() => token || "(missing)", [token]);

  return (
    <main className="shell">
      <h1 className="title">用户状态页（P0 壳页面）</h1>
      <p className="subtle">后续会在这里展示 VIP 状态、剩余天数和变动历史。</p>
      <div className="code">Route: /status/:token | token: {safeToken}</div>
    </main>
  );
};
