import io

p = 'src/components/node/NodeVersionsPage.tsx'
s = io.open(p, encoding='utf-8', newline='').read()

def rep(old, new, tag, count=1):
    global s
    assert s.count(old) == count, "FAIL %s count=%d" % (tag, s.count(old))
    s = s.replace(old, new)
    print("ok", tag)

# 2) 状态：获取其它版本 展开 + 安装中版本
rep('''  const [switchingNvm, setSwitchingNvm] = useState<string | null>(null);''',
'''  const [switchingNvm, setSwitchingNvm] = useState<string | null>(null);
  const [showNvmInstall, setShowNvmInstall] = useState(false);
  const [nvmInstallingVer, setNvmInstallingVer] = useState<string | null>(
    null,
  );''', "state")

# 3) handler：nvm 安装其它版本
rep('''  const handleVersionClick = (item: NodeVersion) => {''',
'''  const handleNvmInstall = async (version: string) => {
    if (nvmInstallingVer) return;
    setNvmInstallingVer(version);
    try {
      const output = await nodeApi.nvmInstall(version);
      toast.success(output, { duration: 6000 });
    } catch (error) {
      toast.error(String(error), { duration: 8000 });
    } finally {
      setNvmInstallingVer(null);
      void refreshNvm();
    }
  };

  const handleVersionClick = (item: NodeVersion) => {''', "handler")

# 4) nvm 卡片头部：加刷新按钮
rep('''                {nvm?.installed
                  ? nvm.root ?? ""
                  : t("nvm.hintNotInstalled", {
                      defaultValue:
                        "nvm 可在同一台机器管理多个 Node 版本并随时切换",
                    })}
              </p>
            </div>''',
'''                {nvm?.installed
                  ? nvm.root ?? ""
                  : t("nvm.hintNotInstalled", {
                      defaultValue:
                        "nvm 可在同一台机器管理多个 Node 版本并随时切换",
                    })}
              </p>
            </div>
            {nvm?.installed && (
              <button
                type="button"
                onClick={() => {
                  void refreshNvm();
                  void refreshStatus();
                }}
                title={t("nvm.refresh", { defaultValue: "刷新 nvm 状态" })}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}''', "refresh-btn")

# 5) 版本 chips 之后：获取其它版本区块
rep('''              <div className="flex flex-wrap gap-2">
                {nvm.versions.map((version) => {''',
'''              {(() => {
                const installedSet = new Set(
                  nvm.versions.map((v) => v.replace(/^v/, "")),
                );
                const available = versions
                  .map((v) => v.version.replace(/^v/, ""))
                  .filter((v) => !installedSet.has(v));
                return (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setShowNvmInstall((open) => !open)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showNvmInstall ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                      {t("nvm.getMore", {
                        defaultValue: "获取其它 Node 版本（经 nvm 安装）",
                      })}
                    </button>
                    {showNvmInstall && (
                      <div className="flex flex-wrap gap-2">
                        {available.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t("nvm.allInstalled", {
                              defaultValue: "可获取的版本都已安装",
                            })}
                          </span>
                        ) : (
                          available.map((version) => (
                            <button
                              key={version}
                              type="button"
                              disabled={nvmInstallingVer !== null}
                              onClick={() => void handleNvmInstall(version)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-orange-500/50 hover:bg-orange-500/5 hover:text-foreground",
                                nvmInstallingVer === version && "opacity-60",
                              )}
                            >
                              {nvmInstallingVer === version ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              v{version}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="flex flex-wrap gap-2">
                {nvm.versions.map((version) => {''', "more-versions")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print("ALL OK")
