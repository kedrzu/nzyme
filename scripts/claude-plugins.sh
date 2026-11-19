#!/usr/bin/env bash
# Sets up the Claude Code plugins of the checkout it runs in: a clone or a worktree, the current
# directory. Shared by nzyme and the product repos (`bash nzyme/scripts/claude-plugins.sh` from the
# product root), called from their setup scripts, which Paseo runs for every new worktree.
#
# Claude Code records a project-scope plugin install against the absolute path of the checkout, not in
# the repo: `.claude/settings.json` only says which plugins are enabled. Every clone and every worktree
# therefore needs its own install, or Claude Code reports the plugins as enabled but not installed.
#
# 1. Marks the checkout as trusted in `~/.claude.json`. Plugins symlinked into `.claude/skills/` load
#    only in a trusted workspace, and worktrees created by Paseo never see the trust dialog.
# 2. Removes this checkout's marketplace installs that shadow a plugin in `.claude/skills/`. A user-scope
#    one also serves other projects, so it is only reported.
# 3. Installs, at project scope, every plugin enabled in `.claude/settings.json` that is installed
#    neither for this checkout nor for the user, nor symlinked into `.claude/skills/`. A missing
#    marketplace is added from the source in `extraKnownMarketplaces`.
#
# Never installs anything at user scope. Exits 1 when a step was skipped; each skipped step is printed
# with the command to run by hand.

set -uo pipefail

here=$(pwd -P)
skipped=0

skip() {
    echo "⚠️  $1"
    skipped=1
}

if ! command -v claude > /dev/null 2>&1 || ! command -v python3 > /dev/null 2>&1; then
    echo "⚠️  Claude Code CLI or python3 not found: the project's plugins were not set up."
    exit 1
fi

if [ ! -f .claude/settings.json ]; then
    echo "No .claude/settings.json in $here: no plugins to set up."
    exit 0
fi

# --- 1. Trust ---

python3 -I - "$here" << 'PY' || skip "Could not mark $here as trusted in ~/.claude.json: plugins in .claude/skills load only after Claude Code's trust dialog."
import json, os, sys, tempfile
here = sys.argv[1]
config_dir = os.environ.get("CLAUDE_CONFIG_DIR")
path = os.path.realpath(os.path.join(config_dir, ".claude.json") if config_dir else os.path.expanduser("~/.claude.json"))
config = json.load(open(path)) if os.path.exists(path) else {}
entry = config.setdefault("projects", {}).setdefault(here, {})
if entry.get("hasTrustDialogAccepted") is not True:
    entry["hasTrustDialogAccepted"] = True
    mode = os.stat(path).st_mode & 0o7777 if os.path.exists(path) else 0o600
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    os.chmod(tmp, mode)
    os.replace(tmp, path)
PY

# --- 2 and 3. Plan against the installed plugins ---

if ! plugins=$(claude plugin list --json 2> /dev/null); then
    echo "⚠️  'claude plugin list --json' failed: the project's plugins were not set up."
    exit 1
fi
marketplaces=$(claude plugin marketplace list --json 2> /dev/null || echo '[]')

# One line per action: `uninstall <plugin> <scope>`, `shadowed <plugin>` or
# `install <plugin> <marketplace> <source>` (source empty when settings do not declare the marketplace,
# or when the machine already knows it).
plan=$(PLUGINS="$plugins" MARKETPLACES="$marketplaces" python3 -I - "$here" << 'PY'
import json, os, sys
here = sys.argv[1]
settings = json.load(open(".claude/settings.json"))
plugins = json.loads(os.environ["PLUGINS"])
known = {m.get("name") for m in json.loads(os.environ["MARKETPLACES"])}

def mine(p):
    return p.get("scope") == "user" or os.path.realpath(p.get("projectPath") or "/") == here

local = {p["id"].rsplit("@", 1)[0] for p in plugins if p["id"].endswith("@skills-dir")}
for p in plugins:
    name = p["id"].rsplit("@", 1)[0]
    if name in local and not p["id"].endswith("@skills-dir") and mine(p):
        print("shadowed" if p.get("scope") == "user" else "uninstall", p["id"], p.get("scope"))

installed = {p["id"] for p in plugins if mine(p)}
sources = {}
for name, m in settings.get("extraKnownMarketplaces", {}).items():
    s = m.get("source", {})
    sources[name] = s.get("repo") or s.get("url") or s.get("path") or ""
for plugin, enabled in settings.get("enabledPlugins", {}).items():
    # A plugin symlinked into `.claude/skills/` is already there; installing it would shadow it.
    if enabled and plugin not in installed and "@" in plugin and plugin.rsplit("@", 1)[0] not in local:
        marketplace = plugin.rsplit("@", 1)[1]
        print("install", plugin, marketplace, "" if marketplace in known else sources.get(marketplace, ""))
PY
) || {
    echo "⚠️  Could not read .claude/settings.json or the plugin list: the project's plugins were not set up."
    exit 1
}

# Runs a claude command quietly; on failure prints its output, which names the cause.
run() {
    local out
    if ! out=$("$@" 2>&1); then
        echo "$out" | tail -n 5 | sed 's/^/      /'
        return 1
    fi
}

while read -r action plugin arg source; do
    case "$action" in
        uninstall)
            if run claude plugin uninstall "$plugin" --scope "$arg"; then
                echo "   removed $plugin, replaced by .claude/skills/${plugin%@*}"
            else
                skip "Could not remove $plugin, which hides .claude/skills/${plugin%@*}: run 'claude plugin uninstall $plugin --scope $arg'."
            fi
            ;;
        shadowed)
            skip "$plugin is installed for all projects and hides .claude/skills/${plugin%@*}: uninstall it if no other project needs it ('claude plugin uninstall $plugin')."
            ;;
        install)
            if [ -n "$source" ] && ! run claude plugin marketplace add "$source"; then
                skip "Could not add the marketplace $arg: run 'claude plugin marketplace add $source'."
                continue
            fi
            if run claude plugin install "$plugin" --scope project; then
                echo "   installed $plugin"
            else
                skip "Could not install the Claude Code plugin $plugin: run 'claude plugin install $plugin --scope project'."
            fi
            ;;
    esac
done <<< "$plan"

exit "$skipped"
