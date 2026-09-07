#!/usr/bin/env python
"""harness 打包暂存（可复现）：install 依赖 → build 构建产物(lib) → robocopy 进 harness-dist。

任何机器克隆仓库后跑本脚本都能得到完整暂存目录，
供 tauri bundle.resources 内嵌进安装包（别人电脑安装时即得完整 harness）。
"""
import os
import subprocess
import sys

# Windows runner 的控制台默认 cp1252：pnpm 输出含 ✓/进度条等 UTF-8 字符，
# 不重配编码会在 print/解码处 UnicodeEncodeError/DecodeError 崩掉（退出码 1）
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(ROOT, "harness")
DIST = os.path.join(ROOT, "harness-dist")

def run(cmd, cwd, timeout_s=1800):
    # pnpm/npm 是 .cmd 垫片，CreateProcess 直调找不到 → 经 shell 解析
    print(f">>> {' '.join(cmd)}  (cwd={cwd})")
    r = subprocess.run(" ".join(cmd), cwd=cwd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace",
                       timeout=timeout_s, shell=True)
    tail = (r.stderr or r.stdout or "")[-800:]
    if r.returncode != 0:
        print(tail)
        # GitHub Actions 注解：失败细节带进 annotations，无 Actions 权限也能经 API 读到
        one_line = " ".join(tail.split())[-500:]
        print(f"::error::stage failed at `{' '.join(cmd)}` exit={r.returncode}: {one_line}")
        sys.exit(f"stage failed exit={r.returncode}")
    print(tail.splitlines()[-1] if tail.strip() else "ok")

# 1) 依赖
run(["pnpm", "install", "--prefer-offline"], HARNESS)

# 2) 构建产物（lib/ 等是 gitignored，dsh web 运行必需）。
#    构建失败但仓库已有预编译 lib（如从发行包拷贝而来）时容错继续。
def client_bundles_present():
    import glob
    return bool(glob.glob(os.path.join(HARNESS, "packages", "client", "*", "lib", "client.js")))

try:
    run(["pnpm", "run", "build"], HARNESS, timeout_s=3600)
except SystemExit:
    if client_bundles_present():
        print("⚠ 构建失败，但仓库已含预编译 lib/，继续暂存（全新机器需先修构建）")
    else:
        raise
# 3) 暂存镜像：完整源码+构建产物，仅排除 node_modules / IDE 杂物（跨平台）
import shutil
import stat

IGNORE_DIRS = {"node_modules", ".zcode", ".git"}

def copy_tree():
    def ignore(directory, entries):
        skipped = set()
        for e in entries:
            full = os.path.join(directory, e)
            if os.path.isdir(full) and e in IGNORE_DIRS:
                skipped.add(e)
            elif e.endswith(".tsbuildinfo"):
                skipped.add(e)
        return skipped

    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    shutil.copytree(HARNESS, DIST, ignore=ignore)

if os.name == "nt":
    rc = subprocess.run(
        ["robocopy", HARNESS, DIST, "/MIR",
         "/XD", "node_modules", ".zcode", ".git",
         "/XF", "*.tsbuildinfo",
         "/NFL", "/NDL", "/NJH", "/R:1", "/W:1"],
        capture_output=True).returncode
    if rc >= 8:
        print(f"::error::robocopy failed code={rc}")
        sys.exit(f"robocopy failed code={rc}")
else:
    copy_tree()
files = sum(len(fs) for _, _, fs in os.walk(DIST))
print(f"✓ harness-dist 就绪：{files} 个文件")
