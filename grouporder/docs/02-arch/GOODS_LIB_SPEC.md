# 用户商品库 `grouporder-goods-lib` 实现规格

- 文档版本：v0.3
- 更新日期：2026-09-15
- 文档状态：**方案已定，可实施**
- 对应决策：D-063、D-064、D-065（推荐标识）、D-066（商品库分类），均已写入 `DECISIONS.md`
- 依据：产品负责人 2026-09-15 确认采用方案 A（原始评审文档 `NAV_AND_GOODS_ALIGNMENT.md` 已于 2026-09-18 删除，结论见 `DECISIONS.md` 变更记录与 D-063～D-066）
- 适用版本：见 `docs/README.md` 版本总表
- 读者：实现本功能的开发 Agent。本文是自包含的，除本文外只需阅读 `grouporder-goods.schema.json` 与 `grouporder-address.schema.json`（作为命名约定参照）

---

## 1. 要解决的问题

现状：`grouporder-goods` 的 `activity_id` 为必填，商品是活动的子对象，不存在跨活动复用能力。团长每次发起接龙都要把相同的商品名称、封面图、详情图、说明、单位重新录入一遍。

目标：商品在保存时自动沉淀为**用户级商品库**记录；团长在创建活动时可以「复用历史商品」，一次多选，把历史商品的内容复制进当前活动。

---

## 2. 核心设计：复制，不是引用

**商品库只做复制源，不做引用源。** 复用动作执行的是「按库记录的内容，在 `grouporder-goods` 里新建一条独立记录」，复制完成后两者再无任何关联，不存外键、不做同步。

必须坚持这一点的三个理由，实现时不要"优化"成引用模型：

1. **历史不可变。** 引用模型下，团长把库里的商品改名换图，所有历史活动的商品展示和已生成清单的内容会跟着变。本项目已经用价格快照（`order_item`）和收货快照（`order`）确立了「一旦成为业务记录就与源头解耦」的原则，商品必须遵循同一原则。
2. **治理不连坐。** 引用模型下，运营下架一个库商品，会波及引用它的全部历史活动，包括那些已经截止、已经线下履约完毕的。
3. **改动面最小。** 复制模型下 `grouporder-goods` 只增加一个**只读来源字段** `lib_id`（见 §2.2），其余字段与索引原样保留；引用模型则要重做库存、限购、停售、治理四套逻辑的归属。

### 2.2 `lib_id`：唯一的来源字段，且只能用于来源追溯

`grouporder-goods` 增加一个可空字段 `lib_id`，记录这条活动商品是从哪条库记录复制来的。手工新增、未经复用的商品该字段为空。

**它存在的唯一理由是治理反写（§7）。** 商品复制进活动后团长可以改名，若仅按「`user_id` + `name`」反查商品库，改过名的商品被下架时匹配不到库记录，`governance_blocked` 置不上，绕过治理的路径重新成立。`lib_id` 把这个匹配从模糊字符串变为精确定位。

**严格禁止的用法**，实现时不要越界：

| 禁止 | 原因 |
|---|---|
| 通过 `lib_id` 联表读取库记录的名称、图片、价格来展示活动商品 | 活动商品的内容必须自带，库记录改了不能影响已有活动 |
| 任何方向的字段同步（库→活动、活动→库） | 沉淀只发生在商品保存时（§4），复制只发生在复用时（§5），此外不存在第三条同步路径 |
| 把它声明为 `foreignKey` | 本项目 `foreignKey` 用于真实关系（`activity_id`、`user_id`）。声明为外键会让它在视觉上归入同一类，正是错误的信号 |
| 因库记录被软删就清空或报错 | 悬空是正常的，它是历史来源记录，不是有效引用 |

字段定义（加入 `grouporder-goods.schema.json` 的 `properties`，**不加入 `required`**）：

```json
"lib_id": {
  "bsonType": "string",
  "title": "来源商品库记录",
  "description": "复用历史商品时记录来源库记录 ID，手工新增为空。仅用于治理反写定位（D-064），禁止联表读取或任何字段同步；库记录被软删后本字段保持原值不清空"
}
```

`grouporder-goods.index.json` **不需要新增索引**：治理反写是低频操作且已知 `lib_id` 具体值，全表少量扫描可接受，加索引的写入成本不划算。

### 2.3 为什么 `grouporder-goods` 仍要自带内容字段

常见质疑：`name`、`description`、`cover_image`、`detail_images`、`unit` 在库记录里已经有了，活动商品为什么还要各存一份？看起来是冗余。

**它不是冗余，是快照。** 与 `order_item.price`（价格快照）、`order` 的收货信息快照属于同一设计，遵循同一条原则：

> **lib 是填表模板，goods 是业务事实。凡是会进入订单、清单、履约凭证的内容，一律存快照，不存引用。**

五条理由，每条单独都足以否掉"内容只放 lib、goods 通过 `lib_id` 读取"的方案：

| # | 理由 | 后果 |
|---|---|---|
| 1 | **清单是履约凭证** | 已截止活动的 Excel 清单写着"有机白菜 5 元 × 87 份"。团长次月修改或软删该库记录，清单内容会跟着变甚至变空，参与者无法核对 |
| 2 | **`lib_id` 可以为空** | 手工新增的商品没有来源记录，内容将无处安放。为此强制"每个商品必须先建库记录"，等于把 lib 变成必经路径，引用模型从后门重新成立 |
| 3 | **活动内允许改名换图** | D-048 允许截止前编辑商品内容。改动存回 lib 会污染该商品在其他活动中的呈现；不存则直接丢失 |
| 4 | **治理会连坐** | 运营下架某活动内的违规商品时，共享内容要么波及全部历史活动，要么下架不干净 |
| 5 | **留存期不一致** | D-035 规定订单相关数据自活动截止起保存三年；D-056 规定账号注销时 lib 记录删除或匿名化。内容挂在 lib 上，一次注销会抹掉三年保存期内的历史活动内容，直接违反留存规则 |

关于"重复存储浪费"：图片字段存的是 fileID 字符串而非文件本身，复制等同于复制一个字符串；文字字段量级为数百字节。按 D-024 容量上限估算，日增数 MB 文本，代价远低于放弃历史不可变。

