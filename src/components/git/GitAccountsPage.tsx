import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ApiKeyInput from "@/components/providers/forms/ApiKeyInput";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Check,
  Folder,
  FolderSearch,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  gitAccountApi,
  newAccountId,
  GIT_PLATFORM_LABEL,
  type GitAccount,
  type GitPlatform,
} from "@/lib/api/gitAccount";
import { GitPlatformIcon } from "@/components/git/GitPlatformIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { settingsApi } from "@/lib/api/settings";

interface GitAccountsPageProps {
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}

interface AccountWithPlatform {
  platform: GitPlatform;
  account: GitAccount;
}

const emptyDraft = (): GitAccount => ({
  id: "",
  name: "",
  email: "",
  password: "",
  projectPath: "",
});

/**
 * 统一 Git 账号页：Gitee / GitHub 的所有账号在同一页面分组展示。
 * 点击卡片或「使用」把全局 git 身份（user.name / user.email）切到该账号，
 * 全局同一时刻只有一个账号生效。
 */
export function GitAccountsPage({
  addOpen,
  onAddOpenChange,
}: GitAccountsPageProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<AccountWithPlatform[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  // 编辑/新增对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GitAccount>(emptyDraft());
  const [draftPlatform, setDraftPlatform] = useState<GitPlatform>("gitee");
  // 待确认删除的账号（弹框式，与供应商删除一致）
  const [deleteTarget, setDeleteTarget] = useState<AccountWithPlatform | null>(
    null,
  );

  const reload = useCallback(async () => {
    try {
      const [all, current] = await Promise.all([
        gitAccountApi.getAccounts(),
        gitAccountApi.getCurrentAccount(),
      ]);
      setItems([
        ...all.gitee.map((account) => ({
          platform: "gitee" as const,
          account,
        })),
        ...all.github.map((account) => ({
          platform: "github" as const,
          account,
        })),
      ]);
      setCurrentId(current);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (addOpen) {
      setEditingId(null);
      setDraft(emptyDraft());
      setDraftPlatform("gitee");
      setDialogOpen(true);
      onAddOpenChange(false);
    }
  }, [addOpen, onAddOpenChange]);

  /** 把账号写入指定平台；编辑时若换了平台则从原平台列表移除（迁移） */
  const persistTo = useCallback(
    async (target: GitPlatform, account: GitAccount) => {
      const all = await gitAccountApi.getAccounts();
      const moving = editingId !== null;
      const next: { gitee: GitAccount[]; github: GitAccount[] } = {
        gitee: all.gitee.filter((item) => !(moving && item.id === account.id)),
        github: all.github.filter(
          (item) => !(moving && item.id === account.id),
        ),
      };
      next[target] = [...next[target], account];
      await gitAccountApi.saveAccounts(next);
    },
    [editingId],
  );

  const openEdit = (platform: GitPlatform, account: GitAccount) => {
    setEditingId(account.id);
    setDraft({ ...account });
    setDraftPlatform(platform);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = draft.name.trim();
    const email = draft.email.trim();
    if (!name || !email) {
      toast.error(
        t("gitAccount.requiredFields", {
          defaultValue: "请填写用户名和邮箱",
        }),
      );
      return;
    }
    try {
      const account: GitAccount = editingId
        ? { ...draft, name, email }
        : { ...draft, id: newAccountId(), name, email };
      await persistTo(draftPlatform, account);
      toast.success(
        editingId
          ? t("gitAccount.saved", { defaultValue: "已保存" })
          : t("gitAccount.addedTo", {
              platform: GIT_PLATFORM_LABEL[draftPlatform],
              defaultValue: `已添加到 ${GIT_PLATFORM_LABEL[draftPlatform]}`,
            }),
      );
      setDialogOpen(false);
      await reload();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.account.id;
    setDeleteTarget(null);
    try {
      const all = await gitAccountApi.getAccounts();
      await gitAccountApi.saveAccounts({
        gitee: all.gitee.filter((item) => item.id !== id),
        github: all.github.filter((item) => item.id !== id),
      });
      await reload();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleSwitch = async (platform: GitPlatform, account: GitAccount) => {
    if (account.id === currentId) return;
    setSwitchingId(account.id);
    try {
      const result = await gitAccountApi.switchAccount(platform, account.id);
      setCurrentId(account.id);
      toast.success(
        t("gitAccount.switchSuccess", {
          platform: GIT_PLATFORM_LABEL[platform],
          name: result.name,
          defaultValue: `已切换到 ${GIT_PLATFORM_LABEL[platform]}（${result.name}）`,
        }),
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSwitchingId(null);
    }
  };

  const renderAccount = ({ platform, account }: AccountWithPlatform) => {
    const active = account.id === currentId;
    return (
      <div
        key={`${platform}-${account.id}`}
        role="button"
        tabIndex={0}
        onClick={() => void handleSwitch(platform, account)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void handleSwitch(platform, account);
        }}
        className={cn(
          "glass-card group flex cursor-pointer items-center gap-3 rounded-xl p-4 transition-all",
          active
            ? "ring-2 ring-teal-500/50 bg-teal-500/5"
            : "hover:bg-muted/50",
          switchingId === account.id && "opacity-60",
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted",
            active && "bg-teal-500/15",
          )}
        >
          <GitPlatformIcon platform={platform} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {account.name ||
                t("gitAccount.defaultAccount", {
                  defaultValue: "默认账号",
                })}
            </span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {GIT_PLATFORM_LABEL[platform]}
            </span>
            {active && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-600 dark:text-teal-300">
                <Check className="h-3 w-3" />
                {t("gitAccount.current", { defaultValue: "当前" })}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {account.email ||
              t("gitAccount.emptyEmailHint", {
                defaultValue: "未填写，点击编辑补全用户名和邮箱",
              })}
          </p>
          {account.projectPath && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground/80">
              <Folder className="h-3 w-3 shrink-0" />
              <span className="truncate">{account.projectPath}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant={active ? "secondary" : "default"}
            disabled={active || switchingId === account.id}
            onClick={(event) => {
              event.stopPropagation();
              void handleSwitch(platform, account);
            }}
          >
            {active
              ? t("gitAccount.inUse", { defaultValue: "使用中" })
              : t("gitAccount.use", { defaultValue: "使用" })}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common.edit", { defaultValue: "编辑" })}
            onClick={(event) => {
              event.stopPropagation();
              openEdit(platform, account);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("common.delete", { defaultValue: "删除" })}
            className="text-muted-foreground hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              setDeleteTarget({ platform, account });
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 p-4 pt-6">
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">...</p>
      ) : items.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center">
          <UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {t("gitAccount.emptyHint", {
              defaultValue:
                "还没有 Git 用户，点击右上角 + 添加；Gitee 与 GitHub 的账号都集中在这里",
            })}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => renderAccount(item))}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={t("gitAccount.deleteTitle", { defaultValue: "删除 Git 用户" })}
        message={t("gitAccount.deleteConfirm", {
          platform: deleteTarget
            ? GIT_PLATFORM_LABEL[deleteTarget.platform]
            : "",
          name:
            deleteTarget?.account.name ||
            t("gitAccount.defaultAccount", { defaultValue: "默认账号" }),
          defaultValue:
            "确定要删除 {{platform}} 的「{{name}}」吗？此操作不可恢复。",
        })}
        onConfirm={() => void handleDeleteConfirmed()}
        onCancel={() => setDeleteTarget(null)}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="border-b-0 bg-transparent px-7 pb-2 pt-6">
            <DialogTitle>
              {editingId
                ? t("gitAccount.editAccount", { defaultValue: "编辑 Git 用户" })
                : t("gitAccount.addGitUser", {
                    defaultValue: "添加 Git 用户",
                  })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 px-7 py-5">
            <div className="space-y-2">
              <p className="text-center text-sm text-muted-foreground">
                {t("gitAccount.choosePlatform", {
                  defaultValue: "保存到哪个平台？",
                })}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["gitee", "github"] as GitPlatform[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDraftPlatform(option)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 transition-all",
                      draftPlatform === option
                        ? "border-teal-500/60 bg-teal-500/10 shadow-sm"
                        : "border-muted bg-muted/30 hover:border-muted-foreground/30 hover:bg-muted/50",
                    )}
                  >
                    <GitPlatformIcon platform={option} size={36} />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        draftPlatform === option
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {GIT_PLATFORM_LABEL[option]}
                    </span>
                    {draftPlatform === option && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-[11px] text-teal-600 dark:text-teal-300">
                        <Check className="h-3 w-3" />
                        {t("gitAccount.selected", { defaultValue: "已选择" })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="git-draft-name"
                >
                  {t("gitAccount.userName", {
                    defaultValue: "用户名（user.name）",
                  })}
                </label>
                <Input
                  id="git-draft-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="your-name"
                />
              </div>
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="git-draft-email"
                >
                  {t("gitAccount.email", {
                    defaultValue: "邮箱（user.email）",
                  })}
                </label>
                <Input
                  id="git-draft-email"
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft({ ...draft, email: event.target.value })
                  }
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <ApiKeyInput
              id="git-draft-password"
              label={t("gitAccount.password", {
                defaultValue: "密码（选填，仅本地保存）",
              })}
              value={draft.password}
              onChange={(password) => setDraft({ ...draft, password })}
            />
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="git-draft-project"
              >
                {t("gitAccount.projectPath", {
                  defaultValue: "项目本地路径（选填）",
                })}
              </label>
              <div className="flex gap-2">
                <Input
                  id="git-draft-project"
                  value={draft.projectPath}
                  onChange={(event) =>
                    setDraft({ ...draft, projectPath: event.target.value })
                  }
                  placeholder="D:/projects/my-repo"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    void settingsApi
                      .pickDirectory(draft.projectPath || undefined)
                      .then((dir) => {
                        if (dir) setDraft((d) => ({ ...d, projectPath: dir }));
                      });
                  }}
                >
                  <FolderSearch className="mr-1 h-4 w-4" />
                  {t("gitAccount.browse", { defaultValue: "浏览" })}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t-0 bg-transparent px-7 pb-6 pt-1">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
            <Button onClick={() => void handleSave()}>
              {t("common.save", { defaultValue: "保存" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
