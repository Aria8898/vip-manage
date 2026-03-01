import { Link } from "react-router-dom";

export const NotFoundPage = () => {
  return (
    <main className="shell">
      <h1 className="title">404</h1>
      <p className="subtle">页面不存在。</p>
      <p className="subtle">
        返回 <Link to="/admin">/admin</Link>
      </p>
    </main>
  );
};