### 2.1 为什么 `grouporder-goods.activity_id` 仍然必填

这是本方案最容易被误解的一点，实现前务必确认理解无误。

「同一个商品可以出现在多个活动里」这件事，是靠 **`grouporder-goods` 中的多条记录各自持有一个 `activity_id`** 来表达的，**不是**靠一条记录持有多个 `activity_id`。两张表的分工：

| 表 | 一个商品对应几条记录 | 有无 `activity_id` |
|---|---|---|
| `grouporder-goods-lib` | 每个用户每个商品名**只有 1 条** | **没有这个字段**，库记录不属于任何活动 |
| `grouporder-goods` | 每被复用到一个活动就**新增 1 条**，彼此独立 | **必填**，且是该表的核心索引字段 |

举例，团长的「有机白菜」用过三次：

库中 1 条（无 `activity_id`）：

| `_id` | `user_id` | `name` | `last_price` | `use_count` |
|---|---|---|---|---|
| L1 | 该团长 | 有机白菜 | 550 | 3 |

活动商品中 3 条，互不关联，也不指回 L1：

| `_id` | `activity_id` | `name` | `price` | `total_stock` | `sold_qty` | `on_sale` |
|---|---|---|---|---|---|---|
| G1 | 活动 A | 有机白菜 | 500 | 100 | 87 | 1 |
| G2 | 活动 B | 有机白菜 | 600 | 50 | 50 | 0 |
| G3 | 活动 C | 有机白菜 | 550 | 80 | 12 | 1 |

**反证**：若改为一条商品记录挂多个活动，则 `price`、`total_stock`、`sold_qty`、`on_sale`、`ever_ordered`、`governance_status` 六个字段全部无处安放——它们逐活动不同。结果必然是再建一张「活动↔商品」关系表来承载这六个字段，而那张表就是现在的 `grouporder-goods`。绕回原点，且多出一层无用的间接。

因此：`activity_id` 保持必填，`grouporder-goods` **仅新增 `lib_id` 一个可空字段**（见 §2.2），其余字段与 `grouporder-goods.index.json` 原样保留。

---

---

## 3. 新增表 `grouporder-goods-lib`

### 3.1 字段定义

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | 商品库记录 ID |
| `user_id` | string | ✓ | | 归属用户，`foreignKey: uni-id-users._id` |
| `name` | string | ✓ | | 1–50 字，与 `goods.name` 同约束 |
| `description` | string | | | ≤500 字 |
| `cover_image` | file | ✓ | | 封面图，与 `goods.cover_image` 同约束 |
| `detail_images` | array&lt;file&gt; | | `[]` | 详情图，≤9 张 |
| `unit` | string | ✓ | `份` | 与 `goods.unit` 同约束 |
| `last_price` | int | ✓ | | 上次使用的单价（分）。**预填值，复用时必须确认** |
| `last_total_stock` | int | ✓ | `0` | 上次使用的总库存。语义同 `goods.total_stock`（0 表示不限）。**预填值，复用时必须确认** |
| `last_per_user_limit` | int | ✓ | `0` | 上次使用的每人限购。语义同 `goods.per_user_limit`（0 表示不限购）。**预填值，复用时必须确认** |
| `last_used_time` | timestamp | ✓ | | 最近一次沉淀或复用的时间，用于列表倒序 |
| `use_count` | int | ✓ | `0` | 被复用次数，仅在执行复制时 +1 |
| `img_check_status` | int | ✓ | `0` | 枚举与 `goods.img_check_status` 完全一致：0 待检测 / 1 通过 / 2 待人工复核 / 3 已拦截 |
| `is_recommend` | int | ✓ | `0` | 团长自荐标识的**默认值**，复用时带入活动（D-065） |
| `category_id` | string | | | 所属分类，空表示未分组。关联 `grouporder-goods-category._id`（D-066） |
| `governance_blocked` | int | ✓ | `0` | 0 正常 / 1 不可复用。由运营下架商品时反写，见 §7 |
| `deleted` | int | ✓ | `0` | 软删标记，命名对齐 `grouporder-address.deleted` |
| `create_date` | timestamp | ✓ | `now` | `forceDefaultValue` |
| `update_date` | timestamp | | | 更新时间 |

命名约定说明：归属字段用 `user_id` 而非 `uid`，软删字段用 `deleted` 而非 `is_deleted`，与 `grouporder-address` 保持一致。

### 3.2 `grouporder-goods-lib.schema.json`

落盘路径：`grouporder-admin/uniCloud-alipay/database/grouporder-goods-lib.schema.json`，并同步一份到 `docs/02-arch/schema/`。

