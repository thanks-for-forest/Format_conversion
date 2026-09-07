// 会话态 hook：登录用户 + 配额摘要；页面层持有并传给展示组件，保证刷新一致。

import { useCallback, useEffect, useState } from "react";
import {
  fetchMe,
  fetchQuotaSummary,
  type AuthUser,
  type QuotaSummary,
} from "./api";

export function useQuota(): {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  quota: QuotaSummary | null;
  reloadQuota: () => void;
} {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [quota, setQuota] = useState<QuotaSummary | null>(null);

  const reloadQuota = useCallback(() => {
    fetchQuotaSummary()
      .then(setQuota)
      .catch(() => setQuota(null)); // 后端不可用时预检降级为放行（429 兜底）
  }, []);

  const reloadUser = useCallback(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    reloadUser();
    reloadQuota();
  }, [reloadUser, reloadQuota]);

  return { user, setUser, quota, reloadQuota };
}
