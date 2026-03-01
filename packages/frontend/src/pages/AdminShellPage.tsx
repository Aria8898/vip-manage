import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminCreateUserResponseDTO,
  AdminListUsersResponseDTO,
  AdminUserDTO
} from "@vip/shared";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { fetchAdminSession } from "../auth/session";

export const AdminShellPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("-");
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [users, setUsers] = useState<AdminUserDTO[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQueryInput, setSearchQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [newRemarkName, setNewRemarkName] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadUsers = useCallback(async (query: string) => {
    setLoadingUsers(true);
    setErrorMessage("");

    try {
      const response = await apiRequest<AdminListUsersResponseDTO>("/admin/users", {
        method: "GET",
        query: query ? { query } : undefined
      });
      setUsers(response.data.items);
      setActiveQuery(response.data.query);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "加载用户列表失败");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

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
    void loadUsers("");

    return () => {
      cancelled = true;
    };
  }, [loadUsers]);

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

  const formatUnixSeconds = useCallback((value: number) => {
    if (value <= 0) {
      return "未设置";
    }

    return new Date(value * 1000).toLocaleString("zh-CN", {
      hour12: false,
      timeZone: "Asia/Shanghai"
    });
  }, []);

  const buildStatusLink = useCallback((statusToken: string) => {
    const encodedToken = encodeURIComponent(statusToken);
    return `${window.location.origin}/status/${encodedToken}?t=${encodedToken}`;
  }, []);

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadUsers(searchQueryInput.trim());
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const remarkName = newRemarkName.trim();

    if (!remarkName) {
      setErrorMessage("请输入用户备注名");
      return;
    }

    setCreatingUser(true);
    setNoticeMessage("");
    setErrorMessage("");

    try {
      const response = await apiRequest<AdminCreateUserResponseDTO>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          remarkName
        })
      });

      const createdUser = response.data.user;
      setUsers((previous) => [createdUser, ...previous]);
      setNewRemarkName("");
      setNoticeMessage(`已创建用户 ${createdUser.remarkName}`);
      const statusLink = buildStatusLink(createdUser.statusToken);
      await navigator.clipboard.writeText(statusLink);
      setCopiedUserId(createdUser.id);
      setNoticeMessage(`已创建并复制链接：${createdUser.remarkName}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "创建用户失败");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCopyLink = async (user: AdminUserDTO) => {
    const statusLink = buildStatusLink(user.statusToken);
    setErrorMessage("");
    setNoticeMessage("");

    try {
      await navigator.clipboard.writeText(statusLink);
      setCopiedUserId(user.id);
      setNoticeMessage(`已复制链接：${user.remarkName}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "复制失败");
    }
  };

  const userCountText = useMemo(() => {
    const prefix = activeQuery ? `搜索 “${activeQuery}”` : "全部用户";
    return `${prefix}：${users.length} 条`;
  }, [activeQuery, users.length]);

  return (
    <main className="shell">
      <div className="row">
        <h1 className="title">用户管理（P2）</h1>
        <button className="button secondary" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "退出中..." : "退出登录"}
        </button>
      </div>
      <p className="subtle">已登录账号：{username}</p>
      {expiresAt > 0 ? (
        <p className="subtle">会话到期时间（Unix 秒）：{expiresAt}</p>
      ) : null}
      <p className="subtle">目标：新增用户、搜索用户、复制专属链接。</p>

      <section className="panel">
        <h2 className="panel-title">新增用户</h2>
        <form className="inline-form" onSubmit={handleCreateUser}>
          <input
            className="input"
            type="text"
            value={newRemarkName}
            placeholder="例如：微信名-大刘"
            onChange={(event) => setNewRemarkName(event.target.value)}
            maxLength={80}
            required
          />
          <button className="button" type="submit" disabled={creatingUser}>
            {creatingUser ? "创建中..." : "创建并复制链接"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="row row-wrap">
          <h2 className="panel-title">用户列表</h2>
          <p className="subtle">{userCountText}</p>
        </div>

        <form className="inline-form" onSubmit={handleSearchSubmit}>
          <input
            className="input"
            type="text"
            value={searchQueryInput}
            placeholder="按备注名或用户 ID 搜索"
            onChange={(event) => setSearchQueryInput(event.target.value)}
          />
          <button className="button secondary" type="submit" disabled={loadingUsers}>
            {loadingUsers ? "搜索中..." : "搜索"}
          </button>
        </form>

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>用户 ID</th>
                <th>备注名</th>
                <th>到期时间</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan={5}>
                    {loadingUsers ? "加载中..." : "暂无用户"}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="table-code">{user.id}</td>
                    <td>{user.remarkName}</td>
                    <td>{formatUnixSeconds(user.expireAt)}</td>
                    <td>{formatUnixSeconds(user.createdAt)}</td>
                    <td>
                      <button
                        className="button secondary button-inline"
                        type="button"
                        onClick={() => handleCopyLink(user)}
                      >
                        {copiedUserId === user.id ? "已复制" : "复制链接"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {noticeMessage ? <p className="subtle success-text">{noticeMessage}</p> : null}
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      <div className="code">Route: /admin | Link: /status/:token (兼容 ?t=)</div>
    </main>
  );
};
