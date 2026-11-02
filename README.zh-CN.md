# Kotowa · 词和 中文说明

[English](README.md) · [日本語](README.ja.md) · **简体中文**

本项目由 AntaresGG 独立维护，源自 [OpenJLPT](https://github.com/evanclan/OpenJLPT)，增加简体中文内容与数据质量检查。保留上游提交历史、稳定 ID 和静态站点架构，独立管理 Issue、CI 和 Release。上游项目和数据来源的署名见 [NOTICE.md](NOTICE.md)。

[![CI](https://github.com/AntaresGG/kotowa/actions/workflows/ci.yml/badge.svg)](https://github.com/AntaresGG/kotowa/actions/workflows/ci.yml)

## 数据范围与当前能力

全库收录量与中文覆盖量分别统计；未中文化的条目仍保留英文内容。

| 等级 | 中文词汇 / 全部词汇 | 中文语法 / 全部语法 | 中文例句 |
| --- | ---: | ---: | ---: |
| N5 | 674 / 674 | 81 / 81 | 1,574 |
| N4 | 630 / 630 | 98 / 98 | 1,538 |
| N3 | 1,659 / 1,659 | 101 / 101 | 3,602 |
| N2 | 1,778 / 1,778 | 123 / 123 | 3,651 |
| N1 | 3,070 / 3,070 | 123 / 123 | 6,351 |
| **合计** | **7,811 / 7,811** | **526 / 526** | **16,716** |

以上为 2026-10-28 核对仓库中的 [JSON 数据](data/json)与[质量报告](data/quality-report.json)所得的快照。另收录 2,383 个汉字；汉字中文释义与完整中文界面尚未在此快照中完成。JLPT 等级是社区整理的参考范围，并非官方出题清单。

支持中文搜索、间隔重复闪卡、跨牌组切换及刷新后的进度保存、持久化 Shuffle，以及 JSON、CSV、SQLite、Anki 和 Yomitan 导出。保留原英文字段、稳定 ID，以及 JavaScript/TypeScript 和 Python API。

闪卡支持「重点复习库」：点击卡片上方的 ☆ 标记需要强化的内容，在 **Focused review** 中按等级与类别集中练习，或展开 **Saved cards in this deck** 查看、移除。强化练习不受到期时间限制，不改变日常间隔复习进度；答对不会自动取消标记，重置日常进度也保留标记。标记和练习会话仅保存在当前浏览器、当前站点地址下，不跨设备或 LAN/HTTPS 地址同步；清除浏览器站点数据会丢失这些记录。

## 获取与安装

从 [GitHub Releases](https://github.com/AntaresGG/kotowa/releases) 下载数据、Anki 牌组、Yomitan 词典及 JavaScript/Python 安装包。独立版本为 **v0.4.0**；继承的 v0.1.0、v0.2.0 标签属于上游历史。本项目未发布到 npm/PyPI，注册表中的 `openjlpt` 是上游产品。

```sh
git clone https://github.com/AntaresGG/kotowa.git
cd kotowa
npm ci
npm run build:pkg
```

JavaScript/TypeScript 项目安装当前源码后使用：

```sh
npm install git+https://github.com/AntaresGG/kotowa.git#main
```

```ts
import { searchVocab, getGrammar } from 'kotowa';

const words = searchVocab('肥皂');
const grammar = getGrammar('N3');
```

主入口使用 Node.js 文件访问；浏览器项目应打包 `data/json/` 中的 JSON，或将其作为静态资源提供。

Python 在仓库根目录安装。分发名为 `kotowa`，CLI 为 `kotowa`，兼容旧命令 `openjlpt`；Python 导入名仍为 `openjlpt`。现有 v0.4.0 Release 安装包保留旧名称，使用 Kotowa 包名请从 `main` 源码安装。请使用独立环境避免与上游混装：

```sh
uv venv
uv pip install --python .venv/bin/python .
# Windows: uv pip install --python .venv/Scripts/python.exe .
```

```python
from openjlpt import search_vocab, get_grammar

words = search_vocab("肥皂")
grammar = get_grammar("N3")
```

## 中文内容状态

N5–N1 的词汇与语法中文已全量完成，全部例句均有中文译文。本轮补齐 N5/N4 剩余 1,104 个词汇和 149 个语法点。按项目所有者授权，内容由 Codex 审校后转为正式稿；审核标记仅保留在数据和维护记录中，学习页面、搜索、闪卡及 Anki 不显示这些提示。这不是独立人工复核。

## 数据与审核

本轮 N5/N4 补齐沿用 N3–N1 标准，使用 GPT-6.1 Terra 编写与逐条 AI 审校；语法接续经过交叉复核，词汇另做定向抽查，不能视为全量独立二次审核。五个等级均无待审校、缺失或过期中文：

| 等级 | 词汇 | 语法 | 词汇例句中文 | 语法例句中文 |
| --- | ---: | ---: | ---: | ---: |
| N5 | 674 | 81 | 1,332 | 242 |
| N4 | 630 | 98 | 1,246 | 292 |
| N3 | 1,659 | 101 | 3,299 | 303 |
| N2 | 1,778 | 123 | 3,328 | 323 |
| N1 | 3,070 | 123 | 5,985 | 366 |

全站中文累计 7,811 个词汇、526 个语法点、16,716 条例句。本轮新增范围、逐条指纹与修订决定见 [N5/N4 完成记录](sources/quality/n5-n4-complete-review.json)；N3–N1 及早期试点审核记录继续保留。

- 原始词表和语法仍在 sources/ 中；稳定 ID 不因中文化而改变。
- sources/corrections/entries.json 保存按 ID 应用的纠错及依据。只接受记录中的旧值或新值；遇到不同的上游修改会报冲突，避免静默覆盖。
- sources/zh-CN/vocab.json 与 grammar.json 保存中文源内容、源哈希、参考说明及审核状态。
- 修改日文、读音、释义或例句会使中文状态变为 stale。页面、搜索、导出不使用过期中文，回退到英文；原中文源文件保留供复核。
- reviewed 必须记录 reviewer、review_method、reviewed_at 和 review_hash。中文释义、讲解、例句译文或参考资料改变后，旧审核指纹会使构建失败；须实际复核后更新指纹，或先降回 draft。重新计算哈希不代表已经完成内容审核。
- sources/quality/review-2026-10-28.json 记录早期试点审核范围、逐条指纹与纠错决定；review-dictionary.json 保留所核对的 JMdict 释义摘录及下载文件校验和。中文由 Codex 原创，词典摘录不能视为独立中文验证。
- sources/quality/pilot.json 保留早期试点样本。样本主要按读音顺序选择，并加入纠错案例，不能用于估计全库错误率。
- data/quality-report.json 记录覆盖率和待复核候选；同词典 ID 与读音的重复项可能是合理异体写法，不能自动合并。

全部 7,811 个词汇和 526 个语法点均有例句，全部例句已翻译；汉字中文释义与完整中文界面属于后续范围。现有 Yomitan 导出是等级元数据词典，不包含释义；Anki 保留原有 note ID，增加双语内容。

## 本地验证

在仓库根目录执行：

```text
npm ci
npm run prepare:data
npm run check:data
npm run validate
npm run typecheck
npm test
npm run build:pkg
uv run --no-project --with pytest --with genanki python -m pytest -q
npm run audit:data
```

prepare:data 使用已提交的数据离线应用纠错、合并中文并重建 SQLite，无需下载完整语料。完整上游更新仍使用 npm run build，涉及上游网络下载及 tar/bzip2 工具。

JSON 的 zh 字段保留英文接口；CSV 追加中文字段；SQLite 的 vocab、grammar 表追加 zh JSON 列。Python 和 TypeScript 搜索支持中文释义。Python 返回条目的嵌套列表和中文字典拒绝普通修改，调用方如需编辑请显式转换为自有副本。

## 网站与部署

npm run build:site 会生成静态网站；通过 SITE_URL 指定正式域名。网站的 dataset/ 下载来自本次构建，避免下载到上游未修正的数据。使用以下命令补齐下载：

```text
uv run --no-project --with genanki python scripts/build_exports.py _site/downloads
```

部署目标已改为 LAN 内的 Mac mini，不再使用 VPS。PC 提交并推送至 GitHub，Mac 拉取同一提交；PC/CI 构建可追溯的静态产物，包含网页、数据和下载包，Mac 通过 Caddy 托管。操作与登录后自启动说明见 [Mac mini 部署文档](docs/DEPLOY-MACOS.md)。SITE_URL 必须使用实际局域网访问地址重新构建。

GitHub 定时更新需要开启允许 Actions 创建 PR 的仓库设置。仓库保持默认只读 token 权限；更新 workflow 单独请求写入权限。更新失败时保留数据产物供排查。

## 实施记录

- 上游基线：0d1d3410bec90bd4098a7c72de820543cb4f707c。
- 纠错累计覆盖 1,150 个词条，本轮新增 49 项 N5/N4 守卫纠错；包含释义补全、例句替换、注音修复及缺失例句补充，不等同于发现 1,150 个错误词义。
- 本轮修复「五つ」误选地名例句、「いただきます」饭前用语与例句不一致、「上げる」缺少举起义，以及「以下／以上」英文遗漏包含端点等问题。
- 修复注音生成器将词典编号当读音的问题。本轮已核对并修复剩余 24 条 N5/N4 异常注音，当前质量报告中此类异常为零；这不表示所有读音都经过独立人工复核。
- 受付的 receipt 并非无效词义，本次选择与例句一致的接待处义项；一日限定初学者卡片的时长义项。
- せっけん与石鹸暂保留原有两张卡片，避免破坏已有学习记录；合并需要单独的 ID 迁移方案。
- 新创作的日文例句不挂原 Tatoeba ID；仅修复注音的原例句保留署名。
- 修正「中腹／ちゅうふく」「何々／なになに」的错误读音时保留原稳定 ID，并要求原读音及罗马字守卫；有词典依据的古语、异读不会自动改成常见读音。
- 离线重建会更新数据元信息，不改写上游快照日期；三语 README 的中文覆盖表须依据质量报告同步核对。
- 完整上游刷新可能改变纠错字段并触发保护性冲突，须检查后调整记录；本轮验证的是已提交快照的离线重建和导出。

## Git 治理

- 产品：`AntaresGG/kotowa`，`origin/main` 是唯一产品主线。
- 上游贡献通道：`AntaresGG/OpenJLPT`，保留为 Fork；不向其 main 混入产品特有改动。
- 上游：`evanclan/OpenJLPT`；`contrib/*` 从其最新 main 创建，按功能提取补丁。
- 迁移基线：`migration-baseline-2026-10-28`，对应 `f72221983fb4c970411ac9a753f6796473321164`。

产品改动直接在本地 `main` 完成，运行相关检查后推送到 `origin/main`。执行规则见[治理与发布](docs/GOVERNANCE.md)，贡献拆分见[上游贡献记录](UPSTREAM_CONTRIBUTIONS.md)，版本变化见[更新日志](CHANGELOG.md)。GitHub Pages 默认关闭，部署地址只保存在本地配置中。

## 来源与许可

本项目基于 Evan Clan 和贡献者开发的 OpenJLPT，独立增加中文学习内容与学习功能。保留 [CC BY-SA 4.0 LICENSE](LICENSE)、[NOTICE](NOTICE.md) 与[引用信息](CITATION.cff)。JMdict、KANJIDIC2、Waller、Tatoeba 和 KanjiVG 的来源及许可分别见 NOTICE；新创作例句不借用 Tatoeba 署名。更名为 Kotowa 不改变这些许可或数据来源。
