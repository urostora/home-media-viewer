#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

if [[ $# != 1 || ("$1" != --check && "$1" != --write) ]]; then
    echo 'Usage: bash scripts/format.sh --check|--write' >&2
    exit 2
fi

# Include new code, but never generated files, media fixtures or historical releases.
git ls-files --cached --others --exclude-standard -z -- \
    '*.ts' '*.tsx' '*.js' '*.jsx' '*.cjs' '*.mjs' '*.mts' '*.cts' '*.js.prod' '*.css' '*.scss' '*.json' '*.yml' '*.yaml' \
    ':!:**/package-lock.json' ':!:**/next-env.d.ts' ':!:releases/**' ':!:test/files/**' |
    docker compose run --rm -T --no-deps --user "$(id -u):$(id -g)" --volume "$repo_root:/workspace" dependencies \
        sh -c 'cd /workspace && xargs -0 /home/node/app/node_modules/.bin/prettier --config /workspace/home-media-viewer/.prettierrc "$@"' sh "$1"

# Pin the Bash formatter independently of application dependencies.
shell_files=()
while IFS= read -r -d '' shell_file; do
    shell_files+=("$shell_file")
done < <(git ls-files --cached --others --exclude-standard -z -- '*.sh' ':!:releases/**' ':!:test/files/**')
if [[ ${#shell_files[@]} -gt 0 ]]; then
    shell_mode=-d
    if [[ "$1" == --write ]]; then
        shell_mode=-w
    fi
    docker run --rm --user "$(id -u):$(id -g)" --volume "$repo_root:/workspace" --workdir /workspace \
        mvdan/shfmt:v3.12.0@sha256:307d265ffd25ce832899ae17c93ed5062fc3375c514bba8f52cbf52792735c4d \
        -i 4 "$shell_mode" "${shell_files[@]}"
fi
