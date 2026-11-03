# Edmonton 社区观察

以官方社区边界展示 Edmonton 的家庭收入与华人人口。收入用蓝—黄—红底色表示，华人人口用面积成比例的圆点表示，支持人数／占比切换、社区搜索、桌面悬停、手机点击详情与社区链接分享。

- 源码：<https://github.com/curtisatiwatt/edmonton-census>
- GitHub Pages：<https://curtisatiwatt.github.io/edmonton-census/>

## 开发与预览

使用 **Node.js 24 + Vite + Leaflet**，无需 Python、API key、数据库或外部地图瓦片服务。

```sh
npm ci
npm run dev
```

打开终端显示的 Vite 本地地址。修改前端后会自动刷新。

```sh
npm run check     # 数据校验与单元测试
npm run build     # 打包至 dist/
npm run preview   # 本地查看生产构建
```

不要直接双击 `index.html`：浏览器需要通过 Vite 或其他 HTTP 服务读取 GeoJSON。网站资源使用相对路径，可运行在根目录或 GitHub Pages 的 `/edmonton-census/` 子目录。

## GitHub Pages

工作流 `.github/workflows/pages.yml` 在 `main` 更新后执行 `npm ci`、校验、Vite 打包与 Pages 发布。首次使用需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

只发布 `dist/` 中的构建结果；依赖锁定在 `package-lock.json`。访问者无需登录 GitHub 或 ChatGPT。

## 项目结构

| 文件 | 用途 |
| --- | --- |
| `index.html` | 页面、控件及数据说明对话框 |
| `src/main.js` | 地图、搜索、图层与响应式交互 |
| `src/map-utils.js` | 收入分档、圆面积换算、搜索等纯函数 |
| `src/data.js` | 加载本地数据、标准化社区代码与计算排名 |
| `src/styles.css` | 桌面与手机样式 |
| `public/data/communities.geojson` | 官方社区边界、统计与选区参考 |
| `public/data/basemap.geojson` | 道路与水域参考几何 |
| `public/data/metadata.json` | 数据年份、全市基准、定义与来源 |
| `scripts/validate-data.mjs` | 数据覆盖、字段、来源和几何检查 |
| `tests/map-utils.test.js` | 缺失值、配色边界、面积比例与搜索测试 |
| `vite.config.js` | Vite 开发与生产打包配置 |
| `data/source/` | 已核对的官方统计快照与简化边界，用于重建应用数据 |
| `data/audit/` | 官方字段、查询、覆盖率、连接方法及几何校验记录 |
| `scripts/prepare-data.mjs` | 从快照按社区编号连接统计，生成参考说明和发布数据 |

如需从仓库中的已核对快照重建数据，运行 `npm run prepare:data`。这一步也仅使用 Node.js；日常开发无需执行。`data/audit/statistics.json` 保存官方 API 查询及字段编号，便于更新下一期数据时核查口径。

## 数据口径与使用限制

网站的数据说明对话框与 `metadata.json` 记录此版本使用的具体年份、来源及统计分母。收入参考年和人口普查年份分别标示，不将新一轮普查完成收集误写成新收入或族裔数据已公布。

- 收入为 2020 年税前私人住户总年收入中位数，单位 CAD，来自 2021 年普查 25% 长表社区定制汇总，不是个人工资、经济家庭收入、税后收入、房价或净资产。
- Chinese 是普查 visible minority 分类中的 Chinese 人数，来自 25% 长表加权估计，不等于中国国籍、中国出生、中文使用者或所有具华人祖源者。占比用同一长表的私人住户人口作分母，从公布的随机取整人数计算；详情中显示该分母，不能用其他总人口替代。
- 详情中的“私人住户人口”来自 100% 短表，不含集体住所居民；与 25% 长表加权人口可能不同。0–14 岁占比使用市府短表直接发布值，分母为包含集体住所居民的年龄统计总人口。平均私人住户人数亦采用 100% 短表直接发布值。
- 缺失值为 `null`；公布的 0 保留统计取整提示。缺少圆点可能是 0，也可能是没有数据。
- 市府提供的 2021 边界名称与定制统计整理范围存在时间和合并口径差异：部分小型河谷、工业区域人口并入邻近社区，且没有完整逐区对应表。本图按官方社区编号连接公布值，不向周边缺失社区复制统计；具体方法与限制见数据说明。
- 圆的**面积**与人数或占比成正比，圆心为社区内的显示位置，不是居民住址。手机端统一缩小圆点与图例。
- 每个社区的收入排名由有可用收入的社区计算；相同收入并列排名。参考说明是分析判断，不是官方学校排名或治安评分。
- 地图覆盖 Edmonton 市界内社区，不包含 St. Albert、Sherwood Park 等市外地区。
- 社区链接可在网址后加 `#社区代码`；搜索亦支持数据中列出的历史名称别名。

## 来源与许可

原始来源链接、整理日期与官方许可说明见 `public/data/metadata.json`。数据不是实时更新服务。Leaflet 采用 BSD-2-Clause 许可，许可证随发布文件保留在 `public/licenses/leaflet.txt`；Vite 采用 MIT 许可，详见对应依赖的 LICENSE 文件。第三方许可不改变项目自有代码的权利归属。
