# Roadmap da fork

Pendências e ideias da fork do GitHub Desktop. Notas de como rodar e da arquitetura
ficam no `AGENTS.md`.

## Features

1. [ ] **Fetch de branch sem checkout** (Right Click → Fetch no dropdown): fast-forward com
       `fetch x:x`; divergiu → `merge-tree`; conflito ou pull com rebase → diálogo pra
       trocar de branch e dar pull.
2. [ ] **Conflitos A:** achar, contar, navegar e mostrar marcadores de conflito em qualquer
       arquivo não commitado (só leitura, com sintaxe).
3. [ ] **Stashes nomeadas:** lista, nome, apply/pop/drop, sem overwrite por branch.
4. [ ] **Histórico com busca** por mensagem, autor e SHA.
5. [ ] **Histórico de um arquivo:** Right Click num arquivo → todos os commits que mudaram
       ele (`git log --follow`).
6. [ ] **Aviso de conflito com a main:** a cada commit, checar se a branch conflita com a
       main (`git merge-tree --write-tree`, sem checkout) e pôr um ícone nos commits
       conflitantes.
7. [ ] **Visualizar arquivos inteiros**, com a sintaxe e números de linha do diff, mas sem
       cor de adição/remoção (não como "tudo adicionado"). Entradas:
       - "Ver arquivo inteiro" em cada arquivo aberto no diff (mesmo commit);
       - Repository > View All Files: árvore de pastas do repo no HEAD, com busca fuzzy
         (repos com milhares de arquivos, então árvore virtualizada, não lista plana);
       - Right Click num commit do histórico → "Ver arquivos neste commit".
8. [ ] **Preview de `.md`** igual ao GitHub web.
       - [x] Botão Preview/Diff no diff de `.md` (Changes e History), lembra a última escolha;
             imagens relativas embutidas da versão certa do arquivo.
       - [ ] Mesmo preview no visualizador do 7.
       - [ ] Links relativos entre `.md` (hoje só links https abrem, no navegador).
9. [ ] **Editor de texto simples** embutido.
10. [ ] **Conflitos B:** merge editor (escolher um/outro/ambos, editar, reordenar linhas;
        pop-out depois). Em cima de 2 e 9.
11. [ ] **Remotes/upstreams:** add/remove/rename/set-url.
12. [ ] **Reword e edição de commits antigos**, não só o último.

## Sintaxe rAthena

- [ ] **Override (fase 3):** dropdown "Sintaxe" ao lado do Diff Options (Auto / rAthena /
      rAthena YAML / Texto puro / outras), com "lembrar pra este caminho neste repo" e
      mostrando a fonte ativa (ex.: "rAthena · Gear-Mechanica-Server · 753 cmds").
- [ ] `Script: "..."` em linha única no YAML (hoje só blocos `|` e `>`).
- [ ] Tooltip com a doc do comando (de `doc/script_commands.txt`).
- [ ] Marcar comando desconhecido e `callfunc "F_X"` inexistente.

## Problemas conhecidos

- [ ] **403 em `api.github.com` nos repos da TheGearfinderSociety:** o build de dev usa o
      app OAuth de desenvolvimento do GitHub Desktop, bloqueado pela org. Aprovar o app
      na org, ou registrar um OAuth App próprio da fork (necessário pra distribuir).
- [ ] **Rollback de prefs:** um repo adicionado sumiu depois de fechar o app pelo bat.

## Distribuição pro time

- [ ] Build de produção com nome e ID próprios, convivendo com o Desktop oficial.
- [ ] Auto-update pelos Releases da fork (ou desligado) e telemetria desligada.
