import { Link } from "react-router-dom";

interface NotFoundPageProps {
  homeLabel?: string;
  homePath?: string;
}

export const NotFoundPage = ({ homeLabel, homePath }: NotFoundPageProps) => {
  return (
    <main className="shell">
      <h1 className="title">404</h1>
      <p className="subtle">页面不存在。</p>
      {homePath && homeLabel ? (
        <p className="subtle">
          返回 <Link to={homePath}>{homeLabel}</Link>
        </p>
      ) : null}
    </main>
  );
};