```json
{
  "bsonType": "object",
  "required": [
    "user_id",
    "name",
    "cover_image",
    "unit",
    "last_price",
    "last_total_stock",
    "last_per_user_limit",
    "last_used_time"
  ],
  "permission": {
    "read": false,
    "create": false,
    "update": false,
    "delete": false
  },
  "description": "用户商品库。商品保存时自动沉淀，创建活动时可复用；仅作复制源，与活动商品无引用关系（D-063）",
  "properties": {
    "_id": {
      "description": "存储文档 ID（商品库记录 ID），系统自动生成"
    },
    "user_id": {
      "bsonType": "string",
      "title": "归属用户",
      "foreignKey": "uni-id-users._id",
      "description": "归属用户 ID。商品库为用户私有，任何读写必须校验归属"
    },
    "name": {
      "bsonType": "string",
      "title": "商品名称",
      "description": "商品名称，1-50 字。与 user_id 共同作为同名判定依据",
      "minLength": 1,
      "maxLength": 50,
      "trim": "both"
    },
    "description": {
      "bsonType": "string",
      "title": "商品说明",
      "description": "商品说明，最多 500 字",
      "maxLength": 500,
      "trim": "both"
    },
    "cover_image": {
      "bsonType": "file",
      "title": "商品封面图",
      "description": "商品封面图，必填（D-041）。与活动商品共用同一云存储文件，删除记录时不得删除文件"
    },
    "detail_images": {
      "bsonType": "array",
      "arrayType": "file",
      "title": "详情图",
      "description": "商品详情图，最多 9 张（D-041）",
      "maxLength": 9
    },
    "unit": {
      "bsonType": "string",
      "title": "商品单位",
      "description": "商品单位，默认份，可填盒、箱、袋、瓶等（D-045）",
      "defaultValue": "份",
      "minLength": 1,
      "maxLength": 10,
      "trim": "both"
    },
    "last_price": {
      "bsonType": "int",
      "title": "上次使用单价",
      "description": "上次使用的单价，单位为分，非负整数。复用时作为预填值，团长必须逐项确认（§5.3）",
      "minimum": 0
    },
    "last_total_stock": {
      "bsonType": "int",
      "title": "上次使用总库存",
      "description": "语义与 grouporder-goods.total_stock 完全一致：0 表示不设上限，正整数为有限总库存（D-044）。记录团长当次设定的总量，不是剩余量。复用时作为预填值，必须逐项确认",
      "defaultValue": 0,
      "minimum": 0
    },
    "last_per_user_limit": {
      "bsonType": "int",
      "title": "上次使用每人限购",
      "description": "语义与 grouporder-goods.per_user_limit 完全一致：0 表示不限购（D-044）。复用时作为预填值，必须逐项确认",
      "defaultValue": 0,
      "minimum": 0
    },
    "last_used_time": {
      "bsonType": "timestamp",
      "title": "最近使用时间",
      "description": "最近一次沉淀或复用的时间，用于商品库列表倒序"
    },
    "use_count": {
      "bsonType": "int",
      "title": "复用次数",
      "description": "被复用到活动的次数，仅在执行复制时递增",
      "defaultValue": 0,
      "minimum": 0
    },
    "img_check_status": {
      "bsonType": "int",
      "title": "图片检测状态",
      "description": "枚举与 grouporder-goods.img_check_status 一致。仅状态 1 可在复用时免于重新送检（D-058）",
      "defaultValue": 0,
      "enum": [
        { "value": 0, "text": "待检测" },
        { "value": 1, "text": "通过" },
        { "value": 2, "text": "待人工复核" },
        { "value": 3, "text": "已拦截" }
      ]
    },
    "is_recommend": {
      "bsonType": "int",
      "title": "推荐标识默认值",
      "description": "团长自荐标识的默认值，复用时带入活动商品（D-065）。平台不参与任何商品推荐",
      "defaultValue": 0,
      "enum": [
        { "value": 0, "text": "普通" },
        { "value": 1, "text": "推荐" }
      ]
    },
    "category_id": {
      "bsonType": "string",
      "title": "所属分类",
      "description": "关联 grouporder-goods-category._id，空表示未分组（D-066）。分类为用户私有，不随复制进入活动商品"
    },
    "governance_blocked": {
      "bsonType": "int",
      "title": "是否禁止复用",
      "description": "运营下架该用户同名商品后置 1，禁止继续复用到新活动（D-064）",
      "defaultValue": 0,
      "enum": [
        { "value": 0, "text": "正常" },
        { "value": 1, "text": "禁止复用" }
      ]
    },
    "deleted": {
      "bsonType": "int",
      "title": "是否已删除",
      "description": "软删除标记。已复制出的活动商品不受影响",
      "defaultValue": 0,
      "enum": [
        { "value": 0, "text": "否" },
        { "value": 1, "text": "是" }
      ]
    },
    "create_date": {
      "bsonType": "timestamp",
      "title": "创建时间",
      "description": "创建时间",
      "forceDefaultValue": { "$env": "now" }
    },
    "update_date": {
      "bsonType": "timestamp",
      "title": "更新时间",
      "description": "更新时间"
    }
  }
}
```

### 3.3 `grouporder-goods-lib.index.json`

```json
[
  {
    "IndexName": "user_deleted_used",
    "MgoKeySchema": {
      "MgoIndexKeys": [
        { "Name": "user_id", "Direction": "1" },
        { "Name": "deleted", "Direction": "1" },
        { "Name": "last_used_time", "Direction": "-1" }
      ],
      "MgoIsUnique": false
    }
  },
  {
    "IndexName": "user_name",
    "MgoKeySchema": {
      "MgoIndexKeys": [
        { "Name": "user_id", "Direction": "1" },
        { "Name": "name", "Direction": "1" }
      ],
      "MgoIsUnique": false
    }
  },
  {
    "IndexName": "user_category",
    "MgoKeySchema": {
      "MgoIndexKeys": [
        { "Name": "user_id", "Direction": "1" },
        { "Name": "category_id", "Direction": "1" },
        { "Name": "last_used_time", "Direction": "-1" }
      ],
      "MgoIsUnique": false
    }
  }
]
```

**`user_name` 刻意不设唯一索引。** 原因：软删记录仍占用 `user_id + name` 组合，加唯一索引会导致用户删掉某商品后无法再用同一名称沉淀。同名去重改由云端「先查后写」实现，代价是极低频的并发同名写入可能留下两条重复记录——后果仅是列表里多一行，可接受，不值得为它引入事务。

### 3.5 关联新表 `grouporder-goods-category` 商品库分类

分类为用户私有，只用于在商品库中"找得到"，**不进入活动展示、不进入 Excel 清单、参与者永远不可见**。因此：活动商品表不携带分类字段；分类名不需要送内容安全检测（省一笔接口调用，实现时不要出于保险默认送检）。

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | |
| `user_id` | string | ✓ | | 归属用户，`foreignKey: uni-id-users._id` |
| `name` | string | ✓ | | 1–10 字 |
| `sort` | int | ✓ | `0` | 用户自定义顺序 |
| `create_date` | timestamp | ✓ | `now` | `forceDefaultValue` |

