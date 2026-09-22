<!--
  A-15 运营账号与权限（复用 uni-admin 的 system/user/list.vue，五处必改）

  1. 查询范围：D-038 下小程序用户与运营账号同表，空 where 会列出全部小程序用户。
     顶部增加身份筛选器（全部 / 普通用户 / 运营账号），默认「运营账号」（ADM-02）。
  2. 导出：保留导出按钮（D-072 已放开导出），但导出对象随身份筛选收窄。
  3. 手机号、邮箱两列隐藏：D-029 运营账号不采集手机号，该列恒为空且易误导。
  4. 角色列映射为中文角色名，「运营统计查看」作为独立权限点单列（OPS §3.2、D-042）。
  5. 删除保留但须逐字输入 delete 确认；停用与删除分开呈现（D-074、ADM-07）。

  另按 OPS §15 与 D-029 移除了标签管理、群发短信、可登录应用三处与运营职责无关的入口。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <uni-data-select
          class="identity-select"
          v-model="identity"
          :localdata="identityOptions"
          :clear="false"
          placeholder="账号身份"
          @change="onIdentityChange"
        />
        <input class="uni-search" type="text" v-model="query" @confirm="search" :placeholder="$t('common.placeholder.query')" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="search">{{ $t('common.button.search') }}</button>
        <button class="uni-button" type="primary" size="mini" @click="navigateTo('./add')">{{ $t('common.button.add') }}</button>
        <button class="uni-button" type="default" size="mini" :disabled="!selectedIndexs.length" @click="batchDisable">停用</button>
        <button class="uni-button" type="warn" size="mini" :disabled="!selectedIndexs.length" @click="openDeletePopup">{{ $t('common.button.delete') }}</button>
        <!-- #ifdef H5 -->
        <download-excel class="hide-on-phone" :fields="exportExcel.fields" :data="exportExcelData" :type="exportExcel.type" :name="exportExcel.filename">
          <button class="uni-button" type="primary" size="mini">{{ $t('common.button.exportExcel') }}</button>
        </download-excel>
        <!-- #endif -->
      </view>
    </view>
    <view class="uni-container">
      <uni-notice-bar
        class="account-notice"
        single
        :text="noticeText"
        background-color="#fdf6ec"
        color="#f3a73f"
      />
      <unicloud-db
        ref="udbRef"
        :collection="collectionList"
        :where="where"
        page-data="replace"
        :orderby="orderby"
        :getcount="true"
        :page-size="options.pageSize"
        :page-current="options.pageCurrent"
        v-slot:default="{ data, pagination, loading, error }"
        :options="options"
        loadtime="manual"
        @load="onqueryload"
      >
        <uni-table ref="tableRef" :loading="loading" :emptyText="error.message || $t('common.empty')" border stripe type="selection" @selection-change="selectionChange">
          <uni-tr>
            <uni-th align="center" filter-type="search" @filter-change="filterChange($event, 'username')" sortable @sort-change="sortChange($event, 'username')">用户名</uni-th>
            <uni-th align="center" filter-type="search" @filter-change="filterChange($event, 'nickname')" sortable @sort-change="sortChange($event, 'nickname')">用户昵称</uni-th>
            <uni-th align="center" filter-type="select" :filter-data="options.filterData.status_localdata" @filter-change="filterChange($event, 'status')">账号状态</uni-th>
            <uni-th align="center">角色</uni-th>
            <uni-th align="center">运营统计查看</uni-th>
            <uni-th align="center" filter-type="timestamp" @filter-change="filterChange($event, 'last_login_date')" sortable @sort-change="sortChange($event, 'last_login_date')"
              >最后登录时间</uni-th
            >
            <uni-th align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="(item, index) in data" :key="item._id || index">
            <uni-td align="center">
              {{ item.username }}
              <text v-if="item._id === currentUid" class="account-self-tag">当前登录账号</text>
            </uni-td>
            <uni-td align="center">{{ item.nickname }}</uni-td>
            <uni-td align="center">
              <uni-tag :type="item.status === USER_STATUS.NORMAL ? 'success' : 'default'" inverted size="small" :text="item._statusText"></uni-tag>
            </uni-td>
            <uni-td align="center">
              <view class="account-roles">
                <uni-tag v-for="role in item._roleTags" :key="role.id" type="primary" inverted size="small" :text="role.name" class="account-role-tag"></uni-tag>
                <text v-if="!item._roleTags.length" class="account-empty">未分配</text>
              </view>
              <text v-if="item._id === currentUid" class="account-self-hint">不能改自己的角色</text>
            </uni-td>
            <uni-td align="center">
              <uni-tag :type="item._hasStatView ? 'success' : 'default'" inverted size="small" :text="item._hasStatView ? '有' : '无'"></uni-tag>
            </uni-td>
            <uni-td align="center">
              <uni-dateformat :threshold="[0, 0]" :date="item.last_login_date"></uni-dateformat>
            </uni-td>
            <uni-td align="center">
              <view class="uni-group" v-if="item._id !== currentUid">
                <button @click="navigateTo('./edit?id=' + item._id, false)" class="uni-button" size="mini" type="primary">{{ $t('common.button.edit') }}</button>
                <button @click="toggleStatus(item)" class="uni-button" size="mini" :type="item.status === USER_STATUS.NORMAL ? 'warn' : 'default'">
                  {{ item.status === USER_STATUS.NORMAL ? '停用' : '启用' }}
                </button>
              </view>
              <text v-else class="account-empty">不能操作本人账号</text>
            </uni-td>
          </uni-tr>
        </uni-table>
        <view class="uni-pagination-box">
          <uni-pagination
            show-iconn
            show-page-size
            :page-size="pagination.size"
            v-model="pagination.current"
            :total="pagination.count"
            @change="onPageChanged"
            @pageSizeChange="changeSize"
          />
        </view>
      </unicloud-db>
    </view>
    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
    <uni-popup ref="deletePopupRef" type="center" :is-mask-click="false">
      <view class="delete-confirm--x">
        <view class="delete-confirm--header">删除运营账号</view>
        <view class="delete-confirm--body">
          <view class="delete-confirm--text">
            即将删除 {{ pendingDeleteIds.length }} 个账号，删除不可撤销。若只是暂时停止其后台访问，请改用「停用」。
          </view>
          <view class="delete-confirm--names">{{ pendingDeleteNames }}</view>
          <view class="delete-confirm--text">请逐字输入 <text class="delete-confirm--keyword">delete</text> 以确认（区分大小写）</view>
          <uni-easyinput v-model="deleteConfirmText" placeholder="delete" trim="all" />
        </view>
        <view class="uni-group delete-confirm--actions">
          <button class="uni-button" size="mini" type="default" @click="closeDeletePopup">取消</button>
          <button class="uni-button" size="mini" type="warn" :disabled="deleteConfirmText !== DELETE_KEYWORD" @click="doDelete">确认删除</button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
  import { computed, getCurrentInstance, nextTick, ref } from 'vue';
  import { onLoad, onReady } from '@dcloudio/uni-app';
  import { filterToWhere } from '../../../js_sdk/validator/uni-id-users.js';
  import { OPS_ROLE_IDS, OPS_ROLE_NAMES, STAT_VIEW_PERMISSION, USER_STATUS, setAccountStatus, removeAccounts } from '@/common/grouporder/ops-account.js';

  const db = uniCloud.database();
  const { proxy } = getCurrentInstance();

  // 表查询配置
  const dbOrderBy = 'last_login_date desc';
  // 支持模糊搜索的字段列表。已移除 mobile 与 email：运营账号不采集手机号（D-029）
  const dbSearchFields = ['username', 'nickname', 'role.role_name'];
  const pageSize = 20;
  const pageCurrent = 1;
  const orderByMapping = {
    ascending: 'asc',
    descending: 'desc',
  };
  /** 删除确认关键字，区分大小写（ADM-07） */
  const DELETE_KEYWORD = 'delete';
  const STATUS_TEXT = {
    [USER_STATUS.NORMAL]: '启用',
    [USER_STATUS.DISABLED]: '停用',
    [USER_STATUS.AUDITING]: '审核中',
    [USER_STATUS.AUDIT_REJECTED]: '审核拒绝',
    [USER_STATUS.CLOSED]: '已注销',
  };

  // 联表取角色的 permission，用于判断「运营统计查看」是否已授予
  const collectionList = ref([
    db
      .collection('uni-id-users')
      .field(
        'avatar,avatar_file,comment,dcloud_appid,department_id,email,gender,invite_time,inviter_uid,last_login_date,last_login_ip,mobile,my_invite_code,nickname,role,score,status,username'
      )
      .getTemp(),
    db.collection('uni-id-roles').field('role_id, role_name, permission').getTemp(),
  ]);

  const currentUid = uniCloud.getCurrentUserInfo().uid;

  const query = ref('');
  const where = ref('');
  const orderby = ref(dbOrderBy);
  const selectedIndexs = ref([]);
  const identity = ref('ops');
  const identityOptions = ref([
    { value: 'ops', text: '运营账号' },
    { value: 'normal', text: '普通用户' },
    { value: 'all', text: '全部' },
  ]);
  const options = ref({
    pageSize,
    pageCurrent,
    filterData: {
      status_localdata: [
        { text: '启用', value: USER_STATUS.NORMAL },
        { text: '停用', value: USER_STATUS.DISABLED },
        { text: '审核中', value: USER_STATUS.AUDITING },
        { text: '审核拒绝', value: USER_STATUS.AUDIT_REJECTED },
        { text: '已注销', value: USER_STATUS.CLOSED },
      ],
    },
  });
  const exportExcel = ref({
    filename: 'grouporder-ops-accounts.xls',
    type: 'xls',
    // 导出字段与列表一致：不含手机号与邮箱
    fields: {
      用户名: 'username',
      用户昵称: 'nickname',
      账号状态: '_statusText',
      角色: '_roleText',
      运营统计查看: '_statViewText',
      最后登录时间: 'last_login_date',
    },
  });
  const exportExcelData = ref([]);
  const pendingDeleteIds = ref([]);
  const pendingDeleteNames = ref('');
  const deleteConfirmText = ref('');
  const _filter = ref({});

  const udbRef = ref(null);
  const tableRef = ref(null);
  const deletePopupRef = ref(null);

  const noticeText = computed(() => {
    const scope = identity.value === 'ops' ? '仅列运营账号' : identity.value === 'normal' ? '仅列普通用户' : '列出全部账号（含小程序用户）';
    return `当前范围：${scope}；导出对象与当前筛选结果一致；删除需逐字输入 delete。查看与导出均记入审计。`;
  });

  // —— 查询条件：身份筛选、关键字搜索、列头筛选三者合并，互不覆盖 ——
  const getIdentityWhere = () => {
    if (identity.value === 'ops') {
      return { 'role.role_id': db.command.in(OPS_ROLE_IDS) };
    }
    if (identity.value === 'normal') {
      return { 'role.role_id': db.command.nin(OPS_ROLE_IDS) };
    }
    return null;
  };

  const getSearchWhere = () => {
    const keyword = query.value.trim();
    if (!keyword) {
      return null;
    }
    const queryRe = new RegExp(keyword, 'i');
    return db.command.or(dbSearchFields.map((name) => ({ [name]: queryRe })));
  };

  const applyWhere = () => {
    const conditions = [];
    const identityWhere = getIdentityWhere();
    if (identityWhere) {
      conditions.push(identityWhere);
    }
    const searchWhere = getSearchWhere();
    if (searchWhere) {
      conditions.push(searchWhere);
    }
    const columnWhere = filterToWhere(_filter.value || {}, db.command);
    if (columnWhere && Object.keys(columnWhere).length) {
      conditions.push(columnWhere);
    }
    if (!conditions.length) {
      where.value = '';
    } else if (conditions.length === 1) {
      where.value = conditions[0];
    } else {
      where.value = db.command.and(conditions);
    }
  };

  const loadData = (clear = true) => {
    udbRef.value && udbRef.value.loadData({ clear });
  };

  const reload = () => {
    options.value.pageCurrent = 1;
    applyWhere();
    nextTick(() => loadData());
  };

  const onIdentityChange = () => {
    selectedIndexs.value = [];
    tableRef.value && tableRef.value.clearSelection();
    reload();
  };

  const search = () => reload();

  const onqueryload = (data) => {
    data.forEach((item) => {
      const roles = Array.isArray(item.role) ? item.role : [];
      item._roleTags = roles.map((role) => ({
        id: role.role_id,
        name: OPS_ROLE_NAMES[role.role_id] || role.role_name || role.role_id,
      }));
      item._roleText = item._roleTags.map((role) => role.name).join('、');
      // 权限点授予的是角色，不是账号；此处按其角色是否含 ops-stat-view 展示，只读
      item._hasStatView = roles.some((role) => Array.isArray(role.permission) && role.permission.indexOf(STAT_VIEW_PERMISSION) > -1);
      item._statViewText = item._hasStatView ? '有' : '无';
      item._statusText = STATUS_TEXT[item.status] || '未知';
      item.last_login_date = proxy.$formatDate(item.last_login_date);
    });
    exportExcelData.value = data;
  };

  const changeSize = (size) => {
    options.value.pageSize = size;
    options.value.pageCurrent = 1;
    nextTick(() => loadData());
  };

  const onPageChanged = (e) => {
    selectedIndexs.value = [];
    tableRef.value && tableRef.value.clearSelection();
    udbRef.value.loadData({ current: e.current });
  };

  const navigateTo = (url, clear) => {
    // clear 表示刷新列表时是否清除页码，true 表示刷新并回到列表第 1 页，默认为 true
    uni.navigateTo({
      url,
      events: {
        refreshData: () => loadData(clear),
      },
    });
  };

  const selectionChange = (e) => {
    selectedIndexs.value = e.detail.index;
  };

  const selectedRows = () => {
    const dataList = (udbRef.value && udbRef.value.dataList) || [];
    return selectedIndexs.value.map((i) => dataList[i]).filter((item) => !!item);
  };

  /** 本人账号不可停用、不可删除，防止自锁与自行提权（OPS §4.9） */
  const excludeSelf = (rows) => {
    const kept = rows.filter((item) => item._id !== currentUid);
    if (kept.length !== rows.length) {
      uni.showToast({ title: '已跳过本人账号', icon: 'none' });
    }
    return kept;
  };

  const showError = (err) => {
    uni.showModal({ content: (err && (err.errMsg || err.message)) || '操作失败', showCancel: false });
  };

  const updateStatus = (uids, status, reason) => {
    uni.showLoading({ title: '处理中', mask: true });
    // 走 grouporder-ops-co 的 accountSetStatus：服务端逐个写审计，并拒绝修改自己的账号
    setAccountStatus(uids, status, reason)
      .then((res) => {
        const changed = (res && res.changed) || 0;
        const skipped = uids.length - changed;
        uni.showToast({
          title: (status === USER_STATUS.DISABLED ? '已停用 ' : '已启用 ') + changed + ' 个' + (skipped ? '，' + skipped + ' 个状态未变化' : ''),
          icon: 'none',
        });
        selectedIndexs.value = [];
        tableRef.value && tableRef.value.clearSelection();
        loadData(false);
      })
      .catch(showError)
      .finally(() => uni.hideLoading());
  };

  const toggleStatus = (item) => {
    const toDisabled = item.status === USER_STATUS.NORMAL;
    uni.showModal({
      title: toDisabled ? '停用账号' : '启用账号',
      content: toDisabled
        ? `停用 ${item.username} 后立即失去后台访问能力，未完成的操作不得继续提交。`
        : `确认恢复 ${item.username} 的后台访问能力？`,
      success: (res) => {
        if (res.confirm) {
          updateStatus([item._id], toDisabled ? USER_STATUS.DISABLED : USER_STATUS.NORMAL, toDisabled ? '停用运营账号' : '启用运营账号');
        }
      },
    });
  };

  const batchDisable = () => {
    const rows = excludeSelf(selectedRows());
    if (!rows.length) return;
    uni.showModal({
      title: '停用账号',
      content: `将停用 ${rows.length} 个账号，停用后立即失去后台访问能力。`,
      success: (res) => {
        if (res.confirm) {
          updateStatus(
            rows.map((item) => item._id),
            USER_STATUS.DISABLED,
            '批量停用运营账号'
          );
        }
      },
    });
  };

  const openDeletePopup = () => {
    const rows = excludeSelf(selectedRows());
    if (!rows.length) return;
    pendingDeleteIds.value = rows.map((item) => item._id);
    pendingDeleteNames.value = rows.map((item) => item.username || item.nickname || item._id).join('、');
    deleteConfirmText.value = '';
    deletePopupRef.value.open();
  };

  const closeDeletePopup = () => {
    deleteConfirmText.value = '';
    pendingDeleteIds.value = [];
    pendingDeleteNames.value = '';
    deletePopupRef.value.close();
  };

  const doDelete = () => {
    if (deleteConfirmText.value !== DELETE_KEYWORD || !pendingDeleteIds.value.length) {
      return;
    }
    const uids = pendingDeleteIds.value.slice();
    uni.showLoading({ title: '删除中', mask: true });
    removeAccounts(uids)
      .then(() => {
        uni.showToast({ title: '已删除', icon: 'none' });
        selectedIndexs.value = [];
        tableRef.value && tableRef.value.clearSelection();
        closeDeletePopup();
        loadData();
      })
      .catch((err) => {
        closeDeletePopup();
        showError(err);
      })
      .finally(() => uni.hideLoading());
  };

  const sortChange = (e, name) => {
    orderby.value = e.order ? name + ' ' + orderByMapping[e.order] : '';
    tableRef.value && tableRef.value.clearSelection();
    selectedIndexs.value = [];
    nextTick(() => loadData());
  };

  const filterChange = (e, name) => {
    _filter.value[name] = {
      type: e.filterType,
      value: e.filter,
    };
    reload();
  };

  onLoad((e) => {
    _filter.value = {};
    const userId = e && e.id;
    if (userId) {
      // 由其他页面带 id 跳转过来时，直接定位到该账号，身份筛选放开以免查不到
      identity.value = 'all';
      _filter.value._id = { type: 'select', value: [userId] };
    }
  });

  onReady(() => {
    applyWhere();
    nextTick(() => loadData());
  });
</script>

<style lang="scss">
  .identity-select {
    width: 140px;
    flex-shrink: 0;
    margin: 10px;
  }

  .account-notice {
    margin-bottom: 15px;
  }

  .account-roles {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
  }

  .account-role-tag {
    margin: 2px 3px;
  }

  .account-self-tag {
    display: block;
    font-size: 12px;
    color: #2979ff;
  }

  .account-self-hint {
    display: block;
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }

  .account-empty {
    font-size: 12px;
    color: #999;
  }

  .delete-confirm {
    &--x {
      width: 420px;
      padding: 25px 30px;
      border-radius: 5px;
      background-color: #fff;
    }

    &--header {
      font-size: 18px;
      color: #333;
      text-align: center;
      margin-bottom: 20px;
    }

    &--body {
      font-size: 14px;
      color: #606266;
      line-height: 1.8;
    }

    &--text {
      margin-bottom: 10px;
    }

    &--names {
      color: #333;
      word-break: break-all;
      margin-bottom: 10px;
    }

    &--keyword {
      color: #e43d33;
      font-weight: bold;
    }

    &--actions {
      margin-top: 25px;
      justify-content: flex-end;
    }
  }
</style>
