/**
 * A-15 运营账号写操作适配层
 *
 * A-15 的**读**走 uni-id 体系的 unicloud-db 直连（uni-id-* 本就是 read: true），
 * 但**写**必须走 grouporder-ops-co：直连没有任何地方能写 grouporder-oplog，
 * 而 OPS §13 要求「运营账号停用 / 角色变更」两类事件必记（CLOUD_API §11 批 G）。
 *
 * 云对象在服务端另做两件页面无法保证的事：
 *   - 不允许修改自己的账号状态与角色（避免自锁或自行提权）
 *   - 状态未变化时返回 changed: false，重复操作不重复写审计
 */

import { callOps } from './ops-co.js';

const db = uniCloud.database();

/** 四类运营角色（REUSE_MAP §6.3）。admin 是初始化账号，不属于业务角色 */
export const OPS_ROLE_IDS = ['ops-super', 'ops-content', 'ops-privacy', 'ops-auditor'];

/** 角色 id → 中文名。不依赖库中的 role_name 文案，避免角色数据被改名后列表跟着变 */
export const OPS_ROLE_NAMES = {
  'ops-super': '超级管理员',
  'ops-content': '内容运营',
  'ops-privacy': '账号与隐私专员',
  'ops-auditor': '审计查看者',
  admin: '系统管理员',
};

/** 运营统计查看：独立权限点，不随角色自动获得（D-042、OPS §3.2） */
export const STAT_VIEW_PERMISSION = 'ops-stat-view';

/** uni-id-users.status（schema 已按 D-056 补回 4） */
export const USER_STATUS = {
  NORMAL: 0,
  DISABLED: 1,
  AUDITING: 2,
  AUDIT_REJECTED: 3,
  CLOSED: 4,
};

/**
 * 启用 / 停用运营账号，逐个走云对象以保证每次变更都写入审计。
 * 停用立即生效：被停用的账号失去后台访问能力，未完成操作不得继续提交（OPS §3.1）。
 * @param {Array<String>} uids
 * @param {Number} status USER_STATUS.NORMAL 或 USER_STATUS.DISABLED
 * @param {String} reason 操作原因，写入 grouporder-oplog
 * @returns {Promise<{changed: number, results: Array}>}
 */
export async function setAccountStatus(uids, status, reason = '') {
  if (!Array.isArray(uids) || !uids.length) {
    return Promise.reject({ errCode: 'INVALID_PARAM', errMsg: '未选择账号' });
  }
  // 云对象一次只处理一个账号（要记录每个账号的前后状态快照），这里按顺序提交
  const results = [];
  for (const uid of uids) {
    // silent：批量时由调用方汇总提示，不逐条弹窗
    const res = await callOps('accountSetStatus', { user_id: uid, status, reason }, { silent: uids.length > 1 });
    results.push(res);
  }
  return { changed: results.filter((r) => r && r.changed).length, results };
}

/**
 * 授予 / 撤销角色。整份角色列表覆盖式提交，云对象负责禁止改自己与禁止授予内置 admin。
 * @param {String} uid
 * @param {Array<String>} roles 完整的角色 id 列表
 * @param {String} reason
 */
export function assignRoles(uid, roles, reason = '') {
  return callOps('roleAssign', { user_id: uid, roles, reason });
}

/**
 * 删除运营账号（不可逆，与停用分开呈现，D-074）。
 *
 * ⚠ 数据库层另有一道保险：DELETE_UNI_ID_USERS 权限点刻意未登记到 uni-id-permissions
 * （ADM-07），因此除内置 admin 外，schema 的 delete 表达式会拒绝本次删除。
 * 页面保留入口是按 BRIEF §4⑤ 的要求，实际能否删除由服务端裁决。
 * @param {Array<String>} uids
 */
export function removeAccounts(uids) {
  if (!Array.isArray(uids) || !uids.length) {
    return Promise.reject({ errCode: 'INVALID_PARAM', errMsg: '未选择账号' });
  }
  // 云对象没有删除方法（运营账号只允许停用），删除仍走直连，由 schema 裁决
  return db
    .collection('uni-id-users')
    .where({ _id: db.command.in(uids) })
    .remove();
}

export default { OPS_ROLE_IDS, OPS_ROLE_NAMES, STAT_VIEW_PERMISSION, USER_STATUS, setAccountStatus, assignRoles, removeAccounts };
