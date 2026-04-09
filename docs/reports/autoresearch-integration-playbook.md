# Playbook: Harness + AutoResearch

## Papel do AutoResearch

O `autoresearch` fica fora do harness.

- o harness e o sistema sob teste
- o benchmark em `eval/` e o juiz fixo
- o `autoresearch` e o motor que propõe mudancas, roda o benchmark, e decide keep/revert

## Fluxo completo

1. editar `juninho-coding-harness`
2. `npm run build`
3. `eval/runners/run-loop.sh`
4. instalar o harness nos repos da suite
5. rodar `j.finish-setup`
6. rodar `j.spec -> j.plan -> j.implement -> j.check -> j.unify`
7. calcular score
8. registrar em `eval/results.tsv`
9. comparar com baseline e manter ou reverter

## Arquivos principais

- `eval/benchmarks/benchmark-v0.json`
- `eval/runners/run-benchmark.js`
- `eval/runners/run-loop.sh`
- `eval/runners/prepare-autoresearch-run.js`
- `eval/results.tsv`

## Preparar o repositorio autoresearch

Execute:

```bash
node eval/runners/prepare-autoresearch-run.js /caminho/para/juninho-coding-harness /caminho/para/autoresearch
```

Isso gera `juninho-eval-config.json` dentro do repo `autoresearch`.

## Rodar a baseline

```bash
npm run build
sh eval/runners/run-loop.sh
```

O resultado consolidado vai para:

- `eval/results/<run-label>/summary.json`
- `eval/results.tsv`

## Observacao sobre aprovacao humana

O benchmark ativa:

- `workflow.automation.nonInteractive = true`
- `workflow.automation.autoApproveArtifacts = true`

Isso permite que `j.spec` e `j.plan` nao travem aguardando `question` tool durante o loop externo.
