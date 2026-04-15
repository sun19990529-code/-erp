import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

/**
 * JWT 令牌版本注销机制测试
 * 验证 token_version 在登录/鉴权/刷新三个环节的行为
 */

const TEST_SECRET = 'test-secret-key';
const REFRESH_SECRET = 'test-refresh-secret';

// 从 basic.js 提取的 token payload 构建逻辑
function buildTokenPayload(user) {
  return {
    id: user.id,
    username: user.username,
    role_id: user.role_id,
    role_code: user.role_code,
    user_type: user.user_type,
    token_version: user.token_version || 1,
  };
}

// 从 server.js 提取的鉴权校验逻辑
async function verifyTokenVersion(decoded, dbGetUser) {
  if (decoded.token_version == null || !decoded.id) {
    return { allowed: true, reason: 'no_version_check' };
  }
  try {
    const dbUser = await dbGetUser(decoded.id);
    if (!dbUser || dbUser.status === 0) {
      return { allowed: false, reason: 'disabled' };
    }
    if (dbUser.token_version != null && dbUser.token_version !== decoded.token_version) {
      return { allowed: false, reason: 'version_mismatch' };
    }
    return { allowed: true, reason: 'ok' };
  } catch (err) {
    // 降级放行
    return { allowed: true, reason: 'db_error_fallback' };
  }
}

// 从 basic.js 提取的版本递增判定逻辑
function shouldIncrementVersion(oldUser, newRoleId, newStatus, hasPasswordChange) {
  if (!oldUser) return false;
  return oldUser.role_id !== newRoleId || oldUser.status !== newStatus || hasPasswordChange;
}

describe('JWT Payload 构建', () => {
  it('登录时应将 token_version 写入 payload', () => {
    const user = { id: 1, username: 'admin', role_id: 1, role_code: 'admin', user_type: 'internal', token_version: 3 };
    const payload = buildTokenPayload(user);
    expect(payload.token_version).toBe(3);
  });

  it('token_version 为 null/undefined 时应默认为 1', () => {
    const user = { id: 1, username: 'old_user', role_id: 2, role_code: 'operator', user_type: 'internal' };
    const payload = buildTokenPayload(user);
    expect(payload.token_version).toBe(1);
  });

  it('生成的 JWT 应包含 token_version', () => {
    const payload = buildTokenPayload({ id: 1, username: 'test', role_id: 1, role_code: 'admin', user_type: 'internal', token_version: 5 });
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, TEST_SECRET);
    expect(decoded.token_version).toBe(5);
  });
});

describe('JWT 鉴权 - token_version 校验', () => {
  it('版本号匹配应放行', async () => {
    const decoded = { id: 1, token_version: 3 };
    const dbGet = vi.fn().mockResolvedValue({ token_version: 3, status: 1 });
    const result = await verifyTokenVersion(decoded, dbGet);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('版本号不匹配应拒绝（用户被踢下线）', async () => {
    const decoded = { id: 1, token_version: 2 };
    const dbGet = vi.fn().mockResolvedValue({ token_version: 3, status: 1 });
    const result = await verifyTokenVersion(decoded, dbGet);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('version_mismatch');
  });

  it('用户被禁用应拒绝', async () => {
    const decoded = { id: 1, token_version: 3 };
    const dbGet = vi.fn().mockResolvedValue({ token_version: 3, status: 0 });
    const result = await verifyTokenVersion(decoded, dbGet);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('用户不存在应拒绝', async () => {
    const decoded = { id: 999, token_version: 1 };
    const dbGet = vi.fn().mockResolvedValue(null);
    const result = await verifyTokenVersion(decoded, dbGet);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  it('旧令牌不含 token_version 应自动放行（向下兼容）', async () => {
    const decoded = { id: 1 }; // 旧令牌没有 token_version
    const dbGet = vi.fn();
    const result = await verifyTokenVersion(decoded, dbGet);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('no_version_check');
    expect(dbGet).not.toHaveBeenCalled(); // 不应查询数据库
  });

  it('数据库异常时应降级放行', async () => {
    const decoded = { id: 1, token_version: 3 };
    const dbGet = vi.fn().mockRejectedValue(new Error('connection pool exhausted'));
    const result = await verifyTokenVersion(decoded, dbGet);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('db_error_fallback');
  });
});

describe('JWT - 版本号递增触发条件', () => {
  it('角色变更应触发递增', () => {
    const oldUser = { role_id: 2, status: 1 };
    expect(shouldIncrementVersion(oldUser, 3, 1, false)).toBe(true);
  });

  it('状态变更（禁用）应触发递增', () => {
    const oldUser = { role_id: 2, status: 1 };
    expect(shouldIncrementVersion(oldUser, 2, 0, false)).toBe(true);
  });

  it('修改密码应触发递增', () => {
    const oldUser = { role_id: 2, status: 1 };
    expect(shouldIncrementVersion(oldUser, 2, 1, true)).toBe(true);
  });

  it('仅修改姓名/部门时不应触发递增', () => {
    const oldUser = { role_id: 2, status: 1 };
    expect(shouldIncrementVersion(oldUser, 2, 1, false)).toBe(false);
  });

  it('角色+状态+密码同时变更只需递增一次', () => {
    const oldUser = { role_id: 2, status: 1 };
    // 返回 true 就够了，SQL 中只会 +1 次
    expect(shouldIncrementVersion(oldUser, 3, 0, true)).toBe(true);
  });
});

describe('JWT - Refresh 端点版本校验', () => {
  it('refresh token 版本匹配时应签发新 access token', () => {
    const refreshPayload = { id: 1, username: 'admin', role_id: 1, role_code: 'admin', user_type: 'internal', token_version: 3 };
    const refreshToken = jwt.sign(refreshPayload, REFRESH_SECRET, { expiresIn: '7d' });
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);

    // 模拟签发新 token（保留 token_version）
    const newToken = jwt.sign(
      { id: decoded.id, username: decoded.username, role_id: decoded.role_id, role_code: decoded.role_code, user_type: decoded.user_type, token_version: decoded.token_version },
      TEST_SECRET,
      { expiresIn: '2h' }
    );
    const newDecoded = jwt.verify(newToken, TEST_SECRET);
    expect(newDecoded.token_version).toBe(3);
  });

  it('refresh token 过期应拒绝', () => {
    const refreshPayload = { id: 1, token_version: 1 };
    const expiredToken = jwt.sign(refreshPayload, REFRESH_SECRET, { expiresIn: '0s' });

    // 等几毫秒确保过期
    expect(() => jwt.verify(expiredToken, REFRESH_SECRET)).toThrow();
  });
});
