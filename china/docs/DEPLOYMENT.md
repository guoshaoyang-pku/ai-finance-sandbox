# cn-0.2.0 部署记录

页面：https://guoshaoyang-pku.github.io/ai-finance-sandbox/china/?v=cn-0.2.0

代码提交：92f787c。HTML SHA-256：`d7825186a52ed27e5d6021748d56fc3aec40d53cc368b3bfe0fbdcbbb5ec11b1`。

线上HTTP200并与构建文件逐字节相同。175项模型检查、52项部署前Chrome检查、52项线上Chrome检查通过，0页面脚本错误。数值检查不是经济预测有效性的证明。

原美国版保留，仅更新中国版导航的版本参数；旧季度版归档于`versions/cn-0.1.0.html`，存档不可与月度版混读。

离线直接打开index.html；修改src或data后运行node build.cjs。模型测试：node --test tests/engine.test.cjs。浏览器测试需安装playwright-core并设置PLAYWRIGHT_MODULE、CHROME_PATH；可用TEST_URL检验网站。
