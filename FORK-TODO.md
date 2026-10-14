# TODO da fork

Pendências da fork do GitHub Desktop. O upstream fica intocado; isto é só nosso.

## Sintaxe rAthena

- [ ] **Override de sintaxe (fase 3):** dropdown "Sintaxe" ao lado do Diff Options
      (Auto / rAthena / rAthena YAML / Texto puro / outras), com "lembrar pra este
      caminho neste repo" e mostrando a fonte ativa (ex.: "rAthena · Gear-Mechanica-Server · 753 cmds").
- [ ] `Script: "..."` em linha única no YAML (hoje só blocos `|` e `>` viram rAthena).
- [ ] Tooltip com a doc do comando (de `doc/script_commands.txt`).
- [ ] Marcar comando desconhecido (removido do nosso source) e `callfunc "F_X"` inexistente.

## Problemas conhecidos

- [ ] **403 em `api.github.com` nos repos da TheGearfinderSociety:** o build de dev usa o
      app OAuth de desenvolvimento do GitHub Desktop, bloqueado pela org. Opções: aprovar
      o app na org, ou registrar um OAuth App próprio da fork (necessário pra distribuir).
- [ ] **Rollback de prefs:** um repo adicionado sumiu depois de fechar o app pelo bat. Investigar.

## Roadmap

1. [ ] Fetch de branch sem checkout (Right Click → Fetch): fast-forward com `fetch x:x`,
       divergiu com `merge-tree`, conflito ou pull com rebase → diálogo pra trocar de branch e dar pull.
2. [ ] Conflitos A: achar, contar, navegar e mostrar marcadores de conflito (só leitura).
3. [ ] Stashes nomeadas: lista, nome, apply/pop/drop, sem overwrite por branch.
4. [ ] Histórico com busca por mensagem, autor e SHA.
5. [ ] Editor de texto simples embutido.
6. [ ] Conflitos B: merge editor (escolher um/outro/ambos, editar, reordenar; pop-out depois).
7. [ ] Gerenciar remotes/upstreams (add/remove/rename/set-url).
8. [ ] Reword e edição de commits antigos (não só o último).

## Distribuição pro time

- [ ] Build de produção com nome e ID próprios (convivendo com o Desktop oficial).
- [ ] Auto-update apontando pros Releases da fork (ou desligado) e telemetria desligada.

## Dev

- Abrir sempre pelo atalho / `dev-start.bat` (nunca o exe direto). Reload: **Ctrl+Alt+R**.
- `dev-start.bat` faz build completo sozinho só quando dependências, `app/static` ou
  `script/build.ts` mudam; o resto é watch.
