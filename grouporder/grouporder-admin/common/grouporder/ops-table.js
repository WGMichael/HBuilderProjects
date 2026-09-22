/**
 * 后台表格页通用封装
 *
 * 把 uni-table 的列头筛选与排序（filter-type / sortable）直接接到云对象的列表契约上：
 *   uni-table @filter-change / @sort-change  →  { page, pageSize, filters, orderBy }
 *
 * filters 是**扁平的值对象**：云对象按 p.filters.<字段> 直接取值
 * （见 grouporder-ops-co 的 reportList 等方法），因此：
 *   - search    → filters[field] = '关键字'
 *   - select    → filters[field] = 单个值（uni-table 给的是数组，取第一个）
 *   - timestamp → filters.start_date / filters.end_date（云对象的 _dateRange 认这两个键）
 *
 * 业务页不得直连数据库（D-075），因此这里只对接 grouporder-ops-co 的列表方法。
 * 筛选「长在列头里」，页面不要在表格上方另做筛选表单区（ADMIN_FRONTEND_BRIEF §3）。
 */

import { ref, reactive } from 'vue';
import { callOpsList, MAX_PAGE_SIZE } from './ops-co.js';

/** uni-table 的排序取值 → 云对象契约的 direction */
const ORDER_DIRECTION = {
  ascending: 'asc',
  descending: 'desc',
};

/**
 * @param {String|Function} method grouporder-ops-co 的列表方法名；
 *        传函数时每次取数前重新求值，用于 A-04 这种一屏切换多个检索对象的页面
 * @param {Object} options
 *        - pageSize      初始每页条数，默认 20
 *        - immediate     创建后是否立即拉取，默认 false（页面通常在 onReady 里调 reload）
 *        - defaultFilters 固定筛选条件，与列头筛选合并，列头同名字段优先
 *        - defaultOrderBy 初始排序，形如 { field: 'create_date', direction: 'desc' }
 *        - callOptions   透传给 callOps 的选项，如 { errorActions }
 */
export function useOpsTable(method, options = {}) {
  const { pageSize: initialPageSize = 20, immediate = false, defaultFilters = {}, defaultOrderBy = null, callOptions = {} } = options;

  const list = ref([]);
  const total = ref(0);
  const asOf = ref(null);
  const loading = ref(false);
  const errMessage = ref('');
  const page = ref(1);
  const pageSize = ref(Math.min(initialPageSize, MAX_PAGE_SIZE));
  // 列头筛选：{ 字段名: { type: 'search'|'select'|'timestamp', value } }
  const filters = reactive({});
  const orderBy = ref(defaultOrderBy);

  const resolveMethod = () => (typeof method === 'function' ? method() : method);

  const buildFilters = () => {
    const merged = { ...defaultFilters };
    Object.keys(filters).forEach((field) => {
      merged[field] = filters[field];
    });
    return merged;
  };

  const load = async () => {
    if (loading.value) return;
    loading.value = true;
    errMessage.value = '';
    try {
      const res = await callOpsList(
        resolveMethod(),
        {
          page: page.value,
          pageSize: pageSize.value,
          filters: buildFilters(),
          orderBy: orderBy.value,
        },
        callOptions
      );
      list.value = res.list;
      total.value = res.total;
      asOf.value = res.asOf;
    } catch (err) {
      // 错误提示已由 callOps 统一处理，这里只保留表格空态文案
      list.value = [];
      total.value = 0;
      errMessage.value = (err && err.errMsg) || '数据加载失败';
    } finally {
      loading.value = false;
    }
  };

  /** 条件变化后回到第 1 页重新拉取 */
  const reload = () => {
    page.value = 1;
    return load();
  };

  /** 对接 uni-th 的 @filter-change="onFilterChange($event, '字段名')" */
  const onFilterChange = (e, field) => {
    const raw = e && e.filter;
    const isEmpty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && !raw.length);
    const type = e && e.filterType;

    if (type === 'timestamp' || type === 'date') {
      // 时间范围统一落到 start_date / end_date，云对象的 _dateRange 只认这两个键
      if (isEmpty) {
        delete filters.start_date;
        delete filters.end_date;
      } else {
        const [start, end] = Array.isArray(raw) ? raw : [raw, raw];
        if (start) filters.start_date = start;
        else delete filters.start_date;
        if (end) filters.end_date = end;
        else delete filters.end_date;
      }
      return reload();
    }

    if (isEmpty) {
      delete filters[field];
    } else {
      // select 给的是数组，云对象按单值比较，取第一个
      filters[field] = Array.isArray(raw) ? raw[0] : raw;
    }
    return reload();
  };

  /** 页面手工设置筛选条件时用这个，避免各页面重复写「空值就删键」 */
  const setFilter = (field, value) => {
    const isEmpty = value === undefined || value === null || value === '';
    if (isEmpty) delete filters[field];
    else filters[field] = value;
  };

  /** 对接 uni-th 的 @sort-change="onSortChange($event, '字段名')" */
  const onSortChange = (e, field) => {
    const direction = e && ORDER_DIRECTION[e.order];
    orderBy.value = direction ? { field, direction } : defaultOrderBy;
    return reload();
  };

  /** 对接 uni-pagination 的 @change */
  const onPageChange = (e) => {
    page.value = (e && e.current) || 1;
    return load();
  };

  /** 对接 uni-pagination 的 @pageSizeChange */
  const onPageSizeChange = (size) => {
    pageSize.value = Math.min(size || 20, MAX_PAGE_SIZE);
    return reload();
  };

  const clearFilters = () => {
    Object.keys(filters).forEach((field) => delete filters[field]);
    orderBy.value = defaultOrderBy;
    return reload();
  };

  if (immediate) {
    load();
  }

  return {
    list,
    total,
    asOf,
    loading,
    errMessage,
    page,
    pageSize,
    filters,
    orderBy,
    load,
    reload,
    clearFilters,
    setFilter,
    onFilterChange,
    onSortChange,
    onPageChange,
    onPageSizeChange,
  };
}

export default { useOpsTable };
