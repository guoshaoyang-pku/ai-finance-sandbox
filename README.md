# 当前版本 0.3.2

入口：https://guoshaoyang-pku.github.io/ai-finance-sandbox/?v=0.3.2 。公司/机构名代表群体，保留清楚的模拟标注。角色按真实网格边界裁剪；每 48 季暂停后可继续；冲击开始与扩散时长可设。详细变更与测试见 docs/UPDATE_v0.3.2.md。以下早期记录按其版本理解，旧的匿名标签与 48 季终点不再适用。

# AI 金融风险沙盘 · 可玩版 0.3.0

[打开游戏](https://guoshaoyang-pku.github.io/ai-finance-sandbox/?v=0.3.0) · [本版更新](docs/UPDATE_v0.3.0.md)

当前首页是角色、表情、劳动人口和政策均可交互的真实网页，不是效果图。模拟假设，不是美国经济预测。计算引擎保留0.2.0，源文件与构建物一致。

# 当前版本：0.2.0

本次新增角色资产与 E/U/N 人口就业模型。最新说明见 `docs/UPDATE_v0.2.0.md`，实际运行记录见 `results/v0.2.0/`。下文保留的 0.1 历史数字和旧失业公式不适用于新引擎。

# AI 金融沙盘 · 美国原型 v0.1.1

一个离线、可重复运行的 AI 投资—金融传染—宏观政策游戏。当前范围是**美国及投资美国资产的海外投资者**，不含中国国内金融系统。

**这是已经可以玩的机制原型，不是美国经济预测器。** 企业是虚拟主体，资产负债表和宏观系数是演示假设。真实披露保存在独立资料表中，尚未用于校准游戏。不能据此作投资决策或宣称某项监管已经被证明有效。

## 直接玩

在线版：https://guoshaoyang-pku.github.io/ai-finance-sandbox/

本次修复、部署与验收见 `FIXES_v0.1.1.md`。支持自动播放、暂停与速度调节；顶部绿色“JS 已启动”表示页面已成功初始化。

打开 `index.html`，点击 **“一键完整演示”**。会自动运行 16 个季度：Q4 出现商业化冲击，Q6 后加入干预，与相同冲击、没有新增干预的路径比较。

页面包含资产价格、利率、GDP、就业、机构资产负债表、融资网络和事件记录。可以逐季推进、调整政策、保存分支、返回重跑、比较六组政策、扫描冲击强度，并导出 JSON/CSV。最多推进 48 个季度。

文件自带全部代码和研究摘要，没有 CDN、在线 API、账号或追踪请求。桌面浏览器通常可以直接打开 HTML；若文件预览器不执行 JavaScript，请用浏览器打开，或在解压目录执行：

```bash
npm start
# 浏览器打开 http://127.0.0.1:8765
```

页面上 “S&P / Nasdaq” 是**初值 100 的合成组合**，不是实际指数点位；国债、美元和 GPU 价格也都是模拟值。初始利率不是抓取的现价。政策中的“企业投资节奏”是协调情景，并不假定美国政府能直接命令所有私营企业减支。

## 交给 agent

先读 `docs/AGENT_HANDOFF.md`，再读 `docs/MODEL_SPEC.md`。运行需要 Node.js 18+；没有需要安装的 Node 依赖。

```bash
npm test
npm run build
node src/cli.js demo --out results/reproduced_demo
node src/cli.js run --config examples/config.json --out results/custom_run.json
node src/cli.js compare --scenario disappointment --severity 1.5 --bank-buffer 0.04 --out results/comparison.json
node src/cli.js stress --scenario disappointment --bank-buffer 0.04 --out results/stress.json
node src/cli.js batch --out results/batch.json
node src/cli.js step --input results/demo_intervention.json --quarters 1 --policy-file examples/policy.json --out results/continued.json
```

`--policy` 可取 `market / preventive / liquidity / stabilization / slow / late`。`late` 从第 4 季起收紧；其他预设从开局配置，但财政支出仍受审批时滞约束。`step` 从导出的配置和政策历史重新计算后再推进，不盲信保存文件里的结果。

浏览器验收另需 Python、Playwright 和 Chromium。测试默认使用 `/usr/bin/chromium`，可用环境变量 `CHROMIUM_PATH` 指定浏览器位置：

```bash
python tests/browser_v011.py
node tests/cli_smoke.js
```

单文件回归使用 Playwright `set_content` 载入。v0.1.1 另外在实际 HTTPS 网站完成了桌面和触屏模拟验收；原始记录见 `results/v0.1.1/live-test-report.json`。普通用户不需要 Playwright。

## 已实现的核心

13 类主体、24 笔初始债权、5 项算力付款合同、2 项初始担保；新增融资会改变网络。现金支付、还本、利息、股权融资、原股东稀释、资产折价出售、合同到期、违约传染、有限担保与财政资金来源均进入计算。股票下跌不是直接等同于债务违约。

政策包括新增贷款抵押比例、银行权益/资产目标、AI 贷款集中度、新担保限额、央行流动性、财政注资、就业支持、审批延迟和危机时释放资本缓冲。提高资本目标不会凭空增加银行资本；央行贷款不会自动消灭债务；原有合同也不会被新政策追溯取消。

## 文件入口

| 路径 | 内容 |
|---|---|
| `index.html` | 可独立分发的离线游戏 |
| `src/engine.js` | 浏览器、CLI 和测试共用的仿真引擎 |
| `src/app.js` / `src/index.template.html` | 界面逻辑与样式 |
| `src/cli.js` | agent 批量运行、分支和继续执行接口 |
| `docs/MODEL_SPEC.md` | 数学模型、结算顺序、单位和已知边界 |
| `docs/RESEARCH.md` | 现有研究、“全自由度扰动”问题、融资口径校正 |
| `docs/AGENT_HANDOFF.md` | 可直接交给后续 agent 的工作说明与验收条件 |
| `data/sources.json` | 14 项原始来源与 6 项独立披露样例 |
| `data/contract.schema.json` | 后续真实合同采集规范，不代表现有数据已齐全 |
| `data/parameter_registry.json` | 演示参数及其非实证状态 |
| `data/initial_synthetic_world.json` | 开局虚拟主体和合同明细 |
| `RESULTS.md` | 已实际执行的闭环和测试结果 |
| `results/` | 完整轨迹、测试记录、政策对照和截图 |

## 不应越过的边界

本版不是完整的国民经济会计、全部金融机构数据或法律破产程序。银行没有实际风险加权资产体系；担保按主债务清算后支付，尚未求解同季度递归担保破产；资产抛售的外部买家和美国整体财政被简化；没有真实存款保险、回购保证金、外汇套保、完整收益率曲线或政治选举模型。

现金和债权检查通过，证明代码在这些检查下自洽，**不证明参数正确、不证明危机概率，也不证明现实政策有效**。下一阶段最重要的是校准和反证，而不是继续增加看似精确的指标。


## 中国 AI 压力沙盘

新增 [中国压力版](https://guoshaoyang-pku.github.io/ai-finance-sandbox/china/?v=cn-0.2.0)：公开初始财报与宏观统计、月度结算、三至十五年条件演化、六种政策对照；参数与事实分开，不是经济或企业破产预测。代码和资料位于 `china/`。原美国版保持独立。