```json
{
  "bsonType": "object",
  "required": ["user_id", "name"],
  "permission": { "read": false, "create": false, "update": false, "delete": false },
  "description": "用户商品库分类。用户私有，仅用于商品库筛选，不进入活动展示与清单（D-066）",
  "properties": {
    "_id": { "description": "存储文档 ID（分类 ID），系统自动生成" },
    "user_id": {
      "bsonType": "string",
      "title": "归属用户",
      "foreignKey": "uni-id-users._id",
      "description": "归属用户 ID。分类为用户私有，任何读写必须校验归属"
    },
    "name": {
      "bsonType": "string",
      "title": "分类名称",
      "description": "分类名称，1-10 字。仅用户本人可见，不对外展示，无需内容安全检测",
      "minLength": 1,
      "maxLength": 10,
      "trim": "both"
    },
    "sort": {
      "bsonType": "int",
      "title": "排序",
      "description": "用户自定义顺序，正序",
      "defaultValue": 0
    },
    "create_date": {
      "bsonType": "timestamp",
      "title": "创建时间",
      "description": "创建时间",
      "forceDefaultValue": { "$env": "now" }
    }
  }
}
```

索引 `grouporder-goods-category.index.json`：

```json
[
  {
    "IndexName": "user_sort",
    "MgoKeySchema": {
      "MgoIndexKeys": [
        { "Name": "user_id", "Direction": "1" },
        { "Name": "sort", "Direction": "1" }
      ],
      "MgoIsUnique": false
    }
  }
]
```

**分类规则：**

- **一个商品至多属于一个分类**，采用一对多而非多对多。多对多会让"按分类筛选"出现同一商品被重复选中的歧义，前端要额外去重。
- **不建「未分组」实体。** `category_id` 为空即未分组，不为每个用户初始化默认分类记录。筛选条中的「未分组」是一个查询条件，不是一条数据。
- **删除分类不删商品。** 删除时把该分类下全部 lib 记录的 `category_id` 置空，分类记录本身可**硬删**——它不是业务记录，不进入任何订单或清单，无需软删与留痕。
- 分类数上限 20 个，服务端校验。

### 3.4 上传约定

按 DATA_MODEL §1 的既有约定：**schema 只从 `grouporder-admin` 上传，`grouporder-client` 只拉取、永不上传。** 新增的两个文件同样遵守。

---

## 4. 写入路径：保存商品时自动沉淀

### 4.1 触发点

团长在商品编辑页（M-11）保存商品成功后，服务端在**同一次调用内**同步沉淀到商品库。不是定时任务，不是前端二次调用。

### 4.2 规则

以 `user_id`（活动的团长，不是当前操作者——两者在首版恒等，但按团长取更稳妥）+ `name`（`trim` 后精确匹配）+ `deleted = 0` 查询：

- **未命中** → 新建一条库记录。`last_price = goods.price`，`last_total_stock = goods.total_stock`，`last_per_user_limit = goods.per_user_limit`，`is_recommend = goods.is_recommend`，`last_used_time = now`，`use_count = 0`，`category_id` 留空（分类由用户在 M-29 自行归类，沉淀不猜测分类），其余内容字段从商品复制。
- **命中** → 更新该条记录的 `name`、`description`、`cover_image`、`detail_images`、`unit`、`last_price`、`last_total_stock`、`last_per_user_limit`、`is_recommend`、`img_check_status`、`last_used_time`、`update_date`。**`use_count` 与 `category_id` 不变**（沉淀不算复用，也不改写用户已设的分类）。

`last_total_stock` 记录的是团长当次**设定的总量**，不是剩余量，也不是已售量。上次设 100 份卖出 87 份，沉淀的值是 100。
- `governance_blocked = 1` 的记录**跳过更新**，不因团长重新编辑而解除封禁。

### 4.3 不设「保存到商品库」按钮

沉淀必须是自动的。参考产品（`docs/app-ui/IMG_4872.PNG`）的发起页只有「添加商品」和「复用历史商品」两个动作，没有第三个保存动作——用户的心理预期是"以前填过的应该自动能调出来"。多一个显式按钮的结果是大多数人的商品库永远是空的，功能等于没做。

### 4.4 失败处理

沉淀失败**不得导致商品保存失败**。商品保存是主事务，沉淀是附属动作，失败时记录服务端日志并正常返回商品保存成功。用户下次保存同名商品时会自然补上。

---

## 5. 读取路径：复用历史商品

### 5.1 入口

创建/编辑活动页（M-10）的「复用历史商品」按钮 → 新页 **M-28 历史商品选择**：

- 顶部一行**分类筛选 chips**：全部 / 各分类（按 `category.sort` 正序）/ 未分组。点击过滤列表。**不提供「按分类批量加入」**——整组重复的场景由 D-067 复用历史接龙覆盖，两条路径都做会造成功能重叠（D-066）。
- 列表按 `last_used_time` 倒序，分页。
- 每项展示封面图、名称、单位、上次价格（标注"上次价格，需确认"）。
- 支持**多选**，一次可选多个商品。
- `governance_blocked = 1` 的记录显示为不可选，并说明"该商品曾被平台下架，不能继续使用"。
- `deleted = 1` 的记录不返回。
- 支持按名称关键字搜索（可选，库记录多时才有意义）。
- 页面右上角提供「管理」入口跳转 M-29（§5.6 入口 3）；从 M-29 返回后列表需刷新，以反映刚刚的编辑或删除。
- 空态：说明"保存过的商品会自动出现在这里"。

### 5.2 复制语义与字段映射

确认选择后，为每个选中项在 `grouporder-goods` **新建一条记录**：

| `goods` 字段 | 取值 | 说明 |
|---|---|---|
| `activity_id` | 当前活动 ID | |
| `lib_id` | 来源库记录 `_id` | 仅作来源追溯，见 §2.2。手工新增商品不写该字段 |
| `is_recommend` | 预填 `lib.is_recommend` | 团长可在活动内单独修改，**不回写库**（D-065） |
| `category_id` | **不复制** | 分类是商品库的私人组织方式，不进入活动、清单与参与者视图（D-066） |
| `name` | 库记录 `name` | 复制 |
| `description` | 库记录 `description` | 复制 |
| `cover_image` | 库记录 `cover_image` | **复制文件引用，不重新上传**，见 §6 |
| `detail_images` | 库记录 `detail_images` | 同上 |
| `unit` | 库记录 `unit` | 复制 |
| `price` | 预填 `last_price` | **必须逐项确认后才能提交发布**，见 §5.3 |
| `img_check_status` | 库记录为 `1` 则复制为 `1`，否则置 `0` | 见 §8 |
| `total_stock` | 预填 `last_total_stock` | **必须逐项确认**，见 §5.3 |
| `per_user_limit` | 预填 `last_per_user_limit` | **必须逐项确认**，见 §5.3 |
| `sold_qty` | `0` | 新商品 |
| `on_sale` | `1` | 新商品 |
| `ever_ordered` | `0` | 新商品 |
| `governance_status` | `0` | 新商品 |
| `governance_uid` / `governance_time` / `governance_reason` | 不写入 | |
| `sort` | 追加到当前活动商品列表末尾 | |
| `create_date` | `now` | `forceDefaultValue` 自动 |

