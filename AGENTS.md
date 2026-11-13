# AGENTS.md

本仓库通过 git tag 发布版本：DSH 插件市场索引按 tag 列出可用版本，不读取未打 tag 的提交。

## 发布规则

- 发布一个版本，必须在该版本号所在提交上创建 tag 并推送到远端；只提交 `package.json` 不算发布。
- tag 名为 `v<version>`（例如 `v0.2.1`），必须与 `package.json` 的 `version` 完全一致。
- 推送命令：`git push origin v<version>`，不加 `--force`。
- 已发布的 tag 永不移动、删除或重新指向其他提交。
- tag 打在发布时 `main` 的顶端（该提交的 `package.json` 声明此版本），沿用现有 `v0.1.0`、`v0.2.0` 的附注 tag 风格。

原因：索引生成器只列出打了 tag 的版本。若某个旧版本没打 tag，它会从索引中消失；而只有版本号、没有 tag 的提交会随 `main` 前进而漂移，安装者无法稳定复现发布内容。

## 发布清单

1. 修改 `package.json` 的 `version`，同步更新 `CHANGELOG.md`。
2. 提交版本号变更（发布内容可先于 tag 进入 `main`）。
3. 在发布时的 `main` 顶端创建附注 tag：`git tag -a v<version> -m "<version> 发布说明"`。
4. 推送分支和 tag：`git push origin main && git push origin v<version>`。
