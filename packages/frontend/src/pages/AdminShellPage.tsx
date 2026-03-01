import { Link } from "react-router-dom";

export const AdminShellPage = () => {
  return (
    <main className="shell">
      <h1 className="title">管理员后台（P0 壳页面）</h1>
      <p className="subtle">下一阶段将接入登录、用户管理、充值与审计模块。</p>
      <div className="code">Route: /admin</div>
      <p className="subtle">
        预览用户页：<Link to="/status/demo-token">/status/demo-token</Link>
      </p>
    </main>
  );
};