同时对每条被复用的库记录：`use_count + 1`，`last_used_time = now`。

### 5.3 三个经营字段：预填 + 必须逐项确认

`price`、`total_stock`、`per_user_limit` 这三个字段**逐次活动都可能不同**，但**上次的值是最好的起点**——同一个团往往每周重复，份数和限购变化不大，进价则时有浮动。

因此统一按「预填 + 必须确认」处理，而不是二选一：

- **预填**：复制时三个字段都带出库里的上次值，团长不改也能直接用。
- **必须确认**：复制进来的商品在活动内标记为「待确认」，团长逐个打开核对（可一键确认，也可就地修改）后才能提交发布。全部确认前「下一步」禁用。

只预填不确认的风险是真实的：静默沿用上次价格会造成收款差错，静默沿用上次库存会造成超卖后不得不取消订单。只清空不预填则等于没做复用，团长每次还得重填三个数字。确认门同时挡住这两头。

**确认粒度为「每个商品一次」**，不是每个字段一次：展示一张含名称、单价、总库存、每人限购的卡片，团长点「确认」或「修改」。

实现上用前端状态承载即可（不落库）：复制接口返回后把这些项标为未确认、高亮并禁用「下一步」，直到全部确认。若确实需要落库，可在 `goods` 上加临时布尔字段——但这会改动 `goods` 表，**优先用前端状态实现**。

### 5.4 与 D-048 的联动

复用历史商品 = 向活动新增商品 = 修改活动内容。按 D-048，**在"进行中"的活动里执行复用会使活动重新进入审核**。接口必须在返回中明确告知，前端在确认弹窗里提示"新增商品后活动需重新审核，审核通过前将暂停接龙"。

在"草稿"状态的活动里复用不触发任何审核变化。

### 5.5 权限校验

- 列表接口：只返回 `user_id = 当前登录用户` 的记录，不接受任何 `user_id` 入参。
- 复制接口：校验目标活动存在、当前用户是该活动团长、活动状态为草稿或进行中且未截止、活动治理状态正常。
- 所有库记录的 `_id` 入参必须校验归属，防止越权复制他人商品。

---

### 5.6 商品库记录的独立维护

团长可以脱离活动直接维护商品库，不必为了改一个错别字去某个活动里绕一圈。

**M-28 与 M-29 的分工**（先分清这一条，三个入口的摆放都由它决定）：

| | M-28 历史商品选择 | M-29 商品库管理 |
|---|---|---|
| 性质 | 活动内的**选择**页 | 账号级的**管理**页 |
| 结果 | 选中后把商品复制进当前活动 | 改模板、删模板，**不往活动加任何东西** |
| 页面 | 两者不复用同一页面 | |

**三个入口**：

1. 「我的」（M-08）→「我的商品库」→ M-29。账号级的常规入口。
2. **创建/编辑活动页（M-10）的商品列表区块，标题行右侧的文字链接「管理商品库 ›」→ M-29。**
3. M-28 页面右上角的「管理」→ M-29。挑商品时发现某条模板信息过时，就地跳过去改。

**入口 2 必须做成轻量文字链接，不能做成第四个并列按钮。** 「＋ 添加商品」「↺ 复用历史商品」「↺ 复用历史接龙」是三个主操作，再并排一个「我的商品库」，团长会分不清它和「复用历史商品」的区别——两者字面上都指向商品库，但一个往活动里加商品、一个不加。降低视觉层级是消除这个歧义最省事的办法。

**返回与草稿保持**：从 M-10 跳 M-29 用 `navigateTo`，返回时 M-10 的页面实例仍在栈中，草稿表单状态不丢。在 M-29 中编辑或删除库记录**不影响已加入当前活动的商品**——这是复制语义的直接推论（§2.3），团长可以放心在半途去改模板。

**可编辑字段**：`name`、`description`、`cover_image`、`detail_images`、`unit`、`last_price`、`last_total_stock`、`last_per_user_limit`、`is_recommend`、`category_id`。三个 `last_*` 字段允许直接编辑，语义按「下次复用时的预填值」理解——团长预知下周调价时可以提前改好。

**不可编辑**：`user_id`、`use_count`、`governance_blocked`、`deleted`（删除走 `libDelete`）。

**规则**：

- **编辑不影响任何已有活动商品。** 这是复制语义的直接推论，也是本功能可以安全提供的前提。
- **改名撞库则拒绝。** 若改后的 `name` 与同一用户另一条 `deleted = 0` 的记录重名，拒绝并提示已存在同名商品。理由：同名是沉淀去重的判定依据（§4.2），库中出现两条同名会让后续沉淀行为不确定。
- **改图则重新送检。** 变更 `cover_image` 或 `detail_images` 时 `img_check_status` 置 `0` 并重新送检；命中拦截（转 `3`）的记录不可复用。
- **`governance_blocked = 1` 的记录禁止编辑。** 否则团长可以靠改名把被封禁的商品洗白。解封只能由运营在复核恢复流程中执行（§7）。
- 编辑成功后写 `update_date`，**不更新 `last_used_time`**——它表示"最近一次被用于活动"，编辑不是使用。

---

### 5.7 活动商品的排序规则（D-065）

**活动详情页与团长商品管理页使用同一条排序**，两处必须一致——否则团长看到的顺序与参与者不同，核对商品时会出错。

```
ORDER BY sort ASC, create_date ASC
```

