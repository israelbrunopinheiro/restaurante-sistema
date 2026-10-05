#!/usr/bin/env bash
# Publica o site na branch gh-pages SEM depender do GitHub Actions (útil quando a fila de execução do GitHub trava).
#
# Uso (na raiz do projeto, com o arquivo .env.local preenchido):
#   bash scripts/publicar-branch.sh
#
# Uso único no GitHub: Settings → Pages → Build and deployment → Source: "Deploy from a branch",
# Branch: gh-pages, pasta: / (root).
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_NAME="${REPO_NAME:-restaurante-sistema}"
if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
: "${VITE_SUPABASE_URL:?Faltou VITE_SUPABASE_URL (veja .env.example)}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:?Faltou VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example)}"

SRC_REV="$(git rev-parse --short HEAD)"
VITE_BASE="/${REPO_NAME}/" npm run build
cp dist/index.html dist/404.html   # o Pages não conhece as rotas do app: endereços desconhecidos caem no index.html
touch dist/.nojekyll

WORK="$(mktemp -d)"
trap 'git worktree remove --force "$WORK" 2>/dev/null || true; git branch -D gh-pages-build 2>/dev/null || true' EXIT
git branch -D gh-pages-build 2>/dev/null || true
git worktree add --orphan -b gh-pages-build "$WORK" >/dev/null
cp -R dist/. "$WORK"/
git -C "$WORK" add -A
git -C "$WORK" commit -q -m "Publicar site (código ${SRC_REV})"
git -C "$WORK" push --force origin gh-pages-build:gh-pages
echo "Publicado na branch gh-pages (código ${SRC_REV})."