| 键 | 作用 |
|---|---|
| `sort ASC` | 团长拖拽产生的顺序 |
| `create_date ASC` | **必需的稳定兜底键**。同 `sort` 值时若无次级排序键，数据库返回顺序不稳定，分页会出现重复或遗漏 |

**`is_recommend` 不进入排序表达式。** 首版推荐只做视觉强调：商品卡加「推荐」标签与边框高亮，位置不变。

> 推荐置顶已评估但**暂不实施**。置顶一旦启用，管理页必须把列表分为「推荐」与「其他」两区并禁止跨区拖拽，否则会出现「把商品拖到最顶部、`sort` 变成 1，却仍显示在推荐商品之后」的表现——拖了没反应，是最难向用户解释的一类 bug。字段与角标本次已就位，后续要开启时只需改排序表达式并补上分区拖拽约束。**在产品负责人明确要求前，不要自行加上置顶。**

关于「没有 `sort` 就按数据顺序」：`sort` 的 `defaultValue` 为 0，而 §5.2 已规定新增商品时 `sort` 取当前活动最大值 +1，因此正常路径下 `sort` 永远有有效值，兜底键只在异常数据时生效。**不需要把 `sort` 改为可空。**

- 拖拽提交时，服务端按拖拽后的可视顺序**整体重写该活动全部商品的 `sort`**（从 1 连续递增），不允许出现部分有值、部分为默认值的混合状态。本次不分区，整个列表自由拖拽。
- **每个活动推荐上限 5 个**，服务端校验，超出时提示先取消其他推荐。只做前端限制不够。
- Excel 清单的「商品汇总」建议采用同一排序，使小程序内看到的顺序与打印出的配货单一致。

**索引**：`grouporder-goods.index.json` 的 `activity_gov_sort` **保持原样不动**（`activity_id + governance_status + sort`）。推荐不参与排序，无需把 `is_recommend` 加入索引。

---

## 6. 图片文件引用：一个必须注意的副作用

`cover_image` / `detail_images` 是 uniCloud `file` 类型，存的是 fileID 与文件元信息。复制记录时**复制的是文件引用，不是文件本身**——同一个云存储文件会被库记录和一个或多个活动商品同时引用。

由此产生的约束：

> **删除商品库记录或活动商品时，一律不得删除云存储文件。**

首版处理方式：库记录只做软删（`deleted = 1`），活动商品的删除同样不触碰云存储。孤儿文件清理留给后续的定期任务，判定条件是"`grouporder-goods` 与 `grouporder-goods-lib` 中均无任何记录引用该 fileID"。

DATA_MODEL §1 把「便于孤儿文件清理」列为选用 `file` 类型的理由之一，本节是对该清理逻辑的必要补充，请一并写入。

---

## 7. 治理联动（D-064，必须实现）

不实现这一条会留下一个真实漏洞：违规商品被运营下架后，团长可以从商品库无限复制到新活动，绕过治理。

**规则**：运营在后台执行商品治理下架（页面 A-09）时，服务端反查 `grouporder-goods-lib`，把命中记录置 `governance_blocked = 1` 并写 `update_date`。

匹配条件是以下两者的**并集**，两条都要执行：

1. **按来源精确定位**：`_id = goods.lib_id`（`lib_id` 非空时）。这条覆盖"复制后被团长改了名"的情况。
2. **按团长与当前名称匹配**：`user_id = 该活动团长` 且 `name = goods.name` 且 `deleted = 0`。这条覆盖两种情况：商品是手工新增的（`lib_id` 为空），以及团长删掉旧库记录后又用同名重新沉淀了一条。

- 两条都匹配不到时静默跳过，不报错。
- 命中的库记录即使 `deleted = 1` 也要置 `governance_blocked = 1`，防止恢复软删后重新可用。
- 该标记**不可由用户自行解除**。若后续复核认定下架有误需要恢复，由运营在恢复流程中一并置回 `0`。
- 反写动作按统一操作日志要求记录一条 `grouporder-oplog`：`action_type` 取 `goods_lib_blocked`，`object_type` 取 `goods_lib`，`object_id` 取库记录 `_id`，`case_no` 关联原举报编号。`action_type` 在 schema 中是自由字符串而非枚举，因此**不需要修改 oplog schema**。

---

## 8. 图片内容检测

- 库记录的图片在首次沉淀时随商品一同送检，检测结果回写到库记录的 `img_check_status`。
- 复用时：库记录为 `1`（通过）则直接复制状态，**不重复送检**，节省接口调用；其余状态一律置 `0`，按新图重新检测。
- 复用不改变活动整体的发布审核流程，活动仍走 D-043。
- 若库记录的图片后续被异步回调判定命中（`img_check_status` 转 `3`），按 §7 同样置 `governance_blocked = 1`。

---

## 9. 边界与异常场景

| 场景 | 预期行为 |
|---|---|
| 库为空时点「复用历史商品」 | 进入 M-28 显示空态，说明保存过的商品会自动出现在这里 |
| 一次复用超过活动商品数上限（D-024：50 个） | 提交前校验"当前商品数 + 选中数 ≤ 50"，超出时阻止并提示还可添加几个 |
| 复用的商品与活动内已有商品同名 | 允许，不去重。活动内允许同名商品（现有 schema 无唯一约束），由团长自行判断 |
| 复制过程中部分失败 | 不得显示整体成功；明确列出成功与失败项，已成功的保留 |
| 复用后团长又删除了该活动商品 | 库记录不受影响，`use_count` 不回退 |
| 用户删除库记录 | 软删，已复制出的活动商品完全不受影响 |
| 同一用户并发保存两个同名商品 | 可能产生两条重复库记录，属已知可接受取舍（见 §3.3） |
| 活动已截止 / 已取消 / 已下架时调用复制接口 | 拒绝，返回当前活动状态 |
| 重复提交同一次复制请求 | 按项目既有幂等原则处理：同一请求重试复用结果，不重复创建商品 |

---

## 10. 接口契约（建议，待架构确认）

项目当前只有 uni-admin 模板自带的云函数，**业务云对象的划分尚未决定**。以下是可直接采用的默认方案，若架构阶段另有划分，只需调整归属，方法语义不变。

建议新建云对象 `grouporder-goods-co`：

| 方法 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `libList` | `{ keyword?, category_id?, page, pageSize }` | `{ list, total }` | 仅当前用户，`deleted=0`，按 `last_used_time` 倒序。`category_id` 传特定值筛选、传 `"__none__"` 查未分组、不传查全部 |
| `libCopyToActivity` | `{ activity_id, lib_ids: string[] }` | `{ created: [...], failed: [...], need_recheck: boolean }` | `need_recheck` 表示本次操作会使活动重新进入审核（§5.4） |
| `libUpdate` | `{ lib_id, ...可编辑字段 }` | `{ success, img_recheck: boolean }` | 见 §5.6。改名撞库、记录被封禁时拒绝 |
| `libDelete` | `{ lib_id }` | `{ success }` | 软删 |
| `categoryList` | `{}` | `{ list }` | 仅当前用户，按 `sort` 正序 |
| `categoryCreate` | `{ name }` | `{ category_id }` | 上限 20 个 |
| `categoryUpdate` | `{ category_id, name?, sort? }` | `{ success }` | |
| `categoryDelete` | `{ category_id }` | `{ success, affected }` | 硬删分类，其下 lib 记录 `category_id` 置空 |

沉淀逻辑不单独暴露方法，作为商品保存方法内部调用的私有函数 `_sinkToLib(userId, goodsDoc)` 实现（§4.1）。

治理反写同样不暴露为独立方法，由运营端的商品下架方法内部调用 `_blockLibByGoods(goodsDoc)`（§7）。

---

## 11. 明确不改动的部分

- **`grouporder-goods.schema.json` 只新增两个字段**：`lib_id`（可空，§2.2）与 `is_recommend`（int，默认 0，§5.7），不得改动其余任何字段。**`grouporder-goods.index.json` 完全不改**——推荐不参与排序，现有索引已够用。若实现中发现还需要动 `goods` 表的其他字段，说明偏离了复制语义，请先回来确认。
- `grouporder-order`、`grouporder-order-item`、`grouporder-activity` 不涉及。
- `grouporder-oplog` schema 不改，只新增 `action_type` 取值约定。
- uni-id 相关表与模块一律不动。

---

## 12. 验收标准

| 编号 | 标准 |
|---|---|
| AC-GL-001 | 团长保存一个新商品后，商品库中出现一条对应记录，内容字段与商品一致，`last_price`、`last_total_stock`、`last_per_user_limit` 分别等于该商品的价格、总库存与每人限购，`use_count` 为 0 |
| AC-GL-002 | 团长保存一个与库中已有记录同名的商品，库中不新增记录，原记录的内容与三个 `last_*` 字段被更新，`use_count` 不变 |
| AC-GL-003 | 沉淀失败时商品保存仍然成功，用户侧无错误提示，服务端有日志 |
| AC-GL-004 | 商品库列表只返回当前登录用户的记录；构造他人 `user_id` 或他人库记录 `_id` 的请求被拒绝 |
| AC-GL-005 | 复用历史商品后，活动中新增的商品记录里 `price`、`total_stock`、`per_user_limit` 等于库中对应的 `last_*` 值；`sold_qty`、`ever_ordered`、`governance_status` 一律为初始值，不从库继承 |
| AC-GL-005a | 上次设总库存 100 且已售 87 的商品，复用时预填的总库存为 100（设定总量），不是 13 或 87 |
| AC-GL-005b | 团长在复用后把价格、总库存或每人限购改为新值并提交，活动商品按新值生效，商品库记录在本次保存后同步更新为新值 |
| AC-GL-006 | 复用后修改活动商品的名称或价格，商品库记录不发生变化；修改商品库记录，已复制出的活动商品不发生变化 |
| AC-GL-007 | 复用后的商品在团长逐项确认（价格、总库存、每人限购）前，活动不能提交发布；确认粒度为每个商品一次 |
| AC-GL-008 | 在"进行中"的活动里复用商品，接口返回 `need_recheck = true`，活动重新进入审核；在"草稿"活动里复用不改变活动状态 |
| AC-GL-009 | 运营下架某商品后，该团长商品库中的对应记录 `governance_blocked` 变为 1，在 M-28 列表中不可选，直接调用复制接口被拒绝 |
| AC-GL-009a | 复用商品后在活动内改名，该商品被下架时仍能通过 `lib_id` 定位并封禁来源库记录 |
| AC-GL-009b | 手工新增（`lib_id` 为空）的商品被下架时，仍能通过「团长 + 商品名」匹配封禁同名库记录；两条都匹配不到时静默跳过不报错 |
| AC-GL-009c | 活动商品的名称、图片、价格全部来自自身字段，不通过 `lib_id` 联表读取；软删库记录后活动商品显示不受任何影响 |
| AC-GL-010 | 上述下架反写在 `grouporder-oplog` 中产生一条 `action_type = goods_lib_blocked` 的记录，含操作人、时间、对象与关联事项编号 |
| AC-GL-011 | 库记录 `img_check_status = 1` 时复用不触发重新送检；为 0、2、3 时复用后的商品状态为 0 并重新送检 |
| AC-GL-012 | 删除商品库记录后，云存储中的图片文件仍然存在，已复制出的活动商品图片可正常显示 |
| AC-GL-012a | 在 M-29 编辑库记录的名称、图片或价格后，此前复制出的活动商品内容完全不变 |
| AC-GL-012b | 把库记录改名为该用户已有的另一条未删除记录的名称时被拒绝并给出明确提示 |
| AC-GL-012c | 编辑库记录的图片后 `img_check_status` 归 0 并重新送检；`governance_blocked = 1` 的记录拒绝编辑 |
| AC-GL-012d | 编辑库记录写入 `update_date` 但不改变 `last_used_time` 与 `use_count` |
| AC-GL-012e | M-29 可从三处进入：「我的」、创建活动页的「管理商品库」文字链接、M-28 右上角「管理」 |
| AC-GL-012f | 从创建活动页跳转 M-29 并返回后，草稿的活动资料与已添加商品全部保留；在 M-29 中删除某条库记录不影响已加入该活动的同名商品 |
| AC-GL-013 | 一次复用使活动商品数超过 50 时被阻止，并提示当前还可添加的数量 |
| AC-GL-014 | 对已截止、已取消或已下架的活动调用复制接口被拒绝，并返回该活动的当前状态 |
| AC-GL-015 | 同一次复制请求重试不产生重复的活动商品 |
| AC-GL-016 | 商品标记推荐后只显示「推荐」角标，**在列表中的位置不变**；活动详情页与团长商品管理页顺序完全一致 |
| AC-GL-017 | 同一活动内两个商品 `sort` 值相同时，多次刷新与翻页的顺序保持稳定（`create_date` 兜底生效） |
| AC-GL-018 | 拖拽提交后该活动全部商品的 `sort` 被重写为 1 起的连续值，不出现部分默认值 |
| AC-GL-019 | 一个活动标记第 6 个推荐商品时被服务端拒绝，绕过前端直接调接口同样被拒绝 |
| AC-GL-020 | 活动内修改商品的推荐状态，商品库记录的 `is_recommend` 不变；在 M-29 修改库记录的 `is_recommend`，已有活动商品不变 |
| AC-GL-021 | 商品库列表按分类筛选返回正确结果；「未分组」筛选只返回 `category_id` 为空的记录 |
| AC-GL-022 | 删除一个分类后，其下商品全部归入未分组且一件不少；分类记录本身从库中消失 |
| AC-GL-023 | 创建第 21 个分类被拒绝；分类名不触发内容安全检测调用 |
| AC-GL-024 | 复用历史商品时 `is_recommend` 按库中默认值预填，`category_id` 不写入活动商品 |

---

## 13. 需要同步更新的文档

| 文件 | 改动 |
|---|---|
| `DECISIONS.md` | 新增 D-063（商品沉淀为用户级商品库，复用按复制语义）、D-064（被下架商品的库记录标记为不可复用） |
| `arch/DATA_MODEL.md` | §3 表清单第一批由 6 张改 7 张、合计由 16 张改 17 张；新增 §4.7 `grouporder-goods-lib` 表定义；§6 索引补充两条；§1 图片字段说明补充 §6 的文件引用约束 |
| `arch/schema/` | 新增 `grouporder-goods-lib`、`grouporder-goods-category` 两组 `.schema.json` 与 `.index.json`；`grouporder-goods.schema.json` 增加 `lib_id` 与 `is_recommend`；`grouporder-goods.index.json` 调整 `activity_gov_sort` |
| `ux/UX_FLOW_SPEC.md` | §3.1 新增 M-28 历史商品选择、M-29 商品库管理、M-30 分类管理；M-29 的入口为 M-08、M-10 文字链接、M-28 右上角三处；M-28 增加分类筛选；F-M03 与 F-M08 补充复用分支 |
| `product/PRD.md` | §4.1 首版必须具备中增加一条商品库与复用能力 |
| `product/OPS_ADMIN_REQUIREMENTS.md` | §6.1 商品下架动作补充商品库反写；§12 日志事件补充 `goods_lib_blocked` |

---

## 14. 实施顺序建议

1. 两个 schema 文件落盘 + `DATA_MODEL` 更新（无依赖，可立即做）
2. 沉淀逻辑 `_sinkToLib`（依赖商品保存接口，若尚未实现则与之一并开发）
3. `libList` + M-28 页面
4. `libCopyToActivity` + 价格确认交互
5. 推荐标识 `is_recommend`：字段 + 排序规则（§5.7）+ 管理页分区拖拽 + 上限校验
6. 分类：`grouporder-goods-category` 表 + 四个接口 + M-30 分类管理页 + M-28 筛选条
7. 治理反写 `_blockLibByGoods`（依赖运营端商品下架接口）

第 7 步依赖运营后台，若运营端尚未开发，**前六步可以先行，但必须在商品下架功能上线前补齐第 7 步**，否则 §7 的绕过漏洞成立。

第 5、6 步的 schema 字段（`is_recommend`、`category_id` 与分类表）应与第 1 步**合并为一次 schema 变更**一同上传，避免连续两次改动服务空间；功能实现仍可分开推进。

---

## 15. 变更记录

| 版本 | 变化 | 影响 |
|---|---|---|
| v0.1 | 初稿：建表、自动沉淀、复用复制、治理反写、验收标准 | — |
| v0.2.1 | 修正 §2.1 末尾遗留的「`grouporder-goods` 保持零改动」表述，与 §2.2、§11、§15 的 `lib_id` 新增结论对齐。`activity_id` 必填的结论不变 | 文档订正，不影响已实现内容 |
| v0.3 | ① 新增 §3.5 商品库分类表 `grouporder-goods-category`，lib 增 `category_id`，M-28 增分类筛选（仅筛选，不做批量加入）<br>② `goods-lib` 与 `goods` 各增 `is_recommend`；**推荐首版只做视觉角标，不进入排序**，排序规则为 `sort ASC, create_date ASC`（§5.7），推荐上限 5 个<br>③ `grouporder-goods` 新增字段由 1 个变为 2 个；**索引不改**<br>④ 接口新增分类 CRUD 四项，`libList` 增 `category_id` 入参；验收标准由 23 条增至 32 条 | 对应 D-065、D-066 |
| v0.2 | ① 新增 §2.1：`goods.activity_id` 仍必填的说明与反证<br>② **`price` / `total_stock` / `per_user_limit` 由「不继承、置 0」改为「预填 + 必须逐项确认」**，库表新增 `last_total_stock`、`last_per_user_limit` 并进 `required`，§5.3 整节重写<br>③ **`grouporder-goods` 新增可空字段 `lib_id`**，§11 的「goods 零改动」结论作废；§7 治理反查改为「`lib_id` 精确定位」与「团长 + 商品名」两条匹配取并集，且软删记录同样封禁<br>④ 新增 §2.3：`goods` 必须自带内容字段的五条理由<br>⑤ 新增 §5.6 商品库独立维护、接口 `libUpdate`、页面 M-29；验收标准由 15 条增至 23 条 | 按 v0.1 已产出的代码需按 §15 第 ② ③ ⑤ 项重做 |
